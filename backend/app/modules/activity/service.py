"""
Activity, ActivityType, Facilitator, Participation services
"""

import uuid

from sqlalchemy.orm import Session, joinedload

from app.common.exceptions import NotFoundError, ValidationError
from app.modules.activity.model import (
    Activity,
    ActivityFacilitator,
    ActivityType,
    ActivityTypeAccess,
    Facilitator,
    Participation,
)
from app.modules.dimension.model import (
    ActivityTag,
    DimensionValue,
)


class ActivityTypeService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(
        self, org_id: uuid.UUID, accessible_ids: list[uuid.UUID] | None = None
    ) -> list[ActivityType]:
        query = self.db.query(ActivityType).filter_by(organization_id=org_id)
        if accessible_ids is not None:
            query = query.filter(ActivityType.id.in_(accessible_ids))
        return query.all()

    def get_by_id(self, type_id: uuid.UUID, org_id: uuid.UUID) -> ActivityType:
        at = self.db.query(ActivityType).filter_by(id=type_id, organization_id=org_id).first()
        if not at:
            raise NotFoundError("Activity type not found")
        return at

    def create(self, org_id: uuid.UUID, data: dict) -> ActivityType:
        at = ActivityType(organization_id=org_id, **data)
        self.db.add(at)
        self.db.commit()
        self.db.refresh(at)
        return at

    def update(self, type_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> ActivityType:
        at = self.get_by_id(type_id, org_id)
        for key, value in data.items():
            if value is not None:
                setattr(at, key, value)
        self.db.commit()
        self.db.refresh(at)
        return at

    def delete(self, type_id: uuid.UUID, org_id: uuid.UUID) -> None:
        at = self.get_by_id(type_id, org_id)
        self.db.delete(at)
        self.db.commit()

    # --- Access management ---

    def get_access(self, activity_type_id: uuid.UUID) -> list[uuid.UUID]:
        """Get dimension value IDs for an activity type's access."""
        rows = self.db.query(ActivityTypeAccess).filter_by(activity_type_id=activity_type_id).all()
        return [r.dimension_value_id for r in rows]

    def update_access(
        self, activity_type_id: uuid.UUID, dimension_value_ids: list[uuid.UUID]
    ) -> list[uuid.UUID]:
        """Bulk-replace an activity type's dimension access."""
        self.db.query(ActivityTypeAccess).filter_by(activity_type_id=activity_type_id).delete()
        for dv_id in dimension_value_ids:
            self.db.add(
                ActivityTypeAccess(
                    activity_type_id=activity_type_id,
                    dimension_value_id=dv_id,
                )
            )
        self.db.commit()
        return self.get_access(activity_type_id)

    def list_all_access(self, org_id: uuid.UUID) -> list[dict]:
        """List access for all activity types in the org.

        Returns a list of {activity_type_id, dimension_value_ids} dicts.
        """
        rows = (
            self.db.query(ActivityTypeAccess)
            .join(ActivityType, ActivityTypeAccess.activity_type_id == ActivityType.id)
            .filter(ActivityType.organization_id == org_id)
            .all()
        )
        # Group by activity_type_id
        access_map: dict[uuid.UUID, list[uuid.UUID]] = {}
        for row in rows:
            access_map.setdefault(row.activity_type_id, []).append(row.dimension_value_id)
        return [
            {"activity_type_id": at_id, "dimension_value_ids": dv_ids}
            for at_id, dv_ids in access_map.items()
        ]


class FacilitatorService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(self, org_id: uuid.UUID) -> list[Facilitator]:
        return self.db.query(Facilitator).filter_by(organization_id=org_id).all()

    def get_by_id(self, facilitator_id: uuid.UUID, org_id: uuid.UUID) -> Facilitator:
        facilitator = (
            self.db.query(Facilitator).filter_by(id=facilitator_id, organization_id=org_id).first()
        )
        if not facilitator:
            raise NotFoundError("Facilitator not found")
        return facilitator

    def create(self, org_id: uuid.UUID, data: dict) -> Facilitator:
        facilitator = Facilitator(organization_id=org_id, **data)
        self.db.add(facilitator)
        self.db.commit()
        self.db.refresh(facilitator)
        return facilitator

    def update(self, facilitator_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> Facilitator:
        facilitator = self.get_by_id(facilitator_id, org_id)
        for key, value in data.items():
            if value is not None:
                setattr(facilitator, key, value)
        self.db.commit()
        self.db.refresh(facilitator)
        return facilitator

    def delete(self, facilitator_id: uuid.UUID, org_id: uuid.UUID) -> None:
        facilitator = self.get_by_id(facilitator_id, org_id)
        self.db.delete(facilitator)
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

        # If user has dimension access restrictions, filter activities
        # to those that have at least one matching tag
        if accessible_dv_ids:
            from sqlalchemy import exists

            query = query.filter(
                exists()
                .where(ActivityTag.activity_id == Activity.id)
                .where(ActivityTag.dimension_value_id.in_(accessible_dv_ids))
            )

        return (
            query.options(
                joinedload(Activity.activity_type),
                joinedload(Activity.activity_facilitators).joinedload(
                    ActivityFacilitator.facilitator
                ),
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
                joinedload(Activity.activity_type),
                joinedload(Activity.activity_facilitators).joinedload(
                    ActivityFacilitator.facilitator
                ),
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
        facilitator_ids: list[str],
        dimension_value_ids: list[str],
    ) -> Activity:
        # Verify activity type belongs to org
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

        # Add facilitators
        for fid in facilitator_ids:
            sf = ActivityFacilitator(activity_id=activity.id, facilitator_id=uuid.UUID(fid))
            self.db.add(sf)

        # Add dimension tags
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


class ParticipationService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_activity(self, activity_id: uuid.UUID) -> list[Participation]:
        return self.db.query(Participation).filter_by(activity_id=activity_id).all()

    def bulk_create(self, activity_id: uuid.UUID, records: list[dict]) -> list[Participation]:
        # Verify activity exists
        activity = self.db.query(Activity).filter_by(id=activity_id).first()
        if not activity:
            raise NotFoundError("Activity not found")

        # Delete existing participations, then recreate
        self.db.query(Participation).filter_by(activity_id=activity_id).delete()

        participations = []
        for record in records:
            p = Participation(
                activity_id=activity_id,
                beneficiary_id=uuid.UUID(record["beneficiary_id"]),
                status=record.get("status", "present"),
                meta=record.get("meta"),
            )
            self.db.add(p)
            participations.append(p)

        self.db.commit()
        for p in participations:
            self.db.refresh(p)
        return participations
