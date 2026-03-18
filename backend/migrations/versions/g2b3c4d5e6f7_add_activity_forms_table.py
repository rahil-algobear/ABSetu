"""Add activity_forms table and remove sections from activity_categories

Revision ID: g2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-03-18
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision = "g2b3c4d5e6f7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create activity_forms table
    op.create_table(
        "activity_forms",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "activity_category_id",
            UUID(as_uuid=True),
            sa.ForeignKey("activity_categories.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("elements", JSONB, nullable=False, server_default="[]"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Remove sections column from activity_categories
    op.drop_column("activity_categories", "sections")


def downgrade() -> None:
    # Re-add sections column
    op.add_column(
        "activity_categories",
        sa.Column("sections", JSONB, nullable=True),
    )

    # Drop activity_forms table
    op.drop_table("activity_forms")
