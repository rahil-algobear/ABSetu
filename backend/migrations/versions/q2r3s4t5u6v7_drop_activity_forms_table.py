"""Drop activity_forms table

Form configuration is now fully driven by meta_field_schemas
(Form Fields). The separate ActivityForm model and activity_forms
table are no longer needed.

Revision ID: q2r3s4t5u6v7
Revises: p1q2r3s4t5u6
Create Date: 2026-03-24
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "q2r3s4t5u6v7"
down_revision = "p1q2r3s4t5u6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("activity_forms")


def downgrade() -> None:
    import sqlalchemy as sa
    from sqlalchemy.dialects.postgresql import JSONB, UUID

    op.create_table(
        "activity_forms",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "activity_type_id",
            UUID(as_uuid=True),
            sa.ForeignKey("activity_types.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("elements", JSONB, nullable=False, server_default="[]"),
    )
