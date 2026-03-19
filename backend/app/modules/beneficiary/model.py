"""
Enrollment model (legacy beneficiary module — Beneficiary replaced by Entity)
"""

from sqlalchemy import Column, Date, ForeignKey
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
    admission_date = Column(Date, nullable=False)
    release_date = Column(Date, nullable=True)
    meta = Column(JSONB, nullable=True, default=dict)

    entity = relationship("Entity", back_populates="enrollments")
    dimensions = relationship(
        "EnrollmentDimension",
        back_populates="enrollment",
        cascade="all, delete-orphan",
        lazy="joined",
    )
