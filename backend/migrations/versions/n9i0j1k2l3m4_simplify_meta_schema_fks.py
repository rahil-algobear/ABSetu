"""Replace scope_key string with structured FK columns on meta_field_schemas.

Adds scope_type, entity_type_id, activity_type_id, dimension_value_id,
dimension_id columns. Migrates existing scope_key data into them, then
drops the scope_key column and old unique constraint.

Revision ID: n9i0j1k2l3m4
Revises: m8h9i0j1k2l3
Create Date: 2026-03-20
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision = "n9i0j1k2l3m4"
down_revision = "m8h9i0j1k2l3"
branch_labels = None
depends_on = None

# Sentinel UUID for "user" entity type in participant scopes
USER_SENTINEL = "00000000-0000-0000-0000-000000000000"


def upgrade() -> None:
    # 1. Add new columns (nullable initially)
    op.add_column("meta_field_schemas", sa.Column("scope_type", sa.String(), nullable=True))
    op.add_column(
        "meta_field_schemas",
        sa.Column(
            "entity_type_id",
            UUID(as_uuid=True),
            sa.ForeignKey("entity_types.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.add_column(
        "meta_field_schemas",
        sa.Column(
            "activity_type_id",
            UUID(as_uuid=True),
            sa.ForeignKey("activity_types.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.add_column(
        "meta_field_schemas",
        sa.Column(
            "dimension_value_id",
            UUID(as_uuid=True),
            sa.ForeignKey("dimension_values.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.add_column(
        "meta_field_schemas",
        sa.Column(
            "dimension_id",
            UUID(as_uuid=True),
            sa.ForeignKey("dimensions.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )

    # 2. Migrate scope_key data into structured columns
    conn = op.get_bind()

    rows = conn.execute(
        sa.text("SELECT id, scope_key FROM meta_field_schemas")
    ).fetchall()

    for row in rows:
        scope_key = row.scope_key
        parts = scope_key.split(":")

        scope_type = None
        entity_type_id = None
        activity_type_id = None
        dimension_value_id = None
        dimension_id = None

        # Static scope types
        if scope_key in ("enrollment", "activity", "participation", "beneficiary", "facilitator"):
            scope_type = scope_key

        # entity:{entity_type_id}
        elif len(parts) == 2 and parts[0] == "entity":
            scope_type = "entity"
            entity_type_id = parts[1]

        # dimension:{dimension_id}
        elif len(parts) == 2 and parts[0] == "dimension":
            scope_type = "dimension"
            dimension_id = parts[1]

        # activity:activity_type:{id} or activity:dimension_value:{id}
        elif parts[0] == "activity":
            scope_type = "activity"
            # Parse pairs after "activity"
            i = 1
            while i < len(parts) - 1:
                if parts[i] == "activity_type":
                    activity_type_id = parts[i + 1]
                elif parts[i] == "dimension_value":
                    dimension_value_id = parts[i + 1]
                i += 2

        # participant:entity:{entity_type_id|"user"}[:activity_type:{id}][:dimension_value:{id}]
        elif parts[0] == "participant" and len(parts) >= 3 and parts[1] == "entity":
            scope_type = "participant"
            if parts[2] == "user":
                entity_type_id = USER_SENTINEL
            else:
                entity_type_id = parts[2]
            i = 3
            while i < len(parts) - 1:
                if parts[i] == "activity_type":
                    activity_type_id = parts[i + 1]
                elif parts[i] == "dimension_value":
                    dimension_value_id = parts[i + 1]
                i += 2

        else:
            # Fallback: use scope_key as scope_type (shouldn't happen with valid data)
            scope_type = scope_key

        conn.execute(
            sa.text(
                "UPDATE meta_field_schemas SET "
                "scope_type = :scope_type, "
                "entity_type_id = CAST(:entity_type_id AS uuid), "
                "activity_type_id = CAST(:activity_type_id AS uuid), "
                "dimension_value_id = CAST(:dimension_value_id AS uuid), "
                "dimension_id = CAST(:dimension_id AS uuid) "
                "WHERE id = :id"
            ),
            {
                "id": row.id,
                "scope_type": scope_type,
                "entity_type_id": entity_type_id,
                "activity_type_id": activity_type_id,
                "dimension_value_id": dimension_value_id,
                "dimension_id": dimension_id,
            },
        )

    # 3. Make scope_type non-nullable now that data is migrated
    op.alter_column("meta_field_schemas", "scope_type", nullable=False)

    # 4. Drop old unique constraint and scope_key column
    op.drop_constraint("uq_meta_field_schema_org_scope", "meta_field_schemas", type_="unique")
    op.drop_column("meta_field_schemas", "scope_key")

    # 5. Create new unique index using COALESCE for nullable FK columns
    op.execute(
        """
        CREATE UNIQUE INDEX uq_meta_field_schema_scope ON meta_field_schemas (
            organization_id,
            scope_type,
            COALESCE(entity_type_id, '00000000-0000-0000-0000-000000000000'),
            COALESCE(activity_type_id, '00000000-0000-0000-0000-000000000000'),
            COALESCE(dimension_value_id, '00000000-0000-0000-0000-000000000000'),
            COALESCE(dimension_id, '00000000-0000-0000-0000-000000000000')
        )
        """
    )


def downgrade() -> None:
    # 1. Re-add scope_key column
    op.add_column("meta_field_schemas", sa.Column("scope_key", sa.String(), nullable=True))

    # 2. Rebuild scope_key from structured columns
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, scope_type, entity_type_id, activity_type_id, "
            "dimension_value_id, dimension_id FROM meta_field_schemas"
        )
    ).fetchall()

    for row in rows:
        scope_key = row.scope_type

        if row.scope_type == "entity" and row.entity_type_id:
            scope_key = f"entity:{row.entity_type_id}"
        elif row.scope_type == "dimension" and row.dimension_id:
            scope_key = f"dimension:{row.dimension_id}"
        elif row.scope_type == "activity":
            scope_key = "activity"
            if row.activity_type_id:
                scope_key += f":activity_type:{row.activity_type_id}"
            if row.dimension_value_id:
                scope_key += f":dimension_value:{row.dimension_value_id}"
        elif row.scope_type == "participant" and row.entity_type_id:
            et_str = "user" if str(row.entity_type_id) == USER_SENTINEL else str(row.entity_type_id)
            scope_key = f"participant:entity:{et_str}"
            if row.activity_type_id:
                scope_key += f":activity_type:{row.activity_type_id}"
            if row.dimension_value_id:
                scope_key += f":dimension_value:{row.dimension_value_id}"

        conn.execute(
            sa.text("UPDATE meta_field_schemas SET scope_key = :sk WHERE id = :id"),
            {"sk": scope_key, "id": row.id},
        )

    op.alter_column("meta_field_schemas", "scope_key", nullable=False)

    # 3. Drop new index, add old unique constraint
    op.execute("DROP INDEX IF EXISTS uq_meta_field_schema_scope")
    op.create_unique_constraint(
        "uq_meta_field_schema_org_scope", "meta_field_schemas", ["organization_id", "scope_key"]
    )

    # 4. Drop new columns
    op.drop_column("meta_field_schemas", "dimension_id")
    op.drop_column("meta_field_schemas", "dimension_value_id")
    op.drop_column("meta_field_schemas", "activity_type_id")
    op.drop_column("meta_field_schemas", "entity_type_id")
    op.drop_column("meta_field_schemas", "scope_type")
