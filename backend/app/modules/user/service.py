"""
User services for profile operations
"""
import uuid

from sqlalchemy.orm import Session

from app.modules.auth.model import User


class UserService:
    """Service for user profile operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_user_by_id(self, user_id: uuid.UUID) -> User:
        """Get user by ID."""
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("User not found")
        return user
