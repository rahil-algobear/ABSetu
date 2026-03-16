"""V2: Entity/EntityType, ActivityCategory, ActivityParticipant

Replace beneficiaries/facilitators with generic entities.
Replace participations/activity_facilitators with activity_participants.
Add activity_categories for form builder config.

Revision ID: e6f7g8h9i0j1
Revises: d5e6f7g8h9i0
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers
revision = "e6f7g8h9i0j1"
down_revision = "d5e6f7g8h9i0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Create entity_types table ──

    op.create_table(
        "entity_types",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("key", sa.String, nullable=False),
        sa.Column("config", JSONB, nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("organization_id", "key", name="uq_entity_type_org_key"),
    )

    # ── 2. Create entities table ──

    op.create_table(
        "entities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("entity_type_id", UUID(as_uuid=True), sa.ForeignKey("entity_types.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("case_number", sa.String, nullable=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("organization_id", "case_number", name="uq_entity_case_number"),
    )

    # ── 3. Create entity_tags table ──

    op.create_table(
        "entity_tags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("dimension_value_id", UUID(as_uuid=True), sa.ForeignKey("dimension_values.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("entity_id", "dimension_value_id", name="uq_entity_tag"),
    )

    # ── 4. Create activity_categories table ──

    op.create_table(
        "activity_categories",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("key", sa.String, nullable=False),
        sa.Column("sections", JSONB, nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("organization_id", "key", name="uq_activity_category_org_key"),
    )

    # ── 5. Add category_id to activity_types ──

    op.add_column(
        "activity_types",
        sa.Column("category_id", UUID(as_uuid=True), sa.ForeignKey("activity_categories.id", ondelete="SET NULL"), nullable=True, index=True),
    )

    # ── 6. Create activity_participants table ──

    op.create_table(
        "activity_participants",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("activity_id", UUID(as_uuid=True), sa.ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("participant_type", sa.String, nullable=False),
        sa.Column("participant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("section_key", sa.String, nullable=False),
        sa.Column("status", sa.String, nullable=True),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("activity_id", "participant_type", "participant_id", "section_key", name="uq_activity_participant"),
    )

    # ── 7. Data migration: beneficiaries → entities ──

    # Create "beneficiary" entity type for each org that has beneficiaries
    op.execute("""
        INSERT INTO entity_types (id, organization_id, name, key, config, sort_order, created_at, updated_at)
        SELECT gen_random_uuid(), organization_id, 'Beneficiary', 'beneficiary',
               '{"case_number_enabled": true, "can_enroll": true}'::jsonb, 0, now(), now()
        FROM (SELECT DISTINCT organization_id FROM beneficiaries) orgs
    """)

    # Migrate beneficiary records to entities
    op.execute("""
        INSERT INTO entities (id, organization_id, entity_type_id, case_number, name, meta, created_at, updated_at)
        SELECT b.id, b.organization_id, et.id, b.case_number, b.name, b.meta, b.created_at, b.updated_at
        FROM beneficiaries b
        JOIN entity_types et ON et.organization_id = b.organization_id AND et.key = 'beneficiary'
    """)

    # Migrate beneficiary_tags to entity_tags
    op.execute("""
        INSERT INTO entity_tags (id, entity_id, dimension_value_id, created_at, updated_at)
        SELECT id, beneficiary_id, dimension_value_id, created_at, updated_at
        FROM beneficiary_tags
    """)

    # ── 8. Data migration: facilitators → entities ──

    # Create "facilitator" entity type for each org that has facilitators
    op.execute("""
        INSERT INTO entity_types (id, organization_id, name, key, config, sort_order, created_at, updated_at)
        SELECT gen_random_uuid(), organization_id, 'Facilitator', 'facilitator',
               '{"case_number_enabled": false, "can_enroll": false}'::jsonb, 1, now(), now()
        FROM (SELECT DISTINCT organization_id FROM facilitators) orgs
        WHERE NOT EXISTS (
            SELECT 1 FROM entity_types et2
            WHERE et2.organization_id = orgs.organization_id AND et2.key = 'facilitator'
        )
    """)

    # Migrate facilitator records to entities (keep same IDs for FK references)
    op.execute("""
        INSERT INTO entities (id, organization_id, entity_type_id, name, meta, created_at, updated_at)
        SELECT f.id, f.organization_id, et.id, f.name, f.meta, f.created_at, f.updated_at
        FROM facilitators f
        JOIN entity_types et ON et.organization_id = f.organization_id AND et.key = 'facilitator'
    """)

    # ── 9. Migrate enrollments: beneficiary_id → entity_id ──

    op.add_column(
        "enrollments",
        sa.Column("entity_id", UUID(as_uuid=True), nullable=True, index=True),
    )
    op.execute("UPDATE enrollments SET entity_id = beneficiary_id")
    op.alter_column("enrollments", "entity_id", nullable=False)
    op.create_foreign_key(
        "fk_enrollments_entity_id",
        "enrollments",
        "entities",
        ["entity_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint("enrollments_beneficiary_id_fkey", "enrollments", type_="foreignkey")
    op.drop_index("ix_enrollments_beneficiary_id", table_name="enrollments")
    op.drop_column("enrollments", "beneficiary_id")

    # ── 10. Migrate participations → activity_participants ──

    op.execute("""
        INSERT INTO activity_participants (id, activity_id, participant_type, participant_id, section_key, status, meta, created_at, updated_at)
        SELECT id, activity_id, 'entity', beneficiary_id, 'default', status, meta, created_at, updated_at
        FROM participations
    """)

    # Migrate activity_facilitators → activity_participants
    op.execute("""
        INSERT INTO activity_participants (id, activity_id, participant_type, participant_id, section_key, status, created_at, updated_at)
        SELECT id, activity_id, 'entity', facilitator_id, 'facilitators', NULL, created_at, updated_at
        FROM activity_facilitators
    """)

    # ── 11. Drop old tables ──

    op.drop_table("participations")
    op.drop_table("activity_facilitators")
    op.drop_table("beneficiary_tags")
    op.drop_table("facilitators")
    op.drop_table("beneficiaries")


def downgrade() -> None:
    # ── Recreate old tables ──

    op.create_table(
        "beneficiaries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("case_number", sa.String, nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("organization_id", "case_number", name="uq_beneficiary_case_number"),
    )
    op.create_index("ix_beneficiaries_organization_id", "beneficiaries", ["organization_id"])

    op.create_table(
        "facilitators",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("contact", sa.String, nullable=True),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_facilitators_organization_id", "facilitators", ["organization_id"])

    op.create_table(
        "beneficiary_tags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("beneficiary_id", UUID(as_uuid=True), sa.ForeignKey("beneficiaries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dimension_value_id", UUID(as_uuid=True), sa.ForeignKey("dimension_values.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("beneficiary_id", "dimension_value_id", name="uq_beneficiary_tag"),
    )

    op.create_table(
        "activity_facilitators",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("activity_id", UUID(as_uuid=True), sa.ForeignKey("activities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("facilitator_id", UUID(as_uuid=True), sa.ForeignKey("facilitators.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("activity_id", "facilitator_id", name="uq_activity_facilitator"),
    )

    op.create_table(
        "participations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("activity_id", UUID(as_uuid=True), sa.ForeignKey("activities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("beneficiary_id", UUID(as_uuid=True), sa.ForeignKey("beneficiaries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String, nullable=False, server_default="present"),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("activity_id", "beneficiary_id", name="uq_activity_beneficiary"),
    )

    # Restore beneficiary_id on enrollments
    op.add_column(
        "enrollments",
        sa.Column("beneficiary_id", UUID(as_uuid=True), nullable=True),
    )
    op.execute("UPDATE enrollments SET beneficiary_id = entity_id")
    op.create_foreign_key(
        "enrollments_beneficiary_id_fkey",
        "enrollments",
        "beneficiaries",
        ["beneficiary_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_enrollments_beneficiary_id", "enrollments", ["beneficiary_id"])
    op.drop_constraint("fk_enrollments_entity_id", "enrollments", type_="foreignkey")
    op.drop_index("ix_enrollments_entity_id", table_name="enrollments")
    op.drop_column("enrollments", "entity_id")

    # Drop new tables
    op.drop_table("activity_participants")
    op.drop_column("activity_types", "category_id")
    op.drop_table("activity_categories")
    op.drop_table("entity_tags")
    op.drop_table("entities")
    op.drop_table("entity_types")
