from __future__ import annotations

import logging
import re
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import get_settings
from app.db import Base

config = context.config
settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)
if not re.fullmatch(r"[a-z_][a-z0-9_]*", settings.database_schema):
    raise ValueError("DATABASE_SCHEMA debe ser un identificador PostgreSQL válido")

if config.config_file_name is not None:
    fileConfig(config.config_file_name)
    logging.getLogger("alembic").setLevel(logging.INFO)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        version_table_schema=settings.database_schema if settings.database_schema != "public" else None,
    )
    with context.begin_transaction():
        if settings.database_schema != "public":
            context.execute(f"CREATE SCHEMA IF NOT EXISTS {settings.database_schema}")
            context.execute(f"SET search_path TO {settings.database_schema}, public")
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        if settings.database_schema != "public":
            connection.exec_driver_sql(f"CREATE SCHEMA IF NOT EXISTS {settings.database_schema}")
            connection.exec_driver_sql(f"SET search_path TO {settings.database_schema}, public")
            connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            version_table_schema=settings.database_schema if settings.database_schema != "public" else None,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
