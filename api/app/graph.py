"""Grafo de la consulta (LangGraph). Cada nodo emite eventos SSE con el mismo contrato que usa el frontend.

    ruta ──► fuera de dominio ─────────────────────────────► fin
       ├──► aclaración (consulta ambigua) ─────────────────► fin
       ├──► lugar/aula exacto (Excel, sin modelo) ─────────► fin
       └──► búsqueda híbrida ──► sin fuente suficiente ────► fin
                              └──► Claude (solo fragmentos, citas [F#]) ──► fin

Capas contra alucinaciones: dominio, aclaración, datos exactos sin modelo, umbral de relevancia, instrucción de citar,
"SIN_INFORMACION" explícito y citas armadas por el servidor (el modelo nunca escribe títulos, fechas ni enlaces de fuentes).
"""

import re
import time
import uuid
from typing import Any, TypedDict

import anthropic
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph

from . import rules
from .config import settings
from .db import conn
from .search import Hit, hybrid

client = anthropic.AsyncAnthropic() if settings.has_anthropic_key else None

PII = re.compile(r"\b\d{10}\b|[\w.+-]+@[\w-]+\.[\w.]+")
MARK = re.compile(r"\s?\[F\d+(?:\s*,\s*F?\d+)*\]")
MIN_COS = 0.42  # por debajo, y sin coincidencias de texto, no hay fuente suficiente (calibrar con el set de control)

OFFICE = {
    "tramites": ("Dirección de Registros Académicos", "Academic Records Office"),
    "academico": ("Dirección de Servicios Académicos", "Academic Services Office"),
    "bienestar": ("Dirección de Bienestar Universitario", "University Welfare Office"),
    "representacion": ("Federación de Estudiantes de Yachay Tech (FEYT)", "Yachay Tech Student Federation (FEYT)"),
}

SYSTEM = """Eres Yachi, el asistente institucional de la Universidad Yachay Tech (Urcuquí, Ecuador). Ayudas a estudiantes con trámites, normativa, servicios y ubicaciones.

Reglas obligatorias:
1. Responde SOLO con información que esté en los FRAGMENTOS del mensaje. No uses conocimiento propio ni supongas.
2. Después de cada dato escribe la marca del fragmento de donde sale, por ejemplo [F2]. Si un dato no está en ningún fragmento, no lo escribas.
3. Si los fragmentos no permiten responder la pregunta, responde exactamente SIN_INFORMACION y nada más.
4. No inventes fechas, plazos, montos, correos, nombres de personas ni enlaces.
5. Si la información corresponde a un período (por ejemplo 2026SEM02), dilo: puede no aplicar a otros períodos.
6. Responde en el idioma indicado en IDIOMA. Los fragmentos están en español: tradúcelos si hace falta.
7. Sé breve y claro (máximo 160 palabras). Para un trámite usa una lista numerada: qué se hace, en qué orden y con qué documentos.
8. No pidas ni repitas datos personales. Tono cercano y respetuoso, sin emojis."""


class State(TypedDict, total=False):
    question: str
    lang: str
    history: list[dict]
    session_id: str
    message_id: str
    t0: float
    route: str
    place: Any
    room: str | None
    hits: list[Hit]
    kind: str
    doc_ids: list[str]
    tokens_in: int
    tokens_out: int


def _t(lang: str, es: str, en: str) -> str:
    return en if lang == "en" else es


def _source(h: Hit) -> dict:
    body = h.texto.split("\n\n", 1)[-1].strip()
    page = None
    m = re.search(r"p[áa]g(?:ina)?\.?\s*(\d+)", h.seccion or "", re.I)
    if m and h.kind == "pdf":
        page = int(m.group(1))
    return {
        "docId": h.doc_id, "title": h.title, "version": h.version, "docDate": h.fecha_consulta or "", "dateKind": "consulta",
        "periodo": h.periodo, "locator": h.seccion or None, "snippet": (body[:260] + "…") if len(body) > 260 else body,
        "url": h.url if h.acceso != "interno" else None, "page": page, "origin": "web" if h.acceso == "publico" else "interno", "acceso": h.acceso,
    }


def _contact(topic: str | None, lang: str) -> dict:
    es, en = OFFICE.get(topic or "", ("Secretaría General", "Registrar's Office"))
    return {"office": en if lang == "en" else es}


# ---------------------------------------------------------------- nodos

async def route(state: State) -> State:
    q = PII.sub("[dato omitido]", state["question"])
    if rules.out_of_domain(q):
        return {"question": q, "route": "ood"}
    if rules.clarify(q, state["lang"]):
        return {"question": q, "route": "clarify"}
    room = rules.room_lookup(q)
    if room:
        return {"question": q, "route": "place", "place": room[0], "room": room[1]}
    pl = rules.place_lookup(q)
    if pl:
        return {"question": q, "route": "place", "place": pl, "room": None}
    return {"question": q, "route": "retrieve"}


async def out_of_domain(state: State) -> State:
    get_stream_writer()({"type": "unknown", "item": {"reason": "fuera_de_dominio"}})
    return {"kind": "fuera_de_dominio", "doc_ids": []}


async def ask_clarify(state: State) -> State:
    c = rules.clarify(state["question"], state["lang"])
    get_stream_writer()({"type": "clarify", **c})
    return {"kind": "aclaracion", "doc_ids": []}


async def place_answer(state: State) -> State:
    w = get_stream_writer()
    p: rules.Place = state["place"]
    lang = state["lang"]
    name = (p.name_en or p.name) if lang == "en" else p.name
    w({"type": "tool", "name": "mostrar_en_mapa", "input": {"destino": p.id, "lat": p.lat, "lon": p.lon, "nombre": name, "horario": p.horario, "mapsUrl": p.maps_url}})
    if state.get("room"):
        code, ubic, compartida = p.extra.split("|")
        text = _t(lang, f"El aula **{code}** está en **{p.name}**, {ubic}.", f"Classroom **{code}** is in **{p.name}**, {ubic}.")
        if compartida == "compartida":
            text += _t(lang, " El punto del mapa es el de la zona; el aula está dentro de ese edificio.", " The map point is the area's; the classroom is inside that building.")
        doc = "distribucion_aulas"
        locator = _t(lang, f"fila del aula {code}", f"row for classroom {code}")
    else:
        text = _t(lang, f"**{name}** está marcado en el mapa", f"**{name}** is marked on the map")
        if p.uso:
            text += f" ({p.uso})"
        text += "."
        if p.horario:
            text += _t(lang, f" Horario de apertura: **{p.horario}**.", f" Opening hours: **{p.horario}**.")
        doc = p.fuente
        locator = _t(lang, f"fila {p.name}", f"row {p.name}")
    for part in re.findall(r"\S+\s*", text):
        w({"type": "token", "text": part})
    with conn() as c:
        d = c.execute("SELECT id, title, version, fecha_consulta::text AS f, acceso FROM documents WHERE id = %s", (doc,)).fetchone()
    if d:
        w({"type": "sources", "items": [{"docId": d["id"], "title": d["title"], "version": d["version"], "docDate": d["f"] or "", "dateKind": "consulta",
                                          "locator": locator, "snippet": text.replace("**", ""), "url": None, "origin": "interno", "acceso": d["acceso"]}]})
    return {"kind": "lugar", "doc_ids": [doc]}


async def retrieve(state: State) -> State:
    w = get_stream_writer()
    lang = state["lang"]
    w({"type": "status", "label": _t(lang, "Buscando en los documentos oficiales", "Searching official documents")})
    q = state["question"]
    prev = next((h["content"] for h in reversed(state.get("history") or []) if h.get("role") == "user"), "")
    query = f"{prev} {q}" if prev and len(q.split()) < 6 else q  # preguntas de seguimiento cortas ("¿y los requisitos?")
    hits = hybrid(query, k=5)
    if not hits or (max(h.cos for h in hits) < MIN_COS and max(h.fts for h in hits) == 0):
        w({"type": "unknown", "item": {"reason": "sin_fuente", "contact": _contact(hits[0].topic_id if hits else None, lang)}})
        return {"hits": [], "kind": "sin_fuente", "doc_ids": []}
    w({"type": "status", "label": f"{_t(lang, 'Leyendo', 'Reading')} {hits[0].title}"})
    return {"hits": hits}


async def generate(state: State) -> State:
    w = get_stream_writer()
    lang = state["lang"]
    hits = state["hits"]
    if client is None:
        # Sin clave de API: modo extractivo (muestra el fragmento más relevante, sin redactar). Útil para probar la búsqueda.
        h = hits[0]
        body = h.texto.split("\n\n", 1)[-1].strip()
        if len(body) > 900:  # corta en un salto de línea para no dejar filas de tabla a medias
            cut = body.rfind("\n", 0, 900)
            body = body[:cut].rstrip() if cut > 200 else body[:900]
        intro = _t(lang, "Esto dice el documento oficial más relevante:\n\n", "This is what the most relevant official document says:\n\n")
        for part in re.findall(r"\S+\s*", intro + body):
            w({"type": "token", "text": part})
        w({"type": "sources", "items": [_source(h)]})
        return {"kind": "respuesta", "doc_ids": [h.doc_id], "tokens_in": 0, "tokens_out": 0}

    frags = "\n\n".join(
        f"[F{i + 1}] {h.title} | {h.seccion or 'sin sección'} | versión {h.version}{f' | período {h.periodo}' if h.periodo else ''}\n{h.texto.split(chr(10) + chr(10), 1)[-1][:3000]}"
        for i, h in enumerate(hits)
    )
    msgs: list[dict] = []
    for turn in (state.get("history") or [])[-6:]:
        if turn.get("content") and turn.get("role") in ("user", "assistant"):
            if msgs and msgs[-1]["role"] == turn["role"]:
                continue
            msgs.append({"role": turn["role"], "content": turn["content"][:1200]})
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    if msgs and msgs[-1]["role"] == "user":
        msgs.pop()
    msgs.append({"role": "user", "content": f"IDIOMA: {'inglés' if lang == 'en' else 'español'}\n\nFRAGMENTOS:\n{frags}\n\nPREGUNTA: {state['question']}"})

    buf, sent, cited = "", 0, set()
    head_checked = False
    async with client.messages.stream(
        model=settings.anthropic_model, max_tokens=900, system=SYSTEM, messages=msgs,
        thinking={"type": "disabled"}, cache_control={"type": "ephemeral"},
    ) as stream:
        async for text in stream.text_stream:
            buf += text
            if not head_checked:
                if len(buf.strip()) < 16 and "SIN_INFORMACION".startswith(buf.strip()[:15]):
                    continue
                head_checked = True
                if buf.strip().startswith("SIN_INFORMACION"):
                    break
            cited.update(int(n) for m in re.findall(r"\[F([\d,\sF]+)\]", buf) for n in re.findall(r"\d+", m))
            clean = MARK.sub("", buf)
            # No enviar una marca a medio escribir ("[F" al final).
            cut = clean.rfind("[")
            safe = clean if cut == -1 or "]" in clean[cut:] else clean[:cut]
            if len(safe) > sent:
                w({"type": "token", "text": safe[sent:]})
                sent = len(safe)
        final = await stream.get_final_message()
    usage = final.usage
    if buf.strip().startswith("SIN_INFORMACION"):
        w({"type": "unknown", "item": {"reason": "sin_fuente", "contact": _contact(hits[0].topic_id, lang)}})
        return {"kind": "sin_fuente", "doc_ids": [], "tokens_in": usage.input_tokens, "tokens_out": usage.output_tokens}
    clean = MARK.sub("", buf)
    if len(clean) > sent:
        w({"type": "token", "text": clean[sent:]})
    used = [hits[i - 1] for i in sorted(cited) if 0 < i <= len(hits)]
    if not used:
        used = hits[:1]  # respuesta sin marcas: se muestra la fuente principal y queda registrado para revisión
    seen, sources = set(), []
    for h in used:
        if h.chunk_id not in seen:
            seen.add(h.chunk_id)
            sources.append(_source(h))
    w({"type": "sources", "items": sources})
    return {"kind": "respuesta" if cited else "respuesta_sin_marcas", "doc_ids": [h.doc_id for h in used],
            "tokens_in": usage.input_tokens, "tokens_out": usage.output_tokens}


async def finish(state: State) -> State:
    w = get_stream_writer()
    lang = state["lang"]
    kind = state.get("kind", "error")
    with conn() as c:
        sug = c.execute(
            "SELECT question FROM messages WHERE kind IN ('respuesta','lugar') AND lang = %s AND question <> %s "
            "AND created_at > now() - interval '7 days' GROUP BY question ORDER BY count(*) DESC LIMIT 3",
            (lang if lang != "qu" else "es", state["question"]),
        ).fetchall()
        latency = int((time.time() - state["t0"]) * 1000)
        c.execute(
            "INSERT INTO messages (id, session_id, question, lang, kind, doc_ids, latency_ms, tokens_in, tokens_out) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (state["message_id"], state["session_id"], state["question"], lang, kind, state.get("doc_ids") or [], latency,
             state.get("tokens_in"), state.get("tokens_out")),
        )
        if kind in ("sin_fuente", "fuera_de_dominio"):
            record_unanswered(c, state["question"], lang, kind)
    if sug and kind != "aclaracion":
        w({"type": "suggestions", "items": [s["question"] for s in sug]})
    w({"type": "done", "messageId": state["message_id"], "latencyMs": latency})
    return {}


def record_unanswered(c, q: str, lang: str, reason: str, detail: str | None = None) -> None:
    qn = rules.norm(q)
    c.execute(
        """INSERT INTO unanswered (id, q, q_norm, lang, reason, details) VALUES (%s,%s,%s,%s,%s,%s::jsonb)
           ON CONFLICT (q_norm, reason) DO UPDATE SET count = unanswered.count + 1, last_at = now(),
             status = CASE WHEN unanswered.status = 'descartada' THEN 'nuevo' ELSE unanswered.status END,
             details = CASE WHEN %s::text IS NULL THEN unanswered.details
                            ELSE jsonb_set(unanswered.details, ARRAY[%s::text], to_jsonb(coalesce((unanswered.details->>%s::text)::int, 0) + 1)) END""",
        (uuid.uuid4().hex[:8], q, qn, lang, reason, f'{{"{detail}": 1}}' if detail else "{}", detail, detail, detail),
    )


def _next(state: State) -> str:
    return state["route"]


def build():
    g = StateGraph(State)
    g.add_node("route", route)
    g.add_node("ood", out_of_domain)
    g.add_node("clarify", ask_clarify)
    g.add_node("place", place_answer)
    g.add_node("retrieve", retrieve)
    g.add_node("generate", generate)
    g.add_node("finish", finish)
    g.add_edge(START, "route")
    g.add_conditional_edges("route", _next, {"ood": "ood", "clarify": "clarify", "place": "place", "retrieve": "retrieve"})
    g.add_conditional_edges("retrieve", lambda s: "generate" if s.get("hits") else "finish", {"generate": "generate", "finish": "finish"})
    for n in ("ood", "clarify", "place", "generate"):
        g.add_edge(n, "finish")
    g.add_edge("finish", END)
    return g.compile()


graph = build()


async def run(question: str, lang: str, history: list[dict], session_id: str):
    """Ejecuta el grafo y produce los eventos SSE en orden."""
    state: State = {"question": question, "lang": lang, "history": history, "session_id": session_id,
                    "message_id": uuid.uuid4().hex, "t0": time.time()}
    async for ev in graph.astream(state, stream_mode="custom"):
        yield ev
