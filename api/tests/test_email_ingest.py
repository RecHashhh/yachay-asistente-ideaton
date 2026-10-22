import base64
from email.message import EmailMessage

import pytest

from app.email_ingest import (
    BODY_CHUNK_CHARS,
    IngestError,
    body_chunks,
    build_documents,
    same_title,
    clean_body,
    clean_subject,
    decode_raw,
    parse_email,
)

ALLOWED = {"comunicacion@yachaytech.edu.ec"}

# Réplica sintética de la plantilla de Comunicación (encabezado gif, imagen inline, firma y pie).
BODY = """
[https://yachaytech.edu.ec/wp-content/uploads/2024/09/head-enterate.gif]

Estimada Comunidad Universitaria:

Los retiros se realizan en COBUS BPM en el siguiente link:
https://bpm.yachaytech.edu.ec/cobusbpm/

[cid:350ee35d-f7a9-4b91-9d80-69e6ff7401e3]

Consultas: soporte@yachaytech.edu.ec<mailto:soporte@yachaytech.edu.ec> o en el portal<https://www.yachaytech.edu.ec/estudiantes/>



DIRECCIÓN DE SERVICIOS ACADÉMICOS

[https://ezhreon.stripocdn.email/content/guids/CABINET_x/images/footermailing.png]

Hacienda San José S/N Urcuquí - Ecuador | Telf: +593 3 2 999 500
[Fb]<https://www.facebook.com/universidadyachaytech/>
"""


def make_email(sender: str = "Comunicación YachayTech <comunicacion@yachaytech.edu.ec>") -> EmailMessage:
    message = EmailMessage()
    message["From"] = sender
    message["Subject"] = "💻👩‍💻 Entérate- Retiro por caso Fortuito o Fuerza Mayor"
    message["Date"] = "Fri, 16 Oct 2026 21:53:38 +0000"
    message["Message-ID"] = "<abc123@prod.outlook.com>"
    message.set_content(BODY)
    message.add_alternative("<p>versión html</p>", subtype="html")
    return message


def test_clean_subject_removes_emojis_and_keeps_communication_category() -> None:
    assert clean_subject("🌐 🛠️ Servicios- Ventana de mantenimiento ") == ("Ventana de mantenimiento", "Servicios")
    assert clean_subject("🍛🎉Invitación - Feria Gastronómica") == ("Feria Gastronómica", "Invitación")
    assert clean_subject("📌✅ Entérate- Encargo de funciones") == ("Encargo de funciones", "Entérate")
    assert clean_subject("🗳️ 📋 Convocatoria-Conoce a los candidatos") == ("Conoce a los candidatos", "Convocatoria")
    assert clean_subject("Sin prefijo") == ("Sin prefijo", None)


def test_clean_body_keeps_content_and_signature_but_drops_template() -> None:
    body = clean_body(BODY)

    assert body.startswith("Estimada Comunidad Universitaria:")
    assert body.endswith("DIRECCIÓN DE SERVICIOS ACADÉMICOS")
    assert "https://bpm.yachaytech.edu.ec/cobusbpm/" in body
    # La URL de un enlace se conserva literal para que el agente pueda citarla; el mailto se descarta.
    assert "portal (https://www.yachaytech.edu.ec/estudiantes/)" in body
    assert "<mailto:" not in body
    for template_noise in ("head-enterate.gif", "cid:", "footermailing", "Hacienda San José", "facebook"):
        assert template_noise not in body
    assert "\n\n\n" not in body


def test_parse_email_reads_metadata_and_plain_body() -> None:
    email = parse_email(make_email().as_bytes(), ALLOWED)

    assert email.subject == "Retiro por caso Fortuito o Fuerza Mayor"
    assert email.category == "Entérate"
    assert email.sender == "comunicacion@yachaytech.edu.ec"
    assert email.sent_at.isoformat() == "2026-10-16"
    assert email.message_id == "<abc123@prod.outlook.com>"
    assert "versión html" not in email.body
    assert email.attachments == []


def test_parse_email_rejects_senders_outside_allowlist() -> None:
    with pytest.raises(IngestError, match="remitente no permitido"):
        parse_email(make_email("Alguien <falso@gmail.com>").as_bytes(), ALLOWED)


def test_forwarded_as_attachment_processes_the_original_message() -> None:
    forward = EmailMessage()
    forward["From"] = "Kevin <kevin@yachaytech.edu.ec>"
    forward["Subject"] = "RV: comunicado"
    forward.set_content("Reenvío el comunicado.")
    forward.add_attachment(make_email())

    # Quien reenvía debe estar autorizado; el contenido (fecha, asunto, Message-ID) es el del comunicado original.
    email = parse_email(forward.as_bytes(), ALLOWED, {"kevin@yachaytech.edu.ec"})
    assert email.subject == "Retiro por caso Fortuito o Fuerza Mayor"
    assert email.message_id == "<abc123@prod.outlook.com>"
    assert email.sender == "comunicacion@yachaytech.edu.ec"
    assert email.forwarded_by == "kevin@yachaytech.edu.ec"
    with pytest.raises(IngestError, match="remitente no permitido"):
        parse_email(forward.as_bytes(), ALLOWED)


def test_inline_forward_is_rejected_because_it_loses_the_original() -> None:
    inline = EmailMessage()
    inline["From"] = "Kevin <kevin@yachaytech.edu.ec>"
    inline["Subject"] = "RV: Entérate- Retiro por caso Fortuito"
    inline.set_content("De: Comunicación YachayTech\n\n" + BODY)

    with pytest.raises(IngestError, match="como archivo adjunto"):
        parse_email(inline.as_bytes(), ALLOWED, {"kevin@yachaytech.edu.ec"})


def test_forwarded_original_must_come_from_an_official_source() -> None:
    forward = EmailMessage()
    forward["From"] = "Kevin <kevin@yachaytech.edu.ec>"
    forward["Subject"] = "RV: aviso"
    forward.set_content("Reenvío.")
    forward.add_attachment(make_email("Compañero <alguien@gmail.com>"))

    with pytest.raises(IngestError, match="fuente oficial"):
        parse_email(forward.as_bytes(), ALLOWED, {"kevin@yachaytech.edu.ec"})


def test_build_documents_titles_body_with_date_and_stable_id() -> None:
    email = parse_email(make_email().as_bytes(), ALLOWED)
    first, second = build_documents(email), build_documents(email)

    assert len(first) == 1
    assert first[0].title == "Comunicado 16/10/2026: Retiro por caso Fortuito o Fuerza Mayor"
    assert first[0].kind == "email"
    assert first[0].doc_id.startswith("email_") and first[0].doc_id == second[0].doc_id


def test_body_chunks_are_short_enough_for_the_embedding_window() -> None:
    document = build_documents(parse_email(make_email().as_bytes(), ALLOWED))[0]
    long_body = "\n\n".join(f"Párrafo {i}: " + "dato " * 20 for i in range(12))
    chunks = body_chunks(type(document)(document.doc_id, document.title, "email", "comunicado", long_body, 1))

    assert len(chunks) > 1
    assert [c["id"] for c in chunks] == [f"{document.doc_id}#{i}" for i in range(1, len(chunks) + 1)]
    for c in chunks:
        header, searched = c["embed"].split("\n\n", 1)
        assert header == f"Documento: {document.title}"
        assert len(searched) <= BODY_CHUNK_CHARS  # lo que se indexa cabe en la ventana del modelo
        assert c["texto"].startswith(header + "\n\n")  # mismo formato «Documento: …\n\n» que espera la búsqueda
        assert searched in c["texto"]  # lo que se lee incluye lo indexado


def test_body_chunks_keep_a_list_with_its_heading() -> None:
    document = build_documents(parse_email(make_email().as_bytes(), ALLOWED))[0]
    text = ("Listas participantes:\n\nLista A – Movimiento Sinergia\n\n" + "• Candidata A1 y su alterna\n\n" * 6
            + "Lista D – Movimiento Wankurina\n\n" + "• Candidato D1 y su alterno\n\n" * 6)
    chunks = body_chunks(type(document)(document.doc_id, document.title, "email", "comunicado", text, 1))

    # Todo trozo indexado con candidatas de la Lista A se lee junto con su encabezado.
    for c in chunks:
        if "Candidata A1" in c["embed"]:
            assert "Lista A – Movimiento Sinergia" in c["texto"]


def test_long_paragraph_is_split_so_late_facts_are_indexed() -> None:
    document = build_documents(parse_email(make_email().as_bytes(), ALLOWED))[0]
    text = "Importante: " + "texto de relleno sobre co-requisitos. " * 12 + "El plazo para atender una devolución es de 16 horas."
    chunks = body_chunks(type(document)(document.doc_id, document.title, "email", "comunicado", text, 1))

    assert any("16 horas" in c["embed"] and len(c["embed"].split("\n\n", 1)[1]) <= BODY_CHUNK_CHARS for c in chunks)


def test_same_title_detects_corpus_copies_but_not_new_versions() -> None:
    corpus = "Procedimiento de Retiro de Estudiantes de Carrera V4.0"
    assert same_title("1. Procedimiento de Retiro de Estuidantes de Carrera V4.0 (1)", corpus)  # copia con errata
    assert not same_title("Instructivo Retiro Carrera 2026SEM02 (1)", "Instructivo Retiro Carrera 14 03 2025")
    assert not same_title("UITEY-REC-2026-0304-M", corpus)
    # Versiones nuevas: casi el mismo título, distinto número.
    assert not same_title("Procedimiento de Retiro de Estudiantes de Carrera V5.0", corpus)
    assert not same_title("Calendario Academico 2027Sem01", "Calendario Academico 2026Sem02")
    assert not same_title("FORMATO ENTREGA TRABAJO DE TITULACION POSGRADO", "FORMATO ENTREGA TRABAJO DE TITULACION PREGRADO")


def test_attachment_without_text_is_skipped_not_fatal() -> None:
    message = make_email()
    message.add_attachment(b"%PDF-1.4 sin texto", maintype="application", subtype="pdf", filename="escaneado.pdf")
    email = parse_email(message.as_bytes(), ALLOWED)

    assert [name for name, _ in email.attachments] == ["escaneado.pdf"]
    # Un PDF escaneado o dañado no impide indexar el comunicado.
    assert [document.kind for document in build_documents(email)] == ["email"]


def test_decode_raw_accepts_standard_and_url_safe_base64() -> None:
    raw = make_email().as_bytes()
    assert decode_raw(base64.b64encode(raw).decode()) == raw
    assert decode_raw(base64.urlsafe_b64encode(raw).decode().rstrip("=")) == raw
