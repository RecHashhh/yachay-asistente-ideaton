import pytest

from app.config import Settings
from app.retrieval import Retriever


def test_retriever_uses_local_ollama_embeddings(monkeypatch) -> None:
    import app.retrieval as retrieval_module

    received = {}

    class FakeOllamaEmbeddings:
        def __init__(self, **kwargs):
            received.update(kwargs)

    monkeypatch.setattr(retrieval_module, "OllamaEmbeddings", FakeOllamaEmbeddings)
    settings = Settings(
        ollama_embedding_model="bge-m3",
        ollama_base_url="http://ollama:11434",
    )

    Retriever(settings)

    assert received == {"model": "bge-m3", "base_url": "http://ollama:11434"}
    assert not hasattr(settings, "openai_api_key")


@pytest.mark.asyncio
async def test_document_scoped_search_filters_vector_and_text_queries(monkeypatch) -> None:
    import app.retrieval as retrieval_module

    class FakeEmbeddings:
        def __init__(self, **_kwargs):
            pass

        async def aembed_query(self, _query):
            return [0.0] * 1024

    class EmptyResult:
        def all(self):
            return []

    class FakeSession:
        def __init__(self):
            self.statements = []

        async def execute(self, statement):
            self.statements.append(statement)
            return EmptyResult()

    monkeypatch.setattr(retrieval_module, "OllamaEmbeddings", FakeEmbeddings)
    retriever = Retriever(Settings())
    session = FakeSession()

    assert await retriever.search(session, "matrícula", ["doc-a", "doc-b"]) == []

    assert len(session.statements) == 2
    for statement in session.statements:
        compiled = statement.compile()
        assert "rag_chunks.doc_id IN" in str(compiled)
        assert ["doc-a", "doc-b"] in compiled.params.values()


@pytest.mark.asyncio
async def test_document_scoped_search_rejects_more_than_five_documents(monkeypatch) -> None:
    import app.retrieval as retrieval_module

    class FakeEmbeddings:
        def __init__(self, **_kwargs):
            pass

    monkeypatch.setattr(retrieval_module, "OllamaEmbeddings", FakeEmbeddings)
    retriever = Retriever(Settings())

    with pytest.raises(ValueError, match="cinco documentos"):
        await retriever.search(object(), "consulta", ["a", "b", "c", "d", "e", "f"])


@pytest.mark.asyncio
async def test_catalog_returns_document_selection_metadata(monkeypatch) -> None:
    import app.retrieval as retrieval_module

    class FakeEmbeddings:
        def __init__(self, **_kwargs):
            pass

    class FakeResult:
        def all(self):
            return [type("Row", (), {
                "doc_id": "doc-a",
                "title": "Calendario académico",
                "description": "Fechas de matrícula y evaluaciones.",
                "kind": "calendario",
                "validity_period": "2026SEM02",
                "source_url": "https://example.edu/calendario",
            })()]

    class FakeSession:
        async def execute(self, _statement):
            return FakeResult()

    monkeypatch.setattr(retrieval_module, "OllamaEmbeddings", FakeEmbeddings)
    catalog = await Retriever(Settings()).list_documents(FakeSession())

    assert catalog == [
        {
            "doc_id": "doc-a",
            "title": "Calendario académico",
            "description": "Fechas de matrícula y evaluaciones.",
            "kind": "calendario",
            "validity_period": "2026SEM02",
            "source_url": "https://example.edu/calendario",
        }
    ]
