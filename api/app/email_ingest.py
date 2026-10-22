"""Ingesta de comunicados institucionales recibidos por correo: cuerpo en texto plano y PDF adjuntos."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import logging
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import parseaddr, parsedate_to_datetime
from pathlib import Path
from typing import Literal

from langchain_anthropic import ChatAnthropic
from langchain_ollama import OllamaEmbeddings
from markitdown import MarkItDown, StreamInfo
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.corpus import content_hash
from app.models import Document, RagChunk

logger = logging.getLogger(__name__)

# Comunicación ya etiqueta sus asuntos ("Entérate-", "Eventos-"…); sirve de tema cuando no hay IA.
SUBJECT_PREFIX = re.compile(r"(Servicios|Eventos|Invitaci[oó]n|Ent[eé]rate|Convocatoria)\s*-\s*", re.IGNORECASE)
PREFIX_TOPIC = {
    "servicios": "servicio",
    "eventos": "evento",
    "invitación": "evento",
    "invitacion": "evento",
    "convocatoria": "convocatoria",
}
FOOTER_MARK = "footermailing"  # imagen con la que empieza el pie común de la plantilla
MAX_CHUNK_CHARS = 3200  # ≈ 800 tokens con la regla chars/4 del corpus
MIN_PDF_CHARS = 50  # menos texto que esto = PDF escaneado (sin OCR) o vacío


class IngestError(ValueError):
    """El correo no se puede ingerir: remitente no permitido, sin texto, etc."""


class Classification(BaseModel):
    # Mismo vocabulario que la columna `tipo` de rag/fuentes.csv, para que el catálogo hable un solo idioma.
    doc_type: Literal[
        "procedimiento", "reglamento", "instructivo", "guia", "calendario", "convocatoria", "plan", "programa",
        "documento",
    ] = Field(
        description=(
            "Qué clase de documento es: procedimiento, reglamento, instructivo, guia, calendario, "
            "convocatoria (bases de una convocatoria), plan, programa; documento si no encaja "
            "(memorandos, oficios, formularios u otros)."
        )
    )
    topic: Literal["tramite", "evento", "servicio", "autoridades", "convocatoria", "aviso"] = Field(
        description=(
            "tramite: procedimientos, requisitos o plazos académicos/administrativos; "
            "evento: charlas, ferias, invitaciones; servicio: cortes, mantenimientos o servicios del campus; "
            "autoridades: designaciones y encargos de funciones; convocatoria: becas, concursos, postulaciones; "
            "aviso: cualquier otro."
        )
    )
    description: str = Field(
        description=(
            "1 a 3 oraciones en español para un catálogo de búsqueda: de qué trata, a quién aplica y qué datos "
            "concretos contiene (fechas, lugares, plazos, sistemas, contactos). Incluye sinónimos con los que un "
            "estudiante lo buscaría. No agregues nada que no esté en el texto."
        )
    )


@dataclass(frozen=True)
class ParsedEmail:
    message_id: str
    subject: str
    topic_hint: str | None
    sent_at: date
    body: str
    attachments: list[tuple[str, bytes]]  # (nombre del archivo, bytes del PDF)


@dataclass(frozen=True)
class EmailDocument:
    doc_id: str
    title: str
    section: str
    text: str


def decode_raw(value: str) -> bytes:
    """Decodifica el mensaje completo en base64 (acepta el alfabeto estándar y el de URL)."""
    compact = re.sub(r"\s+", "", value)
    try:
        return base64.urlsafe_b64decode(compact + "=" * (-len(compact) % 4))
    except ValueError as exc:
        raise IngestError("raw no es base64 válido") from exc


def clean_subject(subject: str) -> tuple[str, str | None]:
    """Quita emojis iniciales y el prefijo de categoría; devuelve (asunto limpio, tema sugerido)."""
    text = re.sub(r"^[^\w¿¡]+", "", subject).strip()
    match = SUBJECT_PREFIX.match(text)
    if not match:
        return text, None
    return text[match.end():].strip(), PREFIX_TOPIC.get(match.group(1).lower(), "aviso")


def clean_body(text: str) -> str:
    """Limpia el text/plain de la plantilla de Comunicación: sin encabezado, marcas de imagen ni pie."""
    lines: list[str] = []
    for line in text.splitlines():
        if FOOTER_MARK in line:
            break
        if re.fullmatch(r"\s*\[(?:https?://\S+|cid:\S+)\]\s*", line):
            continue
        line = re.sub(r"<mailto:[^>]*>", "", line)
        # Conserva la URL exacta: el agente solo enlaza URLs que aparecen literalmente en las fuentes.
        line = re.sub(r"<(https?://[^>]+)>", r" (\1)", line)
        lines.append(line.rstrip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def split_chunks(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """Agrupa párrafos completos hasta ~800 tokens; un párrafo más largo se corta por líneas."""
    # ponytail: sin solape entre chunks; agregarlo si las respuestas pierden ideas cortadas en el borde
    chunks: list[str] = []
    current = ""
    for paragraph in re.split(r"\n\s*\n", text):
        paragraph = paragraph.strip()
        while len(paragraph) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            cut = paragraph.rfind("\n", 0, max_chars)
            cut = cut if cut > max_chars // 2 else max_chars
            chunks.append(paragraph[:cut].strip())
            paragraph = paragraph[cut:].strip()
        if not paragraph:
            continue
        if current and len(current) + 2 + len(paragraph) > max_chars:
            chunks.append(current)
            current = paragraph
        else:
            current = f"{current}\n\n{paragraph}" if current else paragraph
    if current:
        chunks.append(current)
    return chunks


def parse_email(raw: bytes, allowed_senders: set[str]) -> ParsedEmail:
    outer = BytesParser(policy=policy.default).parsebytes(raw)
    sender = parseaddr(str(outer.get("From", "")))[1].lower()
    if sender not in allowed_senders:
        raise IngestError(f"remitente no permitido: {sender or 'desconocido'}")
    # ponytail: la confianza en el remitente depende del filtro anti-suplantación del buzón (Gmail);
    # validar la cabecera Authentication-Results (dmarc=pass) si el buzón recibe correo de cualquiera.

    # Un comunicado reenviado "como adjunto" viaja entero dentro del correo: se procesa el original.
    message: EmailMessage = next(
        (part.get_content() for part in outer.iter_attachments() if part.get_content_type() == "message/rfc822"),
        outer,
    )
    plain = message.get_body(preferencelist=("plain",))
    if plain is None:
        raise IngestError("el correo no tiene versión en texto plano")
    body = clean_body(plain.get_content())
    if not body:
        raise IngestError("el correo no tiene contenido después de limpiarlo")

    subject, topic_hint = clean_subject(str(message.get("Subject", "")))
    try:
        sent_at = parsedate_to_datetime(str(message["Date"])).date()
    except (TypeError, ValueError):
        sent_at = date.today()
    message_id = str(message.get("Message-ID") or "").strip() or hashlib.sha256(raw).hexdigest()
    attachments = [
        (part.get_filename() or "adjunto.pdf", part.get_payload(decode=True) or b"")
        for part in message.iter_attachments()
        if part.get_content_type() == "application/pdf"
    ]
    return ParsedEmail(message_id, subject or "Comunicado sin asunto", topic_hint, sent_at, body, attachments)


def pdf_to_text(data: bytes) -> str:
    markdown = MarkItDown().convert_stream(io.BytesIO(data), stream_info=StreamInfo(extension=".pdf")).markdown
    return re.sub(r"[ \t]{2,}", " ", markdown).strip()


def build_documents(email: ParsedEmail) -> list[EmailDocument]:
    """Un documento para el cuerpo y uno por cada PDF con texto; los ID hacen la ingesta idempotente."""
    stamp = email.sent_at.strftime("%d/%m/%Y")
    title = f"Comunicado {stamp}: {email.subject}"
    documents = [EmailDocument(
        doc_id="email_" + hashlib.sha256(email.message_id.encode()).hexdigest()[:16],
        title=title,
        section="Cuerpo del correo",
        text=email.body,
    )]
    for filename, data in email.attachments:
        text = pdf_to_text(data)
        if len(text) < MIN_PDF_CHARS:
            logger.warning("Adjunto sin texto extraíble (¿escaneado?): %s", filename)
            continue
        documents.append(EmailDocument(
            # El mismo PDF en dos correos es el mismo documento.
            doc_id="email_adj_" + hashlib.sha256(data).hexdigest()[:16],
            title=f"{Path(filename).stem} (adjunto al comunicado del {stamp}: {email.subject})",
            section="Adjunto PDF",
            text=text,
        ))
    return documents


async def classify(
    document: EmailDocument, topic_hint: str | None, settings: Settings
) -> tuple[Classification, dict[str, int]]:
    """Etiqueta y describe con IA; si no hay clave o falla, usa el prefijo del asunto y el inicio del texto.

    Devuelve también los tokens consumidos, para controlar el costo de la ingesta.
    """
    fallback = Classification(
        doc_type="documento",
        topic=topic_hint or "aviso",
        description=f"{document.title}. {document.text[:300]}",
    )
    no_usage = {"input_tokens": 0, "output_tokens": 0}
    key = settings.anthropic_api_key.get_secret_value()
    if not key:
        return fallback, no_usage
    # 400 tokens cortaron la respuesta de un correo largo y la clasificación cayó al plan B.
    llm = ChatAnthropic(model=settings.anthropic_model, anthropic_api_key=key, max_tokens=1024)
    prompt = (
        "Clasifica este comunicado institucional de la Universidad Yachay Tech y descríbelo para el catálogo "
        f"que usa un asistente para decidir dónde buscar.\n\nTítulo: {document.title}\n\n{document.text[:6000]}"
    )
    try:
        result = await llm.with_structured_output(Classification, include_raw=True).ainvoke(prompt)
    except Exception:
        logger.exception("No se pudo clasificar %s; se usa la etiqueta del asunto", document.doc_id)
        return fallback, no_usage
    usage = getattr(result["raw"], "usage_metadata", None) or {}
    tokens = {key: int(usage.get(key, 0)) for key in no_usage}
    return result["parsed"] or fallback, tokens


async def ingest_email(raw: bytes, session: AsyncSession, settings: Settings) -> list[dict[str, object]]:
    email = parse_email(raw, settings.allowed_email_senders)
    documents = build_documents(email)
    classified = [await classify(document, email.topic_hint, settings) for document in documents]
    # kind = "tipo:tema". El cuerpo siempre es un comunicado; los adjuntos heredan el tema del correo
    # para quedar agrupados. Un filtro futuro por tipo debe usar kind LIKE 'procedimiento%', no igualdad.
    topic = classified[0][0].topic
    kinds = [
        f"{'comunicado' if index == 0 else label.doc_type}:{topic}"
        for index, (label, _) in enumerate(classified)
    ]

    chunks = [
        (document, index, f"Documento: {document.title} | Sección: {document.section}\n{text}")
        for document in documents
        for index, text in enumerate(split_chunks(document.text), start=1)
    ]
    embedder = OllamaEmbeddings(model=settings.ollama_embedding_model, base_url=settings.ollama_base_url)
    vectors = await embedder.aembed_documents([content for _, _, content in chunks])

    now = datetime.now(timezone.utc)
    rows = [
        {
            "doc_id": document.doc_id,
            "title": document.title,
            "description": label.description,
            "kind": kind,
            "source_url": None,
            "validity_period": f"Comunicado del {email.sent_at:%d/%m/%Y}",
            "consulted_at": email.sent_at,
            "source_path": f"correo:{email.message_id}",
            "source_kind": "email",
            "updated_at": now,
        }
        for document, (label, _), kind in zip(documents, classified, kinds, strict=True)
    ]
    statement = insert(Document).values(rows)
    await session.execute(statement.on_conflict_do_update(
        index_elements=[Document.doc_id],
        set_={key: getattr(statement.excluded, key) for key in rows[0] if key != "doc_id"},
    ))
    # Reingerir el mismo correo reemplaza sus chunks en vez de duplicarlos.
    doc_ids = [document.doc_id for document in documents]
    await session.execute(delete(RagChunk).where(RagChunk.doc_id.in_(doc_ids)))
    await session.execute(insert(RagChunk).values([
        {
            "chunk_id": f"{document.doc_id}#{index}",
            "doc_id": document.doc_id,
            "section": document.section,
            "content": content,
            "tokens_approx": len(content) // 4,
            "content_hash": content_hash(content, settings.ollama_embedding_model),
            "embedding_model": settings.ollama_embedding_model,
            "embedding": vector,
        }
        for (document, index, content), vector in zip(chunks, vectors, strict=True)
    ]))
    await session.commit()
    return [
        {
            "docId": document.doc_id,
            "title": document.title,
            "kind": kind,
            "chunks": sum(1 for chunk_document, _, _ in chunks if chunk_document is document),
            "inputTokens": usage["input_tokens"],
            "outputTokens": usage["output_tokens"],
        }
        for document, (_, usage), kind in zip(documents, classified, kinds, strict=True)
    ]


async def main(paths: list[str]) -> None:
    from app.db import SessionLocal

    settings = get_settings()
    async with SessionLocal() as session:
        for path in paths:
            try:
                result = await ingest_email(Path(path).read_bytes(), session, settings)
            except IngestError as exc:
                print(f"✗ {Path(path).name}: {exc}")
                continue
            for document in result:
                print(
                    f"✓ {document['docId']} [{document['kind']}] {document['chunks']} chunks · "
                    f"{document['inputTokens']}+{document['outputTokens']} tokens · {document['title']}"
                )


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
