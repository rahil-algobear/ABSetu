"""Rename case_number to code with dedicated column and add code_counters table

- Add `code` column to entities (dedicated column, not in meta JSONB)
- Create `code_counters` table for atomic serial generation
- Remove `case_number_format` from organizations
- Drop old case_number JSONB functional index

Revision ID: r2s3t4u5v6w7
Revises: p1q2r3s4t5u6
Create Date: 2026-03-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "r2s3t4u5v6w7"
down_revision = "q2r3s4t5u6v7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create code_counters table
    op.create_table(
        "code_counters",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("year", sa.String(2), nullable=False),
        sa.Column("last_serial", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("organization_id", "year", name="uq_code_counter_org_year"),
    )

    # 2. Add code column to entities
    op.add_column("entities", sa.Column("code", sa.String(), nullable=True))

    # 3. Backfill code from meta->>'case_number'
    op.execute(
        "UPDATE entities SET code = meta->>'case_number' "
        "WHERE meta->>'case_number' IS NOT NULL"
    )

    # 4. Strip case_number from meta JSONB
    op.execute("UPDATE entities SET meta = meta - 'case_number' WHERE meta ? 'case_number'")

    # 5. Drop old JSONB functional index
    op.drop_index("uq_entity_case_number", table_name="entities")

    # 6. Create new partial unique index on code
    op.execute(
        "CREATE UNIQUE INDEX uq_entity_code ON entities (organization_id, code) "
        "WHERE code IS NOT NULL"
    )

    # 7. Drop case_number_format from organizations
    op.drop_column("organizations", "case_number_format")


def downgrade() -> None:
    # Re-add case_number_format
    op.add_column(
        "organizations",
        sa.Column("case_number_format", sa.String(), nullable=False, server_default="{ORG_CODE}-{SERIAL}"),
    )

    # Drop new index, re-create old one
    op.drop_index("uq_entity_code", table_name="entities")
    op.execute(
        "CREATE UNIQUE INDEX uq_entity_case_number ON entities "
        "(organization_id, (meta->>'case_number')) "
        "WHERE meta->>'case_number' IS NOT NULL"
    )

    # Move code back to meta
    op.execute(
        "UPDATE entities SET meta = COALESCE(meta, '{}')::jsonb || "
        "jsonb_build_object('case_number', code) WHERE code IS NOT NULL"
    )

    # Drop code column and code_counters table
    op.drop_column("entities", "code")
    op.drop_table("code_counters")
