"""Switch stored vectors to the 1024 dimensional Ollama BGE-M3 model.

Existing vectors are replaced by zero placeholders. The seed command detects the
model marker and regenerates every vector from the canonical corpus before the API
service starts.
"""

from alembic import op

revision = "0003_ollama_embedding_dimensions"
down_revision = "0002_document_description"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_rag_chunks_embedding_hnsw", table_name="rag_chunks")
    op.execute(
        "ALTER TABLE rag_chunks ALTER COLUMN embedding TYPE vector(1024) "
        "USING array_fill(0::real, ARRAY[1024])::vector(1024)"
    )
    op.execute(
        "UPDATE rag_chunks SET embedding_model = 'ollama-rebuild-required', content_hash = '', updated_at = now()"
    )
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
    op.execute(
        "ALTER TABLE rag_chunks ALTER COLUMN embedding TYPE vector(1536) "
        "USING array_fill(0::real, ARRAY[1536])::vector(1536)"
    )
    op.execute(
        "UPDATE rag_chunks SET embedding_model = 'openai-rebuild-required', content_hash = '', updated_at = now()"
    )
    op.create_index(
        "ix_rag_chunks_embedding_hnsw",
        "rag_chunks",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
        postgresql_with={"m": 16, "ef_construction": 64},
    )
