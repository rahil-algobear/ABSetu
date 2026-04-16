"""Cascade delete OTPs when a user is deleted

The `otps.user_id` FK was created without an `ondelete` clause in the
initial schema migration, which defaults to NO ACTION. That blocks user
deletion whenever any OTP rows still reference the user. OTPs are
ephemeral auth artefacts and should be removed alongside the user.

Revision ID: s3t4u5v6w7x8
Revises: r2s3t4u5v6w7
Create Date: 2026-04-16
"""

from alembic import op


revision = "s3t4u5v6w7x8"
down_revision = "r2s3t4u5v6w7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("otps_user_id_fkey", "otps", type_="foreignkey")
    op.create_foreign_key(
        "otps_user_id_fkey",
        "otps",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("otps_user_id_fkey", "otps", type_="foreignkey")
    op.create_foreign_key(
        "otps_user_id_fkey",
        "otps",
        "users",
        ["user_id"],
        ["id"],
    )
