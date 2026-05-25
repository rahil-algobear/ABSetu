"""add created_by to entity

Revision ID: 1eabbaaeee05
Revises: s3t4u5v6w7x8
Create Date: 2026-05-25 15:55:08.991067

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "1eabbaaeee05"
down_revision: Union[str, None] = "s3t4u5v6w7x8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("entities", sa.Column("created_by", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_entities_created_by_users",
        "entities",
        "users",
        ["created_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_entities_created_by_users", "entities", type_="foreignkey")
    op.drop_column("entities", "created_by")
