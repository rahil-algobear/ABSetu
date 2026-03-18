"""
Activity, ActivityType, ActivityCategory, ActivityParticipant services
"""

import uuid

from sqlalchemy.orm import Session, joinedload

from app.common.exceptions import NotFoundError, ValidationError
from app.common.helpers.slugify import slugify
from app.modules.activity.model import (
    Activity,
    ActivityCategory,
    ActivityParticipant,
    ActivityType,
)
from app.modules.dimension.model import (
    ActivityTag,
    Dimension,
    DimensionValue,
)


def _make_at_code(name: str) -> str:
    """Convert activity type name to a dimension value code."""
    return name.upper().replace(" ", "_").replace("-", "_").replace("/", "_").replace(",", "")


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

    @staticmethod
    def _slugify_section_keys(sections: list[dict] | None) -> list[dict] | None:
        if not sections:
            return sections
        for section in sections:
            if "label" in section:
                section["key"] = slugify(section["label"])
        return sections

    def create(self, org_id: uuid.UUID, data: dict) -> ActivityCategory:
        data["key"] = slugify(data["name"])
        data["sections"] = self._slugify_section_keys(data.get("sections"))
        cat = ActivityCategory(organization_id=org_id, **data)
        self.db.add(cat)
        self.db.commit()
        self.db.refresh(cat)
        return cat

    def update(self, category_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> ActivityCategory:
        cat = self.get_by_id(category_id, org_id)
        if "name" in data and data["name"] is not None:
            data["key"] = slugify(data["name"])
        if "sections" in data:
            data["sections"] = self._slugify_section_keys(data["sections"])
        for key, value in data.items():
            if value is not None:
                setattr(cat, key, value)
        self.db.commit()
        self.db.refresh(cat)
        return cat

    def delete(self, category_id: uuid.UUID, org_id: uuid.UUID) -> None:
        cat = self.get_by_id(category_id, org_id)
        # Check if any activity types reference this category
        count = self.db.query(ActivityType).filter_by(category_id=category_id).count()
        if count > 0:
            raise ValidationError(
                f"Cannot delete category with {count} activity types. Reassign them first."
            )
        self.db.delete(cat)
        self.db.commit()


class ActivityTypeService:
    def __init__(self, db: Session):
        self.db = db

    def _get_system_dimension(self, org_id: uuid.UUID) -> Dimension | None:
        """Get the system-managed 'activity_type' dimension for the org."""
        return (
            self.db.query(Dimension)
            .filter_by(organization_id=org_id, is_system="activity_type")
            .first()
        )

    def _sync_dimension_value(self, org_id: uuid.UUID, name: str) -> None:
        """Create or update a mirrored dimension value for an activity type."""
        dim = self._get_system_dimension(org_id)
        if not dim:
            return
        code = _make_at_code(name)
        dv = self.db.query(DimensionValue).filter_by(dimension_id=dim.id, code=code).first()
        if not dv:
            max_order = (
                self.db.query(DimensionValue.sort_order)
                .filter_by(dimension_id=dim.id)
                .order_by(DimensionValue.sort_order.desc())
                .first()
            )
            next_order = (max_order[0] + 1) if max_order else 0
            dv = DimensionValue(
                organization_id=org_id,
                dimension_id=dim.id,
                name=name,
                code=code,
                sort_order=next_order,
            )
            self.db.add(dv)
        else:
            dv.name = name

    def _delete_dimension_value(self, org_id: uuid.UUID, name: str) -> None:
        """Remove the mirrored dimension value for a deleted activity type."""
        dim = self._get_system_dimension(org_id)
        if not dim:
            return
        code = _make_at_code(name)
        dv = self.db.query(DimensionValue).filter_by(dimension_id=dim.id, code=code).first()
        if dv:
            self.db.delete(dv)

    def list_by_org(
        self,
        org_id: uuid.UUID,
        accessible_ids: list[uuid.UUID] | None = None,
        category_id: uuid.UUID | None = None,
    ) -> list[ActivityType]:
        query = self.db.query(ActivityType).filter_by(organization_id=org_id)
        if accessible_ids is not None:
            query = query.filter(ActivityType.id.in_(accessible_ids))
        if category_id is not None:
            query = query.filter_by(category_id=category_id)
        return query.all()

    def get_by_id(self, type_id: uuid.UUID, org_id: uuid.UUID) -> ActivityType:
        at = self.db.query(ActivityType).filter_by(id=type_id, organization_id=org_id).first()
        if not at:
            raise NotFoundError("Activity type not found")
        return at

    def create(self, org_id: uuid.UUID, data: dict) -> ActivityType:
        # Validate category_id if provided
        category_id = data.get("category_id")
        if category_id:
            data["category_id"] = uuid.UUID(category_id)
            cat = (
                self.db.query(ActivityCategory)
                .filter_by(id=data["category_id"], organization_id=org_id)
                .first()
            )
            if not cat:
                raise ValidationError("Activity category not found in this organization")

        at = ActivityType(organization_id=org_id, **data)
        self.db.add(at)
        self.db.flush()
        self._sync_dimension_value(org_id, at.name)
        self.db.commit()
        self.db.refresh(at)
        return at

    def update(self, type_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> ActivityType:
        at = self.get_by_id(type_id, org_id)
        old_name = at.name

        # Validate category_id if provided
        if "category_id" in data and data["category_id"] is not None:
            data["category_id"] = uuid.UUID(data["category_id"])
            cat = (
                self.db.query(ActivityCategory)
                .filter_by(id=data["category_id"], organization_id=org_id)
                .first()
            )
            if not cat:
                raise ValidationError("Activity category not found in this organization")

        for key, value in data.items():
            if value is not None:
                setattr(at, key, value)

        if "name" in data and data["name"] != old_name:
            self._delete_dimension_value(org_id, old_name)
            self._sync_dimension_value(org_id, at.name)

        self.db.commit()
        self.db.refresh(at)
        return at

    def delete(self, type_id: uuid.UUID, org_id: uuid.UUID) -> None:
        at = self.get_by_id(type_id, org_id)
        self._delete_dimension_value(org_id, at.name)
        self.db.delete(at)
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
                .where(ActivityTag.activity_id == Activity.id)
                .where(ActivityTag.dimension_value_id.in_(accessible_dv_ids))
            )

        return (
            query.options(
                joinedload(Activity.activity_type).joinedload(ActivityType.category),
                joinedload(Activity.tags)
                .joinedload(ActivityTag.dimension_value)
                .joinedload(DimensionValue.dimension),
            )
            .order_by(Activity.date.desc())
            .all()
        )

    def get_by_id(self, activity_id: uuid.UUID) -> Activity:
        activity = (
            self.db.query(Activity)
            .options(
                joinedload(Activity.activity_type).joinedload(ActivityType.category),
                joinedload(Activity.tags)
                .joinedload(ActivityTag.dimension_value)
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
        at = (
            self.db.query(ActivityType)
            .filter_by(
                id=uuid.UUID(data["activity_type_id"]),
                organization_id=org_id,
            )
            .first()
        )
        if not at:
            raise ValidationError("Activity type not found in this organization")

        activity = Activity(
            organization_id=org_id,
            activity_type_id=at.id,
            date=data["date"],
            notes=data.get("notes"),
            meta=data.get("meta"),
            created_by=user_id,
        )
        self.db.add(activity)
        self.db.flush()

        for dv_id in dimension_value_ids:
            tag = ActivityTag(activity_id=activity.id, dimension_value_id=uuid.UUID(dv_id))
            self.db.add(tag)

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
