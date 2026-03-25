"""
Organization routes
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import get_current_user, require_permissions
from app.modules.auth.model import User
from app.modules.organization.model import USER_ENTITY_SENTINEL
from app.modules.organization.schemas import (
    MetaFieldSchemaResponse,
    MetaFieldSchemaUpdate,
    MetaFieldScope,
    OrganizationResponse,
    OrganizationUpdate,
)
from app.modules.organization.service import (
    ListConfigService,
    MetaFieldSchemaService,
    OrganizationService,
)

router = APIRouter(prefix="/organization", tags=["organization"])


# --- Organization ---


@router.get("/", dependencies=[Depends(require_permissions("org:settings"))])
def get_organization(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user's organization."""
    service = OrganizationService(db)
    org = service.get_by_id(current_user.organization_id)
    return OrganizationResponse.dump_from_model(org)


@router.put("/", dependencies=[Depends(require_permissions("org:settings"))])
def update_organization(
    data: OrganizationUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update organization settings."""
    service = OrganizationService(db)
    org = service.update(
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return OrganizationResponse.dump_from_model(org)


# --- Meta Field Schemas ---


def _resolve_scope(scope: MetaFieldScope, org_id, db: Session) -> dict:
    """Validate and resolve a MetaFieldScope into structured column values.

    Returns a dict with keys: scope_type, entity_type_id, activity_type_id,
    dimension_value_id, dimension_id — ready for service layer calls.
    FK validation is handled by the database; we only validate existence
    for better error messages.
    """
    from app.modules.dimension.model import Dimension, DimensionValue
    from app.modules.entity.model import EntityType
    from app.modules.activity.model import ActivityType

    result = {
        "scope_type": scope.type,
        "entity_type_id": None,
        "activity_type_id": None,
        "dimension_value_id": None,
        "dimension_id": None,
    }

    # Validate and resolve entity_type_id
    if scope.entity_type_id:
        if scope.entity_type_id == "user":
            result["entity_type_id"] = uuid.UUID(USER_ENTITY_SENTINEL)
        else:
            et = (
                db.query(EntityType)
                .filter_by(organization_id=org_id, id=scope.entity_type_id)
                .first()
            )
            if not et:
                raise HTTPException(400, f"Entity type not found: {scope.entity_type_id}")
            result["entity_type_id"] = et.id

    # Validate and resolve activity_type_id
    if scope.activity_type_id:
        at = (
            db.query(ActivityType)
            .filter_by(organization_id=org_id, id=scope.activity_type_id)
            .first()
        )
        if not at:
            raise HTTPException(400, f"Activity type not found: {scope.activity_type_id}")
        result["activity_type_id"] = at.id

    # Validate and resolve dimension_id
    if scope.dimension_id:
        dim = db.query(Dimension).filter_by(organization_id=org_id, id=scope.dimension_id).first()
        if not dim:
            raise HTTPException(400, f"Dimension not found: {scope.dimension_id}")
        result["dimension_id"] = dim.id

    # Validate and resolve dimension_value_id
    if scope.dimension_value_id:
        dv = (
            db.query(DimensionValue)
            .filter_by(organization_id=org_id, id=scope.dimension_value_id)
            .first()
        )
        if not dv:
            raise HTTPException(400, f"Dimension value not found: {scope.dimension_value_id}")
        result["dimension_value_id"] = dv.id

    # Validate required fields per scope type
    t = scope.type
    if t == "entity" and not result["entity_type_id"]:
        raise HTTPException(400, "entity_type_id is required for entity scope")
    if t == "dimension" and not result["dimension_id"]:
        raise HTTPException(400, "dimension_id is required for dimension scope")
    if t == "participant" and not result["entity_type_id"]:
        raise HTTPException(400, "entity_type_id is required for participant scope")

    return result


def _schema_to_response(row, fields=None) -> dict:
    """Convert a MetaFieldSchema model to a response dict."""
    et_id = None
    if row.entity_type_id:
        et_id = (
            "user" if str(row.entity_type_id) == USER_ENTITY_SENTINEL else str(row.entity_type_id)
        )
    return MetaFieldSchemaResponse(
        scope=MetaFieldScope(
            type=row.scope_type,
            entity_type_id=et_id,
            activity_type_id=str(row.activity_type_id) if row.activity_type_id else None,
            dimension_id=str(row.dimension_id) if row.dimension_id else None,
            dimension_value_id=str(row.dimension_value_id) if row.dimension_value_id else None,
        ),
        fields=fields if fields is not None else row.fields,
        title_template=row.title_template,
    ).model_dump()


@router.get(
    "/meta-field-schemas",
)
def get_all_meta_field_schemas(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all meta field schemas for the organization."""
    service = MetaFieldSchemaService(db)
    entries = service.get_all_schemas_as_dicts(current_user.organization_id)
    results = []
    for entry in entries:
        resp = _schema_to_response(entry["row"], fields=entry["fields"])
        results.append(resp)
    return results


@router.put(
    "/meta-field-schemas",
    dependencies=[Depends(require_permissions("org:settings"))],
)
def update_meta_field_schema_structured(
    data: MetaFieldSchemaUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update meta field schema using structured scope."""
    resolved = _resolve_scope(data.scope, current_user.organization_id, db)
    service = MetaFieldSchemaService(db)
    fields_dicts = [f.model_dump(exclude_none=True) for f in data.fields]
    row = service.update_schema(
        current_user.organization_id,
        fields=fields_dicts,
        title_template=data.title_template,
        **resolved,
    )
    return _schema_to_response(row)


# --- List Config ---


@router.get("/list-config/settings/{scope:path}")
def get_list_config_settings(
    scope: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get list column config + available (not-yet-added) meta columns."""
    service = ListConfigService(db)
    return service.get_settings(current_user.organization_id, scope)


@router.get("/list-config/{scope:path}")
def get_list_config(
    scope: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get active list columns for a scope."""
    service = ListConfigService(db)
    return service.get_config(current_user.organization_id, scope)


@router.put(
    "/list-config/{scope:path}",
    dependencies=[Depends(require_permissions("org:settings"))],
)
def update_list_config(
    scope: str,
    columns: list[dict],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update list column config for a scope."""
    service = ListConfigService(db)
    return service.update_config(current_user.organization_id, scope, columns)
