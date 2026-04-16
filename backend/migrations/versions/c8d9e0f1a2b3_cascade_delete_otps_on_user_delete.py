"""cascade delete otps on user delete

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-04-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c8d9e0f1a2b3'
down_revision: Union[str, None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The original otps.user_id FK was created without an ON DELETE action,
    # which blocked user deletion when any OTPs existed for that user.
    # Recreate it with ON DELETE CASCADE.
    op.drop_constraint('otps_user_id_fkey', 'otps', type_='foreignkey')
    op.create_foreign_key(
        'otps_user_id_fkey',
        'otps',
        'users',
        ['user_id'],
        ['id'],
        ondelete='CASCADE',
    )


def downgrade() -> None:
    op.drop_constraint('otps_user_id_fkey', 'otps', type_='foreignkey')
    op.create_foreign_key(
        'otps_user_id_fkey',
        'otps',
        'users',
        ['user_id'],
        ['id'],
    )
