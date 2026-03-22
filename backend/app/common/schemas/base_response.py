"""
Base Response Schemas
Common response serialization schemas for all modules
"""

import uuid as _uuid
from datetime import date as _date
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, model_validator


def _coerce_value(v: Any) -> Any:
    """Coerce a single value: UUID → str, datetime → ISO string, date → YYYY-MM-DD."""
    if isinstance(v, _uuid.UUID):
        return str(v)
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, _date):
        return v.isoformat()
    return v


class BaseResponseSchema(BaseModel):
    """
    Base response schema.
    - Converts datetime to ISO 8601 strings
    - Converts date to YYYY-MM-DD strings
    - Automatically converts UUID values to strings
    - Supports dump() with include/exclude patterns

    Child classes can override `_exclude` or `_include` class variables.
    """

    id: str | None = None
    created_at: str | None = None  # ISO 8601
    updated_at: str | None = None  # ISO 8601

    _exclude: dict[str, Any] | None = None
    _include: set[str] | None = None

    @model_validator(mode="before")
    @classmethod
    def _coerce_uuids_and_datetimes(cls, data: Any) -> Any:
        """Convert UUID values to str and datetime/date to ISO strings before field validation."""
        if isinstance(data, dict):
            return {
                k: _coerce_value(v)
                for k, v in data.items()
            }
        # ORM model with from_attributes — read declared fields and coerce
        if hasattr(data, "__dict__"):
            out: dict[str, Any] = {}
            for name in cls.model_fields:
                val = getattr(data, name, None)
                out[name] = _coerce_value(val)
            return out
        return data

    def model_dump(self, **kwargs) -> dict:
        """Override to handle nested BaseResponseSchema instances."""
        processed_fields = {}
        for field_name in self.model_fields.keys():
            field_value = getattr(self, field_name, None)
            if isinstance(field_value, BaseResponseSchema):
                processed_fields[field_name] = field_value.dump()
            elif isinstance(field_value, list):
                processed_fields[field_name] = [
                    item.dump() if isinstance(item, BaseResponseSchema) else item
                    for item in field_value
                ]

        result = super().model_dump(**kwargs)
        result.update(processed_fields)
        return result

    def dump(self) -> dict:
        """Dump with schema-specific includes/excludes."""
        return self.model_dump(
            include=self._include if self._include else None,
            exclude=self._exclude if self._exclude else None,
        )

    @classmethod
    def dump_from_model(cls, model: Any) -> dict:
        """Validate from a model instance and dump."""
        instance = cls.model_validate(model)
        return instance.dump()

    model_config = ConfigDict(from_attributes=True)


class PaginatedResponse(BaseModel):
    """Base paginated response format: {"count": int, "data": [...]}"""

    count: int
    data: list[Any]

    model_config = ConfigDict(from_attributes=True)
