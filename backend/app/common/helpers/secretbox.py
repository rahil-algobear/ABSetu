"""
Symmetric encryption helper for short-lived secrets stored at rest.

Used to encrypt the raw successor refresh token on a rotated RefreshToken row
so that a within-grace replay can return the same token (rather than minting
yet another and triggering an avalanche of new tokens during a tab race).

Key is derived from JWT_SECRET_KEY — same trust boundary as token signing.
"""

import base64
import hashlib

from cryptography.fernet import Fernet

from app.core.config import settings


def _derive_key() -> bytes:
    """Derive a Fernet-compatible 32-byte URL-safe base64 key from JWT_SECRET_KEY."""
    digest = hashlib.sha256(settings.JWT_SECRET_KEY.encode()).digest()
    return base64.urlsafe_b64encode(digest)


_fernet = Fernet(_derive_key())


def encrypt(plaintext: str) -> str:
    """Encrypt a string. Returns a URL-safe token suitable for DB storage."""
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Decrypt a string produced by ``encrypt``."""
    return _fernet.decrypt(ciphertext.encode()).decode()
