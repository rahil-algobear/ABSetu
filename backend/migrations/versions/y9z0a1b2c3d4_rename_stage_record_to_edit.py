"""Rename meta-field stage value 'record' to 'edit'

The Pydantic Literal type for FieldDefinition.stage previously accepted
"create", "record", "both". The admin UI labelled "record" as "Edit only",
which produced a persistent naming mismatch. Renaming the stored value to
"edit" so the codebase uses one term end-to-end.

Walks the JSONB `fields` array on every meta_field_schemas row and replaces
`stage: "record"` with `stage: "edit"` per element.

Revision ID: y9z0a1b2c3d4
Revises: x8y9z0a1b2c3
Create Date: 2026-05-28
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "y9z0a1b2c3d4"
down_revision = "x8y9z0a1b2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE meta_field_schemas
        SET fields = (
            SELECT jsonb_agg(
                CASE
                    WHEN field->>'stage' = 'record'
                    THEN jsonb_set(field, '{stage}', '"edit"'::jsonb)
                    ELSE field
                END
            )
            FROM jsonb_array_elements(fields) AS field
        )
        WHERE fields @> '[{"stage": "record"}]'::jsonb;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE meta_field_schemas
        SET fields = (
            SELECT jsonb_agg(
                CASE
                    WHEN field->>'stage' = 'edit'
                    THEN jsonb_set(field, '{stage}', '"record"'::jsonb)
                    ELSE field
                END
            )
            FROM jsonb_array_elements(fields) AS field
        )
        WHERE fields @> '[{"stage": "edit"}]'::jsonb;
        """
    )
