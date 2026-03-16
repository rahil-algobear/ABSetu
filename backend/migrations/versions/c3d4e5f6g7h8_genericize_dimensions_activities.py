"""Genericize: replace centres/programmes/sessions with dimensions/activities

Revision ID: c3d4e5f6g7h8
Revises: b7c8d9e0f1a2
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers
revision = "c3d4e5f6g7h8"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── New tables ──

    op.create_table(
        "dimensions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("key", sa.String, nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_system", sa.String, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("organization_id", "key", name="uq_dimension_org_key"),
    )

    op.create_table(
        "dimension_values",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("dimension_id", UUID(as_uuid=True), sa.ForeignKey("dimensions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("code", sa.String, nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("dimension_id", "code", name="uq_dimension_value_code"),
    )

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

    op.create_table(
        "activity_types",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "activities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("activity_type_id", UUID(as_uuid=True), sa.ForeignKey("activity_types.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "activity_facilitators",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("activity_id", UUID(as_uuid=True), sa.ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("facilitator_id", UUID(as_uuid=True), sa.ForeignKey("facilitators.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("activity_id", "facilitator_id", name="uq_activity_facilitator"),
    )

    op.create_table(
        "participations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("activity_id", UUID(as_uuid=True), sa.ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("beneficiary_id", UUID(as_uuid=True), sa.ForeignKey("beneficiaries.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("status", sa.String, nullable=False, server_default="present"),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("activity_id", "beneficiary_id", name="uq_activity_beneficiary"),
    )

    op.create_table(
        "activity_tags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("activity_id", UUID(as_uuid=True), sa.ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("dimension_value_id", UUID(as_uuid=True), sa.ForeignKey("dimension_values.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("activity_id", "dimension_value_id", name="uq_activity_tag"),
    )

    op.create_table(
        "beneficiary_tags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("beneficiary_id", UUID(as_uuid=True), sa.ForeignKey("beneficiaries.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("dimension_value_id", UUID(as_uuid=True), sa.ForeignKey("dimension_values.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("beneficiary_id", "dimension_value_id", name="uq_beneficiary_tag"),
    )

    op.create_table(
        "enrollment_tags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("enrollment_id", UUID(as_uuid=True), sa.ForeignKey("enrollments.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("dimension_value_id", UUID(as_uuid=True), sa.ForeignKey("dimension_values.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("enrollment_id", "dimension_value_id", name="uq_enrollment_tag"),
    )

    op.create_table(
        "user_dimension_access",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("dimension_value_id", UUID(as_uuid=True), sa.ForeignKey("dimension_values.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("user_id", "dimension_value_id", name="uq_user_dimension_access"),
    )

    # ── Modify enrollments: drop programme_center_id, add organization_id ──

    op.add_column(
        "enrollments",
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True),
    )
    # Backfill organization_id from beneficiary
    op.execute("""
        UPDATE enrollments e
        SET organization_id = b.organization_id
        FROM beneficiaries b
        WHERE e.beneficiary_id = b.id
    """)
    op.alter_column("enrollments", "organization_id", nullable=False)
    op.drop_column("enrollments", "programme_center_id")

    # ── Drop old tables (order matters for FK dependencies) ──

    op.drop_table("user_session_template_access")
    op.drop_table("user_programme_access")
    op.drop_table("user_center_access")
    op.drop_table("attendances")
    op.drop_table("session_facilitators")
    op.drop_table("sessions")
    op.drop_table("session_templates")
    op.drop_table("programme_centers")
    op.drop_table("programmes")
    op.drop_table("centers")


def downgrade() -> None:
    # Recreate old tables (minimal schema for rollback)
    op.create_table(
        "centers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("code", sa.String, nullable=False),
        sa.Column("address", sa.Text, nullable=True),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table(
        "programmes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table(
        "programme_centers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("programme_id", UUID(as_uuid=True), sa.ForeignKey("programmes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("center_id", UUID(as_uuid=True), sa.ForeignKey("centers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table(
        "session_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table(
        "sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("session_template_id", UUID(as_uuid=True), sa.ForeignKey("session_templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("programme_center_id", UUID(as_uuid=True), sa.ForeignKey("programme_centers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table(
        "session_facilitators",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("facilitator_id", UUID(as_uuid=True), sa.ForeignKey("facilitators.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table(
        "attendances",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("beneficiary_id", UUID(as_uuid=True), sa.ForeignKey("beneficiaries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String, nullable=False, server_default="present"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table(
        "user_center_access",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("center_id", UUID(as_uuid=True), sa.ForeignKey("centers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table(
        "user_programme_access",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("programme_id", UUID(as_uuid=True), sa.ForeignKey("programmes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table(
        "user_session_template_access",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_template_id", UUID(as_uuid=True), sa.ForeignKey("session_templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # Restore enrollments
    op.add_column(
        "enrollments",
        sa.Column("programme_center_id", UUID(as_uuid=True), nullable=True),
    )
    op.drop_column("enrollments", "organization_id")

    # Drop new tables
    op.drop_table("user_dimension_access")
    op.drop_table("enrollment_tags")
    op.drop_table("beneficiary_tags")
    op.drop_table("activity_tags")
    op.drop_table("participations")
    op.drop_table("activity_facilitators")
    op.drop_table("activities")
    op.drop_table("activity_types")
    op.drop_table("tag_rules")
    op.drop_table("dimension_values")
    op.drop_table("dimensions")
