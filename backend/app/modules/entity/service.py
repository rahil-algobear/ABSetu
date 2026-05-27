"""
Entity and EntityType services
"""

import uuid
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.common.helpers.dimension_scoping import (
    apply_dimension_access_scoping,
    group_dvs_by_dimension,
)
from app.common.helpers.filter_definitions import build_dimension_filter_config
from app.common.helpers.list_query import apply_filters, apply_search, apply_sort, paginate
from app.common.helpers.meta_normalize import normalize_meta_datetimes
from app.common.helpers.slugify import slugify
from app.common.schemas.list_params import ListParams
from app.modules.activity.model import ActivityParticipant
from app.modules.auth.model import User
from app.modules.dimension.model import EntityDimension
from app.modules.enrollment.model import Enrollment
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

    # Fields that are nullable in the DB and where an explicit None from
    # the caller should clear the column (vs. being treated as "no change").
    _NULLABLE_FIELDS = {"max_active_enrollments"}

    def update(self, entity_type_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> EntityType:
        et = self.get_by_id(entity_type_id, org_id)
        if "name" in data and data["name"] is not None:
            data["key"] = slugify(data["name"])
        for key, value in data.items():
            if value is None and key not in self._NULLABLE_FIELDS:
                continue
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

    def _generate_code(self, org: Organization) -> str:
        """Generate entity code: {ORG_CODE}-{YY}-{SERIAL}.

        Uses the code_counters table with SELECT FOR UPDATE for atomic serial
        generation. The serial resets per org per year.
        """
        from app.modules.entity.model import CodeCounter

        year_2 = datetime.now().strftime("%y")

        # Upsert + lock the counter row
        counter = (
            self.db.query(CodeCounter)
            .filter_by(organization_id=org.id, year=year_2)
            .with_for_update()
            .first()
        )
        if not counter:
            counter = CodeCounter(
                organization_id=org.id,
                year=year_2,
                last_serial=0,
            )
            self.db.add(counter)
            self.db.flush()
            # Re-lock after insert
            counter = (
                self.db.query(CodeCounter)
                .filter_by(organization_id=org.id, year=year_2)
                .with_for_update()
                .first()
            )

        counter.last_serial += 1
        serial = str(counter.last_serial).zfill(3)

        return f"{org.code}-{year_2}-{serial}"

    @staticmethod
    def _created_by_name_subquery(db: Session):
        """Scalar subquery resolving Entity.created_by -> 'First Last'."""
        return (
            db.query(func.concat(User.first_name, " ", User.last_name))
            .filter(User.id == Entity.created_by)
            .correlate(Entity)
            .scalar_subquery()
        )

    def _build_base_query(
        self,
        org_id: uuid.UUID,
        accessible_dv_ids: list[uuid.UUID] | None = None,
    ):
        """Build the base entity query with subqueries and dimension access scoping."""
        # Count only active enrollments — the listing's "Enrollments"
        # column represents the entity's current engagement. Inactive
        # (ended / not-yet-started) enrollments live on the entity
        # detail page where staff can see the full history.
        enrollment_count = (
            self.db.query(func.count(Enrollment.id))
            .filter(Enrollment.entity_id == Entity.id, Enrollment.is_active.is_(True))
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
        created_by_name = self._created_by_name_subquery(self.db)

        query = self.db.query(Entity, enrollment_count, activity_count, created_by_name).filter_by(
            organization_id=org_id
        )

        if accessible_dv_ids:
            restricted_dims = group_dvs_by_dimension(self.db, accessible_dv_ids)
            query = apply_dimension_access_scoping(
                query,
                self.db,
                restricted_dims,
                assoc_fk=EntityDimension.entity_id,
                assoc_dv=EntityDimension.dimension_value_id,
                parent_pk=Entity.id,
                include_untagged=True,
            )

        return query

    def get_sort_config(
        self, org_id: uuid.UUID | None = None, sortable_keys: set[str] | None = None
    ) -> dict:
        """Sort keys available for entity list, optionally including meta fields from list config."""
        config = {
            "code": Entity.code,
            "created_at": Entity.created_at,
            "created_by": self._created_by_name_subquery(self.db),
        }
        if org_id and sortable_keys:
            meta_sort_keys = {k for k in sortable_keys if k.startswith("meta:")}
            if meta_sort_keys:
                from app.common.helpers.filter_definitions import build_meta_field_sort_config

                et_ids = [
                    et.id
                    for et in self.db.query(EntityType).filter_by(organization_id=org_id).all()
                ]
                scopes = [{"scope_type": "entity", "entity_type_id": et_id} for et_id in et_ids]
                config.update(
                    build_meta_field_sort_config(
                        self.db,
                        org_id,
                        scopes,
                        Entity.meta,
                        meta_sort_keys,
                    )
                )
        return config

    @staticmethod
    def get_filter_config() -> dict:
        """Filter config for entity list."""
        return {
            "entity_type_id": {"type": "exact", "column": Entity.entity_type_id},
            "created_at": {"type": "date_range", "column": Entity.created_at},
            "created_by": {"type": "exact", "column": Entity.created_by},
        }

    def get_dimension_filter_config(self, org_id: uuid.UUID) -> dict:
        """Build dimension filter config dynamically from org's dimensions."""
        return build_dimension_filter_config(
            self.db,
            org_id,
            assoc_fk=EntityDimension.entity_id,
            assoc_dv=EntityDimension.dimension_value_id,
            parent_pk=Entity.id,
        )

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

        # Build filter/sort/search keys from list config
        filterable_keys = None
        sortable_keys = None
        searchable_keys = None
        if list_columns:
            filterable_keys = {c["key"] for c in list_columns if c.get("filterable")}
            sortable_keys = {c["key"] for c in list_columns if c.get("sortable")}
            searchable_keys = {c["key"] for c in list_columns if c.get("searchable")}

        et_ids = [et.id for et in self.db.query(EntityType).filter_by(organization_id=org_id).all()]
        scopes = [{"scope_type": "entity", "entity_type_id": et_id} for et_id in et_ids]

        # Search on searchable meta + dimension fields
        from app.common.helpers.filter_definitions import (
            build_dimension_search_columns,
            build_meta_field_filter_config,
            build_meta_field_search_columns,
        )
        from app.modules.dimension.model import EntityDimension

        search_columns = build_meta_field_search_columns(
            self.db, org_id, scopes, Entity.meta, searchable_keys
        )
        search_columns.extend(
            build_dimension_search_columns(
                self.db, org_id, EntityDimension, Entity.id, searchable_keys
            )
        )
        # Always include code in search if searchable or no config
        if searchable_keys is None or "code" in searchable_keys:
            search_columns.append(Entity.code)
        # normalize=True so "auto test" matches "Auto-Test 48", etc.
        query = apply_search(query, params.search, search_columns, normalize=True)

        # Filters (static + dimension + meta from list config)
        filter_config = self.get_filter_config()
        filter_config.update(self.get_dimension_filter_config(org_id))
        if filterable_keys:
            filter_config.update(
                build_meta_field_filter_config(
                    self.db,
                    org_id,
                    scopes,
                    Entity.meta,
                    filterable_keys,
                )
            )
        query = apply_filters(query, params.filters, filter_config)

        # Sort (includes meta fields from list config)
        query = apply_sort(
            query,
            params.sort_by,
            params.sort_order,
            self.get_sort_config(org_id, sortable_keys),
            Entity.created_at.desc(),
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
        created_by: uuid.UUID | None = None,
        commit: bool = True,
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

        code = self._generate_code(org)
        meta = normalize_meta_datetimes(dict(data.get("meta") or {}))

        entity = Entity(
            organization_id=org_id,
            entity_type_id=entity_type.id,
            code=code,
            created_by=created_by,
            meta=meta,
        )
        self.db.add(entity)
        self.db.flush()

        for dv_id in dimension_value_ids or []:
            dim = EntityDimension(
                entity_id=entity.id,
                dimension_value_id=uuid.UUID(dv_id),
            )
            self.db.add(dim)

        if commit:
            self.db.commit()
            self.db.refresh(entity)
        else:
            self.db.flush()
        return entity

    def update(self, entity_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> Entity:
        entity = self.get_by_id(entity_id, org_id)

        # Merge existing meta with updates
        existing_meta = dict(entity.meta or {})
        incoming_meta = data.get("meta") or {}
        existing_meta.update(incoming_meta)

        entity.meta = normalize_meta_datetimes(existing_meta)
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
