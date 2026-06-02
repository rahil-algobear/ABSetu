"""
Application Configuration
"""

import os
from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


def _get_env_files() -> list[str]:
    """
    Determine which .env files to load (in order).

    Pattern: Base + Environment-specific (like class inheritance)
    1. Always load .env first (base/common values - portable across servers)
    2. Read APP_ENV from system environment variable (set per server)
    3. Load .env.{APP_ENV} if it exists (environment-specific overrides)

    APP_ENV must be set as system environment variable (per server):
    - Local: export APP_ENV=local
    - Production: export APP_ENV=production (or prod, which is normalized)
    - Or command-line: APP_ENV=local uvicorn app.main:app
    """
    files = [".env"]  # Always load base first (portable, no APP_ENV)

    # APP_ENV must be set as system environment variable (per server)
    app_env = os.getenv("APP_ENV")

    # Normalize: convert "prod" to "production" for consistency
    if app_env == "prod":
        app_env = "production"
        os.environ["APP_ENV"] = "production"

    # Load environment-specific override file
    if app_env:
        env_file = f".env.{app_env}"
        if Path(env_file).exists():
            files.append(env_file)

    return files


class Settings(BaseSettings):
    """Application settings"""

    model_config = SettingsConfigDict(
        env_file=_get_env_files(),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    APP_NAME: str = "ABSetu"
    APP_ENV: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = "change-me-in-production"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost/absetu"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # Authentication
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    # Window after rotation during which the old refresh token can be presented
    # again and receive the same successor pair (instead of triggering reuse
    # detection). Covers multi-tab races and network retries.
    REFRESH_TOKEN_GRACE_SECONDS: int = 10
    OTP_EXPIRY_MINUTES: int = 5

    # Twilio
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""
    USE_LIVE_SMS: bool = False
    PRODUCT_NAME: str = "ABSetu"

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "logs/app.log"

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3100", "http://localhost:3101"]

    # AWS (for file storage)
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-east-1"
    AWS_S3_BUCKET: str = ""


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


settings = get_settings()
