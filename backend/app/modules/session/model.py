"""
Session models: SessionTemplate, Session, Facilitator, SessionFacilitator, Attendance
"""
from sqlalchemy import Column, Date, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.common.models.base_model import BaseModel


class SessionTemplate(BaseModel):
    __tablename__ = "session_templates"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    meta = Column(JSONB, nullable=True, default=dict)

    organization = relationship("Organization", back_populates="session_templates")
    sessions = relationship(
        "Session", back_populates="session_template", lazy="dynamic"
    )


class Facilitator(BaseModel):
    __tablename__ = "facilitators"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    contact = Column(String, nullable=True)
    meta = Column(JSONB, nullable=True, default=dict)

    organization = relationship("Organization", back_populates="facilitators")
    session_facilitators = relationship(
        "SessionFacilitator", back_populates="facilitator", lazy="dynamic"
    )


class Session(BaseModel):
    __tablename__ = "sessions"

    session_template_id = Column(
        UUID(as_uuid=True),
        ForeignKey("session_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    programme_center_id = Column(
        UUID(as_uuid=True),
        ForeignKey("programme_centers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    meta = Column(JSONB, nullable=True, default=dict)

    session_template = relationship("SessionTemplate", back_populates="sessions")
    programme_center = relationship(
        "ProgrammeCenter", back_populates="sessions"
    )
    session_facilitators = relationship(
        "SessionFacilitator", back_populates="session", lazy="joined"
    )
    attendances = relationship(
        "Attendance", back_populates="session", lazy="dynamic"
    )


class SessionFacilitator(BaseModel):
    __tablename__ = "session_facilitators"

    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    facilitator_id = Column(
        UUID(as_uuid=True),
        ForeignKey("facilitators.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    session = relationship("Session", back_populates="session_facilitators")
    facilitator = relationship(
        "Facilitator", back_populates="session_facilitators"
    )

    __table_args__ = (
        UniqueConstraint(
            "session_id", "facilitator_id", name="uq_session_facilitator"
        ),
    )


class Attendance(BaseModel):
    __tablename__ = "attendances"

    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    beneficiary_id = Column(
        UUID(as_uuid=True),
        ForeignKey("beneficiaries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = Column(String, nullable=False, default="present")

    session = relationship("Session", back_populates="attendances")
    beneficiary = relationship("Beneficiary", back_populates="attendances")

    __table_args__ = (
        UniqueConstraint(
            "session_id", "beneficiary_id", name="uq_session_beneficiary"
        ),
    )
