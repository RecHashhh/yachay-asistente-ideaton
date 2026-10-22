"""Contrato del /chat integrado (grafo de Yachi + agente de búsqueda guiada), sin claves, sin modelo y sin base.

Cubre lo mismo que las pruebas originales del agente: SSE que entiende el frontend, el historial con fuentes llega al
backend, un saludo no dispara búsqueda; y además el camino del agente sobre el índice de Yachi.
"""

import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

import app.main as main_module
from app import graph, rules
from app.yachi_retriever import YachiRetriever

SOURCE = {
    "docId": "reglamento-1",
    "title": "Reglamento académico",
    "version": "2026",
    "locator": "Matrícula",
    "snippet": "La matrícula se realiza en línea.",
}


def parse_events(response):
    return [json.loads(block.removeprefix("data: ")) for block in response.text.strip().split("\n\n")]


def post_chat(monkeypatch, events, history=None, message="¿Cómo es la matrícula?"):
    received = {}

    async def fake_run(question, lang, hist, session_id):
        received.update(question=question, lang=lang, history=hist, session_id=session_id)
        for event in events:
            yield event

    monkeypatch.setattr(main_module.graph, "run", fake_run)
    client = TestClient(main_module.app)  # sin contexto: no abre la base ni carga modelos
    response = client.post("/chat", json={"sessionId": "s1", "message": message, "lang": "es", "history": history or []})
    return response, received


def test_chat_stream_matches_frontend_sse_contract(monkeypatch) -> None:
    events = [
        {"type": "status", "label": "Buscando en los documentos oficiales"},
        {"type": "map", "payload": {"type": "FeatureCollection", "features": []}},
        {"type": "step", "id": "search", "label": "Busqué en 75 documentos oficiales", "state": "done"},
        {"type": "token", "text": "La respuesta está respaldada."},
        {"type": "sources", "items": [SOURCE]},
        {"type": "done", "messageId": "m1", "latencyMs": 40},
    ]
    response, _ = post_chat(monkeypatch, events)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    out = parse_events(response)
    assert [e["type"] for e in out] == ["status", "map", "step", "token", "sources", "done"]
    assert out[1]["payload"]["type"] == "FeatureCollection"
    assert out[4]["items"][0]["locator"] == "Matrícula"
    assert out[-1]["messageId"]


def test_chat_request_accepts_and_forwards_history_sources(monkeypatch) -> None:
    history = [{"role": "assistant", "content": "La matrícula se realiza en línea.", "sources": [SOURCE]}]
    _, received = post_chat(monkeypatch, [{"type": "done", "messageId": "m1"}], history=history, message="¿Y eso dónde se hace?")

    assert received["history"][0]["sources"][0]["docId"] == "reglamento-1"


def test_greeting_does_not_reach_search() -> None:
    assert rules.triage("Hola", "es").route == "smalltalk"
    assert rules.triage("hola yachi", "es").route == "smalltalk"

class FakeAgent:
    def __init__(self, retrieved=None, reused=None):
        self.retrieved = retrieved or []
        self.reused = reused or []
        self.calls = []

    async def gather(self, state, session, notify=None):
        self.calls.append(state)
        if notify:
            notify("catalog", {"n": 75})
            notify("search", {"query": state["message"], "scope": "focused", "found": len(self.retrieved),
                              "documents": [{"docId": "d1", "title": "Guía de matrícula"}]})
        return {"retrieved": self.retrieved, "reused_sources": self.reused, "searched": True, "unknown": not (self.retrieved or self.reused)}


def fake_hit(chunk_id="d1#1", doc_id="d1"):
    return SimpleNamespace(chunk_id=chunk_id, doc_id=doc_id, title="Guía de matrícula", seccion="Inscripción", texto="Documento: Guía\n\nTexto.",
                           version="2026", periodo=None, fecha_consulta=None, url=None, acceso="publico", kind="pdf", audiencia="estudiantes",
                           topic_id="tramites", score=1.0, cos=0.8, fts=1.0)


@pytest.mark.asyncio
async def test_agent_results_become_yachi_hits_with_real_steps(monkeypatch) -> None:
    events = []
    agent = FakeAgent(retrieved=[{"chunk_id": "d1#1", "similarity": 0.8}])
    seen_ids = []
    monkeypatch.setattr(graph, "_agent", lambda: agent)
    monkeypatch.setattr(graph, "hits_by_ids", lambda ids, scores=None: seen_ids.extend(ids) or [fake_hit()])
    monkeypatch.setattr(graph, "get_stream_writer", lambda: events.append)
    monkeypatch.setattr(graph.settings, "anthropic_api_key", SecretStr("fake-key"))
    monkeypatch.setattr(graph.settings, "llm_switch", "on")  # independiente del YACHI_LLM del .env local
    monkeypatch.setattr(graph.usage, "budget_ok", lambda: True)  # sin base en estas pruebas
    monkeypatch.setattr(graph, "_n_docs", lambda: 75)

    result = await graph.retrieve({"question": "¿Cómo me matriculo?", "lang": "es", "history": []})

    assert seen_ids == ["d1#1"]
    assert result["hits"][0].doc_id == "d1"
    steps = {e["id"]: e for e in events if e["type"] == "step"}
    assert steps["catalog"]["label"].startswith("Revisé el catálogo")
    assert steps["search1"]["docs"][0]["title"] == "Guía de matrícula"
    assert steps["search"]["state"] == "done" and "guiado por el catálogo" in steps["search"]["label"]
    assert agent.calls[0]["message"] == "¿Cómo me matriculo?"


@pytest.mark.asyncio
async def test_agent_without_evidence_answers_unknown(monkeypatch) -> None:
    events = []
    monkeypatch.setattr(graph, "_agent", lambda: FakeAgent())
    monkeypatch.setattr(graph, "hits_by_ids", lambda ids, scores=None: [])
    monkeypatch.setattr(graph, "get_stream_writer", lambda: events.append)
    monkeypatch.setattr(graph.settings, "anthropic_api_key", SecretStr("fake-key"))
    monkeypatch.setattr(graph.settings, "llm_switch", "on")  # independiente del YACHI_LLM del .env local
    monkeypatch.setattr(graph.usage, "budget_ok", lambda: True)  # sin base en estas pruebas
    monkeypatch.setattr(graph, "_n_docs", lambda: 75)
    monkeypatch.setattr(graph, "_contact", lambda *a, **k: {"office": "Secretaría General"})

    result = await graph.retrieve({"question": "¿Cuánto cuesta la piscina?", "lang": "es", "history": []})

    assert result["kind"] == "sin_fuente"
    assert any(e["type"] == "unknown" for e in events)


def test_without_key_the_agent_is_not_used(monkeypatch) -> None:
    monkeypatch.setattr(graph.settings, "anthropic_api_key", SecretStr(""))
    assert graph.settings.agent_enabled is False


@pytest.mark.asyncio
async def test_yachi_retriever_caps_selected_documents() -> None:
    with pytest.raises(ValueError):
        await YachiRetriever().search(None, "matrícula", [f"d{i}" for i in range(6)])
