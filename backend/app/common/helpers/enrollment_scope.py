"""
Helpers for "is this enrollment in scope for this activity?" checks.

The smart participant picker (listing query, atomic Add endpoint, and
the picker's enroll/create endpoints) all need the same notion of
"scope match": an enrollment is in scope for an activity iff it carries
values for every dimension the activity has on axes the enrollment
form-builder tracks.

Activities can carry extra dimensions (Project, Intervention,
Sub-Intervention) that the enrollment doesn't track; those are ignored
in the scope check. This file is the single source of truth for that
rule — please use these helpers rather than re-deriving the logic
inline.
"""

import uuid

from sqlalchemy.orm import Session


def get_enrollment_relevant_dim_ids(
    db: Session, org_id: uuid.UUID, entity_type_id: uuid.UUID | None
) -> set[uuid.UUID]:
    """Dimension IDs the org's enrollment form-builder uses for the
    given entity type.

    Considers base-scoped and entity-type-scoped enrollment fields only —
    dimension-value scoped fields would circularly bias the check (they
    only apply to enrollments that already match those values, so
    including them would let those specific enrollments self-qualify).
    """
    from app.modules.organization.service import MetaFieldSchemaService

    meta_service = MetaFieldSchemaService(db)
    relevant: set[uuid.UUID] = set()

    def _harvest(fields: list[dict]) -> None:
        for fd in fields:
            if fd.get("type") == "dimension" and fd.get("dimension_id"):
                relevant.add(uuid.UUID(fd["dimension_id"]))

    _harvest(meta_service.get_schema_by_scope(org_id, "enrollment"))
    if entity_type_id:
        _harvest(
            meta_service.get_schema_by_scope(org_id, "enrollment", entity_type_id=entity_type_id)
        )
    return relevant


def scope_activity_dvs(
    db: Session,
    activity_dv_ids: set[uuid.UUID],
    relevant_dim_ids: set[uuid.UUID],
) -> set[uuid.UUID]:
    """Filter the activity's dimension values to those on dimensions
    the enrollment form-builder tracks."""
    from app.modules.dimension.model import DimensionValue

    if not activity_dv_ids or not relevant_dim_ids:
        return set()
    rows = (
        db.query(DimensionValue.id, DimensionValue.dimension_id)
        .filter(DimensionValue.id.in_(activity_dv_ids))
        .all()
    )
    return {dv_id for dv_id, dim_id in rows if dim_id in relevant_dim_ids}


def enrollment_in_activity_scope(
    db: Session,
    org_id: uuid.UUID,
    entity_type_id: uuid.UUID | None,
    enrollment_dv_ids: set[uuid.UUID],
    activity_dv_ids: set[uuid.UUID],
) -> bool:
    """True iff `enrollment_dv_ids` cover the enrollment-tracked subset
    of `activity_dv_ids`. Wrapper around the two helpers above for the
    common single-enrollment case."""
    relevant_dim_ids = get_enrollment_relevant_dim_ids(db, org_id, entity_type_id)
    if not relevant_dim_ids:
        return False
    scoped = scope_activity_dvs(db, activity_dv_ids, relevant_dim_ids)
    return scoped.issubset(enrollment_dv_ids)
