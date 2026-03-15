"""
Role and Permission schemas
"""

from pydantic import BaseModel, Field

from app.common.schemas.base_response import BaseResponseSchema

# --- Permission ---


class PermissionResponse(BaseResponseSchema):
    key: str
    description: str | None = None


# --- Role ---


class RoleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    is_default: bool = False
    permission_ids: list[str] = []


class RoleUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    is_default: bool | None = None
    permission_ids: list[str] | None = None


class RoleResponse(BaseResponseSchema):
    organization_id: str
    name: str
    is_default: bool
    is_system: bool = False
    permissions: list[PermissionResponse] = []
    user_count: int = 0
