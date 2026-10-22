"""Move RAG tables into their dedicated schema without rewriting data."""

from alembic import op

revision = "0004_isolate_rag_schema"
down_revision = "0003_ollama_embedding_dimensions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS rag")
    op.execute("CREATE SCHEMA IF NOT EXISTS maps")
    op.execute(
        """DO $$ BEGIN
            IF to_regclass('public.documents') IS NOT NULL AND to_regclass('rag.documents') IS NOT NULL THEN
                RAISE EXCEPTION 'Both public.documents and rag.documents exist; refusing an ambiguous migration';
            END IF;
            IF to_regclass('public.rag_chunks') IS NOT NULL AND to_regclass('rag.rag_chunks') IS NOT NULL THEN
                RAISE EXCEPTION 'Both public.rag_chunks and rag.rag_chunks exist; refusing an ambiguous migration';
            END IF;
            IF to_regclass('public.documents') IS NOT NULL THEN
                ALTER TABLE public.documents SET SCHEMA rag;
            END IF;
            IF to_regclass('public.rag_chunks') IS NOT NULL THEN
                ALTER TABLE public.rag_chunks SET SCHEMA rag;
            END IF;
        END $$"""
    )


def downgrade() -> None:
    op.execute(
        """DO $$ BEGIN
            IF to_regclass('rag.rag_chunks') IS NOT NULL AND to_regclass('public.rag_chunks') IS NULL THEN
                ALTER TABLE rag.rag_chunks SET SCHEMA public;
            END IF;
            IF to_regclass('rag.documents') IS NOT NULL AND to_regclass('public.documents') IS NULL THEN
                ALTER TABLE rag.documents SET SCHEMA public;
            END IF;
        END $$"""
    )
