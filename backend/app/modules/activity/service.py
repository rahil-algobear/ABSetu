"""
Activity, ActivityType, ActivityParticipant, ActivityForm services
"""

import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.common.exceptions import NotFoundError, ValidationError
from app.common.helpers.meta_normalize import normalize_meta_datetimes
from app.common.helpers.dimension_scoping import (
    apply_dimension_access_scoping,
    group_dvs_by_dimension,
)
from app.common.helpers.filter_definitions import build_dimension_filter_config
from app.common.helpers.list_query import apply_filters, apply_search, apply_sort, paginate
from app.common.helpers.slugify import slugify
from app.common.schemas.list_params import ListParams
from app.modules.activity.model import Activity, ActivityForm, ActivityParticipant, ActivityType
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

        query = self.db.query(Activity, participant_count).filter_by(organization_id=org_id)

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
            "title": Activity.title,
            "start_date": Activity.start_date,
            "end_date": Activity.end_date,
            "created_at": Activity.created_at,
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
            "start_date": {"type": "datetime_range", "column": Activity.start_date},
            "end_date": {"type": "datetime_range", "column": Activity.end_date},
            "created_at": {"type": "datetime_range", "column": Activity.created_at},
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
    ) -> tuple[list[tuple], int]:
        """Paginated list with search, filter, sort support."""
        query = self._build_base_query(org_id, accessible_dv_ids)

        # Search
        query = apply_search(query, params.search, [Activity.title])

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

            at_ids = [
                at.id for at in self.db.query(ActivityType).filter_by(organization_id=org_id).all()
            ]
            scopes = [{"scope_type": "activity"}] + [
                {"scope_type": "activity", "activity_type_id": at_id} for at_id in at_ids
            ]
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
            Activity.start_date.desc(),
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

        activity = Activity(
            organization_id=org_id,
            activity_type_id=uuid.UUID(activity_type_id) if activity_type_id else None,
            title=data.get("title"),
            start_date=data["start_date"],
            end_date=data.get("end_date"),
            notes=data.get("notes"),
            meta=normalize_meta_datetimes(data.get("meta")),
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
        if "meta" in data and data["meta"] is not None:
            data["meta"] = normalize_meta_datetimes(data["meta"])
        for key, value in data.items():
            if value is not None:
                setattr(activity, key, value)
        self.db.commit()
        self.db.refresh(activity)
        return self.get_by_id(activity.id)

    def list_by_entity(self, entity_id: uuid.UUID, org_id: uuid.UUID) -> list[Activity]:
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
        return (
            self.db.query(Activity)
            .filter(
                Activity.id.in_(activity_ids),
                Activity.organization_id == org_id,
            )
            .options(
                joinedload(Activity.activity_type),
                joinedload(Activity.dimensions)
                .joinedload(ActivityDimension.dimension_value)
                .joinedload(DimensionValue.dimension),
            )
            .order_by(Activity.start_date.desc())
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


class ActivityFormService:
    # Default system field elements in the new simplified format.
    # These are always present and cannot be removed.
    SYSTEM_FIELD_KEYS = ["title", "start_date", "end_date", "notes"]

    DEFAULT_ELEMENTS = [
        {
            "type": "field",
            "ref_key": "title",
            "sort_order": 0,
            "config": {"mode": "free_text"},
        },
        {
            "type": "field",
            "ref_key": "start_date",
            "sort_order": 1,
        },
        {
            "type": "field",
            "ref_key": "end_date",
            "sort_order": 2,
        },
        {
            "type": "field",
            "ref_key": "notes",
            "sort_order": 3,
        },
    ]

    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _migrate_element(el: dict) -> dict:
        """Migrate a single element from old format to new format.

        Old format: type=default/dimension/entity_type/activity_meta, ref_id=...
        New format: type=field/dimension/participant_list, ref_key/dimension_id/entity_type_id=...
        """
        old_type = el.get("type")

        # Already in new format
        if old_type in ("field", "participant_list"):
            return el
        # Dimension type is the same in old and new format — distinguish by
        # checking whether dimension_id is already set (new) vs ref_id (old).
        if old_type == "dimension" and el.get("dimension_id") is not None:
            return el

        if old_type == "default":
            # default → field
            return {
                "type": "field",
                "ref_key": el.get("ref_id"),
                "sort_order": el.get("sort_order", 0),
                "config": el.get("config"),
            }
        elif old_type == "dimension":
            return {
                "type": "dimension",
                "dimension_id": el.get("ref_id"),
                "sort_order": el.get("sort_order", 0),
                "display_type": el.get("display_type", "dropdown"),
                "required": el.get("required", False),
            }
        elif old_type == "entity_type":
            return {
                "type": "participant_list",
                "entity_type_id": el.get("ref_id"),
                "sort_order": el.get("sort_order", 0),
                "display_type": el.get("display_type", "checklist"),
                "required": el.get("required", False),
                "config": el.get("config"),
            }
        elif old_type == "activity_meta":
            # activity_meta elements are no longer needed — meta fields are
            # now included as individual "field" elements via FieldDefinition.
            # Skip them during migration.
            return None
        else:
            return el

    @staticmethod
    def _migrate_elements(elements: list[dict]) -> list[dict]:
        """Migrate all elements from old format to new format."""
        migrated = []
        for el in elements:
            result = ActivityFormService._migrate_element(el)
            if result is not None:
                migrated.append(result)
        return migrated

    @staticmethod
    def _ensure_defaults(elements: list[dict]) -> list[dict]:
        """Ensure system field elements are present."""
        # First migrate any old-format elements
        elements = ActivityFormService._migrate_elements(elements)

        existing_keys = {
            el.get("ref_key")
            for el in elements
            if el.get("type") == "field" and el.get("ref_key")
        }
        # Add missing system field defaults
        missing = [
            {**el}
            for el in ActivityFormService.DEFAULT_ELEMENTS
            if el["ref_key"] not in existing_keys
        ]
        if missing:
            offset = len(missing)
            for el in elements:
                el["sort_order"] = el.get("sort_order", 0) + offset
            for i, m in enumerate(missing):
                m["sort_order"] = i
            elements = missing + elements
        return elements

    def get_by_type(self, activity_type_id: uuid.UUID, org_id: uuid.UUID) -> ActivityForm | None:
        return (
            self.db.query(ActivityForm)
            .filter_by(activity_type_id=activity_type_id, organization_id=org_id)
            .first()
        )

    def upsert(
        self, org_id: uuid.UUID, activity_type_id: uuid.UUID, elements: list[dict]
    ) -> ActivityForm:
        at = (
            self.db.query(ActivityType)
            .filter_by(id=activity_type_id, organization_id=org_id)
            .first()
        )
        if not at:
            raise NotFoundError("Activity type not found")

        elements = self._ensure_defaults(elements)

        form = self.get_by_type(activity_type_id, org_id)
        if form:
            form.elements = elements
        else:
            form = ActivityForm(
                organization_id=org_id,
                activity_type_id=activity_type_id,
                elements=elements,
            )
            self.db.add(form)
        self.db.commit()
        self.db.refresh(form)
        return form

    def delete(self, activity_type_id: uuid.UUID, org_id: uuid.UUID) -> None:
        form = self.get_by_type(activity_type_id, org_id)
        if not form:
            raise NotFoundError("Activity form not found")
        self.db.delete(form)
        self.db.commit()
