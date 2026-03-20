"""
Dashboard service — aggregates stats across modules
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session, Query

from app.modules.activity.model import Activity, ActivityType, ActivityParticipant
from app.modules.entity.model import Entity, EntityType
from app.modules.beneficiary.model import Enrollment
from app.modules.auth.model import User
from app.modules.dimension.model import ActivityDimension
from app.modules.dashboard.schemas import (
    CountByItem,
    DashboardStats,
    RecentActivity,
    TimeSeriesPoint,
)


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def _apply_activity_filters(
        self,
        query: Query,
        dimension_value_ids: list[str] | None,
        activity_type_id: str | None,
        need_type_join: bool = False,
    ) -> Query:
        """Apply optional filters to an activity query."""
        if activity_type_id:
            query = query.filter(Activity.activity_type_id == activity_type_id)

        if dimension_value_ids:
            # Activity must have ALL selected dimension values
            for dv_id in dimension_value_ids:
                query = query.filter(
                    Activity.id.in_(
                        self.db.query(ActivityDimension.activity_id).filter(
                            ActivityDimension.dimension_value_id == dv_id
                        )
                    )
                )

        return query

    def get_stats(
        self,
        organization_id: uuid.UUID,
        dimension_value_ids: list[str] | None = None,
        activity_type_id: str | None = None,
    ) -> DashboardStats:
        org_filter = {"organization_id": organization_id}
        has_filters = bool(dimension_value_ids or activity_type_id)

        # --- Totals ---
        total_entities = self.db.query(func.count(Entity.id)).filter_by(**org_filter).scalar() or 0

        # Activity count respects filters
        activity_count_q = self.db.query(func.count(Activity.id)).filter_by(**org_filter)
        activity_count_q = self._apply_activity_filters(
            activity_count_q, dimension_value_ids, activity_type_id
        )
        total_activities = activity_count_q.scalar() or 0

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

        # --- Activities by type (with filters) ---
        type_q = (
            self.db.query(
                ActivityType.name,
                func.count(Activity.id),
            )
            .join(ActivityType, Activity.activity_type_id == ActivityType.id)
            .filter(Activity.organization_id == organization_id)
        )
        type_q = self._apply_activity_filters(
            type_q, dimension_value_ids, activity_type_id, need_type_join=True
        )
        activities_by_type_rows = (
            type_q.group_by(ActivityType.name)
            .order_by(func.count(Activity.id).desc())
            .all()
        )
        activities_by_type = [CountByItem(label=name, count=cnt) for name, cnt in activities_by_type_rows]

        # --- Activities by dimension value (with filters) ---
        from app.modules.dimension.model import DimensionValue, Dimension

        dim_q = (
            self.db.query(
                Dimension.name,
                DimensionValue.name,
                func.count(func.distinct(Activity.id)),
            )
            .join(ActivityDimension, ActivityDimension.activity_id == Activity.id)
            .join(DimensionValue, ActivityDimension.dimension_value_id == DimensionValue.id)
            .join(Dimension, DimensionValue.dimension_id == Dimension.id)
            .filter(Activity.organization_id == organization_id)
        )
        dim_q = self._apply_activity_filters(
            dim_q, dimension_value_ids, activity_type_id
        )
        activities_by_dimension_rows = (
            dim_q.group_by(Dimension.name, DimensionValue.name, Dimension.sort_order, DimensionValue.sort_order)
            .order_by(Dimension.sort_order, DimensionValue.sort_order)
            .all()
        )
        # Group into {dimension_name: [{label, count}]}
        activities_by_dimension: dict[str, list[CountByItem]] = {}
        for dim_name, val_name, cnt in activities_by_dimension_rows:
            if dim_name not in activities_by_dimension:
                activities_by_dimension[dim_name] = []
            activities_by_dimension[dim_name].append(CountByItem(label=val_name, count=cnt))

        # --- Activities over time (last 12 months, with filters) ---
        twelve_months_ago = date.today().replace(day=1) - timedelta(days=365)
        time_q = (
            self.db.query(
                func.to_char(Activity.start_date, "YYYY-MM").label("period"),
                func.count(Activity.id),
            )
            .filter(
                Activity.organization_id == organization_id,
                Activity.start_date >= twelve_months_ago,
            )
        )
        time_q = self._apply_activity_filters(
            time_q, dimension_value_ids, activity_type_id
        )
        activities_over_time_rows = time_q.group_by("period").order_by("period").all()
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

        # --- Recent activities (last 10, with filters) ---
        recent_q = (
            self.db.query(Activity)
            .filter_by(**org_filter)
        )
        recent_q = self._apply_activity_filters(
            recent_q, dimension_value_ids, activity_type_id
        )
        recent_rows = (
            recent_q.order_by(Activity.start_date.desc(), Activity.created_at.desc())
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
            type_name = a.activity_type.name if a.activity_type else None
            recent_activities.append(
                RecentActivity(
                    id=str(a.id),
                    date=str(a.start_date),
                    type_name=type_name,
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
            activities_by_type=activities_by_type,
            activities_by_dimension=activities_by_dimension,
            activities_over_time=activities_over_time,
            enrollments_over_time=enrollments_over_time,
            recent_activities=recent_activities,
        )
