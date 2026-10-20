"""Búsqueda híbrida: texto completo en PostgreSQL (español sin tildes) + vectores, fusionados con RRF.

Los vectores están en la columna `embedding` de `chunks` y se comparan en memoria (1.400 fragmentos: milisegundos).
En producción, con pgvector, la parte vectorial pasa a `ORDER BY embedding <=> :q LIMIT k` sin cambiar el resto.
"""

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
    """Matriz normalizada de embeddings de los fragmentos vigentes (se recarga si cambian los documentos)."""

    def __init__(self) -> None:
        self.ids: list[str] = []
        self.matrix: np.ndarray | None = None
        self.model = None
        self.lock = threading.Lock()

    def load(self) -> None:
        with conn() as c:
            rows = c.execute(
                "SELECT c.id, c.embedding FROM chunks c JOIN documents d ON d.id = c.doc_id "
                "WHERE d.is_current AND d.status = 'indexado' AND c.embedding IS NOT NULL"
            ).fetchall()
        with self.lock:
            self.ids = [r["id"] for r in rows]
            if rows:
                m = np.array([r["embedding"] for r in rows], dtype=np.float32)
                self.matrix = m / np.linalg.norm(m, axis=1, keepdims=True)
            else:
                self.matrix = None

    def embed(self, text: str) -> np.ndarray:
        if self.model is None:
            from fastembed import TextEmbedding

            self.model = TextEmbedding(settings.embedding_model, cache_dir=str(API_DIR / ".cache"))
        v = np.array(next(iter(self.model.embed([text]))), dtype=np.float32)
        return v / np.linalg.norm(v)

    def search(self, text: str, k: int) -> list[tuple[str, float]]:
        if self.matrix is None:
            return []
        sims = self.matrix @ self.embed(text)
        idx = np.argsort(-sims)[:k]
        return [(self.ids[i], float(sims[i])) for i in idx]


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


def hybrid(text: str, k: int = 4, topic: str | None = None) -> list[Hit]:
    fts = _fts(text, TOP_EACH)
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
