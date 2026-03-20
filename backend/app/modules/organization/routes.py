"""
Organization routes
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import get_current_user, require_permissions
from app.modules.auth.model import User
from app.modules.organization.schemas import (
    MetaFieldSchemaUpdate,
    MetaFieldScope,
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
    "facilitator",
    "beneficiary",
    "enrollment",
    "activity",
    "participation",
}


def _validate_entity_type(entity_type: str, org_id, db: Session) -> None:
    """Validate entity type scope key for meta field schemas.

    Supported patterns:
      - Static: enrollment, activity, participation, beneficiary, facilitator
      - dimension:{dim_id}
      - entity:{entity_type_id}
      - activity:activity_type:{activity_type_id}
      - activity:dimension_value:{dv_id}
      - activity:activity_type:{activity_type_id}:dimension_value:{dv_id}
      - participant:entity:{entity_type_id|"user"}
      - participant:entity:{entity_type_id|"user"}:activity_type:{activity_type_id}
      - participant:entity:{entity_type_id|"user"}:dimension_value:{dv_id}
      - participant:entity:{...}:activity_type:{activity_type_id}:dimension_value:{dv_id}
    """
    if entity_type in STATIC_ENTITY_TYPES:
        return

    parts = entity_type.split(":")

    if len(parts) == 2:
        prefix, ref_id = parts

        if prefix == "dimension":
            from app.modules.dimension.model import Dimension

            if db.query(Dimension).filter_by(organization_id=org_id, id=ref_id).first():
                return

        if prefix == "entity":
            from app.modules.entity.model import EntityType

            if db.query(EntityType).filter_by(organization_id=org_id, id=ref_id).first():
                return

    if len(parts) == 3:
        prefix, sub, ref_id = parts

        if prefix == "activity":
            if sub == "activity_type":
                from app.modules.activity.model import ActivityType

                if db.query(ActivityType).filter_by(organization_id=org_id, id=ref_id).first():
                    return
            elif sub == "dimension_value":
                from app.modules.dimension.model import DimensionValue

                if db.query(DimensionValue).filter_by(organization_id=org_id, id=ref_id).first():
                    return

        # participant:entity:{entity_type_id} — scoped to entity type, all activity types
        if prefix == "participant" and sub == "entity":
            from app.modules.entity.model import EntityType

            if ref_id == "user":
                return
            if db.query(EntityType).filter_by(organization_id=org_id, id=ref_id).first():
                return

    # 5-part keys:
    # activity:activity_type:{activity_type_id}:dimension_value:{dv_id}
    # participant:entity:{...}:activity_type:{id}
    # participant:entity:{...}:dimension_value:{dv_id}
    if len(parts) == 5:
        prefix, sub1, ref_id1, sub2, ref_id2 = parts

        # activity:activity_type:{activity_type_id}:dimension_value:{dv_id}
        if prefix == "activity" and sub1 == "activity_type" and sub2 == "dimension_value":
            from app.modules.activity.model import ActivityType
            from app.modules.dimension.model import DimensionValue

            at_ok = db.query(ActivityType).filter_by(organization_id=org_id, id=ref_id1).first()
            dv_ok = db.query(DimensionValue).filter_by(organization_id=org_id, id=ref_id2).first()
            if at_ok and dv_ok:
                return

        # participant:entity:{...}:activity_type:{id} or :dimension_value:{dv_id}
        if prefix == "participant" and sub1 == "entity":
            from app.modules.entity.model import EntityType

            entity_ok = (
                ref_id1 == "user"
                or db.query(EntityType).filter_by(organization_id=org_id, id=ref_id1).first()
            )

            if entity_ok:
                if sub2 == "activity_type":
                    from app.modules.activity.model import ActivityType

                    if db.query(ActivityType).filter_by(organization_id=org_id, id=ref_id2).first():
                        return
                elif sub2 == "dimension_value":
                    from app.modules.dimension.model import DimensionValue

                    if (
                        db.query(DimensionValue)
                        .filter_by(organization_id=org_id, id=ref_id2)
                        .first()
                    ):
                        return

    # 7-part keys:
    # participant:entity:{...}:activity_type:{activity_type_id}:dimension_value:{dv_id}
    if len(parts) == 7:
        prefix, sub1, ref_id1, sub2, ref_id2, sub3, ref_id3 = parts

        if (
            prefix == "participant"
            and sub1 == "entity"
            and sub2 == "activity_type"
            and sub3 == "dimension_value"
        ):
            from app.modules.entity.model import EntityType
            from app.modules.activity.model import ActivityType
            from app.modules.dimension.model import DimensionValue

            entity_ok = (
                ref_id1 == "user"
                or db.query(EntityType).filter_by(organization_id=org_id, id=ref_id1).first()
            )
            at_ok = db.query(ActivityType).filter_by(organization_id=org_id, id=ref_id2).first()
            dv_ok = db.query(DimensionValue).filter_by(organization_id=org_id, id=ref_id3).first()
            if entity_ok and at_ok and dv_ok:
                return

    from fastapi import HTTPException

    raise HTTPException(status_code=400, detail=f"Invalid entity type: {entity_type}")


@router.get(
    "/meta-field-schemas/{entity_type}",
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
    """Update meta field schema for an entity type (legacy path-based API)."""
    _validate_entity_type(entity_type, current_user.organization_id, db)
    service = MetaFieldSchemaService(db)
    return service.update_schema(current_user.organization_id, entity_type, fields)


def _resolve_scope_key(scope: MetaFieldScope, org_id, db: Session) -> str:
    """Build and validate a scope_key from a structured MetaFieldScope."""
    from fastapi import HTTPException
    from app.modules.dimension.model import Dimension, DimensionValue
    from app.modules.entity.model import EntityType
    from app.modules.activity.model import ActivityType

    def _check_entity_type(eid: str) -> None:
        if eid == "user":
            return
        if not db.query(EntityType).filter_by(organization_id=org_id, id=eid).first():
            raise HTTPException(status_code=400, detail=f"Entity type not found: {eid}")

    def _check_activity_type(cid: str) -> None:
        if not db.query(ActivityType).filter_by(organization_id=org_id, id=cid).first():
            raise HTTPException(status_code=400, detail=f"Activity type not found: {cid}")

    def _check_dimension(did: str) -> None:
        if not db.query(Dimension).filter_by(organization_id=org_id, id=did).first():
            raise HTTPException(status_code=400, detail=f"Dimension not found: {did}")

    def _check_dimension_value(dvid: str) -> None:
        if not db.query(DimensionValue).filter_by(organization_id=org_id, id=dvid).first():
            raise HTTPException(status_code=400, detail=f"Dimension value not found: {dvid}")

    t = scope.type

    if t in ("enrollment", "activity", "participation", "facilitator", "beneficiary"):
        if t == "activity":
            # activity[:activity_type:{activityTypeId}][:dimension_value:{dvId}]
            key = "activity"
            if scope.activity_type_id:
                _check_activity_type(scope.activity_type_id)
                key += f":activity_type:{scope.activity_type_id}"
            if scope.dimension_value_id:
                _check_dimension_value(scope.dimension_value_id)
                key += f":dimension_value:{scope.dimension_value_id}"
            if key == "activity":
                # Bare "activity" is a valid static scope
                pass
            return key
        return t

    if t == "entity":
        if not scope.entity_type_id:
            raise HTTPException(
                status_code=400, detail="entity_type_id is required for entity scope"
            )
        _check_entity_type(scope.entity_type_id)
        return f"entity:{scope.entity_type_id}"

    if t == "dimension":
        if not scope.dimension_id:
            raise HTTPException(
                status_code=400, detail="dimension_id is required for dimension scope"
            )
        _check_dimension(scope.dimension_id)
        return f"dimension:{scope.dimension_id}"

    if t == "participant":
        if not scope.entity_type_id:
            raise HTTPException(
                status_code=400, detail="entity_type_id is required for participant scope"
            )
        _check_entity_type(scope.entity_type_id)
        key = f"participant:entity:{scope.entity_type_id}"
        if scope.activity_type_id:
            _check_activity_type(scope.activity_type_id)
            key += f":activity_type:{scope.activity_type_id}"
        if scope.dimension_value_id:
            _check_dimension_value(scope.dimension_value_id)
            key += f":dimension_value:{scope.dimension_value_id}"
        return key

    raise HTTPException(status_code=400, detail=f"Invalid scope type: {t}")


@router.put(
    "/meta-field-schemas",
    dependencies=[Depends(require_permissions("org:settings"))],
)
def update_meta_field_schema_structured(
    data: MetaFieldSchemaUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update meta field schema using structured scope (preferred API)."""
    scope_key = _resolve_scope_key(data.scope, current_user.organization_id, db)
    service = MetaFieldSchemaService(db)
    return service.update_schema(current_user.organization_id, scope_key, data.fields)
