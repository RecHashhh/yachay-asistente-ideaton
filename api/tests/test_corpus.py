from pathlib import Path

import pytest

from app.corpus import content_hash, load_corpus


def test_loads_full_corpus_and_source_metadata() -> None:
    root = Path(__file__).resolve().parents[2] / "rag"
    if not root.exists():  # Tests also run inside the API image, where Compose mounts the corpus here.
        root = Path("/app/rag")
    if not (root / "fuentes.csv").exists():
        # El corpus es confidencial y no se versiona: sin la copia local en rag/ esta prueba no aplica.
        pytest.skip("corpus local no disponible en rag/ (confidencial, fuera del repositorio)")
    documents, chunks = load_corpus(root)

    assert len(chunks) == 1437
    assert len(documents) > 0
    assert len(documents) == 73
    assert all(chunk.doc_id in documents for chunk in chunks)
    assert all(chunk.content.strip() for chunk in chunks)
    assert all(len(document.description) >= 50 for document in documents.values())
    assert "2026sem02" in documents["calendario_academico_2026sem02"].description.lower()
    assert "confidencialidad" in documents[
        "reglamento_del_comite_de_etica_de_investigacion_en_seres_humanos_ceish"
    ].description.lower()
    # The source consultation date is metadata, not an editorial publication date.
    assert any(document.consulted_at is not None for document in documents.values())


def test_embedding_hash_includes_model_and_text() -> None:
    assert content_hash("texto", "modelo-a") != content_hash("texto", "modelo-b")
    assert content_hash("texto", "modelo-a") != content_hash("texto cambiado", "modelo-a")
    assert content_hash("texto", "modelo-a") == content_hash("texto", "modelo-a")
