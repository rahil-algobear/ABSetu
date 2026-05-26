"""Add is_dimension flag to dimensions

Introduces a boolean column that distinguishes structural dimensions
(used for access control and participating in dimension value links)
from free-form tag axes. Existing rows are backfilled to True to
preserve current behavior.

Revision ID: t4u5v6w7x8y9
Revises: 1eabbaaeee05
Create Date: 2026-05-26
"""

import sqlalchemy as sa
from alembic import op


revision = "t4u5v6w7x8y9"
down_revision = "1eabbaaeee05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dimensions",
        sa.Column(
            "is_dimension",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("dimensions", "is_dimension")
