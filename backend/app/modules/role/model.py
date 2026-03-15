"""
Role and Permission models
"""
from sqlalchemy import Boolean, Column, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.common.models.base_model import BaseModel


class Permission(BaseModel):
    __tablename__ = "permissions"

    key = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)

    role_permissions = relationship(
        "RolePermission", back_populates="permission", lazy="dynamic"
    )


class Role(BaseModel):
    __tablename__ = "roles"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    is_default = Column(Boolean, nullable=False, default=False)
    is_system = Column(Boolean, nullable=False, default=False)

    organization = relationship("Organization", back_populates="roles")
    role_permissions = relationship(
        "RolePermission", back_populates="role", lazy="joined"
    )
    users = relationship("User", back_populates="role", lazy="dynamic")

    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_role_org_name"),
    )


class RolePermission(BaseModel):
    __tablename__ = "role_permissions"

    role_id = Column(
        UUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    permission_id = Column(
        UUID(as_uuid=True),
        ForeignKey("permissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    role = relationship("Role", back_populates="role_permissions")
    permission = relationship("Permission", back_populates="role_permissions")

    __table_args__ = (
        UniqueConstraint(
            "role_id", "permission_id", name="uq_role_permission"
        ),
    )
