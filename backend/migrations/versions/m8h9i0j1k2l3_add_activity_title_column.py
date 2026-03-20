"""Add title column to activities

Revision ID: m8h9i0j1k2l3
Revises: l7g8h9i0j1k2
Create Date: 2026-03-20
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "m8h9i0j1k2l3"
down_revision = "l7g8h9i0j1k2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("activities", sa.Column("title", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("activities", "title")
