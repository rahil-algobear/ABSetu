"""
Organization models
"""

from sqlalchemy import Column, ForeignKey, String, UniqueConstraint, VARCHAR
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.common.models.base_model import BaseModel


class Organization(BaseModel):
    __tablename__ = "organizations"

    name = Column(String, nullable=False)
    code = Column(String, nullable=False, unique=True)
    case_number_format = Column(String, nullable=False, default="{ORG_CODE}-{SERIAL}")
    logo_url = Column(VARCHAR(2048), nullable=True)
    meta = Column(JSONB, nullable=True, default=dict)

    dimensions = relationship("Dimension", back_populates="organization", lazy="dynamic")
    activity_categories = relationship(
        "ActivityCategory", back_populates="organization", lazy="dynamic"
    )
    entity_types = relationship("EntityType", back_populates="organization", lazy="dynamic")
    entities = relationship("Entity", back_populates="organization", lazy="dynamic")
    roles = relationship("Role", back_populates="organization", lazy="dynamic")
    meta_field_schemas = relationship(
        "MetaFieldSchema", back_populates="organization", lazy="dynamic"
    )
    activity_forms = relationship("ActivityForm", back_populates="organization", lazy="dynamic")


class MetaFieldSchema(BaseModel):
    __tablename__ = "meta_field_schemas"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scope_key = Column(String, nullable=False)
    fields = Column(JSONB, nullable=False, default=list)

    organization = relationship("Organization", back_populates="meta_field_schemas")

    __table_args__ = (
        UniqueConstraint("organization_id", "scope_key", name="uq_meta_field_schema_org_scope"),
    )
