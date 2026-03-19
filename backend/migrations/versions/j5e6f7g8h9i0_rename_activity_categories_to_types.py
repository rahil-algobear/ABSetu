"""Rename activity_categories to activity_types for consistency with entity_types.

- activity_categories → activity_types
- activities.category_id → activities.activity_type_id
- activity_forms.activity_category_id → activity_forms.activity_type_id
- permission keys: activity_category:* → activity_type:*

Revision ID: j5e6f7g8h9i0
Revises: i4d5e6f7g8h9
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "j5e6f7g8h9i0"
down_revision = "i4d5e6f7g8h9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Rename table
    op.rename_table("activity_categories", "activity_types")

    # 2. Rename unique constraint
    op.execute(
        'ALTER TABLE activity_types RENAME CONSTRAINT "uq_activity_category_org_key" TO "uq_activity_type_org_key"'
    )

    # 3. Rename FK columns
    op.alter_column("activity_forms", "activity_category_id", new_column_name="activity_type_id")
    op.alter_column("activities", "category_id", new_column_name="activity_type_id")

    # 4. Update permission keys
    op.execute(
        sa.text("""
            UPDATE permissions
            SET key = REPLACE(key, 'activity_category:', 'activity_type:'),
                description = REPLACE(description, 'activity categories', 'activity types')
            WHERE key LIKE 'activity_category:%'
        """)
    )


def downgrade() -> None:
    # Reverse permission keys
    op.execute(
        sa.text("""
            UPDATE permissions
            SET key = REPLACE(key, 'activity_type:', 'activity_category:'),
                description = REPLACE(description, 'activity types', 'activity categories')
            WHERE key LIKE 'activity_type:%'
        """)
    )

    # Reverse FK column renames
    op.alter_column("activities", "activity_type_id", new_column_name="category_id")
    op.alter_column("activity_forms", "activity_type_id", new_column_name="activity_category_id")

    # Reverse constraint rename
    op.execute(
        'ALTER TABLE activity_types RENAME CONSTRAINT "uq_activity_type_org_key" TO "uq_activity_category_org_key"'
    )

    # Reverse table rename
    op.rename_table("activity_types", "activity_categories")
