"""
Custom Exceptions with centralized error messages
"""
from http import HTTPStatus


class AppException(Exception):
    """Base exception for the application"""

    def __init__(self, message: str = "", status_code: int = 500):
        self.message = message or self.default_message()
        self.status_code = status_code
        super().__init__(self.message)

    def default_message(self) -> str:
        """Override in subclasses to provide default messages"""
        return ""


class ValidationError(AppException):
    """Validation error exception"""

    def __init__(self, message: str = "", errors: dict | None = None):
        self.errors = errors
        super().__init__(
            message=message or self.default_message(),
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
        )

    def default_message(self) -> str:
        return "Your input parameters have some validation errors. Please fix & resubmit."


class DatabaseError(AppException):
    """Database error exception"""

    def __init__(self, message: str = ""):
        super().__init__(
            message=message or self.default_message(),
            status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
        )

    def default_message(self) -> str:
        return "Seems to be an error in the Database. Please try again after sometime."


class NotFoundError(AppException):
    """Resource not found exception"""

    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, status_code=HTTPStatus.NOT_FOUND)


class IntegrityError(ValidationError):
    """Database integrity error (foreign key constraints, unique violations, etc.)"""

    def __init__(self, message: str = ""):
        super().__init__(
            message=message or "The operation violates database constraints."
        )


class UnauthorizedError(AppException):
    """Unauthorized error"""

    def __init__(self, message: str = ""):
        super().__init__(
            message=message or self.default_message(),
            status_code=HTTPStatus.UNAUTHORIZED,
        )

    def default_message(self) -> str:
        return "Authentication required. Please provide a valid token."


class TooManyRequestsError(AppException):
    """Too many requests / rate limit exceeded."""

    def __init__(self, message: str = ""):
        super().__init__(
            message=message or self.default_message(),
            status_code=HTTPStatus.TOO_MANY_REQUESTS,
        )

    def default_message(self) -> str:
        return "Too many requests. Please try again later."


class ExternalAPIError(AppException):
    """External API error exception"""

    def __init__(self, message: str = "External API error"):
        super().__init__(message, status_code=HTTPStatus.BAD_GATEWAY)
