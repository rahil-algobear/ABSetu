"""
Organization, Center, Programme routes
"""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import get_current_user, require_permissions
from app.modules.auth.model import User
from app.modules.organization.schemas import (
    CenterCreate,
    CenterResponse,
    CenterUpdate,
    OrganizationResponse,
    OrganizationUpdate,
    ProgrammeCenterCreate,
    ProgrammeCenterResponse,
    ProgrammeCreate,
    ProgrammeResponse,
    ProgrammeUpdate,
)
from app.modules.organization.service import (
    CenterService,
    MetaFieldSchemaService,
    OrganizationService,
    ProgrammeCenterService,
    ProgrammeService,
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


# --- Centers ---


@router.get("/centers", dependencies=[Depends(require_permissions("center:view"))])
def list_centers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all centers for the user's organization."""
    service = CenterService(db)
    centers = service.list_by_org(current_user.organization_id)
    return [CenterResponse.dump_from_model(c) for c in centers]


@router.get("/centers/{center_id}", dependencies=[Depends(require_permissions("center:view"))])
def get_center(
    center_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific center."""
    service = CenterService(db)
    center = service.get_by_id(center_id, current_user.organization_id)
    return CenterResponse.dump_from_model(center)


@router.post("/centers", dependencies=[Depends(require_permissions("center:manage"))], status_code=201)
def create_center(
    data: CenterCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new center."""
    service = CenterService(db)
    center = service.create(
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return CenterResponse.dump_from_model(center)


@router.put("/centers/{center_id}", dependencies=[Depends(require_permissions("center:manage"))])
def update_center(
    center_id: uuid.UUID,
    data: CenterUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a center."""
    service = CenterService(db)
    center = service.update(
        center_id, current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return CenterResponse.dump_from_model(center)


@router.delete("/centers/{center_id}", dependencies=[Depends(require_permissions("center:manage"))])
def delete_center(
    center_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a center."""
    service = CenterService(db)
    service.delete(center_id, current_user.organization_id)
    return {"message": "Center deleted"}


# --- Programmes ---


@router.get("/programmes", dependencies=[Depends(require_permissions("programme:view"))])
def list_programmes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all programmes for the user's organization."""
    service = ProgrammeService(db)
    programmes = service.list_by_org(current_user.organization_id)
    return [ProgrammeResponse.dump_from_model(p) for p in programmes]


@router.get("/programmes/{programme_id}", dependencies=[Depends(require_permissions("programme:view"))])
def get_programme(
    programme_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific programme."""
    service = ProgrammeService(db)
    programme = service.get_by_id(programme_id, current_user.organization_id)
    return ProgrammeResponse.dump_from_model(programme)


@router.post("/programmes", dependencies=[Depends(require_permissions("programme:manage"))], status_code=201)
def create_programme(
    data: ProgrammeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new programme."""
    service = ProgrammeService(db)
    programme = service.create(
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return ProgrammeResponse.dump_from_model(programme)


@router.put("/programmes/{programme_id}", dependencies=[Depends(require_permissions("programme:manage"))])
def update_programme(
    programme_id: uuid.UUID,
    data: ProgrammeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a programme."""
    service = ProgrammeService(db)
    programme = service.update(
        programme_id, current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return ProgrammeResponse.dump_from_model(programme)


@router.delete("/programmes/{programme_id}", dependencies=[Depends(require_permissions("programme:manage"))])
def delete_programme(
    programme_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a programme."""
    service = ProgrammeService(db)
    service.delete(programme_id, current_user.organization_id)
    return {"message": "Programme deleted"}


# --- Programme-Centers ---


@router.get("/programme-centers", dependencies=[Depends(require_permissions("programme:view"))])
def list_programme_centers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all programme-center assignments for the org."""
    service = ProgrammeCenterService(db)
    pcs = service.list_by_org(current_user.organization_id)
    results = []
    for pc in pcs:
        resp = ProgrammeCenterResponse(
            id=str(pc.id),
            updated_at=pc.updated_at,
            programme_id=str(pc.programme_id),
            center_id=str(pc.center_id),
            programme_name=pc.programme.name if pc.programme else None,
            center_name=pc.center.name if pc.center else None,
        )
        results.append(resp.dump())
    return results


@router.post("/programme-centers", dependencies=[Depends(require_permissions("programme:manage"))], status_code=201)
def create_programme_center(
    data: ProgrammeCenterCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Link a programme to a center."""
    service = ProgrammeCenterService(db)
    pc = service.create(
        current_user.organization_id,
        uuid.UUID(data.programme_id),
        uuid.UUID(data.center_id),
    )
    return ProgrammeCenterResponse(
        id=str(pc.id),
        updated_at=pc.updated_at,
        programme_id=str(pc.programme_id),
        center_id=str(pc.center_id),
    ).dump()


@router.delete("/programme-centers/{pc_id}", dependencies=[Depends(require_permissions("programme:manage"))])
def delete_programme_center(
    pc_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Unlink a programme from a center."""
    service = ProgrammeCenterService(db)
    service.delete(pc_id)
    return {"message": "Programme-Center link removed"}


# --- Meta Field Schemas ---

VALID_ENTITY_TYPES = {"centre", "programme", "session_template", "facilitator", "beneficiary"}


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
    if entity_type not in VALID_ENTITY_TYPES:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail=f"Invalid entity type: {entity_type}")
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
    if entity_type not in VALID_ENTITY_TYPES:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail=f"Invalid entity type: {entity_type}")
    service = MetaFieldSchemaService(db)
    return service.update_schema(current_user.organization_id, entity_type, fields)
