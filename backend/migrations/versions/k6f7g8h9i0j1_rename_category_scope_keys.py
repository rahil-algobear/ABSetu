"""Rename :category: to :activity_type: in meta_field_schemas scope_key values.

Revision ID: k6f7g8h9i0j1
Revises: j5e6f7g8h9i0
Create Date: 2026-03-19
"""
from alembic import op

# revision identifiers
revision = "k6f7g8h9i0j1"
down_revision = "j5e6f7g8h9i0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE meta_field_schemas
        SET scope_key = REPLACE(scope_key, ':category:', ':activity_type:')
        WHERE scope_key LIKE '%:category:%'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE meta_field_schemas
        SET scope_key = REPLACE(scope_key, ':activity_type:', ':category:')
        WHERE scope_key LIKE '%:activity_type:%'
        """
    )
