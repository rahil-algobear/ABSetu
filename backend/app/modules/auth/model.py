"""
Auth models: User, OTP, and RefreshToken
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
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
    dimension_access = relationship(
        "UserDimensionAccess",
        back_populates="user",
        cascade="all, delete-orphan",
    )


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
