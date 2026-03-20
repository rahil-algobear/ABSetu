"""
Dashboard service — aggregates stats across modules
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import exists, func, or_
from sqlalchemy.orm import Session, Query

from app.modules.activity.model import Activity, ActivityForm, ActivityType, ActivityParticipant
from app.modules.entity.model import Entity, EntityType
from app.modules.beneficiary.model import Enrollment
from app.modules.auth.model import User
from app.modules.dimension.model import ActivityDimension, DimensionValue, EntityDimension
from app.modules.dashboard.schemas import (
    CountByItem,
    DashboardStats,
    RecentActivity,
    TimeSeriesPoint,
)


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def _get_restricted_dims(
        self, accessible_dv_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[uuid.UUID]]:
        """Group user's accessible dimension value IDs by dimension."""
        dv_dim_rows = (
            self.db.query(DimensionValue.id, DimensionValue.dimension_id)
            .filter(DimensionValue.id.in_(accessible_dv_ids))
            .all()
        )
        restricted_dims: dict[uuid.UUID, list[uuid.UUID]] = {}
        for dv_id, dim_id in dv_dim_rows:
            restricted_dims.setdefault(dim_id, []).append(dv_id)
        return restricted_dims

    def _apply_activity_access_scoping(
        self,
        query: Query,
        restricted_dims: dict[uuid.UUID, list[uuid.UUID]],
    ) -> Query:
        """Apply per-dimension user-access scoping to an Activity query."""
        for dim_id, allowed_ids in restricted_dims.items():
            dim_values_subq = (
                self.db.query(DimensionValue.id)
                .filter(DimensionValue.dimension_id == dim_id)
                .subquery()
            )
            query = query.filter(
                or_(
                    ~exists()
                    .where(ActivityDimension.activity_id == Activity.id)
                    .where(ActivityDimension.dimension_value_id.in_(dim_values_subq))
                    .correlate(Activity),
                    exists()
                    .where(ActivityDimension.activity_id == Activity.id)
                    .where(ActivityDimension.dimension_value_id.in_(allowed_ids))
                    .correlate(Activity),
                )
            )
        return query

    def _apply_entity_access_scoping(
        self,
        query: Query,
        restricted_dims: dict[uuid.UUID, list[uuid.UUID]],
    ) -> Query:
        """Apply per-dimension user-access scoping to an Entity query."""
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
                    .where(EntityDimension.dimension_value_id.in_(dim_values_subq))
                    .correlate(Entity),
                    exists()
                    .where(EntityDimension.entity_id == Entity.id)
                    .where(EntityDimension.dimension_value_id.in_(allowed_ids))
                    .correlate(Entity),
                )
            )
        return query

    def _apply_enrollment_access_scoping(
        self,
        query: Query,
        restricted_dims: dict[uuid.UUID, list[uuid.UUID]],
    ) -> Query:
        """
        Scope enrollments through their parent entity's dimensions.

        Enrollment endpoints don't use EnrollmentDimension for access control,
        so we scope via Entity → EntityDimension instead.
        """
        # Build a subquery of entity IDs the user can access
        accessible_entities_q = self.db.query(Entity.id)
        for dim_id, allowed_ids in restricted_dims.items():
            dim_values_subq = (
                self.db.query(DimensionValue.id)
                .filter(DimensionValue.dimension_id == dim_id)
                .subquery()
            )
            accessible_entities_q = accessible_entities_q.filter(
                or_(
                    ~exists()
                    .where(EntityDimension.entity_id == Entity.id)
                    .where(EntityDimension.dimension_value_id.in_(dim_values_subq))
                    .correlate(Entity),
                    exists()
                    .where(EntityDimension.entity_id == Entity.id)
                    .where(EntityDimension.dimension_value_id.in_(allowed_ids))
                    .correlate(Entity),
                )
            )
        query = query.filter(
            Enrollment.entity_id.in_(
                accessible_entities_q.correlate(None).subquery()
            )
        )
        return query

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
        accessible_dv_ids: list[uuid.UUID] | None = None,
    ) -> DashboardStats:
        org_filter = {"organization_id": organization_id}
        has_filters = bool(dimension_value_ids or activity_type_id)

        # Validate manual filters are within user's accessible scope
        from app.modules.dimension.service import UserDimensionAccessService

        UserDimensionAccessService(self.db).validate_dimension_values(
            accessible_dv_ids, dimension_value_ids or []
        )

        # Pre-compute restricted dimensions for user-access scoping
        restricted_dims = self._get_restricted_dims(accessible_dv_ids) if accessible_dv_ids else {}

        # --- Totals ---
        entity_count_q = self.db.query(func.count(Entity.id)).filter_by(**org_filter)
        if restricted_dims:
            entity_count_q = self._apply_entity_access_scoping(entity_count_q, restricted_dims)
        total_entities = entity_count_q.scalar() or 0

        # Activity count respects filters
        activity_count_q = self.db.query(func.count(Activity.id)).filter_by(**org_filter)
        activity_count_q = self._apply_activity_filters(
            activity_count_q, dimension_value_ids, activity_type_id
        )
        if restricted_dims:
            activity_count_q = self._apply_activity_access_scoping(activity_count_q, restricted_dims)
        total_activities = activity_count_q.scalar() or 0

        enrollment_count_q = self.db.query(func.count(Enrollment.id)).filter_by(**org_filter)
        if restricted_dims:
            enrollment_count_q = self._apply_enrollment_access_scoping(enrollment_count_q, restricted_dims)
        total_enrollments = enrollment_count_q.scalar() or 0

        active_enrollment_q = (
            self.db.query(func.count(Enrollment.id))
            .filter_by(**org_filter)
            .filter(Enrollment.release_date.is_(None))
        )
        if restricted_dims:
            active_enrollment_q = self._apply_enrollment_access_scoping(active_enrollment_q, restricted_dims)
        active_enrollments = active_enrollment_q.scalar() or 0

        total_users = self.db.query(func.count(User.id)).filter_by(**org_filter).scalar() or 0

        # --- Entities by type ---
        entity_type_q = (
            self.db.query(EntityType.name, func.count(Entity.id))
            .join(Entity, Entity.entity_type_id == EntityType.id)
            .filter(Entity.organization_id == organization_id)
        )
        if restricted_dims:
            entity_type_q = self._apply_entity_access_scoping(entity_type_q, restricted_dims)
        entities_by_type_rows = (
            entity_type_q.group_by(EntityType.name)
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
        if restricted_dims:
            type_q = self._apply_activity_access_scoping(type_q, restricted_dims)
        activities_by_type_rows = (
            type_q.group_by(ActivityType.name)
            .order_by(func.count(Activity.id).desc())
            .all()
        )
        activities_by_type = [CountByItem(label=name, count=cnt) for name, cnt in activities_by_type_rows]

        # --- Activities by dimension value (with filters) ---
        from app.modules.dimension.model import Dimension

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
        if restricted_dims:
            dim_q = self._apply_activity_access_scoping(dim_q, restricted_dims)
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
        if restricted_dims:
            time_q = self._apply_activity_access_scoping(time_q, restricted_dims)
        activities_over_time_rows = time_q.group_by("period").order_by("period").all()
        activities_over_time = [TimeSeriesPoint(period=p, count=c) for p, c in activities_over_time_rows]

        # --- Enrollments over time (last 12 months) ---
        enroll_time_q = (
            self.db.query(
                func.to_char(Enrollment.admission_date, "YYYY-MM").label("period"),
                func.count(Enrollment.id),
            )
            .filter(
                Enrollment.organization_id == organization_id,
                Enrollment.admission_date >= twelve_months_ago,
            )
        )
        if restricted_dims:
            enroll_time_q = self._apply_enrollment_access_scoping(enroll_time_q, restricted_dims)
        enrollments_over_time_rows = (
            enroll_time_q.group_by("period")
            .order_by("period")
            .all()
        )
        enrollments_over_time = [TimeSeriesPoint(period=p, count=c) for p, c in enrollments_over_time_rows]

        # --- Recent activities (last 10, with filters) ---
        from sqlalchemy.orm import joinedload
        from app.modules.dimension.model import DimensionValue as DV2, Dimension as Dim2

        recent_q = (
            self.db.query(Activity)
            .filter_by(**org_filter)
            .options(
                joinedload(Activity.activity_type),
                joinedload(Activity.dimensions)
                .joinedload(ActivityDimension.dimension_value)
                .joinedload(DV2.dimension),
            )
        )
        recent_q = self._apply_activity_filters(
            recent_q, dimension_value_ids, activity_type_id
        )
        if restricted_dims:
            recent_q = self._apply_activity_access_scoping(recent_q, restricted_dims)
        recent_rows = (
            recent_q.order_by(Activity.start_date.desc(), Activity.created_at.desc())
            .limit(10)
            .all()
        )

        # Load forms for title resolution
        forms_by_type: dict[str, ActivityForm | None] = {}
        for a in recent_rows:
            key = str(a.activity_type_id) if a.activity_type_id else None
            if key and key not in forms_by_type:
                forms_by_type[key] = (
                    self.db.query(ActivityForm)
                    .filter_by(activity_type_id=a.activity_type_id, organization_id=organization_id)
                    .first()
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

            # Resolve title
            title = a.title
            form = forms_by_type.get(str(a.activity_type_id)) if a.activity_type_id else None
            if not title and form and form.elements:
                title_el = next(
                    (el for el in form.elements
                     if el.get("type") == "default" and el.get("ref_id") == "title"),
                    None,
                )
                if title_el:
                    config = title_el.get("config") or {}
                    if config.get("mode") == "generated":
                        dim_ids = config.get("dimension_ids", [])
                        separator = config.get("separator", " - ")
                        parts = []
                        for dim_id in dim_ids:
                            for d in a.dimensions or []:
                                dv = d.dimension_value
                                if dv and dv.dimension and str(dv.dimension.id) == dim_id:
                                    parts.append(dv.name)
                                    break
                        if parts:
                            title = separator.join(parts)

            recent_activities.append(
                RecentActivity(
                    id=str(a.id),
                    date=str(a.start_date),
                    title=title,
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
