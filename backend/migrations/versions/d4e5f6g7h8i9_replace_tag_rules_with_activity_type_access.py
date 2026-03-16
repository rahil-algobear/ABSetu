"""Replace tag_rules with activity_type_access

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision = "d4e5f6g7h8i9"
down_revision = "c3d4e5f6g7h8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create activity_type_access table
    op.create_table(
        "activity_type_access",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("activity_type_id", UUID(as_uuid=True), sa.ForeignKey("activity_types.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("dimension_value_id", UUID(as_uuid=True), sa.ForeignKey("dimension_values.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("activity_type_id", "dimension_value_id", name="uq_activity_type_access"),
    )

    # 2. Migrate data: for each tag rule where one side is an activity_type
    #    dimension value, create an activity_type_access row mapping the
    #    activity type to the other dimension value.
    op.execute("""
        INSERT INTO activity_type_access (activity_type_id, dimension_value_id)
        SELECT DISTINCT at.id, tr.dimension_value_id_2
        FROM tag_rules tr
        JOIN dimension_values dv1 ON tr.dimension_value_id_1 = dv1.id
        JOIN dimensions d1 ON dv1.dimension_id = d1.id AND d1.is_system = 'activity_type'
        JOIN activity_types at ON at.name = dv1.name AND at.organization_id = tr.organization_id
        JOIN dimension_values dv2 ON tr.dimension_value_id_2 = dv2.id
        JOIN dimensions d2 ON dv2.dimension_id = d2.id AND d2.is_system IS NULL
        ON CONFLICT DO NOTHING
    """)
    op.execute("""
        INSERT INTO activity_type_access (activity_type_id, dimension_value_id)
        SELECT DISTINCT at.id, tr.dimension_value_id_1
        FROM tag_rules tr
        JOIN dimension_values dv2 ON tr.dimension_value_id_2 = dv2.id
        JOIN dimensions d2 ON dv2.dimension_id = d2.id AND d2.is_system = 'activity_type'
        JOIN activity_types at ON at.name = dv2.name AND at.organization_id = tr.organization_id
        JOIN dimension_values dv1 ON tr.dimension_value_id_1 = dv1.id
        JOIN dimensions d1 ON dv1.dimension_id = d1.id AND d1.is_system IS NULL
        ON CONFLICT DO NOTHING
    """)

    # 3. Drop tag_rules table
    op.drop_table("tag_rules")

    # 4. Clean up: remove system activity_type dimension and its values
    op.execute("""
        DELETE FROM dimension_values
        WHERE dimension_id IN (
            SELECT id FROM dimensions WHERE is_system = 'activity_type'
        )
    """)
    op.execute("""
        DELETE FROM dimensions WHERE is_system = 'activity_type'
    """)


def downgrade() -> None:
    # Recreate tag_rules table
    op.create_table(
        "tag_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("dimension_value_id_1", UUID(as_uuid=True), sa.ForeignKey("dimension_values.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("dimension_value_id_2", UUID(as_uuid=True), sa.ForeignKey("dimension_values.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("dimension_value_id_1", "dimension_value_id_2", name="uq_tag_rule_pair"),
    )

    # Drop activity_type_access
    op.drop_table("activity_type_access")
