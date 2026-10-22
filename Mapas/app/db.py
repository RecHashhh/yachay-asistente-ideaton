from __future__ import annotations

from collections.abc import Iterator

import re

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
if not re.fullmatch(r"[a-z_][a-z0-9_]*", settings.database_schema):
    raise ValueError("DATABASE_SCHEMA debe ser un identificador PostgreSQL válido")
@event.listens_for(engine, "connect")
def _set_maps_search_path(dbapi_connection, _connection_record) -> None:
    original_autocommit = dbapi_connection.autocommit
    dbapi_connection.autocommit = True
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute(f"SET search_path TO {settings.database_schema}, public")
        cursor.close()
    finally:
        dbapi_connection.autocommit = original_autocommit
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
