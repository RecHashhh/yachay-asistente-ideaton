from langchain_core.messages import AIMessage
import pytest

from app.agent import RagAgent
from app.config import Settings
from app.retrieval import RetrievedChunk
from app.schemas import ChatRequest


def chunk(chunk_id="c1", doc_id="d1", title="Guía de matrícula"):
    return RetrievedChunk(
        chunk_id=chunk_id,
        doc_id=doc_id,
        title=title,
        kind="guia",
        source_url=None,
        validity_period="2026",
        section="Inscripción en línea",
        content="La matrícula se completa en línea.",
        similarity=0.88,
    )


class FakeRetriever:
    def __init__(self, focused_results=None, global_results=None):
        self.focused_results = focused_results or []
        self.global_results = global_results or []
        self.search_calls = []

    async def list_documents(self, _session):
        return [
            {
                "doc_id": f"d{index}",
                "title": "Guía de matrícula" if index == 1 else f"Documento {index}",
                "description": "Pasos para matricularse." if index == 1 else "Información institucional.",
                "kind": "guia",
                "validity_period": "2026",
                "source_url": None,
            }
            for index in range(1, 7)
        ]

    async def search(self, _session, query, document_ids=None):
        self.search_calls.append((query, document_ids))
        return self.focused_results if document_ids else self.global_results


class FakeSelector:
    def __init__(self, selected_ids):
        self.selected_ids = selected_ids

    async def ainvoke(self, _messages):
        return AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "search_rag",
                    "args": {"query": "¿Cómo me matriculo?", "document_ids": self.selected_ids},
                    "id": "search-call-1",
                    "type": "tool_call",
                }
            ],
        )


class FakeChatModel:
    def __init__(self, selected_ids=None):
        self.selected_ids = selected_ids or []
        self.answer_calls = 0

    def bind_tools(self, _tools, **_kwargs):
        return FakeSelector(self.selected_ids)

    async def astream(self, _messages):
        self.answer_calls += 1
        yield type("Chunk", (), {"content": "La matrícula se realiza en línea."})()


class FakeSession:
    pass


def make_agent(monkeypatch, retriever, selected_ids=None):
    import app.agent as agent_module

    model = FakeChatModel(selected_ids)
    monkeypatch.setattr(agent_module, "ChatAnthropic", lambda **_kwargs: model)
    agent = RagAgent(Settings(anthropic_api_key="fake-key"), retriever=retriever)
    return agent, model


@pytest.mark.asyncio
async def test_agent_searches_multiple_selected_documents_and_streams_answer(monkeypatch) -> None:
    retriever = FakeRetriever(focused_results=[chunk()])
    agent, model = make_agent(monkeypatch, retriever, ["d1", "d2"])
    request = ChatRequest(sessionId="s1", message="¿Cómo me matriculo?", lang="es")

    events = [event async for event in agent.stream(request, FakeSession())]

    custom_events = [payload for mode, payload in events if mode == "custom"]
    assert custom_events == [{"type": "token", "text": "La matrícula se realiza en línea."}]
    values = [payload for mode, payload in events if mode == "values"][-1]
    assert values["unknown"] is False
    assert retriever.search_calls == [("¿Cómo me matriculo?", ["d1", "d2"])]
    assert model.answer_calls == 1


@pytest.mark.asyncio
async def test_agent_caps_selection_at_five_document_ids(monkeypatch) -> None:
    retriever = FakeRetriever(focused_results=[chunk()])
    selected_ids = ["d1", "d2", "d3", "d4", "d5", "d6"]
    agent, _ = make_agent(monkeypatch, retriever, selected_ids)
    request = ChatRequest(sessionId="s1", message="¿Cómo me matriculo?", lang="es")

    [event async for event in agent.stream(request, FakeSession())]

    assert retriever.search_calls == [("¿Cómo me matriculo?", selected_ids[:5])]


@pytest.mark.asyncio
async def test_empty_selection_searches_full_corpus(monkeypatch) -> None:
    retriever = FakeRetriever(global_results=[chunk()])
    agent, _ = make_agent(monkeypatch, retriever, [])
    request = ChatRequest(sessionId="s1", message="¿Cómo me matriculo?", lang="es")

    events = [event async for event in agent.stream(request, FakeSession())]

    values = [payload for mode, payload in events if mode == "values"][-1]
    assert values["unknown"] is False
    assert retriever.search_calls == [("¿Cómo me matriculo?", None)]


@pytest.mark.asyncio
async def test_empty_focused_search_falls_back_to_global(monkeypatch) -> None:
    found = chunk()
    retriever = FakeRetriever(global_results=[found])
    agent, _ = make_agent(monkeypatch, retriever, ["d1"])
    request = ChatRequest(sessionId="s1", message="¿Cómo me matriculo?", lang="es")

    events = [event async for event in agent.stream(request, FakeSession())]

    values = [payload for mode, payload in events if mode == "values"][-1]
    assert values["unknown"] is False
    assert retriever.search_calls == [
        ("¿Cómo me matriculo?", ["d1"]),
        ("¿Cómo me matriculo?", None),
    ]


@pytest.mark.asyncio
async def test_unknown_after_global_fallback_skips_answer_generation(monkeypatch) -> None:
    retriever = FakeRetriever()
    agent, model = make_agent(monkeypatch, retriever, ["d1"])
    request = ChatRequest(sessionId="s1", message="¿Cómo me matriculo?", lang="es")

    events = [event async for event in agent.stream(request, FakeSession())]

    assert ("custom", {"type": "unknown", "item": {"reason": "sin_fuente"}}) in events
    assert not any(mode == "custom" and payload.get("type") == "token" for mode, payload in events)
    assert model.answer_calls == 0
    assert retriever.search_calls == [("¿Cómo me matriculo?", ["d1"]), ("¿Cómo me matriculo?", None)]
