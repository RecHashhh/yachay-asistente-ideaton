"""Conexiones a PostgreSQL.

- `conn()` / `open_pool()`: pool psycopg 3 de Yachi (base DATABASE_URL), lo usan la API, el grafo y el Portal.
- `engine` / `SessionLocal` / `get_session()`: SQLAlchemy asíncrono de la capa del agente original (seed con Ollama,
  Alembic, docker-compose). Apunta a su propia base (POSTGRES_*); el motor no abre conexiones hasta que se usa.
"""

from collections.abc import AsyncIterator
from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

settings = get_settings()

# ------------------------------------------------------------------ Yachi (psycopg)
pool = ConnectionPool(settings.database_url, min_size=1, max_size=8, kwargs={"row_factory": dict_row}, open=False)
geo_lock_pool = ConnectionPool(
    settings.database_url,
    min_size=1,
    max_size=settings.geo_lock_pool_size,
    kwargs={"row_factory": dict_row},
    open=False,
)


def open_pool() -> None:
    pool.open(wait=True, timeout=10)


def open_geo_lock_pool() -> None:
    geo_lock_pool.open(wait=True, timeout=10)


def close_pools() -> None:
    geo_lock_pool.close()
    pool.close()


@contextmanager
def conn():
    with pool.connection() as c:
        yield c


@contextmanager
def geo_lock_conn():
    """Use a separate pool so long lived advisory locks cannot exhaust the query pool."""
    with geo_lock_pool.connection() as c:
        yield c


# ------------------------------------------------------------------ capa SQLAlchemy del agente original
engine = create_async_engine(
    settings.sqlalchemy_url,
    pool_size=5,
    max_overflow=5,
    pool_pre_ping=True,
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
