"""Fixtures que aíslan las pruebas de PostgreSQL y del estado geográfico compartido."""

import pytest

from app import usage
from app.geo_conversation import InMemoryGeoStateStore, reset_store, use_store_for_testing


@pytest.fixture(autouse=True)
def isolated_geo_state_store():
    """Keep unit tests independent of a PostgreSQL service; production uses PostgreSQL."""
    use_store_for_testing(InMemoryGeoStateStore())
    yield
    reset_store()


@pytest.fixture(autouse=True)
def _usage_sin_base(monkeypatch):
    """Las pruebas unitarias no dependen de una base ni consumen el presupuesto real."""
    monkeypatch.setattr(usage, "spent", lambda: 0.0)
    monkeypatch.setattr(usage, "record", lambda *a, **k: None)


def pytest_asyncio_loop_factories(config, item):
    """Use Uvicorn's uvloop; the sandbox selector loop hangs on executor shutdown."""
    import uvloop

    return {"uvloop": uvloop.new_event_loop}
