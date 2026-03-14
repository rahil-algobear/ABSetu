"""
Base Model Class
All SQLAlchemy models should inherit from this class
"""
import re
import uuid
from typing import Any, Optional

from sqlalchemy import Column, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declared_attr
from sqlalchemy.orm import Query

from app.core.database import Base


class BaseModel(Base):
    """
    Base model with common fields and helper methods.
    All models should inherit from this class.
    """

    __abstract__ = True

    id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False
    )
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    @declared_attr
    def __tablename__(cls) -> str:
        """Generate table name from class name (CamelCase → snake_case)"""
        name = re.sub(r"(?<!^)(?=[A-Z])", "_", cls.__name__).lower()
        return name

    @classmethod
    def get_order_by(
        cls,
        order_column_name: str = "",
        is_descending: bool = False,
        default_sort: Optional[Any] = None,
    ) -> Any:
        """Get order by clause for queries"""
        if order_column_name and order_column_name != "":
            order_column = getattr(cls, order_column_name, None)
            if order_column is not None:
                return order_column.desc() if is_descending else order_column.asc()

        return default_sort if default_sort is not None else cls.id.asc()

    @staticmethod
    def run_query(query: Query, offset: int = 1, limit: int = 10) -> list:
        """
        Run a query with pagination (1-indexed offset).
        """
        if limit is not None and limit > 0:
            safe_offset = offset if offset and offset >= 1 else 1
            skip = (safe_offset - 1) * limit
            return query.offset(skip).limit(limit).all()
        else:
            return query.all()

    def to_dict(self) -> dict[str, Any]:
        """Convert model instance to dictionary"""
        return {
            column.name: getattr(self, column.name)
            for column in self.__table__.columns
        }

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(id={self.id})>"
