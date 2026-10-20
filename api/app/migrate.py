"""Aplica el esquema: `python -m app.migrate`."""

from pathlib import Path

import psycopg

from .config import settings


def main() -> None:
    sql = (Path(__file__).resolve().parent.parent / "sql" / "01_esquema.sql").read_text(encoding="utf-8")
    with psycopg.connect(settings.database_url, autocommit=True) as c:
        c.execute(sql)
    print("Esquema aplicado.")


if __name__ == "__main__":
    main()
