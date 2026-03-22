"""merge list_configs and meta_schema_fks

Revision ID: ec280c57a540
Revises: b6569ecc3e3f, n9i0j1k2l3m4
Create Date: 2026-03-22 04:53:59.070029

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ec280c57a540'
down_revision: Union[str, None] = ('b6569ecc3e3f', 'n9i0j1k2l3m4')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
