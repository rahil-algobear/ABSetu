"""
Reusable filter/sort definition builders for list endpoints.
Each function returns a list of dicts ready for the frontend or config for the backend.
"""

import uuid
from typing import Any, TypedDict

from sqlalchemy import Numeric, func, select
from sqlalchemy.orm import Session


class MetaFieldScope(TypedDict, total=False):
    scope_type: str
    entity_type_id: uuid.UUID | None
    activity_type_id: uuid.UUID | None
    dimension_value_id: uuid.UUID | None
    dimension_id: uuid.UUID | None


def build_dimension_filters(
    db: Session,
    org_id: uuid.UUID,
    accessible_dv_ids: list[uuid.UUID] | None = None,
    allowed_keys: set[str] | None = None,
) -> list[dict]:
    """
    Build dimension filter definitions for an org, scoped by user access.

    If allowed_keys is provided, only include dimensions whose key (dim:{id})
    is in the set (i.e. marked filterable in list config).
    """
    from app.modules.dimension.model import Dimension, DimensionValue

    dims = (
        db.query(Dimension).filter_by(organization_id=org_id).order_by(Dimension.sort_order).all()
    )

    # Build per-dimension access sets if user has restrictions
    restricted_dims: dict[uuid.UUID, set[uuid.UUID]] = {}
    if accessible_dv_ids:
        dv_dim_rows = (
            db.query(DimensionValue.id, DimensionValue.dimension_id)
            .filter(DimensionValue.id.in_(accessible_dv_ids))
            .all()
        )
        for dv_id, dim_id in dv_dim_rows:
            restricted_dims.setdefault(dim_id, set()).add(dv_id)

    result = []
    for dim in dims:
        dim_key = f"dim:{dim.id}"
        if allowed_keys is not None and dim_key not in allowed_keys:
            continue

        values = (
            db.query(DimensionValue)
            .filter_by(dimension_id=dim.id)
            .order_by(DimensionValue.sort_order, DimensionValue.name)
            .all()
        )

        # Scope values: if user has restrictions for this dimension, filter
        if dim.id in restricted_dims:
            allowed = restricted_dims[dim.id]
            values = [v for v in values if v.id in allowed]

        if values:
            result.append(
                {
                    "key": dim_key,
                    "label": dim.name,
                    "type": "select",
                    "options": [{"value": str(v.id), "label": v.name} for v in values],
                }
            )

    return result


def _collect_fields(
    db: Session,
    org_id: uuid.UUID,
    scopes: list[MetaFieldScope],
) -> list[tuple[str, dict]]:
    """Collect meta field definitions from multiple scopes, deduplicating by key."""
    from app.modules.organization.service import MetaFieldSchemaService

    meta_service = MetaFieldSchemaService(db)
    seen_keys: set[str] = set()
    result: list[tuple[str, dict]] = []

    for scope in scopes:
        fields = meta_service.get_schema_by_scope(
            org_id,
            scope_type=scope["scope_type"],
            entity_type_id=scope.get("entity_type_id"),
            activity_type_id=scope.get("activity_type_id"),
            dimension_value_id=scope.get("dimension_value_id"),
            dimension_id=scope.get("dimension_id"),
        )
        for field in fields:
            meta_key = f"meta:{field['key']}"
            if meta_key not in seen_keys:
                seen_keys.add(meta_key)
                result.append((meta_key, field))

    return result


def build_meta_field_filters(
    db: Session,
    org_id: uuid.UUID,
    scopes: list[MetaFieldScope],
    allowed_keys: set[str] | None = None,
) -> list[dict]:
    """
    Build meta field filter definitions for given scopes.

    If allowed_keys is provided, only include meta fields whose key (meta:{key})
    is in the set (i.e. marked filterable in list config).
    """
    result = []
    for meta_key, field in _collect_fields(db, org_id, scopes):
        if allowed_keys is not None and meta_key not in allowed_keys:
            continue

        ftype = field.get("type", "text")
        filter_def: dict = {
            "key": meta_key,
            "label": field.get("label", field["key"]),
        }
        if ftype in ("select", "multiselect") and field.get("options"):
            filter_def["type"] = "select"
            filter_def["options"] = [{"value": o, "label": o} for o in field["options"]]
        elif ftype == "number":
            filter_def["type"] = "range"
        elif ftype == "date":
            filter_def["type"] = "date_range"
        elif ftype == "datetime":
            filter_def["type"] = "datetime_range"
        elif ftype == "boolean":
            filter_def["type"] = "boolean"
        else:
            filter_def["type"] = "text"
        result.append(filter_def)

    return result


def build_meta_field_filter_config(
    db: Session,
    org_id: uuid.UUID,
    scopes: list[MetaFieldScope],
    meta_column: Any,
    allowed_keys: set[str] | None = None,
) -> dict[str, dict]:
    """
    Build apply_filters-compatible config for meta fields.

    If allowed_keys provided, only include those meta field keys.
    """
    config: dict[str, dict] = {}

    for meta_key, field in _collect_fields(db, org_id, scopes):
        if allowed_keys is not None and meta_key not in allowed_keys:
            continue

        ftype = field.get("type", "text")
        if ftype in ("select", "multiselect"):
            config[meta_key] = {
                "type": "meta_select",
                "meta_key": field["key"],
                "meta_column": meta_column,
            }
        elif ftype == "number":
            config[meta_key] = {
                "type": "meta_range",
                "meta_key": field["key"],
                "meta_column": meta_column,
            }
        elif ftype == "boolean":
            config[meta_key] = {
                "type": "boolean",
                "meta_key": field["key"],
                "meta_column": meta_column,
            }
        elif ftype in ("date", "datetime"):
            config[meta_key] = {
                "type": "meta_date_range",
                "meta_key": field["key"],
                "meta_column": meta_column,
            }
        else:
            config[meta_key] = {
                "type": "meta_select",
                "meta_key": field["key"],
                "meta_column": meta_column,
            }

    return config


def build_meta_field_sort_config(
    db: Session,
    org_id: uuid.UUID,
    scopes: list[MetaFieldScope],
    meta_column: Any,
    allowed_keys: set[str] | None = None,
) -> dict[str, Any]:
    """
    Build sort config entries for sortable meta fields.

    If allowed_keys provided, only include those meta field keys.
    """
    config: dict[str, Any] = {}

    for meta_key, field in _collect_fields(db, org_id, scopes):
        if allowed_keys is not None and meta_key not in allowed_keys:
            continue

        ftype = field.get("type", "text")
        if ftype == "number":
            config[meta_key] = meta_column[field["key"]].astext.cast(Numeric)
        else:
            config[meta_key] = meta_column[field["key"]].astext

    return config


def build_meta_field_search_columns(
    db: Session,
    org_id: uuid.UUID,
    scopes: list[MetaFieldScope],
    meta_column: Any,
    allowed_keys: set[str] | None = None,
) -> list[Any]:
    """
    Build a list of SQLAlchemy column expressions for searchable meta fields.

    Returns columns suitable for passing to apply_search().
    If allowed_keys provided, only include those meta field keys.
    """
    columns: list[Any] = []
    for meta_key, field in _collect_fields(db, org_id, scopes):
        if allowed_keys is not None and meta_key not in allowed_keys:
            continue
        columns.append(meta_column[field["key"]].astext)
    return columns


def build_dimension_search_columns(
    db: Session,
    org_id: uuid.UUID,
    assoc_model: Any,
    parent_pk: Any,
    allowed_keys: set[str] | None = None,
) -> list[Any]:
    """
    Build searchable column expressions for dimensions.

    Creates a scalar subquery that aggregates dimension value names
    for each parent record, suitable for passing to apply_search().

    Args:
        assoc_model: The association model (EntityDimension or ActivityDimension)
        parent_pk: The parent model's primary key column (Entity.id or Activity.id)
        allowed_keys: If provided, only include dimensions with dim:{id} in this set
    """
    from app.modules.dimension.model import Dimension, DimensionValue

    dims = db.query(Dimension).filter_by(organization_id=org_id).all()
    columns: list[Any] = []
    for dim in dims:
        dim_key = f"dim:{dim.id}"
        if allowed_keys is not None and dim_key not in allowed_keys:
            continue
        # Scalar subquery: get the dimension value name for this dimension on each record
        fk_col = (
            assoc_model.entity_id if hasattr(assoc_model, "entity_id") else assoc_model.activity_id
        )
        subq = (
            select(DimensionValue.name)
            .join(assoc_model, assoc_model.dimension_value_id == DimensionValue.id)
            .where(fk_col == parent_pk, DimensionValue.dimension_id == dim.id)
            .correlate_except(assoc_model, DimensionValue)
            .scalar_subquery()
        )
        columns.append(func.coalesce(subq, ""))
    return columns


def build_dimension_filter_config(
    db: Session,
    org_id: uuid.UUID,
    assoc_fk: Any,
    assoc_dv: Any,
    parent_pk: Any,
) -> dict[str, dict]:
    """
    Build apply_filters-compatible dimension config from org's dimensions.

    Shared by EntityService and ActivityService — only the association
    model columns differ between callers.
    """
    from app.modules.dimension.model import Dimension

    dims = db.query(Dimension).filter_by(organization_id=org_id).all()
    config: dict[str, dict] = {}
    for dim in dims:
        config[f"dim:{dim.id}"] = {
            "type": "dimension",
            "assoc_fk": assoc_fk,
            "assoc_dv": assoc_dv,
            "parent_pk": parent_pk,
        }
    return config


# Enrollment field-type → filter-type mapping for the entity list.
# Mirrors the entity meta mapping (number/date/select/etc.) but skips
# text/entity_list/user_list/dimension-typed meta — text is exact-match
# only (not useful here) and the picker types need proper UI we don't
# have yet. Dimensions live in enrollment_dimensions, not meta.
_ENROLLMENT_META_FRONTEND_TYPE_MAP = {
    "select": "select",
    "multiselect": "select",
    "number": "range",
    "date": "date_range",
    "datetime": "datetime_range",
    "boolean": "boolean",
}
_ENROLLMENT_META_BACKEND_TYPE_MAP = {
    "select": "enrollment_meta_select",
    "multiselect": "enrollment_meta_select",
    "number": "enrollment_meta_range",
    "date": "enrollment_meta_date_range",
    "datetime": "enrollment_meta_date_range",
    "boolean": "enrollment_meta_boolean",
}


def _enrollment_meta_scopes(entity_type_ids: list[uuid.UUID]) -> list[MetaFieldScope]:
    """Scopes to pull enrollment meta fields from: base + each entity type."""
    scopes: list[MetaFieldScope] = [{"scope_type": "enrollment"}]
    for et_id in entity_type_ids:
        scopes.append({"scope_type": "enrollment", "entity_type_id": et_id})
    return scopes


def _collect_enrollment_effective_fields(
    db: Session,
    org_id: uuid.UUID,
    enrollable_entity_type_ids: list[uuid.UUID],
) -> list[dict]:
    """Enrollment fields (meta + dimension-typed) in declared sort_order.

    Mirrors the enrollment form: pulls fields from the base scope plus the
    enrollable entity types, dedupes (meta by key, dimension by dimension_id),
    and sorts by sort_order so filter order matches form order.

    Dimensions only surface here when the org admin declared them as
    enrollment fields — org-wide dimensions that aren't on enrollments
    are intentionally excluded.
    """
    if not enrollable_entity_type_ids:
        return []

    seen_meta_keys: set[str] = set()
    seen_dim_ids: set[uuid.UUID] = set()
    fields: list[dict] = []

    for _key, field in _collect_fields(
        db, org_id, _enrollment_meta_scopes(enrollable_entity_type_ids)
    ):
        ftype = field.get("type", "text")
        if ftype == "dimension":
            dim_id_raw = field.get("dimension_id")
            if not dim_id_raw:
                continue
            try:
                dim_id = dim_id_raw if isinstance(dim_id_raw, uuid.UUID) else uuid.UUID(dim_id_raw)
            except (ValueError, TypeError):
                continue
            if dim_id in seen_dim_ids:
                continue
            seen_dim_ids.add(dim_id)
            fields.append({**field, "_resolved_dimension_id": dim_id})
        else:
            if field["key"] in seen_meta_keys:
                continue
            seen_meta_keys.add(field["key"])
            fields.append(field)

    fields.sort(key=lambda f: f.get("sort_order", 0))
    return fields


def build_enrollment_filter_definitions(
    db: Session,
    org_id: uuid.UUID,
    enrollable_entity_type_ids: list[uuid.UUID],
    accessible_dv_ids: list[uuid.UUID] | None = None,
) -> list[dict]:
    """Build /filters response entries for enrollment meta + dimensions.

    Surfaced on the entity listing for entity types with can_enroll=True.
    Fields are emitted in the enrollment form's declared sort_order — meta
    and dimension entries interleaved — and tagged with section="Enrollment"
    so the frontend can group them. Only dimensions explicitly declared as
    enrollment fields are included.
    """
    from app.modules.dimension.model import Dimension, DimensionValue

    effective = _collect_enrollment_effective_fields(db, org_id, enrollable_entity_type_ids)
    if not effective:
        return []

    # Dimension lookup + access scoping prep (only used when we hit a
    # dimension field below, but cheaper to build once).
    dim_ids_in_play = {
        f["_resolved_dimension_id"] for f in effective if f.get("type") == "dimension"
    }
    dim_by_id: dict[uuid.UUID, Dimension] = {}
    values_by_dim: dict[uuid.UUID, list[DimensionValue]] = {}
    if dim_ids_in_play:
        for d in db.query(Dimension).filter(Dimension.id.in_(dim_ids_in_play)).all():
            dim_by_id[d.id] = d
        for v in (
            db.query(DimensionValue)
            .filter(DimensionValue.dimension_id.in_(dim_ids_in_play))
            .order_by(DimensionValue.sort_order, DimensionValue.name)
            .all()
        ):
            values_by_dim.setdefault(v.dimension_id, []).append(v)

    restricted_dims: dict[uuid.UUID, set[uuid.UUID]] = {}
    if accessible_dv_ids:
        dv_dim_rows = (
            db.query(DimensionValue.id, DimensionValue.dimension_id)
            .filter(DimensionValue.id.in_(accessible_dv_ids))
            .all()
        )
        for dv_id, dim_id in dv_dim_rows:
            restricted_dims.setdefault(dim_id, set()).add(dv_id)

    result: list[dict] = []
    for field in effective:
        ftype = field.get("type", "text")
        label = field.get("label", field.get("key", ""))

        if ftype == "dimension":
            dim_id = field["_resolved_dimension_id"]
            if dim_id not in dim_by_id:
                continue
            values = values_by_dim.get(dim_id, [])
            if dim_id in restricted_dims:
                allowed = restricted_dims[dim_id]
                values = [v for v in values if v.id in allowed]
            if not values:
                continue
            result.append(
                {
                    "key": f"enrollment_dim:{dim_id}",
                    "label": label,
                    "section": "Enrollment",
                    "type": "select",
                    "options": [{"value": str(v.id), "label": v.name} for v in values],
                }
            )
            continue

        ui_type = _ENROLLMENT_META_FRONTEND_TYPE_MAP.get(ftype)
        if not ui_type:
            continue
        entry: dict = {
            "key": f"enrollment_meta:{field['key']}",
            "label": label,
            "section": "Enrollment",
            "type": ui_type,
        }
        if ui_type == "select" and field.get("options"):
            entry["options"] = [{"value": o, "label": o} for o in field["options"]]
        result.append(entry)

    return result


def build_enrollment_filter_config(
    db: Session,
    org_id: uuid.UUID,
    enrollable_entity_type_ids: list[uuid.UUID],
    parent_pk: Any,
) -> dict[str, dict]:
    """Build apply_filters-compatible config for enrollment meta + dimensions.

    Mirrors the field set in build_enrollment_filter_definitions — only
    dimensions explicitly declared as enrollment fields get a config entry,
    so requests referencing other dimensions are silently dropped at parse
    time. The matching SQL (a single EXISTS subquery against active
    enrollments) is built in apply_filters once all enrollment filters
    have been collected.
    """
    effective = _collect_enrollment_effective_fields(db, org_id, enrollable_entity_type_ids)
    if not effective:
        return {}

    config: dict[str, dict] = {}
    for field in effective:
        ftype = field.get("type", "text")
        if ftype == "dimension":
            dim_id = field["_resolved_dimension_id"]
            config[f"enrollment_dim:{dim_id}"] = {
                "type": "enrollment_dimension",
                "dimension_id": dim_id,
                "parent_pk": parent_pk,
            }
            continue
        backend_type = _ENROLLMENT_META_BACKEND_TYPE_MAP.get(ftype)
        if not backend_type:
            continue
        config[f"enrollment_meta:{field['key']}"] = {
            "type": backend_type,
            "meta_key": field["key"],
            "parent_pk": parent_pk,
        }

    return config


def build_list_filter_response(
    db: Session,
    org_id: uuid.UUID,
    accessible_dv_ids: list[uuid.UUID] | None,
    *,
    type_filter: dict | None = None,
    type_id: str | None = None,
    scope_prefix: str,
    meta_scopes: list[MetaFieldScope],
    date_filters: list[dict],
    default_sortable_keys: list[str],
    extra_filters: list[dict] | None = None,
) -> dict:
    """
    Build the complete /filters endpoint response.

    Shared by entity and activity /filters routes. Handles:
    - Type filter (entity_type or activity_type dropdown)
    - List config loading (columns, filterable/sortable keys)
    - Dimension filters (scoped by user access + list config)
    - Meta field filters (scoped by list config)
    - Date filters (scoped by list config)
    - Column ordering by list config sort_order

    Args:
        type_filter: Optional pre-built type filter dict
            e.g. {"key": "entity_type_id", "label": "Entity Type", "options": [...]}
        type_id: Selected type ID for list config scoping (None = all types)
        scope_prefix: "entity" or "activity" — used for list config scope key
        meta_scopes: Scopes for meta field schema lookup
        date_filters: Static date filter definitions
            e.g. [{"key": "created_at", "label": "Created Date"}]
        default_sortable_keys: Default sortable keys when no list config exists
    """
    from app.modules.organization.service import ListConfigService

    filters: list[dict] = []
    if type_filter:
        filters.append(type_filter)

    # Load list config for the selected type
    columns: list[dict] = []
    filterable_keys: set[str] | None = None
    sortable_keys = list(default_sortable_keys)

    if type_id:
        scope = f"{scope_prefix}:{type_id}"
        columns = ListConfigService(db).get_config(org_id, scope)
        filterable_keys = {c["key"] for c in columns if c.get("filterable")}
        sortable_keys = [c["key"] for c in columns if c.get("sortable")]

    # Build field-level filters
    field_filters: list[dict] = []

    # Dimension filters (scoped by user access + list config)
    field_filters.extend(build_dimension_filters(db, org_id, accessible_dv_ids, filterable_keys))

    # Meta field filters (scoped by list config)
    field_filters.extend(build_meta_field_filters(db, org_id, meta_scopes, filterable_keys))

    # Date filters (only if list config allows or no config)
    for df in date_filters:
        if filterable_keys is None or df["key"] in filterable_keys:
            field_filters.append(
                {
                    "key": df["key"],
                    "label": df["label"],
                    "type": df.get("type", "date_range"),
                }
            )

    # Extra pre-built filters (e.g. user dropdowns), gated by list config
    for ef in extra_filters or []:
        if filterable_keys is None or ef["key"] in filterable_keys:
            field_filters.append(ef)

    # Sort field filters to match list config column order
    if columns:
        order_map = {c["key"]: c.get("sort_order", 0) for c in columns}
        field_filters.sort(key=lambda f: order_map.get(f["key"], 9999))

    filters.extend(field_filters)

    # Visible columns sorted by sort_order
    visible_columns = sorted(
        [c for c in columns if c.get("visible")],
        key=lambda c: c.get("sort_order", 0),
    )

    return {
        "filters": filters,
        "sortable_keys": sortable_keys,
        "columns": visible_columns,
    }
