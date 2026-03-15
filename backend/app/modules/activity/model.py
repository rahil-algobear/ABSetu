"""
Activity models: ActivityType, Activity, Facilitator, ActivityFacilitator, Participation
"""

from sqlalchemy import Column, Date, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.common.models.base_model import BaseModel


class ActivityType(BaseModel):
    __tablename__ = "activity_types"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    meta = Column(JSONB, nullable=True, default=dict)

    organization = relationship("Organization", back_populates="activity_types")
    activities = relationship("Activity", back_populates="activity_type", lazy="dynamic")


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
    activity_facilitators = relationship(
        "ActivityFacilitator", back_populates="facilitator", lazy="dynamic"
    )


class Activity(BaseModel):
    __tablename__ = "activities"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_type_id = Column(
        UUID(as_uuid=True),
        ForeignKey("activity_types.id", ondelete="CASCADE"),
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

    activity_type = relationship("ActivityType", back_populates="activities")
    activity_facilitators = relationship(
        "ActivityFacilitator", back_populates="activity", lazy="joined"
    )
    participations = relationship("Participation", back_populates="activity", lazy="dynamic")
    tags = relationship(
        "ActivityTag",
        back_populates="activity",
        cascade="all, delete-orphan",
        lazy="joined",
    )


class ActivityFacilitator(BaseModel):
    __tablename__ = "activity_facilitators"

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    facilitator_id = Column(
        UUID(as_uuid=True),
        ForeignKey("facilitators.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    activity = relationship("Activity", back_populates="activity_facilitators")
    facilitator = relationship("Facilitator", back_populates="activity_facilitators")

    __table_args__ = (
        UniqueConstraint("activity_id", "facilitator_id", name="uq_activity_facilitator"),
    )


class Participation(BaseModel):
    __tablename__ = "participations"

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("activities.id", ondelete="CASCADE"),
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
    meta = Column(JSONB, nullable=True, default=dict)

    activity = relationship("Activity", back_populates="participations")
    beneficiary = relationship("Beneficiary", back_populates="participations")

    __table_args__ = (
        UniqueConstraint("activity_id", "beneficiary_id", name="uq_activity_beneficiary"),
    )
