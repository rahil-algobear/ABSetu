"""
User services for profile operations
"""
import uuid

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.modules.auth.model import User
from app.modules.role.model import Role


class UserService:
    """Service for user profile operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_user_by_id(self, user_id: uuid.UUID) -> User:
        """Get user by ID."""
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise NotFoundError("User not found")
        return user

    def list_by_org(self, org_id: uuid.UUID) -> list[User]:
        """List all users in an organization."""
        return (
            self.db.query(User)
            .filter_by(organization_id=org_id)
            .order_by(User.first_name, User.last_name)
            .all()
        )

    def update_role(
        self, user_id: uuid.UUID, org_id: uuid.UUID, role_id: uuid.UUID
    ) -> User:
        """Update a user's role."""
        user = (
            self.db.query(User)
            .filter_by(id=user_id, organization_id=org_id)
            .first()
        )
        if not user:
            raise NotFoundError("User not found")

        # Verify role belongs to same org
        role = (
            self.db.query(Role)
            .filter_by(id=role_id, organization_id=org_id)
            .first()
        )
        if not role:
            raise NotFoundError("Role not found")

        user.role_id = role_id
        self.db.commit()
        self.db.refresh(user)
        return user

    def create_user(
        self,
        org_id: uuid.UUID,
        first_name: str,
        last_name: str,
        country_code: str,
        mobile_number: str,
        role_id: uuid.UUID,
    ) -> User:
        """Create a new user within the organization."""
        # Check for duplicate mobile number
        existing = (
            self.db.query(User)
            .filter_by(mobile_number=mobile_number)
            .first()
        )
        if existing:
            raise ValidationError("A user with this mobile number already exists")

        # Verify role belongs to same org
        role = (
            self.db.query(Role)
            .filter_by(id=role_id, organization_id=org_id)
            .first()
        )
        if not role:
            raise NotFoundError("Role not found")

        user = User(
            first_name=first_name,
            last_name=last_name,
            country_code=country_code,
            mobile_number=mobile_number,
            organization_id=org_id,
            role_id=role_id,
            is_verified=False,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
