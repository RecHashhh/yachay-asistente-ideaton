"""Adaptador: el agente de búsqueda guiada (agent.py) consulta el índice de Yachi con la misma interfaz que su Retriever.

- `list_documents`: catálogo de documentos vigentes con su descripción (rag/descripciones.csv → documents.description).
- `search`: búsqueda híbrida de Yachi (texto + vectores, RRF), opcionalmente limitada a ≤ 5 documentos.
- `validate_history_sources`: una fuente de un turno anterior solo se reutiliza si su texto sigue en el índice vigente.
El parámetro `session` existe por compatibilidad con la capa SQLAlchemy original; aquí no se usa.
"""

import asyncio
from collections.abc import Sequence
from typing import Any

from .config import Settings, get_settings
from .db import conn
from .retrieval import RetrievedChunk
from .search import Hit, hybrid

MAX_DOCS = 5


def _body(texto: str) -> str:
    """El fragmento sin la línea de contexto «Documento: … | Sección: …» que se antepone al indexar."""
    return texto.split("\n\n", 1)[-1].strip()


def to_chunk(h: Hit) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=h.chunk_id, doc_id=h.doc_id, title=h.title, kind=h.kind,
        source_url=h.url if h.acceso != "interno" else None, validity_period=h.periodo or "",
        section=h.seccion or "", content=_body(h.texto), similarity=round(h.cos, 4),
    )


class YachiRetriever:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    async def list_documents(self, session: Any = None) -> list[dict[str, str | None]]:
        def q() -> list[dict[str, str | None]]:
            with conn() as c:
                rows = c.execute(
                    "SELECT id, title, description, kind, coalesce(periodo, '') AS periodo, CASE WHEN acceso = 'interno' THEN NULL ELSE url END AS url "
                    "FROM documents WHERE is_current AND status = 'indexado' ORDER BY title, id"
                ).fetchall()
            return [{"doc_id": r["id"], "title": r["title"], "description": r["description"], "kind": r["kind"],
                     "validity_period": r["periodo"], "source_url": r["url"]} for r in rows]
        return await asyncio.to_thread(q)

    async def search(self, session: Any, query: str, document_ids: Sequence[str] | None = None) -> list[RetrievedChunk]:
        ids = list(dict.fromkeys(document_ids or []))
        if len(ids) > MAX_DOCS:
            raise ValueError(f"Se pueden seleccionar como máximo {MAX_DOCS} documentos")
        hits = await asyncio.to_thread(hybrid, query, self.settings.rag_context_chunks, None, ids or None)
        # Mismo criterio que la búsqueda directa: sin coincidencia de texto y con similitud baja, no es evidencia.
        hits = [h for h in hits if h.cos >= self.settings.rag_min_similarity or h.fts > 0]
        return [to_chunk(h) for h in hits]

    async def validate_history_sources(self, session: Any, sources: Sequence[dict[str, str | None]], lang: str = "es") -> list[dict[str, str | None]]:
        def q() -> list[dict[str, str | None]]:
            out: list[dict[str, str | None]] = []
            with conn() as c:
                for s in sources:
                    doc_id, snippet = s.get("docId"), (s.get("snippet") or "").rstrip("…").strip()
                    if not doc_id or len(snippet) < 20:
                        continue
                    r = c.execute(
                        "SELECT c.id, d.title, coalesce(d.periodo, '') AS periodo, c.seccion FROM chunks c JOIN documents d ON d.id = c.doc_id "
                        "WHERE d.is_current AND d.status = 'indexado' AND c.doc_id = %s AND position(%s IN c.texto) > 0 LIMIT 1",
                        (doc_id, snippet[:200]),
                    ).fetchone()
                    if r:
                        out.append({"docId": doc_id, "title": r["title"], "version": r["periodo"] or s.get("version"),
                                    "locator": r["seccion"] or s.get("locator"), "snippet": snippet, "chunkId": r["id"]})
            return out
        return await asyncio.to_thread(q)
