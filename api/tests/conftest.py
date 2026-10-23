import pytest

from app.geo_conversation import InMemoryGeoStateStore, reset_store, use_store_for_testing


@pytest.fixture(autouse=True)
def isolated_geo_state_store():
    """Keep unit tests independent of a PostgreSQL service; production uses PostgreSQL."""
    use_store_for_testing(InMemoryGeoStateStore())
    yield
    reset_store()


def pytest_asyncio_loop_factories(config, item):
    """Use Uvicorn's uvloop; the sandbox selector loop hangs on executor shutdown."""
    import uvloop

    return {"uvloop": uvloop.new_event_loop}
