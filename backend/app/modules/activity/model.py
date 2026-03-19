"""
Activity models: ActivityCategory, ActivityForm, Activity, ActivityParticipant
"""

from sqlalchemy import Column, Date, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.common.models.base_model import BaseModel


class ActivityCategory(BaseModel):
    __tablename__ = "activity_categories"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    key = Column(String, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)

    organization = relationship("Organization", back_populates="activity_categories")
    form = relationship("ActivityForm", back_populates="category", uselist=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "key", name="uq_activity_category_org_key"),
    )


class ActivityForm(BaseModel):
    __tablename__ = "activity_forms"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_category_id = Column(
        UUID(as_uuid=True),
        ForeignKey("activity_categories.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    elements = Column(JSONB, nullable=False, default=list)

    organization = relationship("Organization", back_populates="activity_forms")
    category = relationship("ActivityCategory", back_populates="form")


class Activity(BaseModel):
    __tablename__ = "activities"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id = Column(
        UUID(as_uuid=True),
        ForeignKey("activity_categories.id", ondelete="SET NULL"),
        nullable=True,
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

    category = relationship("ActivityCategory")
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
