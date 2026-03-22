"""
Shared dimension access scoping helpers.

Used by entity, activity, and dashboard services to restrict query results
based on the current user's allowed dimension values.
"""

import uuid

from sqlalchemy import exists, or_
from sqlalchemy.orm import Query, Session

from app.modules.dimension.model import DimensionValue


def group_dvs_by_dimension(
    db: Session,
    accessible_dv_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[uuid.UUID]]:
    """
    Group accessible dimension value IDs by their parent dimension.

    Returns: {dimension_id: [dimension_value_id, ...]}
    """
    rows = (
        db.query(DimensionValue.id, DimensionValue.dimension_id)
        .filter(DimensionValue.id.in_(accessible_dv_ids))
        .all()
    )
    result: dict[uuid.UUID, list[uuid.UUID]] = {}
    for dv_id, dim_id in rows:
        result.setdefault(dim_id, []).append(dv_id)
    return result


def apply_dimension_access_scoping(
    query: Query,
    db: Session,
    restricted_dims: dict[uuid.UUID, list[uuid.UUID]],
    assoc_fk,
    assoc_dv,
    parent_pk,
    *,
    include_untagged: bool = False,
) -> Query:
    """
    Apply per-dimension user-access scoping to a query.

    For each restricted dimension, filters the query so that only records
    with at least one allowed dimension value are included.

    Args:
        query: SQLAlchemy query to scope
        db: Database session (needed for subquery when include_untagged=True)
        restricted_dims: {dimension_id: [allowed_dv_ids]} from group_dvs_by_dimension()
        assoc_fk: Association table FK to parent (e.g. EntityDimension.entity_id)
        assoc_dv: Association table dimension_value column (e.g. EntityDimension.dimension_value_id)
        parent_pk: Parent model PK (e.g. Entity.id)
        include_untagged: If True, also include records that have NO dimension values
            for a given dimension (OR logic — used for entities).
            If False, records must have an allowed value (AND logic — used for activities).
    """
    for dim_id, allowed_ids in restricted_dims.items():
        has_allowed = exists().where(assoc_fk == parent_pk).where(assoc_dv.in_(allowed_ids))

        if include_untagged:
            dim_values_subq = (
                db.query(DimensionValue.id).filter(DimensionValue.dimension_id == dim_id).subquery()
            )
            has_no_values_for_dim = (
                ~exists().where(assoc_fk == parent_pk).where(assoc_dv.in_(dim_values_subq))
            )
            query = query.filter(or_(has_no_values_for_dim, has_allowed))
        else:
            query = query.filter(has_allowed)

    return query
