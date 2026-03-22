"""
Dashboard routes
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import get_accessible_dimension_value_ids, get_current_user
from app.modules.auth.model import User
from app.modules.dashboard.schemas import DashboardStats
from app.modules.dashboard.service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
def get_dashboard_stats(
    dimension_value_ids: list[str] = Query(default=[]),
    activity_type_id: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    """Get aggregated dashboard statistics for the current organization."""
    service = DashboardService(db)
    return service.get_stats(
        organization_id=current_user.organization_id,
        dimension_value_ids=dimension_value_ids or None,
        activity_type_id=activity_type_id,
        accessible_dv_ids=accessible_dv_ids,
    )
