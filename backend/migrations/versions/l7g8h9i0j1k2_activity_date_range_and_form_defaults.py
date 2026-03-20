"""Rename activities.date to start_date, add end_date, add stage to form elements

Revision ID: l7g8h9i0j1k2
Revises: k6f7g8h9i0j1
Create Date: 2026-03-20
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "l7g8h9i0j1k2"
down_revision = "k6f7g8h9i0j1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename date -> start_date
    op.alter_column("activities", "date", new_column_name="start_date")

    # Add end_date column
    op.add_column("activities", sa.Column("end_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("activities", "end_date")
    op.alter_column("activities", "start_date", new_column_name="date")
