"""Guías de trámite deterministas: tarjeta paso a paso armada con texto curado del corpus, sin modelo.

Cada paso, documento, oficina y plazo tiene una cita literal verificada contra su fragmento (`verify`).
Cargar o actualizar: `python -m app.procedures` (lee RAG_DIR/tramites.json; también lo hace `app.ingest`).
"""

import json
import hashlib
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
        fields = {ev.get('field') for ev in p.get('evidence', [])}
        es = p.get('es') or p.get('data', {}).get('es', {})
        required = ['summary', 'office'] + [f'steps[{i}]' for i in range(len(es.get('steps') or []))] + [f'documents[{i}]' for i in range(len(es.get('documents') or []))]
        if es.get('duration'):
            required.append('duration')
        required += [f'requirements[{i}]' for i in range(len(es.get('requirements') or []))]
        bad += [f"{p['id']} {field} (sin evidencia)" for field in required if field not in fields]
        for ev in p["evidence"]:
            if not _ws(ev["quote"]) or _ws(ev["quote"]) not in _ws(chunk_text.get(ev["chunk_id"], "")):
                bad.append(f"{p['id']} {ev['field']} ({ev['chunk_id']})")
        for lang in ('es', 'en'):
            data = p.get(lang) or p.get('data', {}).get(lang, {})
            quotes = ' '.join(ev['quote'] for ev in p['evidence'])
            if not data or len(data.get('steps') or []) != len(es.get('steps') or []) or len(data.get('documents') or []) != len(es.get('documents') or []):
                bad.append(f"{p['id']} {lang} (estructura incompleta)")
            for value in data.get('contacts') or []:
                if value['email'] not in quotes:
                    bad.append(f"{p['id']} contacts (sin cita del correo)")
            for value in data.get('links') or []:
                if value['url'] not in quotes:
                    bad.append(f"{p['id']} links (sin cita del enlace)")
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
    # No conservar guías en memoria después de retirar/reemplazar una fuente.
    with conn() as c:
        items = c.execute(
            "SELECT p.id, p.doc_id, p.locator, p.periodo, p.triggers, p.data, p.evidence FROM procedures p "
            "JOIN documents d ON d.id = p.doc_id WHERE p.active AND d.is_current AND d.status = 'indexado' ORDER BY p.id"
        ).fetchall()
        ids = list({ev['chunk_id'] for p in items for ev in p['evidence']})
        texts = {r['id']: r['texto'] for r in c.execute(
            "SELECT c.id, c.texto FROM chunks c JOIN documents d ON d.id = c.doc_id WHERE c.id = ANY(%s) AND d.is_current AND d.status = 'indexado'", (ids,)
        ).fetchall()} if ids else {}
    return [p for p in items if p['evidence'] and not verify([p], texts)]


def match(question: str, items: list[dict] | None = None) -> dict | None:
    """Trámite cuya frase disparadora aparece en la pregunta (la más larga gana)."""
    n = f" {norm(question)} "
    # Limited intent glosses for Kichwa/code-switched questions; not a translator.
    # Keep the original query (including years/periods) for specificity checks.
    if re.search(r'\bimashina\b', n):
        if re.search(r'\bcarrera(?:ka|ta)?\b', n) and re.search(r'\b(?:cambio(?:ta)?|tikrachina|tikray)\b', n):
            n += ' cambio de carrera '
        if re.search(r'\bkimsa\b', n) and re.search(r'\bmatricula(?:ka|ta)?\b', n):
            n += ' tercera matricula '
    best = None
    for p in _all() if items is None else items:
        # Una convocatoria de otro período no responde una consulta explícita sobre uno nuevo.
        years = re.findall(r"\b20\d{2}(?=sem|\b)", n)
        if years and p.get('periodo') and not any(y in p['periodo'] for y in years):
            continue
        periods = re.findall(r'\b(20\d{2})\s*sem\s*0?([12])\b', n)
        if periods and p.get('periodo') and not any(f'{year}sem0{semester}' == norm(p['periodo']) for year, semester in periods):
            continue
        for t in p["triggers"]:
            if f" {t} " in n and (best is None or len(t) > best[0]):
                best = (len(t), p, t)
    if not best:
        return None
    return _more_specific(n, best[1], best[2], _all() if items is None else items)


def _distinctive(p: dict, others: list[dict]) -> set[str]:
    """Palabras que aparecen en la mitad o más de las frases de un trámite y en ninguna de otro (p. ej. «nivelacion»)."""
    other_words = {w for o in others if o["id"] != p["id"] for t in o["triggers"] for w in t.split()}
    counts: dict[str, int] = {}
    for t in p["triggers"]:
        for w in set(t.split()):
            counts[w] = counts.get(w, 0) + 1
    return {w for w, c in counts.items() if len(w) > 3 and c * 2 >= len(p["triggers"]) and w not in other_words}


def _more_specific(n: str, chosen: dict, trigger: str, items: list[dict]) -> dict:
    """«Estoy en nivelación… retiro voluntario»: la frase «retiro voluntario» es de retiro de carrera, pero «nivelación» es
    distintiva de retiro de nivelación, que comparte el tema («retiro»). Gana el trámite más específico."""
    words = set(n.split())
    topic = {w for w in trigger.split() if len(w) > 3}
    for p in items:
        if p["id"] == chosen["id"]:
            continue
        shares_topic = any(topic & set(t.split()) for t in p["triggers"])
        if shares_topic and _distinctive(p, items) & words and not _distinctive(chosen, items) & words:
            return p
    return chosen




def is_followup(text: str) -> bool:
    words = set(norm(text).split())
    fields = set('documento documentos requisitos pasos plazo plazos fecha fechas duracion tiempo tarda dura costo cuesta contacto correo formulario enlace cuando documents document requirements steps deadlines dates duration time cost costs contact email form link when long'.split())
    neutral = set('y and what about the my el la los las sus mi mis que cuales cuanto como donde a quien son es se lo do i need how long much does it take can to for this is are of en de del para con por tarda dura necesito necesita presento envio hago cual siguiente next hacer falta esos estos ese esto ese esas this that those them send submit cierra vence abren abre cierran close closes open opens'.split())
    return bool(words & fields) and words <= fields | neutral


def resolve(question: str, history: list[dict]) -> dict | None:
    items = _all()
    direct = match(question, items)
    if direct:
        return direct
    n = norm(question)
    # Solo elípticas reconocibles, nunca cambiar una nueva consulta por un tema antiguo.
    if len(n.split()) > 12 or not is_followup(n):
        return None
    for turn in reversed(history[-6:]):
        if turn.get('role') != 'user':
            continue
        previous = match(turn.get('content', ''), items)
        if previous:
            return previous
        if not is_followup(turn.get('content', '')):
            break
    return None


def followup_answer(item: dict, question: str, lang: str) -> str:
    """Respuesta determinista al campo pedido; nunca completa datos ausentes."""
    words = set(norm(question).split())
    en = lang == 'en'
    title = item['title']
    if words & {'documento', 'documentos', 'document', 'documents'}:
        values = item.get('documents') or []
        return f"**{title}**\n\n" + ('\n'.join(f'- {v}' for v in values) if values else ('The available source does not list specific documents. Check the current call.' if en else 'La fuente disponible no enumera documentos específicos. Revisa la convocatoria vigente.'))
    if words & {'duracion', 'duration', 'tiempo', 'time', 'tarda', 'dura', 'long', 'costo', 'cost', 'costs', 'cuesta', 'much'}:
        if words & {'costo', 'cost', 'costs', 'cuesta', 'much'}:
            return 'This guide does not specify a verified amount. Check the current fee schedule with the office.' if en else 'Esta guía no especifica un monto verificado. Consulta el tarifario vigente con la dependencia.'
        return item.get('duration') or ('The available source does not specify the total processing time.' if en else 'La fuente disponible no especifica el tiempo total del trámite.')
    if words & {'correo', 'email', 'contacto', 'contact', 'formulario', 'form', 'enlace', 'link'}:
        contacts = [f"- {v['label']}: {v['email']}" for v in item.get('contacts') or []]
        links = [f"- [{v['label']}]({v['url']})" for v in item.get('links') or []]
        return '\n'.join(contacts + links) or ('No verified direct contact or form link is listed in this guide. Check the original document.' if en else 'Esta guía no recoge un contacto directo ni un enlace de formulario verificado. Revisa el documento original.')
    if words & {'plazo', 'plazos', 'fecha', 'fechas', 'deadlines', 'dates', 'cuando', 'when'}:
        dates = [f"- {v['title']}: {v['start']}" + (f" — {v['end']}" if v.get('end') else '') for v in item.get('deadlines') or []]
        if dates:
            return '\n'.join(dates) + ('\n\nThese dates have passed. Check the current call.' if item.get('deadlinesPast') and en else '\n\nEstas fechas ya pasaron. Revisa la convocatoria vigente.' if item.get('deadlinesPast') else '')
        return 'This guide does not specify calendar dates. Check relative deadlines in the steps and the current call.' if en else 'Esta guía no especifica fechas de calendario. Revisa los plazos relativos de los pasos y la convocatoria vigente.'
    if words & {'requisitos', 'requirements'}:
        values = item.get('requirements') or []
        if not values and item.get('steps') and ('requisit' in norm(item['steps'][0]['title'])):
            values = [item['steps'][0].get('detail') or item['steps'][0]['title']]
        return '\n'.join(f'- {v}' for v in values) or item['summary']
    return '\n'.join(f"{i + 1}. {step['title']}" + (f": {step['detail']}" if step.get('detail') else '') for i, step in enumerate(item['steps']))


def card(p: dict, lang: str, today: date | None = None) -> tuple[dict, list[str]]:
    """Tarjeta en el idioma pedido. Plazos vencidos: no se ofrecen para el calendario y se avisa del período."""
    k = "en" if lang == "en" else "es"
    d = dict(p["data"][k])
    d['id'] = p['id']
    d['revision'] = hashlib.sha256(json.dumps([p['data'], p['evidence'], p.get('periodo')], sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:20]
    d['period'] = p.get('periodo')
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
