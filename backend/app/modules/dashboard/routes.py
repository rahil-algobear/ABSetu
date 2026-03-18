"""
Dashboard routes
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import get_current_user
from app.modules.auth.model import User
from app.modules.dashboard.schemas import DashboardStats
from app.modules.dashboard.service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get aggregated dashboard statistics for the current organization."""
    service = DashboardService(db)
    return service.get_stats(current_user.organization_id)
