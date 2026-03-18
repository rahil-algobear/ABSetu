"""Add meta_field_schemas table

Extract meta field schemas from Organization.meta JSONB into a dedicated table.

Revision ID: f1a2b3c4d5e6
Revises: e6f7g8h9i0j1
Create Date: 2026-03-18
"""

import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers
revision = "f1a2b3c4d5e6"
down_revision = "e6f7g8h9i0j1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meta_field_schemas",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("scope_key", sa.String, nullable=False),
        sa.Column("fields", JSONB, nullable=False, server_default="[]"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "organization_id", "scope_key", name="uq_meta_field_schema_org_scope"
        ),
    )

    # Migrate existing data from organizations.meta['meta_field_schemas']
    conn = op.get_bind()
    orgs = conn.execute(
        sa.text("SELECT id, meta FROM organizations WHERE meta IS NOT NULL")
    ).fetchall()

    for org in orgs:
        meta = org.meta or {}
        schemas = meta.get("meta_field_schemas", {})
        for scope_key, fields in schemas.items():
            conn.execute(
                sa.text(
                    "INSERT INTO meta_field_schemas (id, organization_id, scope_key, fields) "
                    "VALUES (gen_random_uuid(), :org_id, :scope_key, :fields::jsonb)"
                ),
                {"org_id": org.id, "scope_key": scope_key, "fields": json.dumps(fields)},
            )

    # Remove meta_field_schemas from organizations.meta
    conn.execute(
        sa.text(
            "UPDATE organizations SET meta = meta - 'meta_field_schemas' "
            "WHERE meta ? 'meta_field_schemas'"
        )
    )


def downgrade() -> None:
    # Move data back into organizations.meta
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT organization_id, scope_key, fields FROM meta_field_schemas")
    ).fetchall()

    org_schemas: dict = {}
    for row in rows:
        org_schemas.setdefault(str(row.organization_id), {})[row.scope_key] = row.fields

    for org_id, schemas in org_schemas.items():
        conn.execute(
            sa.text(
                "UPDATE organizations "
                "SET meta = COALESCE(meta, '{}'::jsonb) || "
                "jsonb_build_object('meta_field_schemas', :schemas::jsonb) "
                "WHERE id = :org_id::uuid"
            ),
            {"org_id": org_id, "schemas": json.dumps(schemas)},
        )

    op.drop_table("meta_field_schemas")
