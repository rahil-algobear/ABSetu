"""
Logging Configuration
"""

import logging
import sys
from pathlib import Path

from app.core.config import settings


def setup_logging() -> None:
    """Configure application logging"""
    # Configure logging format
    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    # Always log to stdout — captured by the hosting platform (e.g. Vercel).
    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]

    # File logging is best-effort. Serverless/read-only filesystems (Vercel,
    # AWS Lambda) can't create the log dir or open the file for writing, which
    # would otherwise crash startup. Fall back to stdout-only in that case.
    try:
        log_file_path = Path(settings.LOG_FILE)
        log_file_path.parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(settings.LOG_FILE))
    except OSError:
        pass

    # Configure root logger
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper()),
        format=log_format,
        datefmt=date_format,
        handlers=handlers,
    )

    # Set specific logger levels to suppress noise
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("python_multipart.multipart").setLevel(logging.WARNING)
