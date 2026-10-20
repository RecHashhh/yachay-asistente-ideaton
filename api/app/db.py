"""Conexiones a PostgreSQL (psycopg 3 con pool)."""

from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import settings

pool = ConnectionPool(settings.database_url, min_size=1, max_size=8, kwargs={"row_factory": dict_row}, open=False)


def open_pool() -> None:
    pool.open(wait=True, timeout=10)


@contextmanager
def conn():
    with pool.connection() as c:
        yield c
