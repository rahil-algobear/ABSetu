"""
Reusable query parameter schemas for list endpoints.
Provides pagination, sorting, and search support.
"""

from pydantic import BaseModel, Field


class PaginateParams(BaseModel):
    page: int = Field(1, ge=1, description="Page number (1-indexed)")
    # The hard cap is enforced per-route via Query(..., le=N). This
    # schema only validates the lower bound and a generous upper
    # bound; internal callers (e.g. the picker's enrolled-cohort
    # fetch) may legitimately ask for several hundred rows without
    # tripping validation here.
    limit: int = Field(
        25, ge=1, le=1000, description="Items per page"
    )


class PaginateSortParams(PaginateParams):
    sort_by: str | None = Field(None, description="Column or meta field key to sort by")
    sort_order: str = Field("desc", pattern="^(asc|desc)$", description="Sort direction")


class ListParams(PaginateSortParams):
    search: str | None = Field(None, description="Search term for text columns")
    filters: str | None = Field(None, description="JSON-encoded filter dict")
