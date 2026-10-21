"""Create document and RAG chunk tables."""

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "documents",
        sa.Column("doc_id", sa.Text(), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("source_url", sa.Text()),
        sa.Column("validity_period", sa.Text(), server_default="", nullable=False),
        sa.Column("consulted_at", sa.Date()),
        sa.Column("source_path", sa.Text()),
        sa.Column("source_kind", sa.Text(), server_default="rag_corpus", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_documents_source_kind", "documents", ["source_kind"])
    op.create_table(
        "rag_chunks",
        sa.Column("chunk_id", sa.Text(), primary_key=True),
        sa.Column("doc_id", sa.Text(), sa.ForeignKey("documents.doc_id", ondelete="CASCADE"), nullable=False),
        sa.Column("section", sa.Text(), server_default="", nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tokens_approx", sa.Integer(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("embedding_model", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1536), nullable=False),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed("to_tsvector('simple', coalesce(content, ''))", persisted=True),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_rag_chunks_doc_id", "rag_chunks", ["doc_id"])
    op.create_index("ix_rag_chunks_search_vector", "rag_chunks", ["search_vector"], postgresql_using="gin")
    op.create_index(
        "ix_rag_chunks_embedding_hnsw",
        "rag_chunks",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
        postgresql_with={"m": 16, "ef_construction": 64},
    )


def downgrade() -> None:
    op.drop_index("ix_rag_chunks_embedding_hnsw", table_name="rag_chunks")
    op.drop_index("ix_rag_chunks_search_vector", table_name="rag_chunks")
    op.drop_index("ix_rag_chunks_doc_id", table_name="rag_chunks")
    op.drop_table("rag_chunks")
    op.drop_index("ix_documents_source_kind", table_name="documents")
    op.drop_table("documents")
