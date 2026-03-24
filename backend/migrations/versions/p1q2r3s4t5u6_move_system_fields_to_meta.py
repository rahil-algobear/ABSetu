"""Move system fields from dedicated columns into meta JSONB

For Activity: title, start_date, end_date, notes → meta
For Entity: name, case_number → meta
For Enrollment: admission_date, release_date → meta

Also adds expression indexes for commonly sorted/filtered meta fields.

Revision ID: p1q2r3s4t5u6
Revises: o0j1k2l3m4n5
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "p1q2r3s4t5u6"
down_revision = "o0j1k2l3m4n5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Activity: merge columns into meta, then drop ---
    op.execute("""
        UPDATE activities
        SET meta = COALESCE(meta, '{}'::jsonb)
            || jsonb_build_object(
                'title', title,
                'start_date', to_char(start_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS+00:00'),
                'end_date', CASE WHEN end_date IS NOT NULL
                    THEN to_char(end_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS+00:00')
                    ELSE NULL END,
                'notes', notes
            )
            -- Remove null-valued keys so meta stays clean
            - ARRAY(SELECT key FROM jsonb_each(
                jsonb_build_object(
                    'title', title,
                    'start_date', to_char(start_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS+00:00'),
                    'end_date', CASE WHEN end_date IS NOT NULL
                        THEN to_char(end_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS+00:00')
                        ELSE NULL END,
                    'notes', notes
                )
            ) WHERE value = 'null'::jsonb)
    """)
    op.drop_column("activities", "title")
    op.drop_column("activities", "start_date")
    op.drop_column("activities", "end_date")
    op.drop_column("activities", "notes")

    # Expression index for activity start_date sorting/filtering
    op.create_index(
        "ix_activity_meta_start_date",
        "activities",
        [sa.text("organization_id"), sa.text("(meta->>'start_date') DESC")],
    )

    # --- Entity: merge columns into meta, then drop ---
    op.execute("""
        UPDATE entities
        SET meta = COALESCE(meta, '{}'::jsonb)
            || jsonb_strip_nulls(jsonb_build_object(
                'name', name,
                'case_number', case_number
            ))
    """)

    # Drop the old unique constraint first
    op.drop_constraint("uq_entity_case_number", "entities", type_="unique")
    op.drop_column("entities", "name")
    op.drop_column("entities", "case_number")

    # Functional unique index for case_number in meta
    op.create_index(
        "uq_entity_case_number",
        "entities",
        [sa.text("organization_id"), sa.text("(meta->>'case_number')")],
        unique=True,
        postgresql_where=sa.text("meta->>'case_number' IS NOT NULL"),
    )

    # Expression index for entity name search/sort
    op.create_index(
        "ix_entity_meta_name",
        "entities",
        [sa.text("organization_id"), sa.text("(meta->>'name')")],
    )

    # --- Enrollment: merge columns into meta, then drop ---
    op.execute("""
        UPDATE enrollments
        SET meta = COALESCE(meta, '{}'::jsonb)
            || jsonb_strip_nulls(jsonb_build_object(
                'admission_date', admission_date::text,
                'release_date', release_date::text
            ))
    """)
    op.drop_column("enrollments", "admission_date")
    op.drop_column("enrollments", "release_date")


def downgrade() -> None:
    # --- Enrollment: restore columns from meta ---
    op.add_column("enrollments", sa.Column("admission_date", sa.Date(), nullable=True))
    op.add_column("enrollments", sa.Column("release_date", sa.Date(), nullable=True))
    op.execute("""
        UPDATE enrollments
        SET admission_date = (meta->>'admission_date')::date,
            release_date = (meta->>'release_date')::date
    """)
    op.alter_column("enrollments", "admission_date", nullable=False)

    # --- Entity: restore columns from meta ---
    op.drop_index("ix_entity_meta_name", "entities")
    op.drop_index("uq_entity_case_number", "entities")
    op.add_column("entities", sa.Column("name", sa.String(), nullable=True))
    op.add_column("entities", sa.Column("case_number", sa.String(), nullable=True))
    op.execute("""
        UPDATE entities
        SET name = meta->>'name',
            case_number = meta->>'case_number'
    """)
    op.alter_column("entities", "name", nullable=False)
    op.create_unique_constraint("uq_entity_case_number", "entities", ["organization_id", "case_number"])

    # --- Activity: restore columns from meta ---
    op.drop_index("ix_activity_meta_start_date", "activities")
    op.add_column("activities", sa.Column("title", sa.Text(), nullable=True))
    op.add_column("activities", sa.Column("start_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("activities", sa.Column("end_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("activities", sa.Column("notes", sa.Text(), nullable=True))
    op.execute("""
        UPDATE activities
        SET title = meta->>'title',
            start_date = (meta->>'start_date')::timestamptz,
            end_date = (meta->>'end_date')::timestamptz,
            notes = meta->>'notes'
    """)
    op.alter_column("activities", "start_date", nullable=False)
