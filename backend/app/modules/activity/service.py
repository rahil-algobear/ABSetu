"""
Activity, ActivityCategory, ActivityParticipant, ActivityForm services
"""

import uuid

from sqlalchemy.orm import Session, joinedload

from app.common.exceptions import NotFoundError, ValidationError
from app.common.helpers.slugify import slugify
from app.modules.activity.model import (
    Activity,
    ActivityCategory,
    ActivityForm,
    ActivityParticipant,
)
from app.modules.dimension.model import (
    ActivityDimension,
    DimensionValue,
)


class ActivityCategoryService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(self, org_id: uuid.UUID) -> list[ActivityCategory]:
        return (
            self.db.query(ActivityCategory)
            .filter_by(organization_id=org_id)
            .order_by(ActivityCategory.sort_order)
            .all()
        )

    def get_by_id(self, category_id: uuid.UUID, org_id: uuid.UUID) -> ActivityCategory:
        cat = (
            self.db.query(ActivityCategory)
            .filter_by(id=category_id, organization_id=org_id)
            .first()
        )
        if not cat:
            raise NotFoundError("Activity category not found")
        return cat

    def create(self, org_id: uuid.UUID, data: dict) -> ActivityCategory:
        data["key"] = slugify(data["name"])
        cat = ActivityCategory(organization_id=org_id, **data)
        self.db.add(cat)
        self.db.commit()
        self.db.refresh(cat)
        return cat

    def update(self, category_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> ActivityCategory:
        cat = self.get_by_id(category_id, org_id)
        if "name" in data and data["name"] is not None:
            data["key"] = slugify(data["name"])
        for key, value in data.items():
            if value is not None:
                setattr(cat, key, value)
        self.db.commit()
        self.db.refresh(cat)
        return cat

    def delete(self, category_id: uuid.UUID, org_id: uuid.UUID) -> None:
        cat = self.get_by_id(category_id, org_id)
        # Check if any activities reference this category
        count = self.db.query(Activity).filter_by(category_id=category_id).count()
        if count > 0:
            raise ValidationError(
                f"Cannot delete category with {count} activities. Reassign them first."
            )
        self.db.delete(cat)
        self.db.commit()


class ActivityService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(
        self,
        org_id: uuid.UUID,
        accessible_dv_ids: list[uuid.UUID] | None = None,
    ) -> list[Activity]:
        query = self.db.query(Activity).filter_by(organization_id=org_id)

        if accessible_dv_ids:
            from sqlalchemy import exists

            query = query.filter(
                exists()
                .where(ActivityDimension.activity_id == Activity.id)
                .where(ActivityDimension.dimension_value_id.in_(accessible_dv_ids))
            )

        return (
            query.options(
                joinedload(Activity.category),
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
                joinedload(Activity.category),
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
        category_id = data.get("category_id")
        if category_id:
            cat = (
                self.db.query(ActivityCategory)
                .filter_by(id=uuid.UUID(category_id), organization_id=org_id)
                .first()
            )
            if not cat:
                raise ValidationError("Activity category not found in this organization")

        activity = Activity(
            organization_id=org_id,
            category_id=uuid.UUID(category_id) if category_id else None,
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

        # Delete existing participants, then recreate
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

    def get_by_category(self, category_id: uuid.UUID, org_id: uuid.UUID) -> ActivityForm | None:
        return (
            self.db.query(ActivityForm)
            .filter_by(activity_category_id=category_id, organization_id=org_id)
            .first()
        )

    def upsert(
        self, org_id: uuid.UUID, category_id: uuid.UUID, elements: list[dict]
    ) -> ActivityForm:
        # Validate category belongs to org
        cat = (
            self.db.query(ActivityCategory)
            .filter_by(id=category_id, organization_id=org_id)
            .first()
        )
        if not cat:
            raise NotFoundError("Activity category not found")

        form = self.get_by_category(category_id, org_id)
        if form:
            form.elements = elements
        else:
            form = ActivityForm(
                organization_id=org_id,
                activity_category_id=category_id,
                elements=elements,
            )
            self.db.add(form)
        self.db.commit()
        self.db.refresh(form)
        return form

    def delete(self, category_id: uuid.UUID, org_id: uuid.UUID) -> None:
        form = self.get_by_category(category_id, org_id)
        if not form:
            raise NotFoundError("Activity form not found")
        self.db.delete(form)
        self.db.commit()
