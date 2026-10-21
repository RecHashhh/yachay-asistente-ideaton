from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Computed, Date, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Document(Base):
    __tablename__ = "documents"

    doc_id: Mapped[str] = mapped_column(Text, primary_key=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str | None] = mapped_column(Text)
    validity_period: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    consulted_at: Mapped[date | None] = mapped_column(Date)
    source_path: Mapped[str | None] = mapped_column(Text)
    source_kind: Mapped[str] = mapped_column(Text, nullable=False, server_default="rag_corpus")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    chunks: Mapped[list["RagChunk"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class RagChunk(Base):
    __tablename__ = "rag_chunks"

    chunk_id: Mapped[str] = mapped_column(Text, primary_key=True)
    doc_id: Mapped[str] = mapped_column(ForeignKey("documents.doc_id", ondelete="CASCADE"), nullable=False)
    section: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tokens_approx: Mapped[int] = mapped_column(Integer, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    embedding_model: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(1024), nullable=False)
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('simple', coalesce(content, ''))", persisted=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    document: Mapped[Document] = relationship(back_populates="chunks")


Index("ix_rag_chunks_doc_id", RagChunk.doc_id)
Index("ix_rag_chunks_search_vector", RagChunk.search_vector, postgresql_using="gin")
Index(
    "ix_rag_chunks_embedding_hnsw",
    RagChunk.embedding,
    postgresql_using="hnsw",
    postgresql_ops={"embedding": "vector_cosine_ops"},
    postgresql_with={"m": 16, "ef_construction": 64},
)
Index("ix_documents_source_kind", Document.source_kind)
