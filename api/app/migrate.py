"""Aplica el esquema (todos los sql/*.sql en orden), siembra los filtros y carga las descripciones del catálogo: `python -m app.migrate`."""

import csv
from pathlib import Path

import psycopg

from .config import settings
from .filters import DEFAULT_TERMS

ROOT = Path(__file__).resolve().parent.parent.parent
# El catálogo del agente usa otros nombres para dos fuentes de datos del campus.
DESCRIPTION_ALIASES = {"distribucion_de_aulas_del_campus": "distribucion_aulas", "sitios_importantes_del_campus": "puntos_importantes_universidad"}


def load_descriptions(c: psycopg.Connection) -> int:
    """rag/descripciones.csv (versionado) → documents.description. Devuelve cuántos documentos quedaron descritos."""
    # En el contenedor el corpus (con las descripciones) se monta en RAG_DIR; en desarrollo están en rag/ del repositorio.
    path = next((p for p in (settings.rag_dir / "descripciones.csv", ROOT / "rag" / "descripciones.csv") if p.exists()), None)
    if path is None:
        return 0
    n = 0
    for r in csv.DictReader(path.open(encoding="utf-8")):
        # Según la copia del corpus, el texto de aulas/sitios vive con el id original o con el alias: se describen ambos.
        ids = [r["doc_id"], DESCRIPTION_ALIASES.get(r["doc_id"], r["doc_id"])]
        n += c.execute("UPDATE documents SET description = %s WHERE id = ANY(%s)", (r["descripcion"].strip(), ids)).rowcount
    return n


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
        n = load_descriptions(c)
    print(f"Esquema aplicado. {n} documentos con descripción para el catálogo del agente.")


if __name__ == "__main__":
    main()
