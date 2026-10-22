import csv
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class CorpusDocument:
    doc_id: str
    title: str
    description: str
    kind: str
    source_url: str | None
    validity_period: str
    consulted_at: date | None
    source_path: str | None


@dataclass(frozen=True)
class CorpusChunk:
    chunk_id: str
    doc_id: str
    section: str
    content: str
    tokens_approx: int


def content_hash(content: str, embedding_model: str) -> str:
    value = f"{embedding_model}\0{content}".encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def _date_or_none(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _clean_summary_text(value: str) -> str:
    value = re.sub(r"\|[^\n]*", " ", value)
    value = re.sub(r"\bDocumento:\s*[^\n]+", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"\s+", " ", value)
    return value.strip(" -:.;\n")


def summarize_document(title: str, kind: str, chunks: list["CorpusChunk"]) -> str:
    """Resume a partir de objetivos y alcance que aparecen en los propios fragmentos."""
    text = "\n".join(chunk.content for chunk in chunks)
    if kind.casefold() == "calendario":
        period_match = re.search(r"período\s+([^;.)]+)", text, flags=re.IGNORECASE)
        audience_match = re.search(r"CALENDARIO ACADÉMICO\s+([^\n|]+)", text, flags=re.IGNORECASE)
        period = _clean_summary_text(period_match.group(1)) if period_match else "indicado en el título"
        audience = _clean_summary_text(audience_match.group(1)) if audience_match else "la comunidad universitaria"
        return (
            f"Calendario académico para {audience}, correspondiente al período {period}. "
            "Organiza fechas de matrícula, clases, evaluaciones, exámenes y cierre del período."
        )

    objective_patterns = (
        r"(?:objetivo(?:\s+general)?|finalidad|prop[oó]sito)\s*[:.]\s*(.+?)(?=\n\s*(?:\d+(?:\.\d+)*\.?\s*)?(?:alcance|responsable|definiciones|consideraciones|introducci[oó]n)\b|\n\s*\d+(?:\.\d+)*\.?\s+[A-ZÁÉÍÓÚÑ]|$)",
        r"(?:^|\n)\s*\d*\.?\s*(?:objetivo(?:\s+general)?|finalidad|prop[oó]sito)\s+(.+?)(?=\n\s*(?:\d+(?:\.\d+)*\.?\s*)?(?:alcance|responsable|definiciones|consideraciones)\b|\n\s*\d+(?:\.\d+)*\.?\s+[A-ZÁÉÍÓÚÑ]|$)",
    )
    excerpts: list[str] = []
    for pattern in objective_patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE | re.DOTALL):
            candidate = _clean_summary_text(match.group(1))
            # Evita tomar la tabla de contenido por el objetivo real.
            if len(candidate) >= 70 and not re.match(r"^\d+\s+\d+\.", candidate):
                excerpts.append(candidate)
                break
        if excerpts:
            break

    if not excerpts:
        purpose_pattern = r"(?:el|la)\s+(?:propósito|objetivo)\s+(?:y\s+responsabilidad\s+)?(?:del|de la)\s+.+?\s+es\s+(.+?)(?=\n|$)"
        match = re.search(purpose_pattern, text, flags=re.IGNORECASE | re.DOTALL)
        if match:
            candidate = _clean_summary_text(match.group(1))
            if len(candidate) >= 50:
                excerpts.append(candidate)

    if excerpts:
        scope_pattern = r"(?:^|\n)\s*\d*\.?\s*alcance\s+(.+?)(?=\n\s*(?:\d+(?:\.\d+)*\.?\s*)?(?:responsable|definiciones|abreviaturas|consideraciones|diagrama|descripci[oó]n de actividades)\b|\n\s*\d+(?:\.\d+)*\.?\s+[A-ZÁÉÍÓÚÑ]|$)"
        for match in re.finditer(scope_pattern, text, flags=re.IGNORECASE | re.DOTALL):
            candidate = _clean_summary_text(match.group(1))
            if len(candidate) >= 70 and not re.match(r"^\d+\s+\d+\.", candidate):
                excerpts.append(candidate)
                break

    if not excerpts:
        # Para normas y documentos sin una sección explícita, tomar prosa inicial
        # sustantiva sin copiar portada, índice ni filas de tablas.
        for chunk in chunks:
            for paragraph in re.split(r"\n\s*\n", chunk.content):
                if re.search(r"\|---|^\s*(?:contenido|índice)\b", paragraph, flags=re.IGNORECASE):
                    continue
                candidate = _clean_summary_text(paragraph)
                candidate = re.sub(rf"^{re.escape(title)}\s*", "", candidate, flags=re.IGNORECASE)
                if len(candidate) >= 100 and not candidate.lower().startswith(("considerando", "que,")):
                    excerpts.append(candidate)
                    break
            if excerpts:
                break

    if not excerpts:
        return f"Documento de tipo {kind} titulado «{title}»."

    summary = " ".join(excerpts)
    # Mantiene descripciones breves y evita cortar una palabra al final.
    if len(summary) > 900:
        summary = summary[:897].rsplit(" ", 1)[0] + "…"
    return summary


def load_corpus(rag_dir: Path) -> tuple[dict[str, CorpusDocument], list[CorpusChunk]]:
    """Carga el JSONL autoritativo y complementa su metadato con fuentes.csv."""
    source_rows: dict[str, dict[str, str]] = {}
    descriptions: dict[str, str] = {}
    with (rag_dir / "fuentes.csv").open(encoding="utf-8-sig", newline="") as source_file:
        for row in csv.DictReader(source_file):
            if row.get("incluir", "").strip().lower() == "si":
                source_rows[row["doc_id"]] = row

    descriptions_path = rag_dir / "descripciones.csv"
    if descriptions_path.exists():
        with descriptions_path.open(encoding="utf-8-sig", newline="") as descriptions_file:
            for row in csv.DictReader(descriptions_file):
                doc_id = row.get("doc_id", "").strip()
                description = row.get("descripcion", "").strip()
                if doc_id and description:
                    descriptions[doc_id] = description

    docs: dict[str, CorpusDocument] = {}
    chunks: list[CorpusChunk] = []
    seen_chunk_ids: set[str] = set()
    with (rag_dir / "chunks.jsonl").open(encoding="utf-8") as chunk_file:
        for line_number, line in enumerate(chunk_file, start=1):
            if not line.strip():
                continue
            try:
                item: dict[str, Any] = json.loads(line)
                chunk_id = str(item["chunk_id"])
                doc_id = str(item["doc_id"])
                content = str(item["texto"]).strip()
            except (json.JSONDecodeError, KeyError, TypeError) as exc:
                raise ValueError(f"Chunk inválido en chunks.jsonl, línea {line_number}: {exc}") from exc
            if not chunk_id or not doc_id or not content:
                raise ValueError(f"Chunk vacío o sin identificador en chunks.jsonl, línea {line_number}")
            if chunk_id in seen_chunk_ids:
                raise ValueError(f"chunk_id duplicado en chunks.jsonl: {chunk_id}")
            seen_chunk_ids.add(chunk_id)

            source = source_rows.get(doc_id, {})
            docs.setdefault(
                doc_id,
                CorpusDocument(
                    doc_id=doc_id,
                    title=source.get("titulo") or str(item.get("titulo_doc") or doc_id),
                    description=descriptions.get(doc_id, ""),
                    kind=source.get("tipo") or str(item.get("tipo") or "documento"),
                    source_url=(source.get("url") or str(item.get("url") or "").strip() or None),
                    validity_period=source.get("periodo_vigencia") or str(item.get("periodo_vigencia") or ""),
                    consulted_at=_date_or_none(source.get("fecha_consulta")),
                    source_path=source.get("archivo_origen") or None,
                ),
            )
            chunks.append(
                CorpusChunk(
                    chunk_id=chunk_id,
                    doc_id=doc_id,
                    section=str(item.get("seccion") or ""),
                    content=content,
                    tokens_approx=max(0, int(item.get("tokens_aprox") or len(content) // 4)),
                )
            )
    if not chunks:
        raise ValueError("rag/chunks.jsonl no contiene chunks para indexar")
    chunks_by_doc: dict[str, list[CorpusChunk]] = {doc_id: [] for doc_id in docs}
    for chunk in chunks:
        chunks_by_doc[chunk.doc_id].append(chunk)
    docs = {
        doc_id: CorpusDocument(
            doc_id=doc.doc_id,
            title=doc.title,
            description=doc.description or summarize_document(doc.title, doc.kind, chunks_by_doc[doc_id]),
            kind=doc.kind,
            source_url=doc.source_url,
            validity_period=doc.validity_period,
            consulted_at=doc.consulted_at,
            source_path=doc.source_path,
        )
        for doc_id, doc in docs.items()
    }
    return docs, chunks
