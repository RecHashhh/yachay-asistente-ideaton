import json

import httpx2
import pytest
from langchain_anthropic import ChatAnthropic

import langchain_anthropic.chat_models as chat_models
import app.agent as agent_module
from app.agent import RagAgent
from app.config import Settings
from app.intent_router import GeoIntent


def _message(request_id, content, stop_reason, input_tokens=37, output_tokens=9):
    return {
        "id": request_id,
        "type": "message",
        "role": "assistant",
        "model": "claude-haiku-5-5",
        "content": content,
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
    }


@pytest.mark.asyncio
async def test_installed_anthropic_sdk_structured_classifier_uses_valid_tool_choice(monkeypatch):
    requests = []
    clients = []

    def handler(request):
        body = json.loads(request.content)
        requests.append(body)
        tool = next(tool for tool in body["tools"] if tool["name"] == "IntentDecision")
        return httpx2.Response(200, json=_message("msg-intent", [{
            "type": "tool_use",
            "id": "use-intent-1",
            "name": tool["name"],
            "input": {
                "intent": "ROUTE_REQUEST",
                "origin": "Plaza Las Manuelas",
                "destination": "SENESCYT",
                "confidence": 0.94,
            },
        }], "tool_use"))

    def client_factory(**kwargs):
        client = httpx2.AsyncClient(transport=httpx2.MockTransport(handler), **kwargs)
        clients.append(client)
        return client

    monkeypatch.setattr(chat_models, "_get_default_async_httpx_client", client_factory)
    settings = Settings(anthropic_api_key="sk-ant-mock", anthropic_model="claude-haiku-5-5")
    agent = RagAgent(settings, retriever=object())
    try:
        decision = await agent.classify_intent("Me urge orientarme hacia el edificio que llaman SENESCYT")
    finally:
        for client in clients:
            await client.aclose()

    assert decision is not None
    assert decision.intent == GeoIntent.ROUTE_REQUEST
    assert decision.origin == "Plaza Las Manuelas"
    assert decision.destination == "SENESCYT"
    assert len(requests) == 1
    assert requests[0]["tool_choice"] == {"type": "tool", "name": "IntentDecision"}


@pytest.mark.asyncio
async def test_installed_anthropic_sdk_preserves_tool_use_id_in_rag_tool_result(monkeypatch):
    requests = []
    clients = []
    tool_call_count = 0

    def handler(request):
        nonlocal tool_call_count
        body = json.loads(request.content)
        requests.append(body)
        if body.get("tool_choice", {}).get("type") == "tool":
            tool = next(tool for tool in body["tools"] if tool["name"] == "IntentDecision")
            return httpx2.Response(200, json=_message("msg-intent", [{
                "type": "tool_use",
                "id": "use-intent-2",
                "name": tool["name"],
                "input": {"intent": "DOCUMENT_SEARCH", "confidence": 0.94},
            }], "tool_use"))
        tool_call_count += 1
        if tool_call_count == 1:
            name, args, call_id = "list_documents", {}, "use-list-7"
            content = [{"type": "tool_use", "id": call_id, "name": name, "input": args}]
            return httpx2.Response(200, json=_message("msg-list", content, "tool_use"))
        if tool_call_count == 2:
            name, args, call_id = "search_rag", {"query": "matrícula", "document_ids": ["d1"]}, "use-search-8"
            content = [{"type": "tool_use", "id": call_id, "name": name, "input": args}]
            return httpx2.Response(200, json=_message("msg-search", content, "tool_use"))
        return httpx2.Response(200, json=_message("msg-done", [{"type": "text", "text": "Listo"}], "end_turn"))

    def client_factory(**kwargs):
        client = httpx2.AsyncClient(transport=httpx2.MockTransport(handler), **kwargs)
        clients.append(client)
        return client

    class Retriever:
        async def list_documents(self, _session):
            return [{"doc_id": "d1", "title": "Guía de matrícula", "description": "Matrícula"}]

        async def search(self, _session, query, document_ids=None):
            return []

    monkeypatch.setattr(chat_models, "_get_default_async_httpx_client", client_factory)
    monkeypatch.setattr(agent_module, "get_stream_writer", lambda: lambda _event: None)
    agent = RagAgent(Settings(anthropic_api_key="sk-ant-mock"), retriever=Retriever())
    try:
        result = await agent.gather({"message": "Consulta el trámite de matrícula", "lang": "es"}, object())
    finally:
        for client in clients:
            await client.aclose()

    assert result["searched"] is True
    assert tool_call_count == 3
    assert requests[0]["tool_choice"] == {"type": "tool", "name": "IntentDecision"}
    assert requests[1]["tool_choice"]["type"] == "auto"
    assert requests[1]["tool_choice"]["disable_parallel_tool_use"] is False
    assert requests[2]["messages"][-1]["content"][0]["tool_use_id"] == "use-list-7"
    assert requests[3]["messages"][-1]["content"][0]["tool_use_id"] == "use-search-8"
    assert requests[3]["messages"][-2]["content"][0]["id"] == "use-search-8"
