"""
Dashboard service — aggregates stats across modules
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import func, extract, case, literal_column
from sqlalchemy.orm import Session

from app.modules.activity.model import Activity, ActivityCategory, ActivityType, ActivityParticipant
from app.modules.entity.model import Entity, EntityType
from app.modules.beneficiary.model import Enrollment
from app.modules.auth.model import User
from app.modules.dashboard.schemas import (
    CountByItem,
    DashboardStats,
    RecentActivity,
    TimeSeriesPoint,
)


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def get_stats(self, organization_id: uuid.UUID) -> DashboardStats:
        org_filter = {"organization_id": organization_id}

        # --- Totals ---
        total_entities = self.db.query(func.count(Entity.id)).filter_by(**org_filter).scalar() or 0
        total_activities = self.db.query(func.count(Activity.id)).filter_by(**org_filter).scalar() or 0
        total_enrollments = self.db.query(func.count(Enrollment.id)).filter_by(**org_filter).scalar() or 0
        active_enrollments = (
            self.db.query(func.count(Enrollment.id))
            .filter_by(**org_filter)
            .filter(Enrollment.release_date.is_(None))
            .scalar()
            or 0
        )
        total_users = self.db.query(func.count(User.id)).filter_by(**org_filter).scalar() or 0

        # --- Entities by type ---
        entities_by_type_rows = (
            self.db.query(EntityType.name, func.count(Entity.id))
            .join(Entity, Entity.entity_type_id == EntityType.id)
            .filter(Entity.organization_id == organization_id)
            .group_by(EntityType.name)
            .order_by(func.count(Entity.id).desc())
            .all()
        )
        entities_by_type = [CountByItem(label=name, count=cnt) for name, cnt in entities_by_type_rows]

        # --- Activities by category ---
        activities_by_category_rows = (
            self.db.query(
                func.coalesce(ActivityCategory.name, "Uncategorized"),
                func.count(Activity.id),
            )
            .join(ActivityType, Activity.activity_type_id == ActivityType.id)
            .outerjoin(ActivityCategory, ActivityType.category_id == ActivityCategory.id)
            .filter(Activity.organization_id == organization_id)
            .group_by(ActivityCategory.name)
            .order_by(func.count(Activity.id).desc())
            .all()
        )
        activities_by_category = [CountByItem(label=name, count=cnt) for name, cnt in activities_by_category_rows]

        # --- Activities over time (last 12 months) ---
        twelve_months_ago = date.today().replace(day=1) - timedelta(days=365)
        activities_over_time_rows = (
            self.db.query(
                func.to_char(Activity.date, "YYYY-MM").label("period"),
                func.count(Activity.id),
            )
            .filter(
                Activity.organization_id == organization_id,
                Activity.date >= twelve_months_ago,
            )
            .group_by("period")
            .order_by("period")
            .all()
        )
        activities_over_time = [TimeSeriesPoint(period=p, count=c) for p, c in activities_over_time_rows]

        # --- Enrollments over time (last 12 months) ---
        enrollments_over_time_rows = (
            self.db.query(
                func.to_char(Enrollment.admission_date, "YYYY-MM").label("period"),
                func.count(Enrollment.id),
            )
            .filter(
                Enrollment.organization_id == organization_id,
                Enrollment.admission_date >= twelve_months_ago,
            )
            .group_by("period")
            .order_by("period")
            .all()
        )
        enrollments_over_time = [TimeSeriesPoint(period=p, count=c) for p, c in enrollments_over_time_rows]

        # --- Recent activities (last 10) ---
        recent_rows = (
            self.db.query(Activity)
            .filter_by(**org_filter)
            .order_by(Activity.date.desc(), Activity.created_at.desc())
            .limit(10)
            .all()
        )

        recent_activities = []
        for a in recent_rows:
            participant_count = (
                self.db.query(func.count(ActivityParticipant.id))
                .filter(ActivityParticipant.activity_id == a.id)
                .scalar()
                or 0
            )
            # Get type and category names via relationship
            type_name = a.activity_type.name if a.activity_type else None
            category_name = (
                a.activity_type.category.name
                if a.activity_type and a.activity_type.category
                else None
            )
            recent_activities.append(
                RecentActivity(
                    id=str(a.id),
                    date=str(a.date),
                    type_name=type_name,
                    category_name=category_name,
                    notes=a.notes,
                    participant_count=participant_count,
                )
            )

        return DashboardStats(
            total_entities=total_entities,
            total_activities=total_activities,
            total_enrollments=total_enrollments,
            active_enrollments=active_enrollments,
            total_users=total_users,
            entities_by_type=entities_by_type,
            activities_by_category=activities_by_category,
            activities_over_time=activities_over_time,
            enrollments_over_time=enrollments_over_time,
            recent_activities=recent_activities,
        )
