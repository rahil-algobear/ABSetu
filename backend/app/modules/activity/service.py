"""
Activity, ActivityType, ActivityParticipant services
"""

import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

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
from app.modules.activity.model import Activity, ActivityParticipant, ActivityType
from app.modules.auth.model import User
from app.modules.dimension.model import ActivityDimension, DimensionValue


class ActivityTypeService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(self, org_id: uuid.UUID) -> list[ActivityType]:
        return (
            self.db.query(ActivityType)
            .filter_by(organization_id=org_id)
            .order_by(ActivityType.sort_order)
            .all()
        )

    def get_by_id(self, activity_type_id: uuid.UUID, org_id: uuid.UUID) -> ActivityType:
        at = (
            self.db.query(ActivityType)
            .filter_by(id=activity_type_id, organization_id=org_id)
            .first()
        )
        if not at:
            raise NotFoundError("Activity type not found")
        return at

    def create(self, org_id: uuid.UUID, data: dict) -> ActivityType:
        data["key"] = slugify(data["name"])
        at = ActivityType(organization_id=org_id, **data)
        self.db.add(at)
        self.db.commit()
        self.db.refresh(at)
        return at

    def update(self, activity_type_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> ActivityType:
        at = self.get_by_id(activity_type_id, org_id)
        if "name" in data and data["name"] is not None:
            data["key"] = slugify(data["name"])
        for key, value in data.items():
            if value is not None:
                setattr(at, key, value)
        self.db.commit()
        self.db.refresh(at)
        return at

    def delete(self, activity_type_id: uuid.UUID, org_id: uuid.UUID) -> None:
        at = self.get_by_id(activity_type_id, org_id)
        count = self.db.query(Activity).filter_by(activity_type_id=activity_type_id).count()
        if count > 0:
            raise ValidationError(
                f"Cannot delete activity type with {count} activities. Reassign them first."
            )
        self.db.delete(at)
        self.db.commit()


class ActivityService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _created_by_name_subquery(db: Session):
        """Scalar subquery resolving Activity.created_by -> 'First Last'."""
        return (
            db.query(func.concat(User.first_name, " ", User.last_name))
            .filter(User.id == Activity.created_by)
            .correlate(Activity)
            .scalar_subquery()
        )

    def _build_base_query(
        self,
        org_id: uuid.UUID,
        accessible_dv_ids: list[uuid.UUID] | None = None,
    ):
        """Build the base activity query with participant count and dimension access scoping."""
        participant_count = (
            self.db.query(func.count(ActivityParticipant.id))
            .filter(ActivityParticipant.activity_id == Activity.id)
            .correlate(Activity)
            .scalar_subquery()
        )
        created_by_name = self._created_by_name_subquery(self.db)

        query = self.db.query(Activity, participant_count, created_by_name).filter_by(
            organization_id=org_id
        )

        if accessible_dv_ids:
            restricted_dims = group_dvs_by_dimension(self.db, accessible_dv_ids)
            query = apply_dimension_access_scoping(
                query,
                self.db,
                restricted_dims,
                assoc_fk=ActivityDimension.activity_id,
                assoc_dv=ActivityDimension.dimension_value_id,
                parent_pk=Activity.id,
            )

        return query

    def get_sort_config(
        self, org_id: uuid.UUID | None = None, sortable_keys: set[str] | None = None
    ) -> dict:
        """Sort keys available for activity list, optionally including meta fields from list config."""
        config = {
            "created_at": Activity.created_at,
            "created_by": self._created_by_name_subquery(self.db),
        }
        if org_id and sortable_keys:
            meta_sort_keys = {k for k in sortable_keys if k.startswith("meta:")}
            if meta_sort_keys:
                from app.common.helpers.filter_definitions import build_meta_field_sort_config

                at_ids = [
                    at.id
                    for at in self.db.query(ActivityType).filter_by(organization_id=org_id).all()
                ]
                scopes = [{"scope_type": "activity"}] + [
                    {"scope_type": "activity", "activity_type_id": at_id} for at_id in at_ids
                ]
                config.update(
                    build_meta_field_sort_config(
                        self.db,
                        org_id,
                        scopes,
                        Activity.meta,
                        meta_sort_keys,
                    )
                )
        return config

    @staticmethod
    def get_filter_config() -> dict:
        """Filter config for activity list."""
        return {
            "activity_type_id": {"type": "exact", "column": Activity.activity_type_id},
            "start_date": {
                "type": "meta_date_range",
                "meta_key": "start_date",
                "meta_column": Activity.meta,
            },
            "end_date": {
                "type": "meta_date_range",
                "meta_key": "end_date",
                "meta_column": Activity.meta,
            },
            "created_at": {"type": "datetime_range", "column": Activity.created_at},
            "created_by": {"type": "exact", "column": Activity.created_by},
        }

    def get_dimension_filter_config(self, org_id: uuid.UUID) -> dict:
        """Build dimension filter config dynamically from org's dimensions."""
        return build_dimension_filter_config(
            self.db,
            org_id,
            assoc_fk=ActivityDimension.activity_id,
            assoc_dv=ActivityDimension.dimension_value_id,
            parent_pk=Activity.id,
        )

    def list_by_org_paginated(
        self,
        org_id: uuid.UUID,
        params: ListParams,
        accessible_dv_ids: list[uuid.UUID] | None = None,
        list_columns: list[dict] | None = None,
        participant_entity_id: uuid.UUID | None = None,
    ) -> tuple[list[tuple], int]:
        """Paginated list with search, filter, sort support."""
        query = self._build_base_query(org_id, accessible_dv_ids)

        if participant_entity_id is not None:
            participant_subq = (
                self.db.query(ActivityParticipant.activity_id)
                .filter(
                    ActivityParticipant.participant_type == "entity",
                    ActivityParticipant.participant_id == participant_entity_id,
                )
                .subquery()
            )
            query = query.filter(Activity.id.in_(self.db.query(participant_subq)))

        # Build filter/sort/search keys from list config
        filterable_keys = None
        sortable_keys = None
        searchable_keys = None
        if list_columns:
            filterable_keys = {c["key"] for c in list_columns if c.get("filterable")}
            sortable_keys = {c["key"] for c in list_columns if c.get("sortable")}
            searchable_keys = {c["key"] for c in list_columns if c.get("searchable")}

        at_ids = [
            at.id for at in self.db.query(ActivityType).filter_by(organization_id=org_id).all()
        ]
        scopes = [{"scope_type": "activity"}] + [
            {"scope_type": "activity", "activity_type_id": at_id} for at_id in at_ids
        ]

        # Search on searchable meta + dimension fields
        from app.common.helpers.filter_definitions import (
            build_dimension_search_columns,
            build_meta_field_filter_config,
            build_meta_field_search_columns,
        )
        from app.modules.dimension.model import ActivityDimension

        search_columns = build_meta_field_search_columns(
            self.db, org_id, scopes, Activity.meta, searchable_keys
        )
        search_columns.extend(
            build_dimension_search_columns(
                self.db, org_id, ActivityDimension, Activity.id, searchable_keys
            )
        )
        query = apply_search(query, params.search, search_columns)

        # Filters (static + dimension + meta from list config)
        filter_config = self.get_filter_config()
        filter_config.update(self.get_dimension_filter_config(org_id))
        if filterable_keys:
            filter_config.update(
                build_meta_field_filter_config(
                    self.db,
                    org_id,
                    scopes,
                    Activity.meta,
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
            Activity.created_at.desc(),
        )

        # Paginate
        return paginate(query, params.page, params.limit)

    def get_by_id(self, activity_id: uuid.UUID) -> Activity:
        activity = (
            self.db.query(Activity)
            .options(
                joinedload(Activity.activity_type),
                joinedload(Activity.dimensions)
                .joinedload(ActivityDimension.dimension_value)
                .joinedload(DimensionValue.dimension),
            )
            .filter_by(id=activity_id)
            .first()
        )
        if not activity:
            raise NotFoundError("Activity not found")
        return activity

    def create(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: dict,
        dimension_value_ids: list[str],
        accessible_dv_ids: list[uuid.UUID] | None = None,
    ) -> Activity:
        from app.modules.dimension.service import UserDimensionAccessService

        UserDimensionAccessService(self.db).validate_dimension_values(
            accessible_dv_ids, dimension_value_ids or []
        )

        activity_type_id = data.get("activity_type_id")
        if activity_type_id:
            at = (
                self.db.query(ActivityType)
                .filter_by(id=uuid.UUID(activity_type_id), organization_id=org_id)
                .first()
            )
            if not at:
                raise ValidationError("Activity type not found in this organization")

        meta = normalize_meta_datetimes(dict(data.get("meta") or {}))

        activity = Activity(
            organization_id=org_id,
            activity_type_id=uuid.UUID(activity_type_id) if activity_type_id else None,
            meta=meta,
            created_by=user_id,
        )
        self.db.add(activity)
        self.db.flush()

        for dv_id in dimension_value_ids:
            dim = ActivityDimension(activity_id=activity.id, dimension_value_id=uuid.UUID(dv_id))
            self.db.add(dim)

        self.db.commit()
        self.db.refresh(activity)
        return self.get_by_id(activity.id)

    def update(self, activity_id: uuid.UUID, data: dict) -> Activity:
        activity = self.get_by_id(activity_id)

        # Merge existing meta with updates
        existing_meta = dict(activity.meta or {})
        incoming_meta = data.get("meta") or {}
        existing_meta.update(incoming_meta)

        activity.meta = normalize_meta_datetimes(existing_meta)
        self.db.commit()
        self.db.refresh(activity)
        return self.get_by_id(activity.id)

    def list_by_entity(
        self,
        entity_id: uuid.UUID,
        org_id: uuid.UUID,
        accessible_dv_ids: list[uuid.UUID] | None = None,
    ) -> list[Activity]:
        """Return activities where the given entity is a participant."""
        participant_activity_ids = (
            self.db.query(ActivityParticipant.activity_id)
            .filter(
                ActivityParticipant.participant_type == "entity",
                ActivityParticipant.participant_id == entity_id,
            )
            .all()
        )
        activity_ids = [row[0] for row in participant_activity_ids]
        if not activity_ids:
            return []
        query = self.db.query(Activity).filter(
            Activity.id.in_(activity_ids),
            Activity.organization_id == org_id,
        )

        if accessible_dv_ids:
            restricted_dims = group_dvs_by_dimension(self.db, accessible_dv_ids)
            query = apply_dimension_access_scoping(
                query,
                self.db,
                restricted_dims,
                assoc_fk=ActivityDimension.activity_id,
                assoc_dv=ActivityDimension.dimension_value_id,
                parent_pk=Activity.id,
            )

        return (
            query.options(
                joinedload(Activity.activity_type),
                joinedload(Activity.dimensions)
                .joinedload(ActivityDimension.dimension_value)
                .joinedload(DimensionValue.dimension),
            )
            .order_by(Activity.meta["start_date"].astext.desc())
            .all()
        )

    def delete(self, activity_id: uuid.UUID) -> None:
        activity = self.get_by_id(activity_id)
        self.db.delete(activity)
        self.db.commit()


class ActivityParticipantService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_activity(self, activity_id: uuid.UUID) -> list[ActivityParticipant]:
        return self.db.query(ActivityParticipant).filter_by(activity_id=activity_id).all()

    def list_by_activity_paginated(
        self,
        activity_id: uuid.UUID,
        section_key: str,
        page: int = 1,
        limit: int = 25,
    ) -> tuple[list[ActivityParticipant], int]:
        """Paginated participants for a single section of an activity.

        Sort defaults to created_at ascending — the order rows were added
        — so pages stay stable as new participants are appended.
        """
        query = (
            self.db.query(ActivityParticipant)
            .filter_by(activity_id=activity_id, section_key=section_key)
            .order_by(ActivityParticipant.created_at.asc())
        )
        total = query.count()
        offset = max(0, (page - 1) * limit)
        rows = query.offset(offset).limit(limit).all()
        return rows, total

    def resolve_display_names(
        self,
        org_id: uuid.UUID,
        rows: list[ActivityParticipant],
    ) -> dict[uuid.UUID, str]:
        """Batch-resolve a participant-row id → display name. Entity
        participants use the first visible meta column of the entity
        type's list config; user participants use first + last name."""
        from app.modules.auth.model import User
        from app.modules.entity.model import Entity
        from app.modules.organization.service import ListConfigService

        entity_pids = {r.participant_id for r in rows if r.participant_type == "entity"}
        user_pids = {r.participant_id for r in rows if r.participant_type == "user"}

        entities_by_id: dict[uuid.UUID, Entity] = {}
        if entity_pids:
            for e in (
                self.db.query(Entity).filter(Entity.id.in_(entity_pids)).all()
            ):
                entities_by_id[e.id] = e

        # First visible meta column per entity type — one lookup per type.
        type_ids = {e.entity_type_id for e in entities_by_id.values()}
        name_key_by_type: dict[uuid.UUID, str | None] = {}
        if type_ids:
            list_config_service = ListConfigService(self.db)
            for tid in type_ids:
                columns = list_config_service.get_config(org_id, f"entity:{tid}")
                first_meta_col = next(
                    (
                        c["key"]
                        for c in columns
                        if c.get("visible") and c.get("key", "").startswith("meta:")
                    ),
                    None,
                )
                name_key_by_type[tid] = (
                    first_meta_col.replace("meta:", "", 1) if first_meta_col else None
                )

        users_by_id: dict[uuid.UUID, User] = {}
        if user_pids:
            for u in (
                self.db.query(User).filter(User.id.in_(user_pids)).all()
            ):
                users_by_id[u.id] = u

        result: dict[uuid.UUID, str] = {}
        for r in rows:
            if r.participant_type == "user":
                u = users_by_id.get(r.participant_id)
                result[r.id] = (
                    f"{u.first_name} {u.last_name}".strip() if u else str(r.participant_id)
                )
                continue
            e = entities_by_id.get(r.participant_id)
            if not e:
                result[r.id] = str(r.participant_id)
                continue
            name_key = name_key_by_type.get(e.entity_type_id)
            name_value = (e.meta or {}).get(name_key) if name_key else None
            result[r.id] = str(name_value) if name_value else str(r.participant_id)
        return result

    def bulk_patch(
        self,
        activity_id: uuid.UUID,
        updates: list[dict],
        removes: list[dict],
    ) -> None:
        """Apply per-row updates and removes atomically. Rows are
        identified by (activity_id, section_key, participant_id).
        Rows not in either list are untouched."""
        try:
            for u in updates:
                row = (
                    self.db.query(ActivityParticipant)
                    .filter_by(
                        activity_id=activity_id,
                        section_key=u["section_key"],
                        participant_id=uuid.UUID(u["participant_id"]),
                    )
                    .first()
                )
                if not row:
                    raise NotFoundError(
                        f"Participant {u['participant_id']} not found in section {u['section_key']}"
                    )
                if "status" in u and u["status"] is not None:
                    row.status = u["status"]
                if "meta" in u and u["meta"] is not None:
                    row.meta = u["meta"]
            for r in removes:
                row = (
                    self.db.query(ActivityParticipant)
                    .filter_by(
                        activity_id=activity_id,
                        section_key=r["section_key"],
                        participant_id=uuid.UUID(r["participant_id"]),
                    )
                    .first()
                )
                if row:
                    self.db.delete(row)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def bulk_create(self, activity_id: uuid.UUID, records: list[dict]) -> list[ActivityParticipant]:
        activity = self.db.query(Activity).filter_by(id=activity_id).first()
        if not activity:
            raise NotFoundError("Activity not found")

        self.db.query(ActivityParticipant).filter_by(activity_id=activity_id).delete()

        participants = []
        for record in records:
            p = ActivityParticipant(
                activity_id=activity_id,
                participant_type=record["participant_type"],
                participant_id=uuid.UUID(record["participant_id"]),
                section_key=record["section_key"],
                status=record.get("status"),
                meta=record.get("meta"),
            )
            self.db.add(p)
            participants.append(p)

        self.db.commit()
        for p in participants:
            self.db.refresh(p)
        return participants

