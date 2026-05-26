"""Rename dimensions.is_dimension to controls_access

The column was introduced moments ago as `is_dimension`, but the name
was self-referential ("a dimension flag on the dimensions table").
`controls_access` describes what the flag actually does.

Revision ID: u5v6w7x8y9z0
Revises: t4u5v6w7x8y9
Create Date: 2026-05-26
"""

from alembic import op


revision = "u5v6w7x8y9z0"
down_revision = "t4u5v6w7x8y9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("dimensions", "is_dimension", new_column_name="controls_access")


def downgrade() -> None:
    op.alter_column("dimensions", "controls_access", new_column_name="is_dimension")
