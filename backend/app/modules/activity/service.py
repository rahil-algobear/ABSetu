"""
Activity, ActivityType, ActivityParticipant, ActivityForm services
"""

import uuid

from sqlalchemy.orm import Session, joinedload

from app.common.exceptions import NotFoundError, ValidationError
from app.common.helpers.slugify import slugify
from app.modules.activity.model import (
    Activity,
    ActivityForm,
    ActivityParticipant,
    ActivityType,
)
from app.modules.dimension.model import (
    ActivityDimension,
    DimensionValue,
)


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

    def list_by_org(
        self,
        org_id: uuid.UUID,
        accessible_dv_ids: list[uuid.UUID] | None = None,
        activity_type_id: uuid.UUID | None = None,
    ) -> list[Activity]:
        query = self.db.query(Activity).filter_by(organization_id=org_id)

        if activity_type_id:
            query = query.filter(Activity.activity_type_id == activity_type_id)

        if accessible_dv_ids:
            from sqlalchemy import exists

            query = query.filter(
                exists()
                .where(ActivityDimension.activity_id == Activity.id)
                .where(ActivityDimension.dimension_value_id.in_(accessible_dv_ids))
            )

        return (
            query.options(
                joinedload(Activity.activity_type),
                joinedload(Activity.dimensions)
                .joinedload(ActivityDimension.dimension_value)
                .joinedload(DimensionValue.dimension),
            )
            .order_by(Activity.date.desc())
            .all()
        )

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
    ) -> Activity:
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
            date=data["date"],
            notes=data.get("notes"),
            meta=data.get("meta"),
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
        for key, value in data.items():
            if value is not None:
                setattr(activity, key, value)
        self.db.commit()
        self.db.refresh(activity)
        return self.get_by_id(activity.id)

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
    def __init__(self, db: Session):
        self.db = db

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
