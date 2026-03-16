"""Rename tag_rules to dimension_value_links

Revision ID: d5e6f7g8h9i0
Revises: c3d4e5f6g7h8
Create Date: 2026-03-16
"""
from alembic import op

# revision identifiers
revision = "d5e6f7g8h9i0"
down_revision = "c3d4e5f6g7h8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("tag_rules", "dimension_value_links")
    op.execute(
        "ALTER TABLE dimension_value_links "
        "RENAME CONSTRAINT uq_tag_rule_pair TO uq_dimension_value_link_pair"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE dimension_value_links "
        "RENAME CONSTRAINT uq_dimension_value_link_pair TO uq_tag_rule_pair"
    )
    op.rename_table("dimension_value_links", "tag_rules")
