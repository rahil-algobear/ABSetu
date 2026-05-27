"""Add max_active_enrollments to entity_types

Per-entity-type total cap on active enrollments. Null = unlimited
(today's behavior). Set per org's enrollment policy via the admin
entity-types page.

Revision ID: x8y9z0a1b2c3
Revises: w7x8y9z0a1b2
Create Date: 2026-05-27
"""

import sqlalchemy as sa
from alembic import op


revision = "x8y9z0a1b2c3"
down_revision = "w7x8y9z0a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "entity_types",
        sa.Column("max_active_enrollments", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("entity_types", "max_active_enrollments")
