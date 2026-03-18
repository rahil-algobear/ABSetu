"""
Dashboard response schemas
"""

from pydantic import BaseModel


class CountByItem(BaseModel):
    label: str
    count: int


class TimeSeriesPoint(BaseModel):
    period: str  # YYYY-MM
    count: int


class RecentActivity(BaseModel):
    id: str
    date: str
    type_name: str | None
    category_name: str | None
    notes: str | None
    participant_count: int


class DashboardStats(BaseModel):
    total_entities: int
    total_activities: int
    total_enrollments: int
    active_enrollments: int
    total_users: int
    entities_by_type: list[CountByItem]
    activities_by_category: list[CountByItem]
    activities_by_type: list[CountByItem]
    activities_by_dimension: dict[str, list[CountByItem]]
    activities_over_time: list[TimeSeriesPoint]
    enrollments_over_time: list[TimeSeriesPoint]
    recent_activities: list[RecentActivity]
