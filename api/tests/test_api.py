import json

from fastapi.testclient import TestClient

import app.main as main_module
from app.db import get_session


class FakeAgent:
    def __init__(self, _settings):
        pass

    async def stream(self, _request, _session):
        yield "custom", {"type": "token", "text": "La respuesta está respaldada."}
        yield "values", {
            "unknown": False,
            "retrieved": [
                {
                    "doc_id": "reglamento-1",
                    "title": "Reglamento académico",
                    "validity_period": "2026",
                    "section": "Matrícula",
                    "content": "La matrícula se realiza en línea.",
                }
            ],
        }


async def fake_session():
    yield object()


def test_chat_stream_matches_frontend_sse_contract(monkeypatch) -> None:
    monkeypatch.setattr(main_module, "RagAgent", FakeAgent)
    main_module.app.dependency_overrides[get_session] = fake_session
    try:
        with TestClient(main_module.app) as client:
            response = client.post(
                "/chat",
                json={"sessionId": "s1", "message": "¿Cómo es la matrícula?", "lang": "es", "history": []},
            )
    finally:
        main_module.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = [json.loads(block.removeprefix("data: ")) for block in response.text.strip().split("\n\n")]
    assert [event["type"] for event in events] == ["status", "token", "status", "sources", "suggestions", "done"]
    assert events[1] == {"type": "token", "text": "La respuesta está respaldada."}
    assert events[3]["items"][0]["locator"] == "Matrícula"
    assert events[-1]["messageId"]
