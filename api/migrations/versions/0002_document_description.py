"""Add a document summary field."""

from alembic import op
import sqlalchemy as sa

revision = "0002_document_description"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("description", sa.Text(), server_default="", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("documents", "description")
