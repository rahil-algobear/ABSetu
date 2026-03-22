"""
Organization models
"""

from sqlalchemy import Column, ForeignKey, Index, String, UniqueConstraint, VARCHAR, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.common.models.base_model import BaseModel

# Sentinel UUID for "user" entity type (staff participants).
# Used in entity_type_id when scope_type is "participant" and the section is for users.
USER_ENTITY_SENTINEL = "00000000-0000-0000-0000-000000000000"


class Organization(BaseModel):
    __tablename__ = "organizations"

    name = Column(String, nullable=False)
    code = Column(String, nullable=False, unique=True)
    case_number_format = Column(String, nullable=False, default="{ORG_CODE}-{SERIAL}")
    logo_url = Column(VARCHAR(2048), nullable=True)
    meta = Column(JSONB, nullable=True, default=dict)

    dimensions = relationship("Dimension", back_populates="organization", lazy="dynamic")
    activity_types = relationship("ActivityType", back_populates="organization", lazy="dynamic")
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
    scope_type = Column(String, nullable=False)
    entity_type_id = Column(
        UUID(as_uuid=True),
        ForeignKey("entity_types.id", ondelete="CASCADE"),
        nullable=True,
    )
    activity_type_id = Column(
        UUID(as_uuid=True),
        ForeignKey("activity_types.id", ondelete="CASCADE"),
        nullable=True,
    )
    dimension_value_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dimension_values.id", ondelete="CASCADE"),
        nullable=True,
    )
    dimension_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dimensions.id", ondelete="CASCADE"),
        nullable=True,
    )
    fields = Column(JSONB, nullable=False, default=list)

    # Keep scope_key as a read-only computed convenience (not stored).
    # The canonical identity is (org_id, scope_type, entity_type_id, activity_type_id, dimension_value_id, dimension_id).

    organization = relationship("Organization", back_populates="meta_field_schemas")

    __table_args__ = (
        # Unique index using COALESCE to treat NULLs as sentinel zeros for uniqueness.
        Index(
            "uq_meta_field_schema_scope",
            "organization_id",
            "scope_type",
            text("COALESCE(entity_type_id, '00000000-0000-0000-0000-000000000000')"),
            text("COALESCE(activity_type_id, '00000000-0000-0000-0000-000000000000')"),
            text("COALESCE(dimension_value_id, '00000000-0000-0000-0000-000000000000')"),
            text("COALESCE(dimension_id, '00000000-0000-0000-0000-000000000000')"),
            unique=True,
        ),
    )

    @property
    def scope_key(self) -> str:
        """Build a legacy-compatible scope_key string from structured columns."""
        if self.scope_type == "entity":
            return f"entity:{self.entity_type_id}"
        if self.scope_type == "dimension":
            return f"dimension:{self.dimension_id}"
        if self.scope_type in ("enrollment", "beneficiary", "facilitator"):
            return self.scope_type
        if self.scope_type == "activity":
            key = "activity"
            if self.activity_type_id:
                key += f":activity_type:{self.activity_type_id}"
            if self.dimension_value_id:
                key += f":dimension_value:{self.dimension_value_id}"
            return key
        if self.scope_type == "participation":
            return "participation"
        if self.scope_type == "participant":
            et_id = "user" if str(self.entity_type_id) == USER_ENTITY_SENTINEL else str(self.entity_type_id)
            key = f"participant:entity:{et_id}"
            if self.activity_type_id:
                key += f":activity_type:{self.activity_type_id}"
            if self.dimension_value_id:
                key += f":dimension_value:{self.dimension_value_id}"
            return key
        return self.scope_type


class ListConfig(BaseModel):
    __tablename__ = "list_configs"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scope = Column(String, nullable=False)  # "entity:{type_id}" or "activity:{type_id}"
    columns = Column(JSONB, nullable=False, default=list)

    organization = relationship("Organization")

    __table_args__ = (
        UniqueConstraint("organization_id", "scope", name="uq_list_config_org_scope"),
    )
