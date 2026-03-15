"""replace user_center_assignments with access tables

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-03-15 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old table
    op.drop_table('user_center_assignments')

    # Create user_center_access
    op.create_table(
        'user_center_access',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('center_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['center_id'], ['centers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'center_id', name='uq_user_center_access'),
    )
    op.create_index('ix_user_center_access_user_id', 'user_center_access', ['user_id'])
    op.create_index('ix_user_center_access_center_id', 'user_center_access', ['center_id'])

    # Create user_programme_access
    op.create_table(
        'user_programme_access',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('programme_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['programme_id'], ['programmes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'programme_id', name='uq_user_programme_access'),
    )
    op.create_index('ix_user_programme_access_user_id', 'user_programme_access', ['user_id'])
    op.create_index('ix_user_programme_access_programme_id', 'user_programme_access', ['programme_id'])

    # Create user_session_template_access
    op.create_table(
        'user_session_template_access',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('session_template_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['session_template_id'], ['session_templates.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'session_template_id', name='uq_user_session_template_access'),
    )
    op.create_index('ix_user_session_template_access_user_id', 'user_session_template_access', ['user_id'])
    op.create_index('ix_user_session_template_access_session_template_id', 'user_session_template_access', ['session_template_id'])


def downgrade() -> None:
    op.drop_table('user_session_template_access')
    op.drop_table('user_programme_access')
    op.drop_table('user_center_access')

    # Recreate old table
    op.create_table(
        'user_center_assignments',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('programme_center_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['programme_center_id'], ['programme_centers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_user_center_assignments_user_id', 'user_center_assignments', ['user_id'])
    op.create_index('ix_user_center_assignments_programme_center_id', 'user_center_assignments', ['programme_center_id'])
