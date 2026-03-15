"""
Rate limiting helpers (SlowAPI).
Enabled only in production by default.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.common.exceptions import TooManyRequestsError
from app.core.config import settings


def _is_production() -> bool:
    return str(settings.APP_ENV).lower() in {"production", "prod"}


def is_rate_limit_enabled() -> bool:
    return _is_production()


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


limiter = None
if is_rate_limit_enabled():
    limiter = Limiter(
        key_func=_get_client_ip,
        default_limits=[],
        storage_uri="memory://",
    )


def rate_limit(limit: str):
    if not is_rate_limit_enabled():

        def decorator(func):
            return func

        return decorator
    return limiter.limit(limit)


def setup_rate_limit(app: FastAPI) -> None:
    if not is_rate_limit_enabled():
        return

    app.state.limiter = limiter

    def _rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
        error = TooManyRequestsError()
        return JSONResponse(
            status_code=error.status_code,
            content={"message": error.message},
        )

    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
