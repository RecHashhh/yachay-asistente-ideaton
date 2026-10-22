from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.db import SessionLocal
from app.importer import import_osm
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def imported_data() -> None:
    settings = get_settings()
    path = Path(settings.osm_path)
    assert path.exists(), f"No existe el OSM en {path}"
    with SessionLocal() as session:
        import_osm(session, path)


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client
