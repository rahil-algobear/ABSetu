"""Remove ActivityType entity — interventions become regular dimension values.

- Add category_id FK on activities (direct reference to activity_categories)
- Migrate activity_type.category_id → activity.category_id
- Create activity tags for the intervention dimension value matching each activity's type
- Convert activity_type system dimension to a regular dimension
- Update form builder elements: type="activity_type" → type="dimension" with ref_id
- Drop activity_type_id FK from activities
- Drop activity_types table

Revision ID: h3c4d5e6f7g8
Revises: g2b3c4d5e6f7
Create Date: 2026-03-18
"""

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision = "h3c4d5e6f7g8"
down_revision = "g2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add category_id to activities
    op.add_column(
        "activities",
        sa.Column(
            "category_id",
            UUID(as_uuid=True),
            sa.ForeignKey("activity_categories.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )

    # Get a connection for data migration
    conn = op.get_bind()

    # 2. Migrate category_id from activity_type to activity
    conn.execute(
        sa.text("""
            UPDATE activities a
            SET category_id = at.category_id
            FROM activity_types at
            WHERE a.activity_type_id = at.id
        """)
    )

    # 3. Find the system activity_type dimension and convert to regular
    sys_dim_row = conn.execute(
        sa.text("SELECT id FROM dimensions WHERE is_system = 'activity_type' LIMIT 1")
    ).fetchone()

    if sys_dim_row:
        sys_dim_id = sys_dim_row[0]

        # 4. Create activity tags for existing activities' intervention dimension values
        # For each activity, find the matching dimension value (by activity_type name)
        # and create a tag if one doesn't already exist
        conn.execute(
            sa.text("""
                INSERT INTO activity_tags (id, activity_id, dimension_value_id)
                SELECT gen_random_uuid(), a.id, dv.id
                FROM activities a
                JOIN activity_types at ON a.activity_type_id = at.id
                JOIN dimension_values dv ON dv.dimension_id = :dim_id AND dv.name = at.name
                WHERE NOT EXISTS (
                    SELECT 1 FROM activity_tags tag
                    WHERE tag.activity_id = a.id AND tag.dimension_value_id = dv.id
                )
            """),
            {"dim_id": sys_dim_id},
        )

        # 5. Convert system dimension to regular
        conn.execute(
            sa.text("UPDATE dimensions SET is_system = NULL WHERE id = :dim_id"),
            {"dim_id": sys_dim_id},
        )

        # 6. Update form builder elements: type="activity_type" → type="dimension"
        # with ref_id pointing to the intervention dimension
        forms = conn.execute(
            sa.text("SELECT id, elements FROM activity_forms")
        ).fetchall()

        for form_row in forms:
            form_id, elements = form_row
            if not elements:
                continue
            updated = False
            for el in elements:
                if el.get("type") == "activity_type":
                    el["type"] = "dimension"
                    el["ref_id"] = str(sys_dim_id)
                    updated = True
            if updated:
                import json
                conn.execute(
                    sa.text("UPDATE activity_forms SET elements = :elements WHERE id = :id"),
                    {"elements": json.dumps(elements), "id": form_id},
                )

    # 7. Rename dimension key from activity_type to intervention
    conn.execute(
        sa.text("""
            UPDATE dimensions SET key = 'intervention'
            WHERE key = 'activity_type'
        """)
    )

    # 8. Remove activity_type permissions (now covered by dimension permissions
    # and a new activity_category permission pair)
    conn.execute(
        sa.text("""
            DELETE FROM role_permissions
            WHERE permission_id IN (
                SELECT id FROM permissions
                WHERE key IN ('activity_type:view', 'activity_type:manage')
            )
        """)
    )
    conn.execute(
        sa.text("""
            DELETE FROM permissions
            WHERE key IN ('activity_type:view', 'activity_type:manage')
        """)
    )

    # 9. Add activity_category permissions
    conn.execute(
        sa.text("""
            INSERT INTO permissions (id, key, description, created_at, updated_at)
            VALUES
                (gen_random_uuid(), 'activity_category:view',
                 'View activity categories and form builder config',
                 now(), now()),
                (gen_random_uuid(), 'activity_category:manage',
                 'Create/edit/delete activity categories and form builder config',
                 now(), now())
            ON CONFLICT (key) DO NOTHING
        """)
    )

    # 10. Grant activity_category permissions to all roles that had activity_type permissions
    # (Since we already deleted those, grant to all roles that have dimension:view)
    conn.execute(
        sa.text("""
            INSERT INTO role_permissions (id, role_id, permission_id, created_at, updated_at)
            SELECT gen_random_uuid(), rp.role_id, p.id, now(), now()
            FROM role_permissions rp
            JOIN permissions dp ON rp.permission_id = dp.id AND dp.key = 'dimension:view'
            CROSS JOIN permissions p
            WHERE p.key = 'activity_category:view'
            AND NOT EXISTS (
                SELECT 1 FROM role_permissions rp2
                WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p.id
            )
        """)
    )
    conn.execute(
        sa.text("""
            INSERT INTO role_permissions (id, role_id, permission_id, created_at, updated_at)
            SELECT gen_random_uuid(), rp.role_id, p.id, now(), now()
            FROM role_permissions rp
            JOIN permissions dp ON rp.permission_id = dp.id AND dp.key = 'dimension:manage'
            CROSS JOIN permissions p
            WHERE p.key = 'activity_category:manage'
            AND NOT EXISTS (
                SELECT 1 FROM role_permissions rp2
                WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p.id
            )
        """)
    )

    # 11. Drop is_system column from dimensions (no longer used)
    op.drop_column("dimensions", "is_system")

    # 12. Drop activity_type_id FK and column from activities
    op.drop_constraint(
        "activities_activity_type_id_fkey", "activities", type_="foreignkey"
    )
    op.drop_index("ix_activities_activity_type_id", table_name="activities")
    op.drop_column("activities", "activity_type_id")

    # 8. Drop activity_types table
    op.drop_table("activity_types")


def downgrade() -> None:
    # Re-add is_system column to dimensions
    op.add_column(
        "dimensions",
        sa.Column("is_system", sa.String, nullable=True),
    )

    # Recreate activity_types table
    op.create_table(
        "activity_types",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "category_id",
            UUID(as_uuid=True),
            sa.ForeignKey("activity_categories.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("meta", JSONB, nullable=True),
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
    )

    # Re-add activity_type_id to activities
    op.add_column(
        "activities",
        sa.Column(
            "activity_type_id",
            UUID(as_uuid=True),
            sa.ForeignKey("activity_types.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_activities_activity_type_id", "activities", ["activity_type_id"])

    # Drop category_id from activities
    op.drop_column("activities", "category_id")
