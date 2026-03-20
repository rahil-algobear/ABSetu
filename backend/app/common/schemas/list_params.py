"""
Reusable query parameter schemas for list endpoints.
Provides pagination, sorting, and search support.
"""

from pydantic import BaseModel, Field


class PaginateParams(BaseModel):
    page: int = Field(1, ge=1, description="Page number (1-indexed)")
    limit: int = Field(25, ge=1, le=100, description="Items per page")


class PaginateSortParams(PaginateParams):
    sort_by: str | None = Field(None, description="Column or meta field key to sort by")
    sort_order: str = Field("desc", pattern="^(asc|desc)$", description="Sort direction")


class ListParams(PaginateSortParams):
    search: str | None = Field(None, description="Search term for text columns")
    filters: str | None = Field(None, description="JSON-encoded filter dict")
