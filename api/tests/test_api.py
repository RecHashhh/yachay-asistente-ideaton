import json

from fastapi.testclient import TestClient

import app.main as main_module
from app.db import get_session


SOURCE = {
    "docId": "reglamento-1",
    "title": "Reglamento académico",
    "version": "2026",
    "locator": "Matrícula",
    "snippet": "La matrícula se realiza en línea.",
}


class FakeAgent:
    def __init__(self, _settings):
        pass

    async def stream(self, _request, _session):
        retrieved = [{
            "doc_id": "reglamento-1",
            "title": "Reglamento académico",
            "validity_period": "2026",
            "section": "Matrícula",
            "content": "La matrícula se realiza en línea.",
        }]
        yield "custom", {"type": "status", "label": "Buscando en los documentos…"}
        yield "values", {"unknown": False, "retrieved": retrieved, "reused_sources": []}
        yield "custom", {"type": "token", "text": "La respuesta está respaldada."}
        yield "values", {"unknown": False, "retrieved": retrieved, "reused_sources": []}


class DirectAgent:
    def __init__(self, _settings):
        pass

    async def stream(self, _request, _session):
        yield "values", {"unknown": False, "retrieved": [], "reused_sources": []}
        yield "custom", {"type": "token", "text": "¡Hola! ¿En qué te ayudo?"}
        yield "values", {"unknown": False, "retrieved": [], "reused_sources": []}


class HistoryAgent:
    def __init__(self, _settings):
        pass

    async def stream(self, request, _session):
        self.__class__.received_history = request.history
        yield "values", {"unknown": False, "retrieved": [], "reused_sources": [SOURCE]}
        yield "custom", {"type": "token", "text": "Se realiza en línea. [S1]"}
        yield "values", {"unknown": False, "retrieved": [], "reused_sources": [SOURCE]}


async def fake_session():
    yield object()


def post_chat(monkeypatch, agent, history=None, message="¿Cómo es la matrícula?"):
    monkeypatch.setattr(main_module, "RagAgent", agent)
    main_module.app.dependency_overrides[get_session] = fake_session
    try:
        with TestClient(main_module.app) as client:
            return client.post(
                "/chat",
                json={"sessionId": "s1", "message": message, "lang": "es", "history": history or []},
            )
    finally:
        main_module.app.dependency_overrides.clear()


def parse_events(response):
    return [json.loads(block.removeprefix("data: ")) for block in response.text.strip().split("\n\n")]


def test_chat_stream_matches_frontend_sse_contract_without_initial_search_status(monkeypatch) -> None:
    response = post_chat(monkeypatch, FakeAgent)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = parse_events(response)
    assert [event["type"] for event in events] == ["status", "status", "token", "sources", "suggestions", "done"]
    assert events[0]["label"].startswith("Buscando")
    assert events[1]["label"].startswith("Preparando")
    assert events[2] == {"type": "token", "text": "La respuesta está respaldada."}
    assert events[3]["items"][0]["locator"] == "Matrícula"
    assert events[-1]["messageId"]


def test_direct_greeting_does_not_emit_search_status(monkeypatch) -> None:
    response = post_chat(monkeypatch, DirectAgent, message="Hola")

    events = parse_events(response)
    assert [event["type"] for event in events] == ["token", "suggestions", "done"]
    assert events[0]["text"] == "¡Hola! ¿En qué te ayudo?"


def test_chat_request_accepts_and_reemits_history_sources(monkeypatch) -> None:
    response = post_chat(
        monkeypatch,
        HistoryAgent,
        history=[{"role": "assistant", "content": "La matrícula se realiza en línea. [S1]", "sources": [SOURCE]}],
        message="¿Y eso dónde se hace?",
    )

    events = parse_events(response)
    assert HistoryAgent.received_history[0].sources[0].docId == "reglamento-1"
    assert [event["type"] for event in events] == ["status", "token", "sources", "suggestions", "done"]
    assert events[2]["items"] == [SOURCE]
