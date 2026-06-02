"""
FastAPI Application Entry Point
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import exc

from app.core.config import settings
from app.core.logging import setup_logging
from app.common.exceptions import (
    AppException,
    DatabaseError,
    ForbiddenError,
    IntegrityError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from app.common.helpers.thirdparty.ratelimit import setup_rate_limit

logger = logging.getLogger(__name__)


# --- Lifespan ---


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    setup_logging()
    logger.info(f"{settings.APP_NAME} starting up (env={settings.APP_ENV})")
    yield
    logger.info(f"{settings.APP_NAME} shutting down")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description=f"{settings.APP_NAME} - FastAPI Backend",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    # Expose Content-Disposition so the browser can read the server-set
    # download filename on the cross-origin Excel export responses
    # (frontend and API are different origins in dev and on the AWS stack).
    expose_headers=["Content-Disposition"],
)

# Rate limiting (production only)
setup_rate_limit(app)

# Mount uploads directory in development
if settings.APP_ENV in {"development", "local"}:
    uploads_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
    if os.path.exists(uploads_dir):
        app.mount("/api/uploads", StaticFiles(directory=uploads_dir), name="uploads")


# --- Centralized Exception Handlers ---


@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    """Handle validation errors"""
    if getattr(exc, "errors", None):
        return JSONResponse(
            status_code=exc.status_code,
            content={"errors": exc.errors, "message": exc.message},
        )
    return JSONResponse(status_code=exc.status_code, content={"message": exc.message})


@app.exception_handler(DatabaseError)
async def database_exception_handler(request: Request, exc: DatabaseError):
    """Handle database errors"""
    return JSONResponse(status_code=exc.status_code, content={"message": exc.message})


@app.exception_handler(NotFoundError)
async def not_found_exception_handler(request: Request, exc: NotFoundError):
    """Handle not found errors"""
    return JSONResponse(status_code=exc.status_code, content={"message": exc.message})


@app.exception_handler(IntegrityError)
async def integrity_exception_handler(request: Request, exc: IntegrityError):
    """Handle database integrity errors"""
    return JSONResponse(status_code=exc.status_code, content={"message": exc.message})


@app.exception_handler(UnauthorizedError)
async def unauthorized_exception_handler(request: Request, exc: UnauthorizedError):
    """Handle unauthorized errors"""
    return JSONResponse(status_code=exc.status_code, content={"message": exc.message})


@app.exception_handler(ForbiddenError)
async def forbidden_exception_handler(request: Request, exc: ForbiddenError):
    """Handle forbidden errors"""
    return JSONResponse(status_code=exc.status_code, content={"message": exc.message})


@app.exception_handler(exc.IntegrityError)
async def sqlalchemy_integrity_error_handler(request: Request, exc: exc.IntegrityError):
    """Handle SQLAlchemy integrity errors directly"""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"message": "The operation violates database constraints."},
    )


@app.exception_handler(exc.SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: exc.SQLAlchemyError):
    """Handle all other SQLAlchemy errors"""
    logger.exception("SQLAlchemy error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "message": "Seems to be an error in the Database. Please try again after sometime."
        },
    )


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    """Catch-all for any AppException not handled above"""
    return JSONResponse(status_code=exc.status_code, content={"message": exc.message})


# --- Endpoints ---


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": "1.0.0",
    }


@app.get("/")
def root():
    """Root endpoint"""
    return {
        "message": f"Welcome to {settings.APP_NAME} API",
        "docs": "/docs",
        "health": "/health",
    }


# --- Import all models so SQLAlchemy resolves string-based relationships ---
from app.core import models as _models  # noqa: F401

# --- Register module routers ---

from app.modules.auth.routes import router as auth_router
from app.modules.user.routes import router as user_router
from app.modules.organization.routes import router as org_router
from app.modules.role.routes import router as role_router
from app.modules.dimension.routes import router as dimension_router
from app.modules.activity.routes import router as activity_router
from app.modules.entity.routes import router as entity_router
from app.modules.enrollment.routes import router as enrollment_router
from app.modules.dashboard.routes import router as dashboard_router

app.include_router(auth_router, prefix="/api", tags=["auth"])
app.include_router(user_router, prefix="/api", tags=["user"])
app.include_router(org_router, prefix="/api", tags=["organization"])
app.include_router(role_router, prefix="/api", tags=["roles"])
app.include_router(dimension_router, prefix="/api", tags=["dimensions"])
app.include_router(activity_router, prefix="/api", tags=["activities"])
app.include_router(entity_router, prefix="/api", tags=["entities"])
app.include_router(enrollment_router, prefix="/api", tags=["enrollments"])
app.include_router(dashboard_router, prefix="/api", tags=["dashboard"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
