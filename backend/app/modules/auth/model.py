"""
Auth models: User, OTP, and RefreshToken
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.common.models.base_model import BaseModel


class User(BaseModel):
    __tablename__ = "users"

    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    country_code = Column(String, nullable=False)
    mobile_number = Column(String, nullable=False, unique=True, index=True)
    is_verified = Column(Boolean, default=False)
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    role_id = Column(
        UUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    organization = relationship("Organization")
    role = relationship("Role", back_populates="users")
    center_access = relationship(
        "UserCenterAccess", back_populates="user", cascade="all, delete-orphan"
    )
    programme_access = relationship(
        "UserProgrammeAccess", back_populates="user", cascade="all, delete-orphan"
    )
    session_template_access = relationship(
        "UserSessionTemplateAccess", back_populates="user", cascade="all, delete-orphan"
    )


class UserCenterAccess(BaseModel):
    __tablename__ = "user_center_access"
    __table_args__ = (UniqueConstraint("user_id", "center_id", name="uq_user_center_access"),)

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    center_id = Column(
        UUID(as_uuid=True),
        ForeignKey("centers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user = relationship("User", back_populates="center_access")
    center = relationship("Center")


class UserProgrammeAccess(BaseModel):
    __tablename__ = "user_programme_access"
    __table_args__ = (UniqueConstraint("user_id", "programme_id", name="uq_user_programme_access"),)

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    programme_id = Column(
        UUID(as_uuid=True),
        ForeignKey("programmes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user = relationship("User", back_populates="programme_access")
    programme = relationship("Programme")


class UserSessionTemplateAccess(BaseModel):
    __tablename__ = "user_session_template_access"
    __table_args__ = (
        UniqueConstraint("user_id", "session_template_id", name="uq_user_session_template_access"),
    )

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_template_id = Column(
        UUID(as_uuid=True),
        ForeignKey("session_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user = relationship("User", back_populates="session_template_access")
    session_template = relationship("SessionTemplate")


class OTP(BaseModel):
    __tablename__ = "otps"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    otp_code = Column(String, nullable=False)


class RefreshToken(BaseModel):
    """
    DB-backed refresh tokens for secure session management.

    Stores a SHA-256 hash of the raw token (never the raw token itself).
    Supports revocation, rotation, and session tracking.
    """

    __tablename__ = "refresh_tokens"

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked = Column(Boolean, nullable=False, default=False)
    user_agent = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
