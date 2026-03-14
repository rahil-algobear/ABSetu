"""
Common FastAPI Dependencies
Reusable dependencies for authentication
"""
import uuid

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.exceptions import UnauthorizedError
from app.common.helpers.tokenhelper import TokenHelper

# Lazy import to avoid circular imports — resolved at call time
_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
):
    """
    Dependency that extracts and validates the JWT, then looks up the user in the DB.

    Returns the full User ORM object (not just an ID).

    Usage:
        from app.common.dependencies import get_current_user

        @router.get("/profile")
        def get_profile(current_user: User = Depends(get_current_user)):
            ...

    Raises:
        UnauthorizedError: If token is missing, invalid, or user not found
    """
    if credentials is None:
        raise UnauthorizedError("Authorization header is missing")

    try:
        token_helper = TokenHelper()
        payload = token_helper.verify_token(credentials.credentials)

        user_id = payload.get("sub")
        if not user_id:
            raise UnauthorizedError("Invalid token payload: missing user ID")

        # Import here to avoid circular imports (dependencies ↔ models)
        from app.modules.auth.model import User

        user = (
            db.query(User)
            .filter(User.id == uuid.UUID(user_id))
            .first()
        )

        if user is None:
            raise UnauthorizedError("User not found or inactive")

        return user

    except jwt.ExpiredSignatureError:
        raise UnauthorizedError("Token has expired")
    except jwt.InvalidTokenError as e:
        raise UnauthorizedError(f"Invalid or expired token: {str(e)}")
    except UnauthorizedError:
        raise
    except Exception as e:
        raise UnauthorizedError(f"Token verification failed: {str(e)}")
