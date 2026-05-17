"""Add title_template column to entity_types and activity_types

Allows each entity type and activity type to define a title template
that references meta field keys, e.g. "{a3x9_first_name} {b2y8_last_name}",
so the frontend can consistently resolve display titles.

Revision ID: s3t4u5v6w7x8
Revises: r2s3t4u5v6w7
Create Date: 2026-03-25
"""

from alembic import op
import sqlalchemy as sa

revision = "s3t4u5v6w7x8"
down_revision = "r2s3t4u5v6w7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "entity_types",
        sa.Column("title_template", sa.Text(), nullable=True),
    )
    op.add_column(
        "activity_types",
        sa.Column("title_template", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("activity_types", "title_template")
    op.drop_column("entity_types", "title_template")
