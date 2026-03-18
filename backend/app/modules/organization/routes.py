"""
Organization routes
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import get_current_user, require_permissions
from app.modules.auth.model import User
from app.modules.organization.schemas import (
    OrganizationResponse,
    OrganizationUpdate,
)
from app.modules.organization.service import (
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

# Static entity types that always exist
STATIC_ENTITY_TYPES = {
    "activity_type",
    "facilitator",
    "beneficiary",
    "enrollment",
    "activity",
    "participation",
}


def _validate_entity_type(entity_type: str, org_id, db: Session) -> None:
    """Validate entity type — allow static types, dimension:{key}, entity:{key}, activity:{key}, and participant:{key} types."""
    if entity_type in STATIC_ENTITY_TYPES:
        return
    if entity_type.startswith("dimension:"):
        from app.modules.dimension.model import Dimension

        dim_key = entity_type.split(":", 1)[1]
        dim = db.query(Dimension).filter_by(organization_id=org_id, key=dim_key).first()
        if dim:
            return
    
    if entity_type.startswith("entity:"):
        from app.modules.entity.model import EntityType

        et_key = entity_type.split(":", 1)[1]
        et = db.query(EntityType).filter_by(organization_id=org_id, key=et_key).first()
        if et:
            return

    if entity_type.startswith("activity:") or entity_type.startswith("participant:"):
        from app.modules.activity.model import ActivityCategory

        cat_key = entity_type.split(":", 1)[1]
        cat = db.query(ActivityCategory).filter_by(organization_id=org_id, key=cat_key).first()
        if cat:
            return

    from fastapi import HTTPException

    raise HTTPException(status_code=400, detail=f"Invalid entity type: {entity_type}")


@router.get(
    "/meta-field-schemas/{entity_type}",
    dependencies=[Depends(require_permissions("org:settings"))],
)
def get_meta_field_schema(
    entity_type: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get meta field schema for an entity type."""
    _validate_entity_type(entity_type, current_user.organization_id, db)
    service = MetaFieldSchemaService(db)
    return service.get_schema(current_user.organization_id, entity_type)


@router.get(
    "/meta-field-schemas",
    dependencies=[Depends(require_permissions("org:settings"))],
)
def get_all_meta_field_schemas(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all meta field schemas for the organization."""
    service = MetaFieldSchemaService(db)
    return service.get_all_schemas(current_user.organization_id)


@router.put(
    "/meta-field-schemas/{entity_type}",
    dependencies=[Depends(require_permissions("org:settings"))],
)
def update_meta_field_schema(
    entity_type: str,
    fields: list[dict],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update meta field schema for an entity type."""
    _validate_entity_type(entity_type, current_user.organization_id, db)
    service = MetaFieldSchemaService(db)
    return service.update_schema(current_user.organization_id, entity_type, fields)
