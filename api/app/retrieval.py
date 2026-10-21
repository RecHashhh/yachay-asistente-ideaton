from dataclasses import dataclass
from collections.abc import Sequence

from langchain_ollama import OllamaEmbeddings
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.fusion import reciprocal_rank_fusion
from app.models import Document, RagChunk


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: str
    doc_id: str
    title: str
    kind: str
    source_url: str | None
    validity_period: str
    section: str
    content: str
    similarity: float


class Retriever:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.embeddings = OllamaEmbeddings(
            model=settings.ollama_embedding_model,
            base_url=settings.ollama_base_url,
        )

    async def list_documents(self, session: AsyncSession) -> list[dict[str, str | None]]:
        result = await session.execute(
            select(
                Document.doc_id,
                Document.title,
                Document.description,
                Document.kind,
                Document.validity_period,
                Document.source_url,
            ).order_by(Document.title, Document.doc_id)
        )
        return [
            {
                "doc_id": row.doc_id,
                "title": row.title,
                "description": row.description,
                "kind": row.kind,
                "validity_period": row.validity_period,
                "source_url": row.source_url,
            }
            for row in result.all()
        ]

    async def search(
        self,
        session: AsyncSession,
        query_text: str,
        document_ids: Sequence[str] | None = None,
    ) -> list[RetrievedChunk]:
        selected_ids = list(dict.fromkeys(document_ids or []))
        if len(selected_ids) > 5:
            raise ValueError("La búsqueda enfocada admite como máximo cinco documentos")

        query_vector = await self.embeddings.aembed_query(query_text)
        limit = max(1, self.settings.rag_vector_candidates)

        distance = RagChunk.embedding.cosine_distance(query_vector).label("distance")
        vector_query = select(RagChunk.chunk_id, distance).order_by(distance).limit(limit)
        if selected_ids:
            vector_query = vector_query.where(RagChunk.doc_id.in_(selected_ids))
        vector_result = await session.execute(vector_query)
        vector_rows = vector_result.all()
        vector_ids = [row.chunk_id for row in vector_rows]
        similarities = {row.chunk_id: max(0.0, 1.0 - float(row.distance)) for row in vector_rows}

        tsquery = func.websearch_to_tsquery("simple", query_text)
        text_rank = func.ts_rank_cd(RagChunk.search_vector, tsquery).label("rank")
        text_query = (
            select(RagChunk.chunk_id, text_rank)
            .where(RagChunk.search_vector.op("@@")(tsquery))
            .order_by(desc("rank"))
            .limit(limit)
        )
        if selected_ids:
            text_query = text_query.where(RagChunk.doc_id.in_(selected_ids))
        text_result = await session.execute(text_query)
        text_ids = [row.chunk_id for row in text_result.all()]

        ranked_ids = reciprocal_rank_fusion(vector_ids, text_ids)
        if not ranked_ids:
            return []
        result = await session.execute(
            select(RagChunk, Document)
            .join(Document, Document.doc_id == RagChunk.doc_id)
            .where(RagChunk.chunk_id.in_(ranked_ids))
        )
        rows = {chunk.chunk_id: (chunk, document) for chunk, document in result.all()}
        ordered: list[RetrievedChunk] = []
        for chunk_id in ranked_ids:
            chunk, document = rows[chunk_id]
            ordered.append(
                RetrievedChunk(
                    chunk_id=chunk.chunk_id,
                    doc_id=document.doc_id,
                    title=document.title,
                    kind=document.kind,
                    source_url=document.source_url,
                    validity_period=document.validity_period,
                    section=chunk.section,
                    content=chunk.content,
                    similarity=similarities.get(chunk_id, 0.0),
                )
            )

        if not ordered or max(item.similarity for item in ordered) < self.settings.rag_min_similarity:
            return []
        return ordered[: max(1, self.settings.rag_context_chunks)]
