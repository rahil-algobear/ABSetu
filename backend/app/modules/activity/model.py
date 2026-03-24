"""
Activity models: ActivityType, Activity, ActivityParticipant
"""

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
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
    key = Column(String, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)

    organization = relationship("Organization", back_populates="activity_types")

    __table_args__ = (UniqueConstraint("organization_id", "key", name="uq_activity_type_org_key"),)


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
        ForeignKey("activity_types.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    meta = Column(JSONB, nullable=True, default=dict)

    activity_type = relationship("ActivityType")
    participants = relationship("ActivityParticipant", back_populates="activity", lazy="dynamic")
    dimensions = relationship(
        "ActivityDimension",
        back_populates="activity",
        cascade="all, delete-orphan",
        lazy="joined",
    )


class ActivityParticipant(BaseModel):
    __tablename__ = "activity_participants"

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    participant_type = Column(String, nullable=False)  # "entity" or "user"
    participant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    section_key = Column(String, nullable=False)
    status = Column(String, nullable=True)
    meta = Column(JSONB, nullable=True, default=dict)

    activity = relationship("Activity", back_populates="participants")

    __table_args__ = (
        UniqueConstraint(
            "activity_id",
            "participant_type",
            "participant_id",
            name="uq_activity_participant",
        ),
    )
