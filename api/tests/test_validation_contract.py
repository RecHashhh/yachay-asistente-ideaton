"""HTTP contracts isolated from credentials, models, and the live database."""

from contextlib import contextmanager
from unittest.mock import patch

import httpx
import pytest
from fastapi import HTTPException

from app import main


@pytest.fixture
def authorized_admin(monkeypatch):
    main.app.dependency_overrides[main.admin] = lambda: "prueba@example.invalid"
    yield
    main.app.dependency_overrides.clear()


@pytest.fixture
def client():
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=main.app),
        base_url="http://test",
    )


@pytest.mark.asyncio
async def test_invalid_imports_do_not_touch_storage(authorized_admin, client):
    async with client as api:
        with patch.object(main, "conn") as connection:
            for body in ({"cases": []}, {"cases": [{"id": "a", "q": "test", "lang": "fr", "expect": "no_se"}]}):
                assert (await api.put("/admin/validation/cases", json=body)).status_code == 422
            duplicate = {"id": "a", "q": "test", "lang": "es", "expect": "no_se"}
            assert (await api.put("/admin/validation/cases", json={"cases": [duplicate, duplicate]})).status_code == 400
            connection.assert_not_called()


@pytest.mark.asyncio
async def test_valid_import_uses_one_transaction(authorized_admin, client):
    calls = []

    class Connection:
        def execute(self, sql, params=None):
            calls.append((sql, params))

    @contextmanager
    def transaction():
        yield Connection()

    async with client as api:
        with patch.object(main, "conn", transaction), patch.object(main, "audit") as audit:
            case = {"id": "T1", "q": "Pregunta de ejemplo", "lang": "es", "expect": "no_se"}
            response = await api.put("/admin/validation/cases", json={"cases": [case]})
            assert response.status_code == 200
            assert response.json()["total"] == 1
            assert calls[0][0].startswith("LOCK")
            assert calls[-1][1] == ("T1", "Pregunta de ejemplo", "es", "no_se")
            audit.assert_called_once()


def test_admin_rejects_missing_authentication():
    main.app.dependency_overrides.clear()
    with pytest.raises(HTTPException) as error:
        main.admin(authorization="")
    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_attachment_is_rejected_before_graph_or_storage(client):
    async with client as api:
        with patch.object(main.graph, "run") as graph_run:
            response = await api.post("/chat", json={"sessionId": "test", "message": "Consulta", "attachments": [{"name": "test.pdf"}]})
            assert response.status_code == 400
            graph_run.assert_not_called()


@pytest.mark.asyncio
async def test_inquiry_rejects_invalid_status(authorized_admin, client):
    async with client as api:
        with patch.object(main, "conn") as connection:
            assert (await api.patch("/admin/inquiries/YT-TEST", json={"status": "invalid"})).status_code == 422
            connection.assert_not_called()
