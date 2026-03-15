"""
Common FastAPI Dependencies
Reusable dependencies for authentication and authorization
"""

import uuid
from typing import Callable

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.exceptions import ForbiddenError, UnauthorizedError
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

        user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()

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


def _get_user_permissions(user) -> set[str]:
    """
    Extract permission keys from a user's role.
    Returns a set of permission key strings.
    """
    if not user.role:
        return set()
    return {rp.permission.key for rp in user.role.role_permissions if rp.permission}


def require_permissions(*required_keys: str) -> Callable:
    """
    FastAPI dependency factory that checks if the current user has
    all the required permission keys.

    Usage:
        @router.post("/", dependencies=[Depends(require_permissions("beneficiary:create"))])
        def create_beneficiary(...):

        # Multiple permissions (user must have ALL):
        @router.delete("/{id}", dependencies=[Depends(require_permissions("beneficiary:edit"))])

    Raises:
        ForbiddenError: If the user lacks any of the required permissions.
    """

    def _checker(current_user=Depends(get_current_user)):
        user_permissions = _get_user_permissions(current_user)
        missing = set(required_keys) - user_permissions
        if missing:
            raise ForbiddenError(f"Missing required permissions: {', '.join(sorted(missing))}")
        return current_user

    return _checker
