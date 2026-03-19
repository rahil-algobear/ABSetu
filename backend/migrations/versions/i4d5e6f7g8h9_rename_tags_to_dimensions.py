"""Rename *_tags tables to *_dimensions, user_dimension_access to user_dimensions.

Aligns table names with the dimension concept — these are dimension mappings, not tags.

- activity_tags → activity_dimensions
- entity_tags → entity_dimensions
- enrollment_tags → enrollment_dimensions
- user_dimension_access → user_dimensions

Revision ID: i4d5e6f7g8h9
Revises: h3c4d5e6f7g8
Create Date: 2026-03-19
"""
from alembic import op

# revision identifiers
revision = "i4d5e6f7g8h9"
down_revision = "h3c4d5e6f7g8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename tables
    op.rename_table("activity_tags", "activity_dimensions")
    op.rename_table("entity_tags", "entity_dimensions")
    op.rename_table("enrollment_tags", "enrollment_dimensions")
    op.rename_table("user_dimension_access", "user_dimensions")

    # Rename unique constraints
    op.execute(
        'ALTER TABLE activity_dimensions RENAME CONSTRAINT "uq_activity_tag" TO "uq_activity_dimension"'
    )
    op.execute(
        'ALTER TABLE entity_dimensions RENAME CONSTRAINT "uq_entity_tag" TO "uq_entity_dimension"'
    )
    op.execute(
        'ALTER TABLE enrollment_dimensions RENAME CONSTRAINT "uq_enrollment_tag" TO "uq_enrollment_dimension"'
    )
    op.execute(
        'ALTER TABLE user_dimensions RENAME CONSTRAINT "uq_user_dimension_access" TO "uq_user_dimension"'
    )


def downgrade() -> None:
    # Rename constraints back
    op.execute(
        'ALTER TABLE activity_dimensions RENAME CONSTRAINT "uq_activity_dimension" TO "uq_activity_tag"'
    )
    op.execute(
        'ALTER TABLE entity_dimensions RENAME CONSTRAINT "uq_entity_dimension" TO "uq_entity_tag"'
    )
    op.execute(
        'ALTER TABLE enrollment_dimensions RENAME CONSTRAINT "uq_enrollment_dimension" TO "uq_enrollment_tag"'
    )
    op.execute(
        'ALTER TABLE user_dimensions RENAME CONSTRAINT "uq_user_dimension" TO "uq_user_dimension_access"'
    )

    # Rename tables back
    op.rename_table("activity_dimensions", "activity_tags")
    op.rename_table("entity_dimensions", "entity_tags")
    op.rename_table("enrollment_dimensions", "enrollment_tags")
    op.rename_table("user_dimensions", "user_dimension_access")
