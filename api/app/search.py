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

    def search(self, text: str, k: int) -> list[tuple[str, float]]:
        q = "[" + ",".join(f"{x:.6f}" for x in self.embed(text)) + "]"
        with conn() as c:
            c.execute("SET hnsw.ef_search = 60")
            rows = c.execute(
                "SELECT c.id, 1 - (c.embedding <=> %s::vector) AS cos FROM chunks c JOIN documents d ON d.id = c.doc_id "
                "WHERE d.is_current AND d.status = 'indexado' AND c.embedding IS NOT NULL ORDER BY c.embedding <=> %s::vector LIMIT %s",
                (q, q, k),
            ).fetchall()
        return [(r["id"], float(r["cos"])) for r in rows]


vectors = _Vectors()


def _fts(text: str, k: int) -> list[tuple[str, float]]:
    """OR de las raíces de la pregunta (no AND): una pregunta natural no repite todas las palabras del reglamento."""
    with conn() as c:
        lex = [r["l"] for r in c.execute("SELECT unnest(tsvector_to_array(to_tsvector('es_unaccent', %s))) AS l", (text,)).fetchall()]
        if not lex:
            return []
        q = " | ".join(re.sub(r"[^\w]", "", x) for x in lex if re.sub(r"[^\w]", "", x))
        rows = c.execute(
            "SELECT c.id, ts_rank_cd(c.tsv, to_tsquery('es_unaccent', %s)) AS r FROM chunks c JOIN documents d ON d.id = c.doc_id "
            "WHERE d.is_current AND d.status = 'indexado' AND c.tsv @@ to_tsquery('es_unaccent', %s) ORDER BY r DESC LIMIT %s",
            (q, q, k),
        ).fetchall()
    return [(r["id"], float(r["r"])) for r in rows]


# Cómo pregunta un estudiante → cómo lo escriben los documentos (expansión de la consulta, solo para la búsqueda de texto).
SYNONYMS = [
    (re.compile(r"otra universidad|otra ies|otra instituci[oó]n|de universidad|other university|transfer from"), "cambio de IES institución de educación superior"),
    (re.compile(r"pasarme|cambiarme"), "cambio"),
    (re.compile(r"retirarme|darme de baja|dejar la carrera"), "retiro"),
    (re.compile(r"notas?|calificaci"), "calificaciones récord académico"),
    (re.compile(r"pagar|cuesta|costo|precio"), "valor arancel pago"),
    (re.compile(r"volver a la universidad|regresar a estudiar"), "reingreso"),
]


def expand(text: str) -> str:
    low = text.lower()
    extra = " ".join(rep for pat, rep in SYNONYMS if pat.search(low))
    return f"{text} {extra}" if extra else text


def hybrid(text: str, k: int = 4, topic: str | None = None) -> list[Hit]:
    fts = _fts(expand(text), TOP_EACH)
    vec = vectors.search(text, TOP_EACH)
    fused: dict[str, float] = {}
    for rank, (cid, _) in enumerate(fts):
        fused[cid] = fused.get(cid, 0) + 1 / (K_RRF + rank + 1)
    for rank, (cid, _) in enumerate(vec):
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
    return hits[:k]


def best_similarity(text: str) -> float:
    top = vectors.search(text, 1)
    return top[0][1] if top else 0.0
