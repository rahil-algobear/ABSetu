"""add list_configs table

Revision ID: b6569ecc3e3f
Revises: m8h9i0j1k2l3
Create Date: 2026-03-20 21:00:58.172877

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b6569ecc3e3f'
down_revision: Union[str, None] = 'm8h9i0j1k2l3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('list_configs',
    sa.Column('organization_id', sa.UUID(), nullable=False),
    sa.Column('scope', sa.String(), nullable=False),
    sa.Column('columns', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('organization_id', 'scope', name='uq_list_config_org_scope')
    )
    op.create_index(op.f('ix_list_configs_organization_id'), 'list_configs', ['organization_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_list_configs_organization_id'), table_name='list_configs')
    op.drop_table('list_configs')
