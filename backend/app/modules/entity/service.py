"""
Entity and EntityType services
"""

import uuid
from datetime import datetime

from sqlalchemy import exists, func, or_
from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.common.helpers.list_query import apply_filters, apply_search, apply_sort, paginate
from app.common.helpers.slugify import slugify
from app.common.schemas.list_params import ListParams
from app.modules.activity.model import ActivityParticipant
from app.modules.beneficiary.model import Enrollment
from app.modules.dimension.model import DimensionValue, EntityDimension
from app.modules.entity.model import Entity, EntityType
from app.modules.organization.model import Organization


class EntityTypeService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(self, org_id: uuid.UUID) -> list[EntityType]:
        return (
            self.db.query(EntityType)
            .filter_by(organization_id=org_id)
            .order_by(EntityType.sort_order)
            .all()
        )

    def get_by_id(self, entity_type_id: uuid.UUID, org_id: uuid.UUID) -> EntityType:
        et = self.db.query(EntityType).filter_by(id=entity_type_id, organization_id=org_id).first()
        if not et:
            raise NotFoundError("Entity type not found")
        return et

    def create(self, org_id: uuid.UUID, data: dict) -> EntityType:
        data["key"] = slugify(data["name"])
        et = EntityType(organization_id=org_id, **data)
        self.db.add(et)
        self.db.commit()
        self.db.refresh(et)
        return et

    def update(self, entity_type_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> EntityType:
        et = self.get_by_id(entity_type_id, org_id)
        if "name" in data and data["name"] is not None:
            data["key"] = slugify(data["name"])
        for key, value in data.items():
            if value is not None:
                setattr(et, key, value)
        self.db.commit()
        self.db.refresh(et)
        return et

    def delete(self, entity_type_id: uuid.UUID, org_id: uuid.UUID) -> None:
        et = self.get_by_id(entity_type_id, org_id)
        # Check if any entities exist for this type
        count = self.db.query(Entity).filter_by(entity_type_id=entity_type_id).count()
        if count > 0:
            raise ValidationError(
                f"Cannot delete entity type with {count} existing entities. Remove them first."
            )
        self.db.delete(et)
        self.db.commit()


class EntityService:
    def __init__(self, db: Session):
        self.db = db

    def _generate_case_number(self, org: Organization, entity_type: EntityType) -> str | None:
        """Generate a case number if the entity type has case_number_enabled."""
        config = entity_type.config or {}
        if not config.get("case_number_enabled", False):
            return None

        fmt = org.case_number_format or "{ORG_CODE}-{SERIAL}"
        year_2 = datetime.now().strftime("%y")
        year_4 = datetime.now().strftime("%Y")

        count = self.db.query(Entity).filter_by(organization_id=org.id).count()
        serial = str(count + 1).zfill(3)

        return (
            fmt.replace("{ORG_CODE}", org.code)
            .replace("{YY}", year_2)
            .replace("{YYYY}", year_4)
            .replace("{SERIAL}", serial)
        )

    def _build_base_query(
        self,
        org_id: uuid.UUID,
        accessible_dv_ids: list[uuid.UUID] | None = None,
    ):
        """Build the base entity query with subqueries and dimension access scoping."""
        enrollment_count = (
            self.db.query(func.count(Enrollment.id))
            .filter(Enrollment.entity_id == Entity.id)
            .correlate(Entity)
            .scalar_subquery()
        )
        activity_count = (
            self.db.query(func.count(ActivityParticipant.id))
            .filter(
                ActivityParticipant.participant_type == "entity",
                ActivityParticipant.participant_id == Entity.id,
            )
            .correlate(Entity)
            .scalar_subquery()
        )

        query = self.db.query(Entity, enrollment_count, activity_count).filter_by(
            organization_id=org_id
        )

        if accessible_dv_ids:
            dv_dim_rows = (
                self.db.query(DimensionValue.id, DimensionValue.dimension_id)
                .filter(DimensionValue.id.in_(accessible_dv_ids))
                .all()
            )
            restricted_dims: dict[uuid.UUID, list[uuid.UUID]] = {}
            for dv_id, dim_id in dv_dim_rows:
                restricted_dims.setdefault(dim_id, []).append(dv_id)

            for dim_id, allowed_ids in restricted_dims.items():
                dim_values_subq = (
                    self.db.query(DimensionValue.id)
                    .filter(DimensionValue.dimension_id == dim_id)
                    .subquery()
                )
                query = query.filter(
                    or_(
                        ~exists()
                        .where(EntityDimension.entity_id == Entity.id)
                        .where(EntityDimension.dimension_value_id.in_(dim_values_subq)),
                        exists()
                        .where(EntityDimension.entity_id == Entity.id)
                        .where(EntityDimension.dimension_value_id.in_(allowed_ids)),
                    )
                )

        return query

    def get_sort_config(self, org_id: uuid.UUID | None = None, sortable_keys: set[str] | None = None) -> dict:
        """Sort keys available for entity list, optionally including meta fields from list config."""
        config = {
            "name": Entity.name,
            "case_number": Entity.case_number,
            "created_at": Entity.created_at,
        }
        if org_id and sortable_keys:
            meta_sort_keys = {k for k in sortable_keys if k.startswith("meta:")}
            if meta_sort_keys:
                from app.common.helpers.filter_definitions import build_meta_field_sort_config
                et_ids = [
                    et.id for et in
                    self.db.query(EntityType).filter_by(organization_id=org_id).all()
                ]
                scopes = [{"scope_type": "entity", "entity_type_id": et_id} for et_id in et_ids]
                config.update(build_meta_field_sort_config(
                    self.db, org_id, scopes, Entity.meta, meta_sort_keys,
                ))
        return config

    @staticmethod
    def get_filter_config() -> dict:
        """Filter config for entity list."""
        return {
            "entity_type_id": {"type": "exact", "column": Entity.entity_type_id},
            "created_at": {"type": "date_range", "column": Entity.created_at},
        }

    def get_dimension_filter_config(self, org_id: uuid.UUID) -> dict:
        """Build dimension filter config dynamically from org's dimensions."""
        from app.modules.dimension.model import Dimension

        dims = (
            self.db.query(Dimension)
            .filter_by(organization_id=org_id)
            .all()
        )
        config = {}
        for dim in dims:
            config[f"dim:{dim.id}"] = {
                "type": "dimension",
                "assoc_model": EntityDimension,
                "assoc_fk": EntityDimension.entity_id,
                "assoc_dv": EntityDimension.dimension_value_id,
                "parent_pk": Entity.id,
            }
        return config

    def list_by_org(
        self,
        org_id: uuid.UUID,
        entity_type_id: uuid.UUID | None = None,
        accessible_dv_ids: list[uuid.UUID] | None = None,
    ) -> list[tuple]:
        """Legacy list method — returns all entities (no pagination)."""
        query = self._build_base_query(org_id, accessible_dv_ids)

        if entity_type_id:
            query = query.filter(Entity.entity_type_id == entity_type_id)

        return query.order_by(Entity.created_at.desc()).all()

    def list_by_org_paginated(
        self,
        org_id: uuid.UUID,
        params: ListParams,
        accessible_dv_ids: list[uuid.UUID] | None = None,
        list_columns: list[dict] | None = None,
    ) -> tuple[list[tuple], int]:
        """Paginated list with search, filter, sort support."""
        query = self._build_base_query(org_id, accessible_dv_ids)

        # Search
        query = apply_search(query, params.search, [Entity.name, Entity.case_number])

        # Build filter/sort keys from list config
        filterable_keys = None
        sortable_keys = None
        if list_columns:
            filterable_keys = {c["key"] for c in list_columns if c.get("filterable")}
            sortable_keys = {c["key"] for c in list_columns if c.get("sortable")}

        # Filters (static + dimension + meta from list config)
        filter_config = self.get_filter_config()
        filter_config.update(self.get_dimension_filter_config(org_id))
        if filterable_keys:
            from app.common.helpers.filter_definitions import build_meta_field_filter_config
            et_ids = [
                et.id for et in
                self.db.query(EntityType).filter_by(organization_id=org_id).all()
            ]
            filter_config.update(build_meta_field_filter_config(
                self.db, org_id, [f"entity:{et_id}" for et_id in et_ids],
                Entity.meta, filterable_keys,
            ))
        query = apply_filters(query, params.filters, filter_config)

        # Sort (includes meta fields from list config)
        query = apply_sort(
            query, params.sort_by, params.sort_order,
            self.get_sort_config(org_id, sortable_keys), Entity.created_at.desc(),
        )

        # Paginate
        return paginate(query, params.page, params.limit)

    def get_by_id(self, entity_id: uuid.UUID, org_id: uuid.UUID) -> Entity:
        entity = self.db.query(Entity).filter_by(id=entity_id, organization_id=org_id).first()
        if not entity:
            raise NotFoundError("Entity not found")
        return entity

    def create(
        self,
        org_id: uuid.UUID,
        data: dict,
        dimension_value_ids: list[str] | None = None,
        accessible_dv_ids: list[uuid.UUID] | None = None,
    ) -> Entity:
        from app.modules.dimension.service import UserDimensionAccessService

        UserDimensionAccessService(self.db).validate_dimension_values(
            accessible_dv_ids, dimension_value_ids or []
        )

        org = self.db.query(Organization).filter_by(id=org_id).first()
        if not org:
            raise NotFoundError("Organization not found")

        entity_type = (
            self.db.query(EntityType)
            .filter_by(id=uuid.UUID(data["entity_type_id"]), organization_id=org_id)
            .first()
        )
        if not entity_type:
            raise ValidationError("Entity type not found in this organization")

        case_number = self._generate_case_number(org, entity_type)
        entity = Entity(
            organization_id=org_id,
            entity_type_id=entity_type.id,
            case_number=case_number,
            name=data["name"],
            meta=data.get("meta"),
        )
        self.db.add(entity)
        self.db.flush()

        for dv_id in dimension_value_ids or []:
            dim = EntityDimension(
                entity_id=entity.id,
                dimension_value_id=uuid.UUID(dv_id),
            )
            self.db.add(dim)

        self.db.commit()
        self.db.refresh(entity)
        return entity

    def update(self, entity_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> Entity:
        entity = self.get_by_id(entity_id, org_id)
        for key, value in data.items():
            if value is not None:
                setattr(entity, key, value)
        self.db.commit()
        self.db.refresh(entity)
        return entity

    def update_dimensions(
        self,
        entity_id: uuid.UUID,
        org_id: uuid.UUID,
        dimension_value_ids: list[str],
        accessible_dv_ids: list[uuid.UUID] | None = None,
    ) -> Entity:
        from app.modules.dimension.service import UserDimensionAccessService

        UserDimensionAccessService(self.db).validate_dimension_values(
            accessible_dv_ids, dimension_value_ids or []
        )
        entity = self.get_by_id(entity_id, org_id)
        self.db.query(EntityDimension).filter_by(entity_id=entity.id).delete()
        for dv_id in dimension_value_ids:
            dim = EntityDimension(
                entity_id=entity.id,
                dimension_value_id=uuid.UUID(dv_id),
            )
            self.db.add(dim)
        self.db.commit()
        self.db.refresh(entity)
        return entity
