"""
Token Helper for JWT operations
Singleton helper class for creating and verifying JWT tokens
"""
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.config import settings


class TokenHelper:
    """
    Singleton helper class for JWT token operations.

    Usage:
        token_helper = TokenHelper()
        token = token_helper.create_access_token({"sub": "user_id", "mobile": "1234567890"})
        payload = token_helper.verify_token(token)
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TokenHelper, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._initialized = True
        self.algorithm = settings.JWT_ALGORITHM
        self.secret_key = settings.JWT_SECRET_KEY
        self.access_token_expire_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES

    def create_token(
        self,
        data: dict,
        expires_delta: Optional[timedelta] = None,
        token_type: str = "access",
    ) -> str:
        """Create a JWT token with the specified data and expiration."""
        to_encode = data.copy()

        if expires_delta:
            expire = datetime.now(timezone.utc) + expires_delta
        else:
            expire = datetime.now(timezone.utc) + timedelta(
                minutes=self.access_token_expire_minutes
            )

        expire_timestamp = int(expire.timestamp())
        to_encode.update({"exp": expire_timestamp, "token_type": token_type})

        return jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)

    def create_access_token(self, data: dict) -> str:
        """Create an access token."""
        return self.create_token(
            data,
            expires_delta=timedelta(minutes=self.access_token_expire_minutes),
            token_type="access",
        )

    def verify_token(self, token: str) -> dict:
        """
        Verify and decode JWT token.

        Raises:
            jwt.ExpiredSignatureError: If token has expired
            jwt.InvalidTokenError: If token is invalid
        """
        try:
            return jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
        except jwt.ExpiredSignatureError:
            raise jwt.InvalidTokenError("Token has expired")
        except jwt.InvalidTokenError as e:
            raise jwt.InvalidTokenError(f"Invalid token: {str(e)}")
