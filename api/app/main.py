"""API de Yachi. Mismo contrato que web/src/lib/types.ts: `uvicorn app.main:app --port 8000`."""

import asyncio
import json
import re
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import filters, graph, rules
from .config import API_DIR, settings
from .db import conn, open_pool
from .search import vectors


def purge() -> None:
    """Conservación limitada (LOPDP): borra preguntas y votos viejos, y las consultas a oficinas vencidas."""
    with conn() as c:
        c.execute("DELETE FROM feedback WHERE created_at < now() - make_interval(days => %s)", (settings.retention_days,))
        c.execute("DELETE FROM messages WHERE created_at < now() - make_interval(days => %s)", (settings.retention_days,))
        c.execute("DELETE FROM unanswered WHERE last_at < now() - make_interval(days => %s) AND status <> 'convertida'", (settings.retention_days,))
        c.execute("DELETE FROM inquiries WHERE delete_after < now()")


async def _purge_loop() -> None:
    while True:
        try:
            await asyncio.to_thread(purge)
        except Exception as e:
            print("Error al depurar datos vencidos:", repr(e))
        await asyncio.sleep(6 * 3600)


@asynccontextmanager
async def lifespan(_: FastAPI):
    open_pool()
    vectors.load()
    task = asyncio.create_task(_purge_loop())
    yield
    task.cancel()


app = FastAPI(title="Yachi API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_origin], allow_methods=["*"], allow_headers=["*"])

# ------------------------------------------------------------------ chat

class Turn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    sessionId: str = Field(max_length=64)
    message: str = Field(min_length=1, max_length=1000)
    lang: str = "es"
    history: list[Turn] = []


def client_ip(request: Request) -> str:
    if settings.trust_proxy and (xff := request.headers.get("x-forwarded-for")):
        return xff.split(",")[-1].strip().rsplit(":", 1)[0]
    return request.client.host if request.client else "?"


@app.post("/chat")
async def chat(req: ChatRequest, request: Request):
    lang = req.lang if req.lang in ("es", "en", "qu") else "es"
    ip = client_ip(request)
    if not (filters.allow(f"ip:{ip}", settings.rate_ip_min, 60) and filters.allow(f"s:{req.sessionId}", settings.rate_session_min, 60)
            and filters.allow(f"d:{req.sessionId}", settings.rate_session_day, 86_400)):
        msg = "Estás enviando muchos mensajes seguidos. Espera un minuto y vuelve a intentarlo." if lang != "en" else "You are sending too many messages. Please wait a minute and try again."
        raise HTTPException(429, msg, headers={"Retry-After": "60"})

    async def events():
        try:
            async for ev in graph.run(req.message, "es" if lang == "qu" else lang, [t.model_dump() for t in req.history[-6:]], req.sessionId):
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        except Exception as e:  # el cliente ve un error legible; el detalle queda en el log del servidor
            print("Error en /chat:", repr(e))
            msg = "No pude responder en este momento. Intenta de nuevo en unos segundos." if lang != "en" else "I could not answer right now. Please try again in a few seconds."
            yield f"data: {json.dumps({'type': 'error', 'message': msg})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ------------------------------------------------------------------ público

@app.get("/topics")
def topics():
    with conn() as c:
        rows = c.execute("SELECT id, name, description, name_en, description_en FROM topics ORDER BY id").fetchall()
    return [{"id": r["id"], "name": r["name"], "description": r["description"], "nameEn": r["name_en"], "descriptionEn": r["description_en"]} for r in rows]


FALLBACK_TRENDS = [
    ("¿Cuándo es la recepción de solicitudes de cambio de carrera para 2026SEM02?", "When can I apply for a change of major for 2026SEM02?", "tramites"),
    ("¿Cómo solicito una tercera matrícula?", "How do I request a third enrollment?", "tramites"),
    ("¿Qué normas hay en las residencias universitarias?", "What are the rules in the student residences?", "campus"),
    ("¿Cuál es el horario de la biblioteca?", "What are the library opening hours?", "campus"),
    ("¿Cómo presento una demanda estudiantil a la FEYT?", "How do I submit a student request to the FEYT?", "representacion"),
    ("¿Qué clubes estudiantiles hay?", "What student clubs are there?", "bienestar"),
]


@app.get("/trends")
def trends(lang: str = "es"):
    lang = "en" if lang == "en" else "es"
    with conn() as c:
        rows = c.execute(
            """SELECT m.question, count(*) AS n, (SELECT d.topic_id FROM documents d WHERE d.id = (array_agg(m.doc_ids[1]))[1]) AS topic
               FROM messages m WHERE m.kind IN ('respuesta','lugar') AND m.lang = %s AND m.created_at > now() - interval '7 days'
                 AND m.question NOT LIKE '%%omitid%%'
               GROUP BY m.question HAVING count(DISTINCT m.session_id) >= 3 ORDER BY n DESC LIMIT 6""",
            (lang,),
        ).fetchall()
    # Tendencia = pregunta de al menos 3 personas distintas (k-anonimato básico): nunca se publica la pregunta de una sola persona.
    out = [{"query": r["question"], "topicId": r["topic"] or "tramites", "count": r["n"], "delta": 0} for r in rows]
    for es, en, topic in FALLBACK_TRENDS:  # completa con preguntas frecuentes curadas mientras no haya uso real
        if len(out) >= 6:
            break
        q = en if lang == "en" else es
        if all(o["query"] != q for o in out):
            out.append({"query": q, "topicId": topic, "count": 0, "delta": 0})
    return out


@app.get("/places")
def places():
    with conn() as c:
        p = c.execute("SELECT id, name, name_en, uso, horario, lat, lon, maps_url FROM places ORDER BY name").fetchall()
    return [{"id": r["id"], "name": r["name"], "nameEn": r["name_en"], "uso": r["uso"], "horario": r["horario"], "lat": r["lat"], "lon": r["lon"], "mapsUrl": r["maps_url"]} for r in p]


class Feedback(BaseModel):
    messageId: str
    vote: str
    reason: str | None = None


@app.post("/feedback")
def feedback(f: Feedback):
    if f.vote not in ("up", "down"):
        raise HTTPException(400, "voto inválido")
    with conn() as c:
        c.execute("INSERT INTO feedback (message_id, vote, reason) VALUES (%s,%s,%s)", (f.messageId, f.vote, f.reason))
        if f.vote == "down":
            m = c.execute("SELECT question, lang FROM messages WHERE id = %s", (f.messageId,)).fetchone()
            if m:
                graph.record_unanswered(c, m["question"], m["lang"], "voto_negativo", f.reason)
    return {"ok": True}


class InquiryIn(BaseModel):
    office: str = Field(max_length=120)
    email: str = Field(max_length=200)
    question: str = Field(min_length=1, max_length=1000)
    lang: str = "es"
    transcript: str | None = Field(default=None, max_length=8000)


@app.post("/inquiries")
def inquiries(i: InquiryIn):
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", i.email):
        raise HTTPException(400, "Correo inválido")
    with conn() as c:
        n = c.execute("SELECT count(*) AS n FROM inquiries WHERE created_at >= date_trunc('year', now())").fetchone()["n"] + 1
        code = f"YT-{date.today().year}-{n:04d}"
        c.execute("INSERT INTO inquiries (code, office, email, question, lang, transcript) VALUES (%s,%s,%s,%s,%s,%s)",
                  (code, i.office, i.email.strip(), i.question.strip(), i.lang, i.transcript))
    return {"code": code, "office": i.office, "email": i.email, "question": i.question, "lang": i.lang, "at": time.strftime("%Y-%m-%dT%H:%M:%S")}


# ------------------------------------------------------------------ administración

_tokens: dict[str, tuple[str, float]] = {}  # prototipo: en producción, Microsoft Entra ID


class Login(BaseModel):
    email: str
    password: str


@app.post("/admin/login")
def admin_login(b: Login):
    if not settings.admin_password or b.email.strip().lower() not in settings.admin_emails or not secrets.compare_digest(b.password, settings.admin_password):
        raise HTTPException(401, "Correo o contraseña incorrectos")
    tok = secrets.token_urlsafe(32)
    _tokens[tok] = (b.email, time.time() + 8 * 3600)
    return {"token": tok, "name": b.email.split("@")[0], "email": b.email}


def admin(authorization: str = Header(default="")) -> str:
    tok = authorization.removeprefix("Bearer ").strip()
    who = _tokens.get(tok)
    if not who or who[1] < time.time():
        raise HTTPException(401, "Sesión expirada")
    return who[0]


@app.get("/admin/docs")
def admin_docs(_: str = Depends(admin)):
    with conn() as c:
        rows = c.execute(
            """SELECT d.*, (SELECT count(*) FROM chunks WHERE doc_id = d.id) AS n_chunks FROM documents d
               WHERE d.status <> 'retirado' ORDER BY d.topic_id, d.title"""
        ).fetchall()
    return [{
        "id": r["id"], "title": r["title"], "topicId": r["topic_id"] or "normativa", "kind": r["kind"] if r["kind"] in ("pdf", "xlsx", "csv") else "pdf",
        "version": r["version"], "docDate": str(r["fecha_consulta"] or ""), "origin": "web" if r["acceso"] == "publico" else "interno",
        "url": r["url"] if r["acceso"] != "interno" else None, "uploadedAt": r["uploaded_at"].isoformat(), "uploadedBy": r["uploaded_by"],
        "status": r["status"] if r["status"] in ("procesando", "indexado", "error") else "indexado", "chunks": r["n_chunks"], "sizeKb": r["size_kb"],
        "audiencia": r["audiencia"], "periodo": r["periodo"], "acceso": r["acceso"],
    } for r in rows]


@app.delete("/admin/docs/{doc_id}")
def admin_delete(doc_id: str, _: str = Depends(admin)):
    with conn() as c:
        c.execute("UPDATE documents SET status = 'retirado', is_current = false WHERE id = %s", (doc_id,))
    vectors.load()
    return {"ok": True}


@app.post("/admin/docs")
async def admin_upload(file: UploadFile = File(...), title: str = Form(...), topicId: str = Form(...), version: str = Form(...),
                       docDate: str = Form(...), origin: str = Form("interno"), url: str | None = Form(None), replaces: str | None = Form(None),
                       who: str = Depends(admin)):
    ext = Path(file.filename or "").suffix.lower().lstrip(".")
    if ext not in ("pdf", "xlsx", "csv"):
        raise HTTPException(400, "Solo PDF, XLSX o CSV")
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(400, "El archivo supera 25 MB")
    doc_id = re.sub(r"[^a-z0-9]+", "_", rules.norm(title))[:60] + "_" + uuid.uuid4().hex[:6]
    up = API_DIR / "uploads"
    up.mkdir(exist_ok=True)
    (up / f"{doc_id}.{ext}").write_bytes(data)
    with conn() as c:
        c.execute(
            """INSERT INTO documents (id, title, tipo, topic_id, version, fecha_consulta, url, acceso, kind, status, uploaded_by, size_kb, replaces, notes)
               VALUES (%s,%s,'documento',%s,%s,%s,%s,%s,%s,'procesando',%s,%s,%s,%s)""",
            (doc_id, title, topicId, version, docDate or None, url, "publico" if origin == "web" and url else "interno", ext, who,
             max(1, len(data) // 1024), replaces, "Pendiente de fragmentar con preparar_corpus.py y cargar con app.ingest"),
        )
        if replaces:
            c.execute("UPDATE documents SET is_current = false WHERE id = %s", (replaces,))
    vectors.load()
    return {"id": doc_id, "title": title, "topicId": topicId, "kind": ext, "version": version, "docDate": docDate, "origin": origin, "url": url,
            "uploadedAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "uploadedBy": who, "status": "procesando", "chunks": 0, "sizeKb": max(1, len(data) // 1024)}


class TopicIn(BaseModel):
    name: str
    description: str = ""
    nameEn: str | None = None
    descriptionEn: str | None = None


@app.post("/admin/topics")
def admin_topic(t: TopicIn, _: str = Depends(admin)):
    tid = re.sub(r"[^a-z0-9]+", "-", rules.norm(t.name)).strip("-")
    with conn() as c:
        c.execute("INSERT INTO topics (id, name, description, name_en, description_en) VALUES (%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING",
                  (tid, t.name, t.description, t.nameEn, t.descriptionEn))
    return {"id": tid, **t.model_dump()}


@app.get("/admin/unanswered")
def admin_unanswered(_: str = Depends(admin)):
    with conn() as c:
        rows = c.execute("SELECT * FROM unanswered ORDER BY count DESC, last_at DESC LIMIT 300").fetchall()
    return [{"id": r["id"], "q": r["q"], "lang": r["lang"], "reason": r["reason"], "count": r["count"], "firstAt": r["first_at"].isoformat(),
             "lastAt": r["last_at"].isoformat(), "status": r["status"], "controlId": r["control_id"], "details": r["details"] or None} for r in rows]


class InboxPatch(BaseModel):
    status: str | None = None
    controlId: str | None = None


@app.patch("/admin/unanswered/{item_id}")
def admin_unanswered_patch(item_id: str, p: InboxPatch, _: str = Depends(admin)):
    with conn() as c:
        c.execute("UPDATE unanswered SET status = coalesce(%s, status), control_id = coalesce(%s, control_id) WHERE id = %s", (p.status, p.controlId, item_id))
    return {"ok": True}


# ------------------------------------------------------------------ filtros (editables por el equipo)

FILTER_CATEGORIES = ("crisis", "denuncia", "manipulacion", "profanidad", "fuera_de_dominio", "permitido")


@app.get("/admin/filters")
def admin_filters(_: str = Depends(admin)):
    with conn() as c:
        rows = c.execute("SELECT category, term, active, note, updated_by, updated_at FROM filter_terms ORDER BY category, term").fetchall()
    return [{"category": r["category"], "term": r["term"], "active": r["active"], "note": r["note"], "updatedBy": r["updated_by"],
             "updatedAt": r["updated_at"].isoformat()} for r in rows]


class FilterIn(BaseModel):
    category: str
    term: str = Field(min_length=2, max_length=80)
    active: bool = True
    note: str | None = Field(default=None, max_length=200)


@app.post("/admin/filters")
def admin_filter_upsert(f: FilterIn, who: str = Depends(admin)):
    """Agrega o activa/desactiva un término. No se borran: desactivar deja el registro de quién y cuándo (trazabilidad)."""
    if f.category not in FILTER_CATEGORIES:
        raise HTTPException(400, "Categoría inválida")
    term = " ".join(f.term.lower().split())
    if filters._term_regex([term]) is None:
        raise HTTPException(400, "Término vacío")
    with conn() as c:
        c.execute(
            """INSERT INTO filter_terms (category, term, active, note, updated_by) VALUES (%s,%s,%s,%s,%s)
               ON CONFLICT (category, term) DO UPDATE SET active = EXCLUDED.active, note = coalesce(EXCLUDED.note, filter_terms.note),
                 updated_by = EXCLUDED.updated_by, updated_at = now()""",
            (f.category, term, f.active, f.note, who),
        )
    filters.invalidate()
    return {"ok": True, "term": term}


class FilterCheck(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


@app.post("/admin/filters/check")
def admin_filter_check(b: FilterCheck, _: str = Depends(admin)):
    """Prueba una frase: qué ruta toma y qué término la activó (sin llamar al modelo)."""
    t = rules.triage(b.text, "es")
    v = filters.classify(filters.redact(b.text))
    return {"route": t.route, "kind": t.kind, "matched": v.matched, "question": t.question, "sensitive": t.sensitive}


@app.post("/admin/filters/test")
def admin_filter_test(_: str = Depends(admin)):
    """Corre los casos de prueba de filtros (app/filter_cases.py) con las listas activas."""
    from .filter_cases import run
    return run()


class CaseIn(BaseModel):
    q: str
    lang: str = "es"
    expect: str


@app.get("/admin/validation/cases")
def cases(_: str = Depends(admin)):
    with conn() as c:
        return c.execute("SELECT id, q, lang, expect, source FROM control_cases ORDER BY id").fetchall()


@app.post("/admin/validation/cases")
def add_case(b: CaseIn, _: str = Depends(admin)):
    with conn() as c:
        n = c.execute("SELECT count(*) AS n FROM control_cases WHERE id LIKE 'C%%'").fetchone()["n"] + 1
        cid = f"C{n:03d}"
        c.execute("INSERT INTO control_cases (id, q, lang, expect, source) VALUES (%s,%s,%s,%s,'bandeja')", (cid, b.q, b.lang, b.expect))
    return {"id": cid, **b.model_dump()}


@app.post("/admin/validation/run")
async def run_validation(_: str = Depends(admin)):
    """Corre todo el set de control contra el sistema real (con el modelo). Cada pregunta cuesta una consulta normal."""
    with conn() as c:
        cases_ = c.execute("SELECT id, q, lang, expect FROM control_cases ORDER BY id").fetchall()
    results = []
    for case in cases_:
        t0 = time.time()
        kind, docs, text = None, [], ""
        async for ev in graph.run(case["q"], case["lang"], [], f"validacion-{case['id']}"):
            if ev["type"] == "unknown":
                kind = "no_se"
            elif ev["type"] == "clarify":
                kind = "aclaracion"
            elif ev["type"] == "sources":
                docs = [s["docId"] for s in ev["items"]]
            elif ev["type"] == "token":
                text += ev["text"]
        got = kind or ",".join(docs)
        expected = case["expect"].split("|")
        ok = (kind == case["expect"]) if case["expect"] in ("no_se", "aclaracion") else any(d in docs for d in expected)
        results.append({"id": case["id"], "q": case["q"], "lang": case["lang"], "expect": case["expect"], "got": got, "ok": ok,
                        "hallucination": bool(text.strip()) and not docs and kind is None, "ms": int((time.time() - t0) * 1000)})
    metrics = {"total": len(results), "ok": sum(r["ok"] for r in results)}
    with conn() as c:
        c.execute("INSERT INTO validation_runs (model, metrics, results) VALUES (%s,%s,%s)",
                  (settings.anthropic_model, json.dumps(metrics), json.dumps(results, ensure_ascii=False)))
    return results
