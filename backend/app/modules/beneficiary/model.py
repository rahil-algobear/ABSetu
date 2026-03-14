"""
Beneficiary models: Beneficiary, Enrollment
"""
from sqlalchemy import Column, Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.common.models.base_model import BaseModel


class Beneficiary(BaseModel):
    __tablename__ = "beneficiaries"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    case_number = Column(String, nullable=False)
    name = Column(String, nullable=False)
    meta = Column(JSONB, nullable=True, default=dict)

    organization = relationship("Organization", back_populates="beneficiaries")
    enrollments = relationship(
        "Enrollment", back_populates="beneficiary", lazy="dynamic"
    )
    attendances = relationship(
        "Attendance", back_populates="beneficiary", lazy="dynamic"
    )

    __table_args__ = (
        UniqueConstraint(
            "organization_id", "case_number", name="uq_beneficiary_case_number"
        ),
    )


class Enrollment(BaseModel):
    __tablename__ = "enrollments"

    beneficiary_id = Column(
        UUID(as_uuid=True),
        ForeignKey("beneficiaries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    programme_center_id = Column(
        UUID(as_uuid=True),
        ForeignKey("programme_centers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    admission_date = Column(Date, nullable=False)
    release_date = Column(Date, nullable=True)
    meta = Column(JSONB, nullable=True, default=dict)

    beneficiary = relationship("Beneficiary", back_populates="enrollments")
    programme_center = relationship(
        "ProgrammeCenter", back_populates="enrollments"
    )
