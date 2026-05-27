"""Promote entity_types.can_enroll from config JSONB to a real column

`can_enroll` is a structural flag (does enrollment exist for this entity
type at all), not org-specific customization. Keeping it in the config
JSONB blob made it unqueryable, easy to default inconsistently, and
invisible in the schema. Moves it to a dedicated boolean column,
backfills from existing config values, and strips the key from config.

Revision ID: v6w7x8y9z0a1
Revises: u5v6w7x8y9z0
Create Date: 2026-05-27
"""

import sqlalchemy as sa
from alembic import op


revision = "v6w7x8y9z0a1"
down_revision = "u5v6w7x8y9z0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "entity_types",
        sa.Column(
            "can_enroll",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    # Backfill from config where the key is present; missing keys keep
    # the True default, matching the runtime default we used before.
    op.execute(
        """
        UPDATE entity_types
        SET can_enroll = (config->>'can_enroll')::boolean
        WHERE config ? 'can_enroll'
        """
    )
    # Strip the key from config so we have one source of truth.
    op.execute(
        """
        UPDATE entity_types
        SET config = config - 'can_enroll'
        WHERE config ? 'can_enroll'
        """
    )


def downgrade() -> None:
    # Stuff the value back into config before dropping the column so
    # downgrade is non-lossy.
    op.execute(
        """
        UPDATE entity_types
        SET config = COALESCE(config, '{}'::jsonb)
            || jsonb_build_object('can_enroll', can_enroll)
        """
    )
    op.drop_column("entity_types", "can_enroll")
