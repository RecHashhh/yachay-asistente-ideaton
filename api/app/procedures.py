"""Guías de trámite deterministas: tarjeta paso a paso armada con texto curado del corpus, sin modelo.

Cada paso, documento, oficina y plazo tiene una cita literal verificada contra su fragmento (`verify`).
Cargar o actualizar: `python -m app.procedures` (lee RAG_DIR/tramites.json; también lo hace `app.ingest`).
"""

import json
import re
import sys
from datetime import date

from psycopg.rows import dict_row

from .config import settings
from .db import conn
from .rules import norm

_cache: list[dict] | None = None


def _ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def verify(items: list[dict], chunk_text: dict[str, str]) -> list[str]:
    """Citas que no aparecen literalmente en su fragmento (deben ser cero para cargar)."""
    bad = []
    for p in items:
        for ev in p["evidence"]:
            if _ws(ev["quote"]) not in _ws(chunk_text.get(ev["chunk_id"], "")):
                bad.append(f"{p['id']} {ev['field']} ({ev['chunk_id']})")
    return bad


def load_seed(c) -> int:
    path = settings.rag_dir / "tramites.json"
    if not path.exists():
        return 0
    items = json.loads(path.read_text(encoding="utf-8"))
    ids = list({ev["chunk_id"] for p in items for ev in p["evidence"]})
    cur = c.cursor(row_factory=dict_row)  # funciona con o sin row_factory en la conexión (ingest usa tuplas)
    chunk_text = {r["id"]: r["texto"] for r in cur.execute("SELECT id, texto FROM chunks WHERE id = ANY(%s)", (ids,)).fetchall()}
    bad = verify(items, chunk_text)
    if bad:
        raise SystemExit("Citas de trámites que no coinciden con el corpus:\n  " + "\n  ".join(bad))
    for p in items:
        triggers = sorted({norm(t) for t in p["triggers_es"] + p["triggers_en"] if norm(t)}, key=len, reverse=True)
        cur.execute(
            """INSERT INTO procedures (id, doc_id, locator, periodo, triggers, data, evidence) VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb)
               ON CONFLICT (id) DO UPDATE SET doc_id = EXCLUDED.doc_id, locator = EXCLUDED.locator, periodo = EXCLUDED.periodo,
                 triggers = EXCLUDED.triggers, data = EXCLUDED.data, evidence = EXCLUDED.evidence, updated_at = now()""",
            (p["id"], p["doc_id"], p.get("locator") or "", p.get("periodo"), triggers,
             json.dumps({"es": p["es"], "en": p["en"]}, ensure_ascii=False), json.dumps(p["evidence"], ensure_ascii=False)),
        )
    invalidate()
    return len(items)


def invalidate() -> None:
    global _cache
    _cache = None


def _all() -> list[dict]:
    global _cache
    if _cache is None:
        with conn() as c:
            _cache = c.execute(
                "SELECT p.id, p.doc_id, p.locator, p.periodo, p.triggers, p.data, p.evidence FROM procedures p "
                "JOIN documents d ON d.id = p.doc_id WHERE p.active AND d.is_current AND d.status = 'indexado'"
            ).fetchall()
    return _cache


def match(question: str) -> dict | None:
    """Trámite cuya frase disparadora aparece en la pregunta (la más larga gana)."""
    n = f" {norm(question)} "
    best = None
    for p in _all():
        for t in p["triggers"]:
            if f" {t} " in n and (best is None or len(t) > best[0]):
                best = (len(t), p)
    return best[1] if best else None


def card(p: dict, lang: str, today: date | None = None) -> tuple[dict, list[str]]:
    """Tarjeta en el idioma pedido. Plazos vencidos: no se ofrecen para el calendario y se avisa del período."""
    k = "en" if lang == "en" else "es"
    d = dict(p["data"][k])
    today = today or date.today()
    all_dl = d.get("deadlines") or []
    if all_dl and all((x.get("end") or x["start"]) < today.isoformat() for x in all_dl):
        # Se muestran (responden "¿cuándo fue…?") pero marcadas como vencidas y sin "Añadir al calendario".
        per = p["periodo"] or ""
        d["summary"] = d["summary"] + (f" Las fechas publicadas eran del período {per} y ya pasaron: revisa la convocatoria vigente."
                                       if k == "es" else f" The published dates were for {per} and have passed: check the current call.")
        d["deadlinesPast"] = True
    d["deadlines"] = all_dl or None
    docs = sorted({ev["chunk_id"].split("#")[0] for ev in p["evidence"]} - {p["doc_id"]})
    return d, [p["doc_id"]] + docs


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    import psycopg

    with psycopg.connect(settings.database_url) as c:
        n = load_seed(c)
        c.commit()
    print(f"{n} trámites cargados (citas verificadas contra el corpus).")
