from __future__ import annotations

import secrets
import time
import uuid
import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent import RagAgent, source_events
from app.config import get_settings
from app.db import engine, get_session
from app.email_ingest import IngestError, decode_raw, ingest_email
from app.events import encode_sse
from app.models import Document, RagChunk
from app.schemas import ChatRequest, EmailIngestRequest, HealthResponse

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title="Yachay RAG API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization"],
)


@app.get("/health", response_model=HealthResponse)
async def health(session: AsyncSession = Depends(get_session)) -> HealthResponse:
    try:
        await session.execute(text("SELECT 1"))
        documents = await session.scalar(select(func.count()).select_from(Document))
        chunks = await session.scalar(select(func.count()).select_from(RagChunk))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="database_unavailable") from exc
    if not chunks:
        raise HTTPException(status_code=503, detail="rag_index_empty")
    return HealthResponse(status="ok", documents=documents or 0, chunks=chunks or 0)


@app.post("/chat")
async def chat(request: ChatRequest, session: AsyncSession = Depends(get_session)) -> StreamingResponse:
    if request.attachments:
        raise HTTPException(status_code=422, detail="attachments_not_supported_yet")
    started = time.monotonic()
    request_id = str(uuid.uuid4())

    async def event_stream() -> AsyncIterator[bytes]:
        final_state: dict = {}
        answering = "Preparing an answer…" if request.lang == "en" else "Preparando respuesta…"
        answer_status_sent = False
        try:
            agent = RagAgent(settings)
            async for mode, payload in agent.stream(request, session):
                if mode == "custom" and isinstance(payload, dict):
                    if payload.get("type") in {"status", "token", "unknown"}:
                        yield encode_sse(payload)
                elif mode == "values" and isinstance(payload, dict):
                    final_state = payload
                    if (payload.get("retrieved") or payload.get("reused_sources")) and not answer_status_sent:
                        yield encode_sse({"type": "status", "label": answering})
                        answer_status_sent = True

            if not final_state.get("unknown", True):
                sources = source_events(final_state.get("retrieved", []), request.lang)
                if not sources:
                    sources = final_state.get("reused_sources", [])
                if sources:
                    yield encode_sse({"type": "sources", "items": sources})
                yield encode_sse({"type": "suggestions", "items": []})
            yield encode_sse({"type": "done", "messageId": request_id, "latencyMs": round((time.monotonic() - started) * 1000)})
        except Exception:
            logger.exception("Falló el streaming de chat request_id=%s", request_id)
            yield encode_sse({"type": "error", "message": "No se pudo completar la consulta. Inténtalo de nuevo."})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/ingest/email")
async def ingest_email_endpoint(
    request: EmailIngestRequest,
    x_ingest_token: str = Header(default=""),
    session: AsyncSession = Depends(get_session),
) -> dict:
    expected = settings.ingest_token.get_secret_value()
    if not expected:
        raise HTTPException(status_code=503, detail="ingest_disabled")
    if not secrets.compare_digest(x_ingest_token.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="invalid_ingest_token")
    try:
        documents = await ingest_email(decode_raw(request.raw), session, settings)
    except IngestError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"status": "ok", "documents": documents}
