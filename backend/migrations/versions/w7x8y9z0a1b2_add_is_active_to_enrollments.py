"""Add is_active flag to enrollments

Staff explicitly toggle this via End/Start actions on the entity detail
page. Existing enrollments backfill to TRUE — current behaviour treats
every enrollment as active regardless of any date fields the org may have
configured.

Revision ID: w7x8y9z0a1b2
Revises: v6w7x8y9z0a1
Create Date: 2026-05-27
"""

import sqlalchemy as sa
from alembic import op


revision = "w7x8y9z0a1b2"
down_revision = "v6w7x8y9z0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "enrollments",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("enrollments", "is_active")
