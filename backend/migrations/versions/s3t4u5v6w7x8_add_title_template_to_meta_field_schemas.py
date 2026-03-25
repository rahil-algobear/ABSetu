"""Add title_template column to meta_field_schemas

Allows each meta field schema to define a title template that references
field keys, e.g. "{a3x9_first_name} {b2y8_last_name}", so the frontend
can consistently resolve display titles for entities and activities.

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
        "meta_field_schemas",
        sa.Column("title_template", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("meta_field_schemas", "title_template")
