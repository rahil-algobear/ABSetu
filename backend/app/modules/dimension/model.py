"""
Dimension models: Dimension, DimensionValue, DimensionValueLink, UserDimension
"""

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, UniqueConstraint, true
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.common.models.base_model import BaseModel


class Dimension(BaseModel):
    __tablename__ = "dimensions"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    key = Column(String, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    # When true, this dimension is used for access control and may
    # participate in DimensionValueLink rules. When false it behaves
    # as a free-form tag axis: still attachable to entities/activities,
    # but not assignable via UserDimension or referenced by links.
    is_dimension = Column(Boolean, nullable=False, default=True, server_default=true())

    organization = relationship("Organization", back_populates="dimensions")
    values = relationship(
        "DimensionValue",
        back_populates="dimension",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    __table_args__ = (UniqueConstraint("organization_id", "key", name="uq_dimension_org_key"),)


class DimensionValue(BaseModel):
    __tablename__ = "dimension_values"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dimension_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dimensions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    code = Column(String, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    meta = Column(JSONB, nullable=True, default=dict)

    dimension = relationship("Dimension", back_populates="values")
    organization = relationship("Organization")

    __table_args__ = (UniqueConstraint("dimension_id", "code", name="uq_dimension_value_code"),)


class DimensionValueLink(BaseModel):
    __tablename__ = "dimension_value_links"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dimension_value_id_1 = Column(
        UUID(as_uuid=True),
        ForeignKey("dimension_values.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dimension_value_id_2 = Column(
        UUID(as_uuid=True),
        ForeignKey("dimension_values.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    dimension_value_1 = relationship("DimensionValue", foreign_keys=[dimension_value_id_1])
    dimension_value_2 = relationship("DimensionValue", foreign_keys=[dimension_value_id_2])

    __table_args__ = (
        UniqueConstraint(
            "dimension_value_id_1",
            "dimension_value_id_2",
            name="uq_dimension_value_link_pair",
        ),
    )


class ActivityDimension(BaseModel):
    __tablename__ = "activity_dimensions"

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dimension_value_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dimension_values.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    activity = relationship("Activity", back_populates="dimensions")
    dimension_value = relationship("DimensionValue")

    __table_args__ = (
        UniqueConstraint("activity_id", "dimension_value_id", name="uq_activity_dimension"),
    )


class EntityDimension(BaseModel):
    __tablename__ = "entity_dimensions"

    entity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dimension_value_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dimension_values.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    entity = relationship("Entity", back_populates="dimensions")
    dimension_value = relationship("DimensionValue")

    __table_args__ = (
        UniqueConstraint("entity_id", "dimension_value_id", name="uq_entity_dimension"),
    )


class EnrollmentDimension(BaseModel):
    __tablename__ = "enrollment_dimensions"

    enrollment_id = Column(
        UUID(as_uuid=True),
        ForeignKey("enrollments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dimension_value_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dimension_values.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    enrollment = relationship("Enrollment", back_populates="dimensions")
    dimension_value = relationship("DimensionValue")

    __table_args__ = (
        UniqueConstraint("enrollment_id", "dimension_value_id", name="uq_enrollment_dimension"),
    )


class UserDimension(BaseModel):
    __tablename__ = "user_dimensions"

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dimension_value_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dimension_values.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user = relationship("User", back_populates="dimension_access")
    dimension_value = relationship("DimensionValue")

    __table_args__ = (UniqueConstraint("user_id", "dimension_value_id", name="uq_user_dimension"),)
