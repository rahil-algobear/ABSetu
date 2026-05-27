"""
Entity models: EntityType, Entity, CodeCounter
"""

from sqlalchemy import (
    Boolean,
    Column,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
    true,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.common.models.base_model import BaseModel


class EntityType(BaseModel):
    __tablename__ = "entity_types"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    key = Column(String, nullable=False)
    config = Column(JSONB, nullable=True, default=dict)
    sort_order = Column(Integer, nullable=False, default=0)
    can_enroll = Column(Boolean, nullable=False, default=True, server_default=true())

    organization = relationship("Organization", back_populates="entity_types")
    entities = relationship("Entity", back_populates="entity_type", lazy="dynamic")

    __table_args__ = (UniqueConstraint("organization_id", "key", name="uq_entity_type_org_key"),)


class Entity(BaseModel):
    __tablename__ = "entities"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entity_type_id = Column(
        UUID(as_uuid=True),
        ForeignKey("entity_types.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code = Column(String, nullable=True)
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    meta = Column(JSONB, nullable=True, default=dict)

    organization = relationship("Organization", back_populates="entities")
    entity_type = relationship("EntityType", back_populates="entities")
    enrollments = relationship("Enrollment", back_populates="entity", lazy="dynamic")
    dimensions = relationship(
        "EntityDimension",
        back_populates="entity",
        cascade="all, delete-orphan",
        lazy="joined",
    )

    __table_args__ = (
        Index(
            "uq_entity_code",
            "organization_id",
            "code",
            unique=True,
            postgresql_where=text("code IS NOT NULL"),
        ),
    )


class CodeCounter(BaseModel):
    __tablename__ = "code_counters"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    year = Column(String(2), nullable=False)
    last_serial = Column(Integer, nullable=False, default=0)

    __table_args__ = (UniqueConstraint("organization_id", "year", name="uq_code_counter_org_year"),)
