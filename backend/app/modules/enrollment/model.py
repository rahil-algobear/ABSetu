"""
Enrollment model
"""

from sqlalchemy import Boolean, Column, ForeignKey, true
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.common.models.base_model import BaseModel


class Enrollment(BaseModel):
    __tablename__ = "enrollments"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    meta = Column(JSONB, nullable=True, default=dict)
    is_active = Column(Boolean, nullable=False, default=True, server_default=true())

    entity = relationship("Entity", back_populates="enrollments")
    dimensions = relationship(
        "EnrollmentDimension",
        back_populates="enrollment",
        cascade="all, delete-orphan",
        lazy="joined",
    )
