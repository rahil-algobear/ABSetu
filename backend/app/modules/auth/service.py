"""
Auth services for user registration, login, and OTP verification
"""

import hashlib
import logging
import random
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import exc
from sqlalchemy.orm import Session

from app.common.helpers import secretbox
from app.common.helpers.smshelper import SMSHelper
from app.common.helpers.tokenhelper import TokenHelper
from app.core.config import settings
from app.modules.auth.model import OTP, RefreshToken, User

logger = logging.getLogger(__name__)


class OTPService:
    """Service for OTP generation and verification"""

    def __init__(self, db: Session):
        self.db = db
        self.sms_helper = SMSHelper()

    def generate_otp(self, length: int = 6) -> str:
        """Generate a random OTP of specified length."""
        return "".join(random.choices(string.digits, k=length))

    def create_otp_for_user(self, user: User) -> OTP:
        """Create and save a new OTP for a user."""
        try:
            otp_code = self.generate_otp()
            otp = OTP(user_id=user.id, otp_code=otp_code)
            self.db.add(otp)
            self.db.commit()
            self.db.refresh(otp)
            return otp
        except exc.SQLAlchemyError:
            self.db.rollback()
            raise

    def send_otp(self, country_code: str, mobile_number: str, otp_code: str) -> bool:
        """Send OTP via SMS or print to console in development."""
        return self.sms_helper.send_otp(country_code, mobile_number, otp_code)

    def verify_otp(self, user: User, otp_code: str) -> bool:
        """Verify if the provided OTP is valid for the user."""
        try:
            otp_expiry_minutes = settings.OTP_EXPIRY_MINUTES or 5
            expiry_time = datetime.now(timezone.utc) - timedelta(minutes=otp_expiry_minutes)

            otp = (
                self.db.query(OTP)
                .filter_by(user_id=user.id, otp_code=otp_code)
                .order_by(OTP.created_at.desc())
                .first()
            )

            if not otp:
                return False

            if otp.created_at and otp.created_at < expiry_time:
                return False

            user.is_verified = True
            self.db.commit()
            return True
        except exc.SQLAlchemyError:
            self.db.rollback()
            raise


class AuthService:
    """Service for user registration, login, and token management"""

    def __init__(self, db: Session):
        self.db = db
        self._otp_service: OTPService | None = None
        self._token_helper: TokenHelper | None = None

    @property
    def otp_service(self) -> OTPService:
        """Lazy-init OTP service."""
        if self._otp_service is None:
            self._otp_service = OTPService(self.db)
        return self._otp_service

    @property
    def token_helper(self) -> TokenHelper:
        """Lazy-init token helper."""
        if self._token_helper is None:
            self._token_helper = TokenHelper()
        return self._token_helper

    # ── Helpers ──────────────────────────────────────────────

    @staticmethod
    def _hash_token(raw_token: str) -> str:
        """SHA-256 hash a raw token for DB storage (never store raw tokens)."""
        return hashlib.sha256(raw_token.encode()).hexdigest()

    def _create_refresh_token(
        self,
        user_id: uuid.UUID,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> str:
        """
        Create an opaque refresh token, store its hash in the DB, return the raw token.

        The raw token is returned to the client; only the hash is persisted.
        """
        raw_token = secrets.token_urlsafe(48)
        token_hash = self._hash_token(raw_token)
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

        refresh_token = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            revoked=False,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self.db.add(refresh_token)
        self.db.commit()

        return raw_token

    # ── Public API ───────────────────────────────────────────

    def get_user_by_mobile(self, country_code: str, mobile_number: str) -> User | None:
        """Get user by mobile number and country code."""
        return (
            self.db.query(User)
            .filter_by(country_code=country_code, mobile_number=mobile_number)
            .first()
        )

    def register_user(
        self,
        first_name: str,
        last_name: str,
        country_code: str,
        mobile_number: str,
    ) -> User:
        """Register a new user and send OTP."""
        existing_user = self.get_user_by_mobile(country_code, mobile_number)
        if existing_user:
            raise ValueError("User already exists")

        try:
            new_user = User(
                first_name=first_name,
                last_name=last_name,
                country_code=country_code,
                mobile_number=mobile_number,
                is_verified=False,
            )
            self.db.add(new_user)
            self.db.commit()
            self.db.refresh(new_user)

            otp = self.otp_service.create_otp_for_user(new_user)
            self.otp_service.send_otp(country_code, mobile_number, otp.otp_code)

            return new_user
        except exc.SQLAlchemyError:
            self.db.rollback()
            raise

    def login_user(self, country_code: str, mobile_number: str) -> User:
        """Login a user by sending OTP."""
        user = self.get_user_by_mobile(country_code, mobile_number)
        if not user:
            raise ValueError("User not found. Please register.")

        otp = self.otp_service.create_otp_for_user(user)
        self.otp_service.send_otp(country_code, mobile_number, otp.otp_code)

        return user

    def verify_user_otp(
        self,
        country_code: str,
        mobile_number: str,
        otp_code: str,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> tuple[User, dict]:
        """Verify user OTP and return user + tokens if valid."""
        user = self.get_user_by_mobile(country_code, mobile_number)
        if not user:
            raise ValueError("User not found")

        if not self.otp_service.verify_otp(user, otp_code):
            raise ValueError("Invalid or expired OTP")

        # JWT access token
        token_data = {"sub": str(user.id), "mobile": user.mobile_number}
        access_token = self.token_helper.create_access_token(token_data)

        # DB-backed opaque refresh token
        refresh_token = self._create_refresh_token(
            user_id=user.id,
            user_agent=user_agent,
            ip_address=ip_address,
        )

        return user, {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "refresh_token_expires_in_days": settings.REFRESH_TOKEN_EXPIRE_DAYS,
        }

    def refresh_access_token(
        self,
        raw_refresh_token: str,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> dict:
        """
        Validate a refresh token, rotate it, and return new tokens.

        Rotation: the old token is soft-rotated (rotated_at set, successor
        recorded) and a fresh pair is issued. Re-presenting the old token
        within REFRESH_TOKEN_GRACE_SECONDS returns the same successor —
        absorbing multi-tab/retry races. Re-presenting it after the grace
        window is treated as a reuse attack and revokes all user tokens.
        """
        token_hash = self._hash_token(raw_refresh_token)
        now = datetime.now(timezone.utc)

        stored_token = self.db.query(RefreshToken).filter_by(token_hash=token_hash).first()

        if not stored_token:
            raise ValueError("Invalid refresh token")

        if stored_token.revoked:
            # Token was hard-revoked (logout, prior reuse detection, or
            # rotated-then-replayed-after-grace). Treat any further use as
            # a reuse attack.
            logger.warning(
                "Revoked refresh token reuse detected for user_id=%s. "
                "Revoking all tokens for safety.",
                stored_token.user_id,
            )
            self._revoke_all_user_tokens(stored_token.user_id)
            raise ValueError("Refresh token has been revoked")

        if stored_token.expires_at < now:
            raise ValueError("Refresh token has expired")

        # Within-grace replay path: token was already rotated, but recently
        # enough that this is almost certainly a legitimate race (another tab,
        # a retry). Return the same successor pair.
        if stored_token.rotated_at is not None:
            grace_cutoff = stored_token.rotated_at + timedelta(
                seconds=settings.REFRESH_TOKEN_GRACE_SECONDS
            )
            if now <= grace_cutoff and stored_token.successor_token_encrypted:
                user = self.db.query(User).filter_by(id=stored_token.user_id).first()
                if not user:
                    raise ValueError("User not found")
                successor_refresh = secretbox.decrypt(stored_token.successor_token_encrypted)
                # Always mint a fresh access JWT — they're short-lived and
                # cheap; this also keeps the access token's exp aligned with
                # the caller's wall clock.
                new_access_token = self.token_helper.create_access_token(
                    {"sub": str(user.id), "mobile": user.mobile_number}
                )
                logger.info(
                    "Refresh token replayed within grace window for user_id=%s",
                    user.id,
                )
                return {
                    "access_token": new_access_token,
                    "refresh_token": successor_refresh,
                    "refresh_token_expires_in_days": settings.REFRESH_TOKEN_EXPIRE_DAYS,
                }

            # Rotated, but outside the grace window → real reuse signal.
            logger.warning(
                "Refresh token reuse after grace window detected for user_id=%s. "
                "Revoking all tokens for safety.",
                stored_token.user_id,
            )
            stored_token.revoked = True
            self.db.commit()
            self._revoke_all_user_tokens(stored_token.user_id)
            raise ValueError("Refresh token has been revoked")

        # Look up the user for the new access token payload
        user = self.db.query(User).filter_by(id=stored_token.user_id).first()
        if not user:
            raise ValueError("User not found")

        # Issue new JWT access token
        new_access_token = self.token_helper.create_access_token(
            {"sub": str(user.id), "mobile": user.mobile_number}
        )

        # Issue new DB-backed refresh token
        new_refresh_token = self._create_refresh_token(
            user_id=user.id,
            user_agent=user_agent,
            ip_address=ip_address,
        )

        # Soft-rotate the old token: record successor + rotation time. We keep
        # revoked=False so the grace-window branch above can recognize this
        # row on replay. After the grace window, that branch flips revoked=True.
        new_token_row = (
            self.db.query(RefreshToken)
            .filter_by(token_hash=self._hash_token(new_refresh_token))
            .first()
        )
        stored_token.rotated_at = datetime.now(timezone.utc)
        stored_token.replaced_by_id = new_token_row.id if new_token_row else None
        stored_token.successor_token_encrypted = secretbox.encrypt(new_refresh_token)
        self.db.commit()

        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "refresh_token_expires_in_days": settings.REFRESH_TOKEN_EXPIRE_DAYS,
        }

    def revoke_refresh_token(self, raw_refresh_token: str) -> None:
        """Revoke a single refresh token (used for logout)."""
        token_hash = self._hash_token(raw_refresh_token)

        stored_token = self.db.query(RefreshToken).filter_by(token_hash=token_hash).first()

        if stored_token and not stored_token.revoked:
            stored_token.revoked = True
            self.db.commit()
            logger.info("Refresh token revoked for user_id=%s", stored_token.user_id)

    def _revoke_all_user_tokens(self, user_id: uuid.UUID) -> None:
        """Revoke all refresh tokens for a user (security measure)."""
        self.db.query(RefreshToken).filter_by(user_id=user_id, revoked=False).update(
            {"revoked": True}
        )
        self.db.commit()
        logger.info("All refresh tokens revoked for user_id=%s", user_id)
