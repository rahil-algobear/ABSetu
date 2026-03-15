"""
User services for profile operations
"""

import uuid

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.modules.auth.model import User
from app.modules.dimension.model import UserDimensionAccess
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

    def update_role(self, user_id: uuid.UUID, org_id: uuid.UUID, role_id: uuid.UUID) -> User:
        """Update a user's role."""
        user = self.db.query(User).filter_by(id=user_id, organization_id=org_id).first()
        if not user:
            raise NotFoundError("User not found")

        role = self.db.query(Role).filter_by(id=role_id, organization_id=org_id).first()
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
        existing = self.db.query(User).filter_by(mobile_number=mobile_number).first()
        if existing:
            raise ValidationError("A user with this mobile number already exists")

        role = self.db.query(Role).filter_by(id=role_id, organization_id=org_id).first()
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

    def get_user_access(self, user_id: uuid.UUID, org_id: uuid.UUID) -> dict:
        """Get a user's dimension access."""
        user = self.db.query(User).filter_by(id=user_id, organization_id=org_id).first()
        if not user:
            raise NotFoundError("User not found")

        return {
            "dimension_value_ids": [str(a.dimension_value_id) for a in user.dimension_access],
        }

    def update_user_access(
        self,
        user_id: uuid.UUID,
        org_id: uuid.UUID,
        dimension_value_ids: list[uuid.UUID],
    ) -> dict:
        """Bulk-replace a user's dimension access."""
        user = self.db.query(User).filter_by(id=user_id, organization_id=org_id).first()
        if not user:
            raise NotFoundError("User not found")

        # Replace all dimension access
        self.db.query(UserDimensionAccess).filter_by(user_id=user_id).delete()
        for dv_id in dimension_value_ids:
            self.db.add(UserDimensionAccess(user_id=user_id, dimension_value_id=dv_id))

        self.db.commit()
        self.db.refresh(user)

        return {
            "dimension_value_ids": [str(a.dimension_value_id) for a in user.dimension_access],
        }

    def update_user(
        self,
        user_id: uuid.UUID,
        org_id: uuid.UUID,
        first_name: str,
        last_name: str,
        country_code: str,
        mobile_number: str,
        role_id: uuid.UUID,
    ) -> User:
        """Update a user's details."""
        user = self.db.query(User).filter_by(id=user_id, organization_id=org_id).first()
        if not user:
            raise NotFoundError("User not found")

        role = self.db.query(Role).filter_by(id=role_id, organization_id=org_id).first()
        if not role:
            raise NotFoundError("Role not found")

        existing = (
            self.db.query(User)
            .filter(User.mobile_number == mobile_number, User.id != user_id)
            .first()
        )
        if existing:
            raise ValidationError("A user with this mobile number already exists")

        user.first_name = first_name
        user.last_name = last_name
        user.country_code = country_code
        user.mobile_number = mobile_number
        user.role_id = role_id
        self.db.commit()
        self.db.refresh(user)
        return user

    def delete_user(
        self, user_id: uuid.UUID, org_id: uuid.UUID, current_user_id: uuid.UUID
    ) -> None:
        """Delete a user from the organization."""
        if user_id == current_user_id:
            raise ValidationError("You cannot delete yourself")

        user = self.db.query(User).filter_by(id=user_id, organization_id=org_id).first()
        if not user:
            raise NotFoundError("User not found")

        self.db.delete(user)
        self.db.commit()

    @staticmethod
    def get_access_dimension_value_ids(user: User) -> list:
        """Extract dimension value IDs from a user object (for use in filtering)."""
        return [a.dimension_value_id for a in user.dimension_access]

    @staticmethod
    def has_full_access(user: User) -> bool:
        """Check if user has no access restrictions (admin-level)."""
        return len(user.dimension_access) == 0
