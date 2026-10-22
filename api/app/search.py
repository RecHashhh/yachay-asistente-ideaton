"""Búsqueda híbrida en PostgreSQL: texto completo (español sin tildes) + vectores con pgvector (HNSW), fusionados con RRF."""

import re
import threading
from dataclasses import dataclass

import numpy as np

from .config import API_DIR, settings
from .db import conn

K_RRF = 60          # constante estándar de Reciprocal Rank Fusion
TOP_EACH = 20       # candidatos de cada índice
AUDIENCE_WEIGHT = {"estudiantes": 1.0, "general": 0.9, "personal": 0.7}
STAFF_QUERY = re.compile(r"docente|profesor|investigador|personal acad|escalaf|teacher|faculty|professor|research", re.I)


@dataclass
class Hit:
    chunk_id: str
    doc_id: str
    title: str
    seccion: str
    texto: str
    version: str
    periodo: str | None
    fecha_consulta: str | None
    url: str | None
    acceso: str
    kind: str
    audiencia: str
    topic_id: str | None
    score: float
    cos: float
    fts: float


class _Vectors:
    """Búsqueda vectorial en PostgreSQL con pgvector (índice HNSW, distancia coseno). Aquí solo vive el modelo de la consulta."""

    def __init__(self) -> None:
        self.model = None
        self.lock = threading.Lock()

    def load(self) -> None:
        """Precarga el modelo de embeddings para que la primera consulta no espere la carga."""
        self.embed("precarga")

    def embed(self, text: str) -> np.ndarray:
        with self.lock:
            if self.model is None:
                from fastembed import TextEmbedding

                self.model = TextEmbedding(settings.embedding_model, cache_dir=str(API_DIR / ".cache"))
        v = np.array(next(iter(self.model.embed([text]))), dtype=np.float32)
        return v / np.linalg.norm(v)

    def search(self, text: str, k: int, doc_ids: list[str] | None = None) -> list[tuple[str, float]]:
        q = "[" + ",".join(f"{x:.6f}" for x in self.embed(text)) + "]"
        only = "AND c.doc_id = ANY(%s) " if doc_ids else ""
        with conn() as c:
            c.execute("SET hnsw.ef_search = 60")
            rows = c.execute(
                "SELECT c.id, 1 - (c.embedding <=> %s::vector) AS cos FROM chunks c JOIN documents d ON d.id = c.doc_id "
                f"WHERE d.is_current AND d.status = 'indexado' AND c.embedding IS NOT NULL {only}ORDER BY c.embedding <=> %s::vector LIMIT %s",
                (q, *([doc_ids] if doc_ids else []), q, k),
            ).fetchall()
        return [(r["id"], float(r["cos"])) for r in rows]


vectors = _Vectors()


def _lexemes(c, text: str) -> list[str]:
    lex = [r["l"] for r in c.execute("SELECT unnest(tsvector_to_array(to_tsvector('es_unaccent', %s))) AS l", (text,)).fetchall()]
    return [x for x in (re.sub(r"[^\w]", "", l) for l in lex) if x]


def _fts(text: str, k: int, doc_ids: list[str] | None = None) -> list[tuple[str, float]]:
    """OR de las raíces de la pregunta (no AND): una pregunta natural no repite todas las palabras del reglamento."""
    with conn() as c:
        lex = _lexemes(c, text)
        if not lex:
            return []
        q = " | ".join(lex)
        only = "AND c.doc_id = ANY(%s) " if doc_ids else ""
        rows = c.execute(
            "SELECT c.id, ts_rank_cd(c.tsv, to_tsquery('es_unaccent', %s), 1) AS r FROM chunks c JOIN documents d ON d.id = c.doc_id "
            f"WHERE d.is_current AND d.status = 'indexado' AND c.tsv @@ to_tsquery('es_unaccent', %s) {only}ORDER BY r DESC LIMIT %s",
            (q, q, *([doc_ids] if doc_ids else []), k),
        ).fetchall()
    return [(r["id"], float(r["r"])) for r in rows]


_df_cache: dict[str, float] = {}
COMMON_DF = 0.12  # raíz presente en más del 12 % de los fragmentos («yachay», «tech», «caso»…): no orienta la búsqueda


def _rare(c, lex: list[str]) -> list[str]:
    """Raíces poco frecuentes en el corpus (frecuencia por fragmento ≤ COMMON_DF). Se cachea; el corpus cambia poco."""
    missing = [x for x in lex if x not in _df_cache]
    if missing:
        total = c.execute("SELECT count(*) AS n FROM chunks").fetchone()["n"] or 1
        for x in missing:
            n = c.execute("SELECT count(*) AS n FROM chunks WHERE tsv @@ to_tsquery('es_unaccent', %s)", (x,)).fetchone()["n"]
            _df_cache[x] = n / total
    return [x for x in lex if _df_cache[x] <= COMMON_DF]


def _coverage(text: str, k: int, doc_ids: list[str] | None = None) -> list[tuple[str, float]]:
    """Fragmentos que contienen la MAYORÍA de las raíces informativas de la pregunta (≥ 60 %, mínimo 2). El OR premia
    frases con una palabra muy repetida; este índice premia al fragmento que trata a la vez los conceptos preguntados."""
    with conn() as c:
        lex = _rare(c, list(dict.fromkeys(_lexemes(c, text))))
        if len(lex) < 2:
            return []
        need = max(2, -(-len(lex) * 6 // 10))
        cover = " + ".join(f"(c.tsv @@ to_tsquery('es_unaccent', %s))::int" for _ in lex)
        only = "AND c.doc_id = ANY(%s) " if doc_ids else ""
        rows = c.execute(
            f"SELECT c.id, ({cover}) AS n, ts_rank_cd(c.tsv, to_tsquery('es_unaccent', %s), 1) AS r FROM chunks c JOIN documents d ON d.id = c.doc_id "
            f"WHERE d.is_current AND d.status = 'indexado' AND c.tsv @@ to_tsquery('es_unaccent', %s) {only}"
            f"AND ({cover}) >= %s ORDER BY n DESC, r DESC LIMIT %s",
            (*lex, " | ".join(lex), " | ".join(lex), *([doc_ids] if doc_ids else []), *lex, need, k),
        ).fetchall()
    return [(r["id"], float(r["n"])) for r in rows]


EXACT_TERM = re.compile(r"\b(?:[A-Z][A-Z0-9]{2,}|\d{4}\s?SEM\s?0?\d)\b")


def _exact(text: str, k: int, doc_ids: list[str] | None = None, context: str = "") -> list[tuple[str, float]]:
    """Siglas y códigos tal como se escriben (SIGA, D2L, CACES, 2026SEM02): la raíz en español los deforma («SIGA» → «sig»,
    como el verbo seguir). Solo cuentan términos selectivos (≤ 40 fragmentos): «UITEY» está en todos y no orienta."""
    terms = list(dict.fromkeys(m.group(0).replace(" ", "") for m in EXACT_TERM.finditer(text)))
    if not terms:
        return []
    only = "AND c.doc_id = ANY(%s) " if doc_ids else ""
    hits: dict[str, list[float]] = {}  # id → [términos encontrados, relevancia del resto de la pregunta]
    with conn() as c:
        rest = " | ".join(_lexemes(c, context)) if context else ""
        for t in terms:
            pat = r"\m" + re.escape(t) + r"\M"
            rows = c.execute(
                "SELECT c.id, " + ("ts_rank_cd(c.tsv, to_tsquery('es_unaccent', %s), 1)" if rest else "0") + " AS r FROM chunks c JOIN documents d ON d.id = c.doc_id "
                f"WHERE d.is_current AND d.status = 'indexado' AND c.texto ~ %s {only}LIMIT 41",
                (*([rest] if rest else []), pat, *([doc_ids] if doc_ids else [])),
            ).fetchall()
            if 0 < len(rows) <= 40:
                for r in rows:
                    h = hits.setdefault(r["id"], [0.0, 0.0])
                    h[0] += 1
                    h[1] = max(h[1], float(r["r"]))
    return [(cid, v[0] + v[1]) for cid, v in sorted(hits.items(), key=lambda x: (x[1][0], x[1][1]), reverse=True)[:k]]


# Cómo pregunta un estudiante → cómo lo escriben los documentos (expansión de la consulta, solo para la búsqueda de texto).
SYNONYMS = [
    (re.compile(r"otra universidad|otra ies|otra instituci[oó]n|de universidad|other university|transfer from"), "cambio de IES institución de educación superior"),
    (re.compile(r"pasarme|cambiarme"), "cambio"),
    (re.compile(r"retirarme|darme de baja|dejar la carrera"), "retiro"),
    (re.compile(r"notas?|calificaci"), "calificaciones récord académico"),
    (re.compile(r"pagar|cuesta|costo|precio"), "valor arancel pago"),
    (re.compile(r"volver a la universidad|regresar a estudiar"), "reingreso"),
    (re.compile(r"maestr[ií]as?|doctorados?|m[aá]ster|cuarto nivel"), "posgrado posgrados"),
]

# Preguntas en inglés sobre un corpus en español: la búsqueda vectorial es multilingüe, pero la de texto no. Se buscan los
# términos equivalentes en español (glosario general de vida universitaria); las palabras inglesas solo agregarían ruido.
EN_HINT = re.compile(r"\b(the|what|how|when|where|who|which|does|do|is|are|can|my|for|of|to|i)\b")
EN_GLOSSARY = [(re.compile(p), es) for p, es in [
    (r"enrol+(ment)?|registration|register", "matrícula"), (r"withdraw(al)?|drop out", "retiro"),
    (r"change (of |my )?(major|program|career)|switch(ing)? (to|majors?|programs?)", "cambio de carrera"),
    (r"transfer", "cambio de IES"), (r"re-?entry|readmission|come back", "reingreso"), (r"third (enrollment|time)", "tercera matrícula"),
    (r"scores?|gpa|grade point", "puntaje promedio"), (r"grades?|transcript", "calificaciones récord académico"), (r"cohort", "cohorte"),
    (r"scholarships?|financial aid", "beca ayuda económica"), (r"fees?|cost|price|tuition|pay", "arancel valor pago"),
    (r"deadlines?|due date", "plazo fecha"), (r"requirements?|eligib", "requisitos"), (r"schedule|timetable|hours", "horario"),
    (r"library", "biblioteca"), (r"bus(es)?|shuttle", "bus autobús"), (r"housing|dorms?|residences?", "residencias"),
    (r"ethics committee", "comité de ética"), (r"committee", "comité"), (r"academic council", "consejo académico"), (r"council", "consejo"),
    (r"chairs?|presides?|heads?", "preside presidente"), (r"rector|president of the university", "rector"), (r"deans?", "decano"),
    (r"schools?", "escuela"), (r"degree project|thesis|graduation", "titulación trabajo de titulación"), (r"internships?", "prácticas"),
    (r"certificates?", "certificado"), (r"semester|term|academic period", "período académico"), (r"exams?|tests?", "examen"),
    (r"leveling|levelling|preparatory course", "nivelación"), (r"mathematics|math", "matemáticas"), (r"physics", "física"),
    (r"chemistry", "química"), (r"biology", "biología"), (r"computer science|computing", "computación"), (r"english program", "programa de inglés"),
    (r"health (center|centre)|clinic|doctor", "centro de salud"), (r"psycholog", "psicología"), (r"appointed|designated|elected", "designado elegido"),
    (r"how long|term of office|duration", "período duración años"), (r"students?", "estudiante estudiantes"), (r"representatives?", "representante"),
    (r"student (government|union|federation)", "FEYT federación de estudiantes"), (r"complaints?|grievances?", "queja reclamo"),
    (r"harassment", "acoso"), (r"plagiarism", "plagio"), (r"attendance|absences?", "asistencia faltas"), (r"credits?", "créditos"),
]]


def is_english(text: str) -> bool:
    return len(EN_HINT.findall(text.lower())) >= 2


def expand(text: str) -> str:
    low = text.lower()
    if is_english(low):
        es = " ".join(dict.fromkeys(rep for pat, rep in EN_GLOSSARY if pat.search(low)))
        acronyms = " ".join(m.group(0) for m in EXACT_TERM.finditer(text))
        words = text.split()
        proper = " ".join(w.strip("¿?¡!.,;:\"'()") for w in words[1:] if len(w) > 2 and w[:1].isupper())
        return f"{es} {proper} {acronyms}".strip()
    extra = " ".join(rep for pat, rep in SYNONYMS if pat.search(low))
    return f"{text} {extra}" if extra else text


def hybrid(text: str, k: int = 4, topic: str | None = None, doc_ids: list[str] | None = None) -> list[Hit]:
    """Búsqueda híbrida: texto (OR de raíces), cobertura de conceptos, siglas exactas y vectores, fusionados con RRF.
    `doc_ids` la limita a esos documentos (búsqueda guiada del agente)."""
    q_text = expand(text)
    fts = _fts(q_text, TOP_EACH, doc_ids) if q_text else []
    cov = _coverage(q_text, TOP_EACH, doc_ids) if q_text else []
    exact = _exact(text, TOP_EACH, doc_ids, context=q_text)
    vec = vectors.search(text, TOP_EACH, doc_ids)
    fused: dict[str, float] = {}
    for lst in (fts, cov, exact, vec):
        for rank, (cid, _) in enumerate(lst):
            fused[cid] = fused.get(cid, 0) + 1 / (K_RRF + rank + 1)
    if not fused:
        return []
    cos = dict(vec)
    fts_r = dict(fts)
    with conn() as c:
        rows = c.execute(
            "SELECT c.id, c.doc_id, c.seccion, c.texto, d.title, d.version, d.periodo, d.fecha_consulta::text AS fecha_consulta, d.url, d.acceso, d.kind, d.audiencia, d.topic_id "
            "FROM chunks c JOIN documents d ON d.id = c.doc_id WHERE c.id = ANY(%s)",
            (list(fused),),
        ).fetchall()
    staff = bool(STAFF_QUERY.search(text))
    hits = []
    for r in rows:
        w = 1.0 if staff else AUDIENCE_WEIGHT.get(r["audiencia"], 1.0)
        if topic and r["topic_id"] == topic:
            w *= 1.1
        hits.append(Hit(r["id"], r["doc_id"], r["title"], r["seccion"], r["texto"], r["version"], r["periodo"], r["fecha_consulta"], r["url"],
                        r["acceso"], r["kind"], r["audiencia"], r["topic_id"], fused[r["id"]] * w, cos.get(r["id"], 0.0), fts_r.get(r["id"], 0.0)))
    hits.sort(key=lambda h: h.score, reverse=True)
    top = hits[:k]
    # El mejor resultado de cada índice entra siempre: RRF castiga al que solo un índice encuentra, aunque sea el 1.º de ese índice.
    by_id = {h.chunk_id: h for h in hits}
    for lst in (vec, cov, exact, fts):
        if lst and lst[0][0] in by_id and all(h.chunk_id != lst[0][0] for h in top):
            if len(top) < k:
                top.append(by_id[lst[0][0]])
            else:
                guaranteed = {l[0][0] for l in (vec, cov, exact, fts) if l}
                replace = next((i for i in range(len(top) - 1, -1, -1) if top[i].chunk_id not in guaranteed), None)
                if replace is not None:
                    top[replace] = by_id[lst[0][0]]
    return top


def hits_by_ids(chunk_ids: list[str], scores: dict[str, float] | None = None) -> list[Hit]:
    """Fragmentos vigentes por id, en el orden dado (los que eligió el agente). `scores`: similitud de cada uno, si se conoce."""
    if not chunk_ids:
        return []
    scores = scores or {}
    with conn() as c:
        rows = c.execute(
            "SELECT c.id, c.doc_id, c.seccion, c.texto, d.title, d.version, d.periodo, d.fecha_consulta::text AS fecha_consulta, d.url, d.acceso, d.kind, d.audiencia, d.topic_id "
            "FROM chunks c JOIN documents d ON d.id = c.doc_id WHERE c.id = ANY(%s) AND d.is_current AND d.status = 'indexado'",
            (chunk_ids,),
        ).fetchall()
    by_id = {r["id"]: r for r in rows}
    out = []
    for i, cid in enumerate(chunk_ids):
        r = by_id.get(cid)
        if r:
            out.append(Hit(r["id"], r["doc_id"], r["title"], r["seccion"], r["texto"], r["version"], r["periodo"], r["fecha_consulta"], r["url"],
                           r["acceso"], r["kind"], r["audiencia"], r["topic_id"], 1 / (K_RRF + i + 1), scores.get(cid, 1.0), 1.0))
    return out


def best_similarity(text: str) -> float:
    top = vectors.search(text, 1)
    return top[0][1] if top else 0.0
