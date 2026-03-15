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
    enrollments = relationship("Enrollment", back_populates="beneficiary", lazy="dynamic")
    participations = relationship("Participation", back_populates="beneficiary", lazy="dynamic")
    tags = relationship(
        "BeneficiaryTag",
        back_populates="beneficiary",
        cascade="all, delete-orphan",
        lazy="joined",
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "case_number", name="uq_beneficiary_case_number"),
    )


class Enrollment(BaseModel):
    __tablename__ = "enrollments"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    beneficiary_id = Column(
        UUID(as_uuid=True),
        ForeignKey("beneficiaries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    admission_date = Column(Date, nullable=False)
    release_date = Column(Date, nullable=True)
    meta = Column(JSONB, nullable=True, default=dict)

    beneficiary = relationship("Beneficiary", back_populates="enrollments")
    tags = relationship(
        "EnrollmentTag",
        back_populates="enrollment",
        cascade="all, delete-orphan",
        lazy="joined",
    )
