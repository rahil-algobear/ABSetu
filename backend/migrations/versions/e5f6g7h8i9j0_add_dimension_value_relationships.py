"""Add dimension_value_relationships table

Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision = "e5f6g7h8i9j0"
down_revision = "d4e5f6g7h8i9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dimension_value_relationships",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "parent_dimension_value_id",
            UUID(as_uuid=True),
            sa.ForeignKey("dimension_values.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "child_dimension_value_id",
            UUID(as_uuid=True),
            sa.ForeignKey("dimension_values.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "parent_dimension_value_id",
            "child_dimension_value_id",
            name="uq_dimension_value_relationship",
        ),
    )


def downgrade() -> None:
    op.drop_table("dimension_value_relationships")
