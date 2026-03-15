"""
Base Response Schemas
Common response serialization schemas for all modules
"""
import uuid as _uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


class BaseResponseSchema(BaseModel):
    """
    Base response schema.
    - Excludes created_at by default
    - Converts datetime to Unix timestamp
    - Automatically converts UUID values to strings
    - Supports dump() with include/exclude patterns

    Child classes can override `_exclude` or `_include` class variables.
    """

    id: str | None = None
    updated_at: float | None = None  # Unix timestamp

    _exclude: dict[str, Any] | None = None
    _include: set[str] | None = None

    @model_validator(mode="before")
    @classmethod
    def _coerce_uuids_and_timestamps(cls, data: Any) -> Any:
        """Convert UUID values to str and datetime to timestamps before field validation."""
        if isinstance(data, dict):
            return {
                k: str(v) if isinstance(v, _uuid.UUID) else v
                for k, v in data.items()
            }
        # ORM model with from_attributes — read declared fields and coerce
        if hasattr(data, "__dict__"):
            out: dict[str, Any] = {}
            for name in cls.model_fields:
                val = getattr(data, name, None)
                if isinstance(val, _uuid.UUID):
                    out[name] = str(val)
                elif isinstance(val, datetime):
                    out[name] = val.timestamp()
                else:
                    out[name] = val
            return out
        return data

    @classmethod
    def convert_datetime_to_timestamp(cls, v):
        """Convert datetime to timestamp, handling None."""
        if v is None:
            return None
        if isinstance(v, datetime):
            return v.timestamp()
        return v

    @field_validator("updated_at", mode="before")
    @classmethod
    def convert_timestamp(cls, v):
        """Convert datetime to timestamp"""
        return cls.convert_datetime_to_timestamp(v)

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
