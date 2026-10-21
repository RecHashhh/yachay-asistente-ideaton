from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path

from langchain_ollama import OllamaEmbeddings
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import select

from app.config import get_settings
from app.corpus import content_hash, load_corpus
from app.db import SessionLocal
from app.models import Document, RagChunk

EMBEDDING_DIMENSIONS = 1024
BATCH_SIZE = 16


async def seed(rag_dir: Path) -> tuple[int, int]:
    settings = get_settings()
    documents, chunks = load_corpus(rag_dir)
    embedder = OllamaEmbeddings(
        model=settings.ollama_embedding_model,
        base_url=settings.ollama_base_url,
    )
    async with SessionLocal() as session:
        existing_result = await session.execute(select(RagChunk.chunk_id, RagChunk.content_hash))
        existing = {row.chunk_id: row.content_hash for row in existing_result.all()}
        pending = [chunk for chunk in chunks if existing.get(chunk.chunk_id) != content_hash(chunk.content, settings.ollama_embedding_model)]

        document_rows = [
            {
                "doc_id": doc.doc_id,
                "title": doc.title,
                "description": doc.description,
                "kind": doc.kind,
                "source_url": doc.source_url,
                "validity_period": doc.validity_period,
                "consulted_at": doc.consulted_at,
                "source_path": doc.source_path,
                "source_kind": "rag_corpus",
                "updated_at": datetime.now(timezone.utc),
            }
            for doc in documents.values()
        ]
        document_statement = insert(Document).values(document_rows)
        await session.execute(
            document_statement.on_conflict_do_update(
                index_elements=[Document.doc_id],
                set_={key: getattr(document_statement.excluded, key) for key in (
                    "title", "description", "kind", "source_url", "validity_period", "consulted_at", "source_path", "updated_at"
                )},
            )
        )
        await session.commit()

        for start in range(0, len(pending), BATCH_SIZE):
            batch = pending[start : start + BATCH_SIZE]
            batch_vectors = await embedder.aembed_documents([chunk.content for chunk in batch])
            if any(len(vector) != EMBEDDING_DIMENSIONS for vector in batch_vectors):
                raise ValueError(
                    f"Ollama devolvió embeddings con una dimensión distinta de {EMBEDDING_DIMENSIONS}; "
                    f"revisa el modelo {settings.ollama_embedding_model!r}"
                )
            rows = [
                {
                    "chunk_id": chunk.chunk_id,
                    "doc_id": chunk.doc_id,
                    "section": chunk.section,
                    "content": chunk.content,
                    "tokens_approx": chunk.tokens_approx,
                    "content_hash": content_hash(chunk.content, settings.ollama_embedding_model),
                    "embedding_model": settings.ollama_embedding_model,
                    "embedding": vector,
                }
                for chunk, vector in zip(batch, batch_vectors, strict=True)
            ]
            statement = insert(RagChunk).values(rows)
            await session.execute(
                statement.on_conflict_do_update(
                    index_elements=[RagChunk.chunk_id],
                    set_={
                        key: getattr(statement.excluded, key)
                        for key in ("doc_id", "section", "content", "tokens_approx", "content_hash", "embedding_model", "embedding")
                    },
                )
            )
            await session.commit()
            print(f"Embeddings guardados: {min(start + len(batch), len(pending))}/{len(pending)}.", flush=True)

        desired_ids = [chunk.chunk_id for chunk in chunks]
        await session.execute(
            RagChunk.__table__.delete().where(
                RagChunk.doc_id.in_(list(documents)), RagChunk.chunk_id.not_in(desired_ids)
            )
        )
        await session.execute(
            Document.__table__.delete().where(
                Document.source_kind == "rag_corpus", Document.doc_id.not_in(list(documents))
            )
        )
        await session.commit()
    return len(pending), len(chunks)


async def main() -> None:
    rag_dir = Path(os.environ.get("RAG_DATA_DIR", str(Path.cwd() / "rag")))
    updated, total = await seed(rag_dir)
    print(f"Corpus sincronizado: {total} fragmentos; embeddings generados/actualizados: {updated}.")


if __name__ == "__main__":
    asyncio.run(main())
