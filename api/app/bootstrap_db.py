"""Create the configured application database when it is missing."""

import logging
import os

import psycopg
from psycopg import sql

logger = logging.getLogger(__name__)


def ensure_database(admin_connection: psycopg.Connection, database_name: str) -> bool:
    """Create *database_name* if absent; return whether it was created."""
    exists = admin_connection.execute(
        "SELECT 1 FROM pg_database WHERE datname = %s", (database_name,)
    ).fetchone()
    if exists:
        return False

    admin_connection.execute(
        sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database_name))
    )
    return True


def main() -> None:
    database_name = os.environ["POSTGRES_DB"]
    with psycopg.connect(
        dbname="postgres",
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
        host=os.environ.get("POSTGRES_HOST", "db"),
        port=int(os.environ.get("POSTGRES_PORT", "5432")),
        autocommit=True,
    ) as connection:
        created = ensure_database(connection, database_name)

    if created:
        logger.info("Created PostgreSQL database %r", database_name)
    else:
        logger.info("PostgreSQL database %r already exists", database_name)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    main()
