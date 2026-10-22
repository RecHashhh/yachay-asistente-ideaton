"""Ingesta de comunicados institucionales recibidos por correo: cuerpo en texto plano y PDF adjuntos.

Reutiliza el procesamiento del Portal (processing.py): misma extracción de PDF, mismos fragmentos y mismos embeddings,
así un comunicado queda en `documents`/`chunks` igual que un documento subido a mano.
"""

import base64
import hashlib
import logging
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import parseaddr, parsedate_to_datetime
from pathlib import Path
from typing import Literal

from langchain_anthropic import ChatAnthropic
from psycopg import errors
from pydantic import BaseModel, Field

from .config import Settings, get_settings
from .db import conn, open_pool
from .processing import extract, make_chunks, tipo_for

logger = logging.getLogger(__name__)

# Comunicación ya etiqueta sus asuntos ("Entérate-", "Eventos-"…): se guarda como pista para clasificar.
SUBJECT_PREFIX = re.compile(r"(Servicios|Eventos|Invitaci[oó]n|Ent[eé]rate|Convocatoria)\s*-\s*", re.IGNORECASE)
FOOTER_MARK = "footermailing"  # imagen con la que empieza el pie común de la plantilla
ECUADOR = timezone(timedelta(hours=-5))  # sin horario de verano; los correos llegan con hora UTC


class IngestError(ValueError):
    """El correo no se puede ingerir: remitente no permitido, sin texto, etc."""


class Classification(BaseModel):
    # Mismo vocabulario que documents.tipo (rag/fuentes.csv y los valores de processing.tipo_for).
    doc_type: Literal[
        "procedimiento", "reglamento", "instructivo", "guia", "calendario", "convocatoria", "plan", "programa",
        "estatuto", "ley", "codigo", "documento",
    ] = Field(
        description=(
            "Qué clase de documento es: procedimiento, reglamento, instructivo, guia, calendario, "
            "convocatoria (bases de una convocatoria), plan, programa, estatuto, ley, codigo; documento si no encaja "
            "(memorandos, oficios, formularios u otros)."
        )
    )
    # Los temas del catálogo (tabla topics, app/catalog.py).
    topic: Literal[
        "tramites", "academico", "bienestar", "campus", "representacion", "admision", "normativa", "investigacion",
        "institucional",
    ] = Field(
        description=(
            "tramites: cambio de carrera, retiro, terceras matrículas, reingresos, certificados, titulación; "
            "academico: calendario académico; bienestar: becas, salud, prevención, clubes, seguros; "
            "campus: aulas, laboratorios, biblioteca, residencias, servicios del campus; "
            "representacion: FEYT, cogobierno, elecciones y canales de participación estudiantil; "
            "admision: postulación, carreras, escuelas, posgrado, inglés; normativa: LOES, estatuto, ética, transparencia; "
            "investigacion: proyectos, ética en investigación; institucional: autoridades, planes, vinculación, "
            "eventos y avisos generales."
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
    sender: str
    subject: str
    category: str | None  # prefijo del asunto que pone Comunicación
    sent_at: date
    body: str
    attachments: list[tuple[str, bytes]]  # (nombre del archivo, bytes del PDF)


@dataclass(frozen=True)
class EmailDocument:
    doc_id: str
    title: str
    kind: str  # formato, como en documents.kind: "email" o "pdf"
    tipo_hint: str  # tipo si la IA no está disponible
    text: str
    size_kb: int


def decode_raw(value: str) -> bytes:
    """Decodifica el mensaje completo en base64 (acepta el alfabeto estándar y el de URL)."""
    compact = re.sub(r"\s+", "", value)
    try:
        return base64.urlsafe_b64decode(compact + "=" * (-len(compact) % 4))
    except ValueError as exc:
        raise IngestError("raw no es base64 válido") from exc


def clean_subject(subject: str) -> tuple[str, str | None]:
    """Quita emojis iniciales y el prefijo de categoría; devuelve (asunto limpio, categoría de Comunicación)."""
    text = re.sub(r"^[^\w¿¡]+", "", subject).strip()
    match = SUBJECT_PREFIX.match(text)
    if not match:
        return text, None
    return text[match.end():].strip(), match.group(1)


def clean_body(text: str) -> str:
    """Limpia el text/plain de la plantilla de Comunicación: sin encabezado, marcas de imagen ni pie."""
    lines: list[str] = []
    for line in text.splitlines():
        if FOOTER_MARK in line:
            break
        if re.fullmatch(r"\s*\[(?:https?://\S+|cid:\S+)\]\s*", line):
            continue
        line = re.sub(r"<mailto:[^>]*>", "", line)
        # Conserva la URL exacta: el asistente solo enlaza URLs que aparecen literalmente en las fuentes.
        line = re.sub(r"<(https?://[^>]+)>", r" (\1)", line)
        lines.append(line.rstrip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


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

    subject, category = clean_subject(str(message.get("Subject", "")))
    try:
        sent_at = parsedate_to_datetime(str(message["Date"])).astimezone(ECUADOR).date()
    except (TypeError, ValueError):
        sent_at = datetime.now(ECUADOR).date()
    message_id = str(message.get("Message-ID") or "").strip() or hashlib.sha256(raw).hexdigest()
    attachments = [
        (part.get_filename() or "adjunto.pdf", part.get_payload(decode=True) or b"")
        for part in message.iter_attachments()
        if part.get_content_type() == "application/pdf"
    ]
    return ParsedEmail(message_id, sender, subject or "Comunicado sin asunto", category, sent_at, body, attachments)


def build_documents(email: ParsedEmail) -> list[EmailDocument]:
    """Un documento para el cuerpo y uno por cada PDF con texto; los ID hacen la ingesta idempotente."""
    stamp = email.sent_at.strftime("%d/%m/%Y")
    documents = [EmailDocument(
        doc_id="email_" + hashlib.sha256(email.message_id.encode()).hexdigest()[:16],
        title=f"Comunicado {stamp}: {email.subject}",
        kind="email",
        tipo_hint="comunicado",
        text=email.body,
        size_kb=max(1, len(email.body.encode()) // 1024),
    )]
    for filename, data in email.attachments:
        title = f"{Path(filename).stem} (adjunto al comunicado del {stamp}: {email.subject})"
        try:
            text, _pages = extract(data, "pdf", title)  # misma extracción que una subida del Portal
        except Exception as exc:  # escaneado (ProcessingError) o dañado: el comunicado se indexa igual
            logger.warning("Adjunto omitido %s: %s", filename, exc)
            continue
        documents.append(EmailDocument(
            # El mismo PDF en dos correos es el mismo documento.
            doc_id="email_adj_" + hashlib.sha256(data).hexdigest()[:16],
            title=title,
            kind="pdf",
            tipo_hint=tipo_for(filename),
            text=text,
            size_kb=max(1, len(data) // 1024),
        ))
    return documents


def classify(
    document: EmailDocument, category: str | None, settings: Settings
) -> tuple[Classification, dict[str, int]]:
    """Tipo, tema y descripción con IA; sin clave o si falla, tipo por nombre del archivo y tema institucional.

    Devuelve también los tokens consumidos, para controlar el costo de la ingesta.
    """
    fallback = Classification(
        doc_type=document.tipo_hint if document.kind == "pdf" else "documento",  # el cuerpo siempre se guarda como comunicado
        topic="institucional",
        description=f"{document.title}. {document.text[:300]}",
    )
    no_usage = {"input_tokens": 0, "output_tokens": 0}
    if not settings.has_anthropic_key:
        return fallback, no_usage
    # 400 tokens cortaron la respuesta de un correo largo y la clasificación cayó al plan B.
    llm = ChatAnthropic(
        model=settings.anthropic_model, anthropic_api_key=settings.anthropic_api_key.get_secret_value(), max_tokens=1024
    )
    prompt = (
        "Clasifica este comunicado institucional de la Universidad Yachay Tech y descríbelo para el catálogo "
        "que usa un asistente para decidir dónde buscar."
        + (f"\n\nCategoría que le puso la Dirección de Comunicación: {category}" if category else "")
        + f"\n\nTítulo: {document.title}\n\n{document.text[:6000]}"
    )
    try:
        result = llm.with_structured_output(Classification, include_raw=True).invoke(prompt)
    except Exception:
        logger.exception("No se pudo clasificar %s; se usa el plan B", document.doc_id)
        return fallback, no_usage
    usage = getattr(result["raw"], "usage_metadata", None) or {}
    tokens = {key: int(usage.get(key, 0)) for key in no_usage}
    return result["parsed"] or fallback, tokens


def ingest_email(raw: bytes, settings: Settings) -> list[dict[str, object]]:
    from .search import vectors  # carga perezosa del modelo de embeddings, igual que processing.process

    email = parse_email(raw, settings.allowed_email_senders)
    documents = build_documents(email)
    classified = [classify(document, email.category, settings) for document in documents]
    # Los adjuntos heredan el tema del correo para que el comunicado quede agrupado en el catálogo.
    topic = classified[0][0].topic
    prepared = []
    for index, (document, (label, usage)) in enumerate(zip(documents, classified, strict=True)):
        chunks = make_chunks(document.doc_id, document.title, document.text)
        vectors_ = [vectors.embed(f"{ch['seccion']}\n{ch['texto'][:2000]}") for ch in chunks]
        prepared.append((document, "comunicado" if index == 0 else label.doc_type, label, usage, chunks, vectors_))

    notes = f"Correo de {email.sender} · {email.message_id}" + (f" · categoría «{email.category}»" if email.category else "")
    try:
        _store(prepared, topic, email, notes)
    except errors.ForeignKeyViolation as exc:  # los temas los siembra la carga del corpus
        raise IngestError("faltan los temas del catálogo: primero carga el corpus (python -m app.ingest)") from exc
    return [
        {
            "docId": document.doc_id,
            "title": document.title,
            "tipo": tipo,
            "topic": topic,
            "chunks": len(chunks),
            "inputTokens": usage["input_tokens"],
            "outputTokens": usage["output_tokens"],
        }
        for document, tipo, _, usage, chunks, _ in prepared
    ]


def _store(prepared: list, topic: str, email: ParsedEmail, notes: str) -> None:
    with conn() as c:
        for document, tipo, label, _, chunks, vectors_ in prepared:
            # Si un administrador retiró el documento en el Portal, reingerir el correo no lo revive.
            c.execute(
                """INSERT INTO documents (id, title, tipo, topic_id, version, fecha_consulta, acceso, kind, status, is_current,
                                          uploaded_by, size_kb, notes, description)
                   VALUES (%s,%s,%s,%s,%s,%s,'institucional',%s,'indexado',true,%s,%s,%s,%s)
                   ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, tipo = EXCLUDED.tipo, topic_id = EXCLUDED.topic_id,
                     version = EXCLUDED.version, fecha_consulta = EXCLUDED.fecha_consulta, kind = EXCLUDED.kind,
                     status = 'indexado', is_current = true, uploaded_by = EXCLUDED.uploaded_by, size_kb = EXCLUDED.size_kb,
                     notes = EXCLUDED.notes, description = EXCLUDED.description
                   WHERE documents.status <> 'retirado'""",
                (document.doc_id, document.title, tipo, topic, f"Comunicado del {email.sent_at:%d/%m/%Y}", email.sent_at,
                 document.kind, f"correo:{email.sender}", document.size_kb, notes, label.description),
            )
            # Reingerir el mismo correo reemplaza sus fragmentos en vez de duplicarlos.
            c.execute("DELETE FROM chunks WHERE doc_id = %s", (document.doc_id,))
            with c.cursor() as cur:
                cur.executemany(
                    "INSERT INTO chunks (id, doc_id, ord, seccion, texto, tokens, embedding) VALUES (%s,%s,%s,%s,%s,%s,%s::vector)",
                    [(ch["id"], document.doc_id, i + 1, ch["seccion"], ch["texto"], ch["tokens"], "[" + ",".join(f"{x:.6f}" for x in v) + "]")
                     for i, (ch, v) in enumerate(zip(chunks, vectors_, strict=True))],
                )


def main(paths: list[str]) -> None:
    settings = get_settings()
    open_pool()
    for path in paths:
        try:
            result = ingest_email(Path(path).read_bytes(), settings)
        except IngestError as exc:
            print(f"✗ {Path(path).name}: {exc}")
            continue
        for document in result:
            print(
                f"✓ {document['docId']} [{document['tipo']} · {document['topic']}] {document['chunks']} chunks · "
                f"{document['inputTokens']}+{document['outputTokens']} tokens · {document['title']}"
            )


if __name__ == "__main__":
    main(sys.argv[1:])
