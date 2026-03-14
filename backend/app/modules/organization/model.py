"""
Organization and related models: Organization, Center, Programme, ProgrammeCentre
"""
from sqlalchemy import Column, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.common.models.base_model import BaseModel


class Organization(BaseModel):
    __tablename__ = "organizations"

    name = Column(String, nullable=False)
    code = Column(String, nullable=False, unique=True)
    case_number_format = Column(
        String, nullable=False, default="{ORG_CODE}-{SERIAL}"
    )
    meta = Column(JSONB, nullable=True, default=dict)

    centers = relationship("Center", back_populates="organization", lazy="dynamic")
    programmes = relationship(
        "Programme", back_populates="organization", lazy="dynamic"
    )
    session_templates = relationship(
        "SessionTemplate", back_populates="organization", lazy="dynamic"
    )
    facilitators = relationship(
        "Facilitator", back_populates="organization", lazy="dynamic"
    )
    beneficiaries = relationship(
        "Beneficiary", back_populates="organization", lazy="dynamic"
    )
    roles = relationship("Role", back_populates="organization", lazy="dynamic")


class Center(BaseModel):
    __tablename__ = "centers"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    code = Column(String, nullable=False)
    address = Column(Text, nullable=True)
    meta = Column(JSONB, nullable=True, default=dict)

    organization = relationship("Organization", back_populates="centers")
    programme_centers = relationship(
        "ProgrammeCenter", back_populates="center", lazy="dynamic"
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_center_org_code"),
    )


class Programme(BaseModel):
    __tablename__ = "programmes"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    meta = Column(JSONB, nullable=True, default=dict)

    organization = relationship("Organization", back_populates="programmes")
    programme_centers = relationship(
        "ProgrammeCenter", back_populates="programme", lazy="dynamic"
    )


class ProgrammeCenter(BaseModel):
    __tablename__ = "programme_centers"

    programme_id = Column(
        UUID(as_uuid=True),
        ForeignKey("programmes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    center_id = Column(
        UUID(as_uuid=True),
        ForeignKey("centers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    programme = relationship("Programme", back_populates="programme_centers")
    center = relationship("Center", back_populates="programme_centers")
    sessions = relationship("Session", back_populates="programme_center", lazy="dynamic")
    enrollments = relationship(
        "Enrollment", back_populates="programme_center", lazy="dynamic"
    )

    __table_args__ = (
        UniqueConstraint(
            "programme_id", "center_id", name="uq_programme_center"
        ),
    )
