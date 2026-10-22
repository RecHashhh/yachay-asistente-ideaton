from langchain_core.messages import AIMessage, SystemMessage
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


def search_call(query="¿Cómo me matriculo?", document_ids=None):
    return {
        "name": "search_rag",
        "args": {"query": query, "document_ids": document_ids or []},
    }


class FakeRetriever:
    def __init__(self, focused_results=None, global_results=None, validated_sources=None):
        self.focused_results = focused_results or []
        self.global_results = global_results or []
        self.validated_sources = validated_sources
        self.search_calls = []
        self.list_calls = 0
        self.validation_calls = []

    async def list_documents(self, _session):
        self.list_calls += 1
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

    async def validate_history_sources(self, _session, sources, _lang="es"):
        self.validation_calls.append(sources)
        if self.validated_sources is not None:
            return self.validated_sources
        return sources


class FakeSelector:
    def __init__(self, model, tool_names):
        self.model = model
        self.tool_names = tool_names

    async def ainvoke(self, messages):
        self.model.decision_messages.append(messages)
        call = self.model.decisions.pop(0) if self.model.decisions else None
        if call is None or call["name"] not in self.tool_names:
            return AIMessage(content="")
        return AIMessage(
            content="",
            tool_calls=[{
                **call,
                "id": f"tool-call-{self.model.decision_calls}",
                "type": "tool_call",
            }],
        )


class FakeChatModel:
    def __init__(self, decisions=None):
        self.decisions = list(decisions or [])
        self.decision_calls = 0
        self.answer_calls = 0
        self.decision_messages = []
        self.answer_messages = []
        self.bound_tools = []

    def bind_tools(self, tools, **kwargs):
        names = [item.name for item in tools]
        self.bound_tools.append((names, kwargs))
        self.decision_calls += 1
        return FakeSelector(self, names)

    async def astream(self, messages):
        self.answer_calls += 1
        self.answer_messages.append(messages)
        yield type("Chunk", (), {"content": "La matrícula se realiza en línea."})()


class FakeSession:
    pass


def make_agent(monkeypatch, retriever, decisions=None, **settings):
    import app.agent as agent_module

    model = FakeChatModel(decisions)
    monkeypatch.setattr(agent_module, "ChatAnthropic", lambda **_kwargs: model)
    agent = RagAgent(Settings(anthropic_api_key="fake-key", **settings), retriever=retriever)
    return agent, model


@pytest.mark.asyncio
async def test_agent_searches_selected_documents_and_streams_answer(monkeypatch) -> None:
    retriever = FakeRetriever(focused_results=[chunk()])
    agent, model = make_agent(monkeypatch, retriever, [
        {"name": "list_documents", "args": {}},
        search_call(document_ids=["d1", "d2"]),
    ])
    request = ChatRequest(sessionId="s1", message="¿Cómo me matriculo?", lang="es")

    events = [event async for event in agent.stream(request, FakeSession())]

    custom_events = [payload for mode, payload in events if mode == "custom"]
    assert {"type": "token", "text": "La matrícula se realiza en línea."} in custom_events
    assert any(event["type"] == "status" and event["label"].startswith("Buscando") for event in custom_events)
    values = [payload for mode, payload in events if mode == "values"][-1]
    assert values["unknown"] is False
    assert retriever.list_calls == 1
    assert retriever.search_calls == [("¿Cómo me matriculo?", ["d1", "d2"])]
    assert model.answer_calls == 1
    assert model.bound_tools[0][1]["tool_choice"] == "auto"
    assert all(sum(isinstance(message, SystemMessage) for message in messages) == 1 for messages in model.decision_messages)


@pytest.mark.asyncio
async def test_agent_caps_document_selection_at_five_ids(monkeypatch) -> None:
    retriever = FakeRetriever(focused_results=[chunk()])
    selected_ids = ["d1", "d2", "d3", "d4", "d5", "d6"]
    agent, _ = make_agent(monkeypatch, retriever, [
        {"name": "list_documents", "args": {}},
        search_call(document_ids=selected_ids),
    ])

    [event async for event in agent.stream(
        ChatRequest(sessionId="s1", message="¿Cómo me matriculo?", lang="es"), FakeSession()
    )]

    assert retriever.search_calls == [("¿Cómo me matriculo?", selected_ids[:5])]


@pytest.mark.asyncio
async def test_empty_selection_searches_full_corpus_without_listing_catalog(monkeypatch) -> None:
    retriever = FakeRetriever(global_results=[chunk()])
    agent, _ = make_agent(monkeypatch, retriever, [search_call(document_ids=[])])

    events = [event async for event in agent.stream(
        ChatRequest(sessionId="s1", message="¿Cómo me matriculo?", lang="es"), FakeSession()
    )]

    values = [payload for mode, payload in events if mode == "values"][-1]
    assert values["unknown"] is False
    assert retriever.list_calls == 0
    assert retriever.search_calls == [("¿Cómo me matriculo?", None)]


@pytest.mark.asyncio
async def test_empty_focused_search_falls_back_to_global(monkeypatch) -> None:
    found = chunk()
    retriever = FakeRetriever(global_results=[found])
    agent, _ = make_agent(monkeypatch, retriever, [
        {"name": "list_documents", "args": {}},
        search_call(document_ids=["d1"]),
    ])

    events = [event async for event in agent.stream(
        ChatRequest(sessionId="s1", message="¿Cómo me matriculo?", lang="es"), FakeSession()
    )]

    values = [payload for mode, payload in events if mode == "values"][-1]
    assert values["unknown"] is False
    assert retriever.search_calls == [
        ("¿Cómo me matriculo?", ["d1"]),
        ("¿Cómo me matriculo?", None),
    ]


@pytest.mark.asyncio
async def test_unknown_after_search_skips_answer_generation(monkeypatch) -> None:
    retriever = FakeRetriever()
    agent, model = make_agent(monkeypatch, retriever, [search_call(document_ids=[])])

    events = [event async for event in agent.stream(
        ChatRequest(sessionId="s1", message="¿Cómo me matriculo?", lang="es"), FakeSession()
    )]

    assert ("custom", {"type": "unknown", "item": {"reason": "sin_fuente"}}) in events
    assert not any(mode == "custom" and payload.get("type") == "token" for mode, payload in events)
    assert model.answer_calls == 0
    assert retriever.search_calls == [("¿Cómo me matriculo?", None)]


@pytest.mark.asyncio
async def test_greeting_skips_catalog_and_rag_search(monkeypatch) -> None:
    retriever = FakeRetriever()
    agent, model = make_agent(monkeypatch, retriever)

    events = [event async for event in agent.stream(
        ChatRequest(sessionId="s1", message="Hola", lang="es"), FakeSession()
    )]

    values = [payload for mode, payload in events if mode == "values"][-1]
    assert values["unknown"] is False
    assert retriever.list_calls == 0
    assert retriever.search_calls == []
    assert model.answer_calls == 1
    assert not any(mode == "custom" and payload.get("type") == "status" for mode, payload in events)


@pytest.mark.asyncio
async def test_sourced_follow_up_reuses_validated_history_without_search(monkeypatch) -> None:
    source = {
        "docId": "d1",
        "title": "Guía de matrícula",
        "version": "2026",
        "locator": "Inscripción en línea",
        "snippet": "La matrícula se completa en línea.",
    }
    retriever = FakeRetriever(validated_sources=[source])
    agent, model = make_agent(monkeypatch, retriever, [{"name": "reuse_history", "args": {"turn_index": 0}}])
    request = ChatRequest(
        sessionId="s1",
        message="¿Y eso dónde se hace?",
        lang="es",
        history=[{"role": "assistant", "content": "La matrícula se realiza en línea. [S1]", "sources": [source]}],
    )

    events = [event async for event in agent.stream(request, FakeSession())]

    values = [payload for mode, payload in events if mode == "values"][-1]
    assert values["reused_sources"] == [source]
    assert retriever.validation_calls == [[source]]
    assert retriever.search_calls == []
    assert retriever.list_calls == 0
    decision_messages = model.decision_messages[0]
    assert sum(isinstance(message, SystemMessage) for message in decision_messages) == 1
    assert "SOURCE RECORDS ATTACHED TO HISTORY TURN 0" in decision_messages[1].content
    answer_system = model.answer_messages[0][0].content
    assert "[S1] Document: Guía de matrícula" in answer_system


@pytest.mark.asyncio
async def test_unverified_history_source_falls_back_to_global_search(monkeypatch) -> None:
    source = {
        "docId": "old-doc",
        "title": "Documento antiguo",
        "version": "2024",
        "locator": "Plazo",
        "snippet": "El trámite vence el 1 de mayo.",
    }
    retriever = FakeRetriever(global_results=[chunk()], validated_sources=[])
    agent, _ = make_agent(monkeypatch, retriever, [{"name": "reuse_history", "args": {"turn_index": 0}}])
    request = ChatRequest(
        sessionId="s1",
        message="Verifica si ese plazo sigue vigente.",
        lang="es",
        history=[{"role": "assistant", "content": "Vence el 1 de mayo. [S1]", "sources": [source]}],
    )

    events = [event async for event in agent.stream(request, FakeSession())]

    values = [payload for mode, payload in events if mode == "values"][-1]
    assert values["unknown"] is False
    assert values["reused_sources"] == []
    assert retriever.search_calls == [("Verifica si ese plazo sigue vigente.", None)]


@pytest.mark.asyncio
async def test_unsourced_history_is_context_but_not_a_reuse_tool(monkeypatch) -> None:
    retriever = FakeRetriever(global_results=[chunk()])
    agent, model = make_agent(monkeypatch, retriever, [search_call("¿Cuánto cuesta?", [])])
    request = ChatRequest(
        sessionId="s1",
        message="¿Cuánto cuesta?",
        lang="es",
        history=[{"role": "assistant", "content": "Cuesta 100 dólares."}],
    )

    [event async for event in agent.stream(request, FakeSession())]

    assert retriever.search_calls == [("¿Cuánto cuesta?", None)]
    first_tools = model.bound_tools[0][0]
    assert "reuse_history" not in first_tools
    assert "Cuesta 100 dólares." in str(model.decision_messages[0])


@pytest.mark.asyncio
async def test_agent_can_search_again_after_reading_results(monkeypatch) -> None:
    first, second = chunk("c1"), chunk("c2", title="Otro documento")

    class TwoStepRetriever(FakeRetriever):
        async def search(self, _session, query, document_ids=None):
            self.search_calls.append((query, document_ids))
            return [first] if len(self.search_calls) == 1 else [first, second]

    retriever = TwoStepRetriever()
    agent, model = make_agent(monkeypatch, retriever, [
        {"name": "list_documents", "args": {}},
        search_call("¿Cómo me matriculo?", ["d1"]),
        search_call("Otro documento: requisitos", []),
    ])

    events = [event async for event in agent.stream(
        ChatRequest(sessionId="s1", message="¿Qué trámite existe?", lang="es"), FakeSession()
    )]

    assert [query for query, _ in retriever.search_calls] == ["¿Cómo me matriculo?", "Otro documento: requisitos"]
    values = [payload for mode, payload in events if mode == "values"][-1]
    assert [item["chunk_id"] for item in values["retrieved"]] == ["c1", "c2"]
    assert model.decision_calls == 1
    assert len(model.decision_messages) == 4


@pytest.mark.asyncio
async def test_tool_calls_are_capped(monkeypatch) -> None:
    retriever = FakeRetriever(global_results=[chunk()])
    agent, _ = make_agent(
        monkeypatch, retriever, [search_call(f"consulta {i}", []) for i in range(10)],
        rag_max_tool_calls=3,
    )

    [event async for event in agent.stream(
        ChatRequest(sessionId="s1", message="¿Qué trámite existe?", lang="es"), FakeSession()
    )]

    assert len(retriever.search_calls) == 3


@pytest.mark.asyncio
async def test_list_documents_is_cached(monkeypatch) -> None:
    retriever = FakeRetriever(global_results=[chunk()])
    agent, _ = make_agent(monkeypatch, retriever, [
        {"name": "list_documents", "args": {}},
        {"name": "list_documents", "args": {}},
        search_call(document_ids=[]),
    ])

    [event async for event in agent.stream(
        ChatRequest(sessionId="s1", message="¿Qué trámite existe?", lang="es"), FakeSession()
    )]

    assert retriever.list_calls == 1


@pytest.mark.asyncio
async def test_kichwa_support_reaches_selection_and_answer_without_becoming_sources(monkeypatch):
    monkeypatch.setenv('KICHWA_MEMORY_PATH', '')
    retriever = FakeRetriever(global_results=[chunk()])
    agent, model = make_agent(monkeypatch, retriever, [search_call('Información sobre matrícula', [])])
    events = [event async for event in agent.stream(
        ChatRequest(sessionId='kichwa-test', message='kawsay', lang='qu'), FakeSession()
    )]
    selector_prompt = model.decision_messages[0][0].content
    answer_prompt = model.answer_messages[0][0].content
    assert 'KICHWA LANGUAGE SUPPORT' in selector_prompt
    assert 'kawsay' in selector_prompt
    assert 'do not answer or translate the final response' in selector_prompt
    assert 'Answer in Ecuadorian Kichwa' not in selector_prompt
    assert 'Answer in Kichwa' in answer_prompt
    assert 'concise Spanish' in answer_prompt
    assert 'NOT INSTITUTIONAL EVIDENCE' in answer_prompt
    values = [payload for mode, payload in events if mode == 'values'][-1]
    assert [item['doc_id'] for item in values['retrieved']] == ['d1']
    assert '[S1]' in answer_prompt
