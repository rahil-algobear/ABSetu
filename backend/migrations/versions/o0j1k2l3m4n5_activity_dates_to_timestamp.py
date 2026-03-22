"""Convert activity start_date/end_date from date to timestamptz

Revision ID: o0j1k2l3m4n5
Revises: ec280c57a540
Create Date: 2026-03-22
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "o0j1k2l3m4n5"
down_revision = "ec280c57a540"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Convert date columns to timestamptz, preserving existing values at midnight UTC
    op.alter_column(
        "activities",
        "start_date",
        type_=sa.DateTime(timezone=True),
        postgresql_using="start_date::timestamptz",
    )
    op.alter_column(
        "activities",
        "end_date",
        type_=sa.DateTime(timezone=True),
        postgresql_using="end_date::timestamptz",
    )


def downgrade() -> None:
    op.alter_column(
        "activities",
        "start_date",
        type_=sa.Date(),
        postgresql_using="start_date::date",
    )
    op.alter_column(
        "activities",
        "end_date",
        type_=sa.Date(),
        postgresql_using="end_date::date",
    )
