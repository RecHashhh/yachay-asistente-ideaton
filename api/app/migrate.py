"""Aplica el esquema (todos los sql/*.sql en orden) y siembra los filtros: `python -m app.migrate`."""

from pathlib import Path

import psycopg

from .config import settings
from .filters import DEFAULT_TERMS


def main() -> None:
    with psycopg.connect(settings.database_url, autocommit=True) as c:
        for f in sorted((Path(__file__).resolve().parent.parent / "sql").glob("*.sql")):
            if f.name.startswith("00_"):  # creación de la base: la corre el superusuario una sola vez
                continue
            c.execute(f.read_text(encoding="utf-8"))
        # Semilla de filtros: agrega los términos nuevos sin tocar los que el equipo editó o desactivó en el Portal.
        for cat, terms in DEFAULT_TERMS.items():
            for t in terms:
                c.execute("INSERT INTO filter_terms (category, term) VALUES (%s, %s) ON CONFLICT DO NOTHING", (cat, t))
    print("Esquema aplicado.")


if __name__ == "__main__":
    main()
