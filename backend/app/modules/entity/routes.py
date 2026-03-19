"""
Entity and EntityType routes
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import (
    get_accessible_dimension_value_ids,
    get_current_user,
    require_permissions,
)
from app.modules.auth.model import User
from app.modules.entity.schemas import (
    DimensionInfo,
    EntityCreate,
    EntityResponse,
    EntityTypeCreate,
    EntityTypeResponse,
    EntityTypeUpdate,
    EntityUpdate,
)
from app.modules.entity.service import EntityService, EntityTypeService

router = APIRouter(tags=["entities"])

entity_type_router = APIRouter(prefix="/entity-types")
entity_router = APIRouter(prefix="/entities")


def _build_entity_response(e) -> dict:
    dim_infos = []
    for d in e.dimensions or []:
        dv = d.dimension_value
        if dv and dv.dimension:
            dim_infos.append(
                DimensionInfo(
                    dimension_key=dv.dimension.key,
                    dimension_name=dv.dimension.name,
                    value_id=str(dv.id),
                    value_name=dv.name,
                    value_code=dv.code,
                ).model_dump()
            )
    return EntityResponse(
        id=str(e.id),
        updated_at=e.updated_at,
        organization_id=str(e.organization_id),
        entity_type_id=str(e.entity_type_id),
        case_number=e.case_number,
        name=e.name,
        meta=e.meta,
        entity_type_name=e.entity_type.name if e.entity_type else None,
        entity_type_key=e.entity_type.key if e.entity_type else None,
        entity_type_config=e.entity_type.config if e.entity_type else None,
        dimensions=dim_infos,
    ).dump()


# --- Entity Types ---


@entity_type_router.get("/", dependencies=[Depends(require_permissions("entity_type:view"))])
def list_entity_types(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = EntityTypeService(db)
    types = service.list_by_org(current_user.organization_id)
    return [EntityTypeResponse.dump_from_model(t) for t in types]


@entity_type_router.get(
    "/{entity_type_id}",
    dependencies=[Depends(require_permissions("entity_type:view"))],
)
def get_entity_type(
    entity_type_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = EntityTypeService(db)
    et = service.get_by_id(entity_type_id, current_user.organization_id)
    return EntityTypeResponse.dump_from_model(et)


@entity_type_router.post(
    "/",
    dependencies=[Depends(require_permissions("entity_type:manage"))],
    status_code=201,
)
def create_entity_type(
    data: EntityTypeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = EntityTypeService(db)
    et = service.create(
        current_user.organization_id,
        data.model_dump(),
    )
    return EntityTypeResponse.dump_from_model(et)


@entity_type_router.put(
    "/{entity_type_id}",
    dependencies=[Depends(require_permissions("entity_type:manage"))],
)
def update_entity_type(
    entity_type_id: uuid.UUID,
    data: EntityTypeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = EntityTypeService(db)
    et = service.update(
        entity_type_id,
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return EntityTypeResponse.dump_from_model(et)


@entity_type_router.delete(
    "/{entity_type_id}",
    dependencies=[Depends(require_permissions("entity_type:manage"))],
)
def delete_entity_type(
    entity_type_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = EntityTypeService(db)
    service.delete(entity_type_id, current_user.organization_id)
    return {"message": "Entity type deleted"}


# --- Entities ---


@entity_router.get("/", dependencies=[Depends(require_permissions("entity:view"))])
def list_entities(
    entity_type_id: uuid.UUID | None = Query(None),
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    service = EntityService(db)
    entities = service.list_by_org(
        current_user.organization_id,
        entity_type_id=entity_type_id,
        accessible_dv_ids=accessible_dv_ids,
    )
    return [_build_entity_response(e) for e in entities]


@entity_router.get(
    "/{entity_id}",
    dependencies=[Depends(require_permissions("entity:view"))],
)
def get_entity(
    entity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = EntityService(db)
    entity = service.get_by_id(entity_id, current_user.organization_id)
    return _build_entity_response(entity)


@entity_router.post(
    "/",
    dependencies=[Depends(require_permissions("entity:create"))],
    status_code=201,
)
def create_entity(
    data: EntityCreate,
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    # Validate dimension values are within user's allowed scope
    from app.modules.dimension.service import UserDimensionAccessService

    UserDimensionAccessService(db).validate_dimension_values(
        accessible_dv_ids, data.dimension_value_ids or []
    )

    service = EntityService(db)
    entity = service.create(
        current_user.organization_id,
        data.model_dump(exclude={"dimension_value_ids"}),
        dimension_value_ids=data.dimension_value_ids,
    )
    return _build_entity_response(entity)


@entity_router.put(
    "/{entity_id}",
    dependencies=[Depends(require_permissions("entity:edit"))],
)
def update_entity(
    entity_id: uuid.UUID,
    data: EntityUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = EntityService(db)
    entity = service.update(
        entity_id,
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return _build_entity_response(entity)


@entity_router.put(
    "/{entity_id}/dimensions",
    dependencies=[Depends(require_permissions("entity:edit"))],
)
def update_entity_dimensions(
    entity_id: uuid.UUID,
    dimension_value_ids: list[str],
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    # Validate dimension values are within user's allowed scope
    from app.modules.dimension.service import UserDimensionAccessService

    UserDimensionAccessService(db).validate_dimension_values(
        accessible_dv_ids, dimension_value_ids or []
    )

    service = EntityService(db)
    entity = service.update_dimensions(
        entity_id,
        current_user.organization_id,
        dimension_value_ids,
    )
    return _build_entity_response(entity)


router.include_router(entity_type_router)
router.include_router(entity_router)
