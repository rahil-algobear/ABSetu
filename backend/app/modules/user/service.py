"""
User services for profile operations
"""

import uuid

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.modules.auth.model import (
    User,
    UserCenterAccess,
    UserProgrammeAccess,
    UserSessionTemplateAccess,
)
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

        # Verify role belongs to same org
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
        # Check for duplicate mobile number
        existing = self.db.query(User).filter_by(mobile_number=mobile_number).first()
        if existing:
            raise ValidationError("A user with this mobile number already exists")

        # Verify role belongs to same org
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
        """Get a user's access tags."""
        user = self.db.query(User).filter_by(id=user_id, organization_id=org_id).first()
        if not user:
            raise NotFoundError("User not found")

        return {
            "center_ids": [str(a.center_id) for a in user.center_access],
            "programme_ids": [str(a.programme_id) for a in user.programme_access],
            "session_template_ids": [
                str(a.session_template_id) for a in user.session_template_access
            ],
        }

    def update_user_access(
        self,
        user_id: uuid.UUID,
        org_id: uuid.UUID,
        center_ids: list[uuid.UUID],
        programme_ids: list[uuid.UUID],
        session_template_ids: list[uuid.UUID],
    ) -> dict:
        """Bulk-replace a user's access tags."""
        user = self.db.query(User).filter_by(id=user_id, organization_id=org_id).first()
        if not user:
            raise NotFoundError("User not found")

        # Replace center access
        self.db.query(UserCenterAccess).filter_by(user_id=user_id).delete()
        for cid in center_ids:
            self.db.add(UserCenterAccess(user_id=user_id, center_id=cid))

        # Replace programme access
        self.db.query(UserProgrammeAccess).filter_by(user_id=user_id).delete()
        for pid in programme_ids:
            self.db.add(UserProgrammeAccess(user_id=user_id, programme_id=pid))

        # Replace session template access
        self.db.query(UserSessionTemplateAccess).filter_by(user_id=user_id).delete()
        for stid in session_template_ids:
            self.db.add(UserSessionTemplateAccess(user_id=user_id, session_template_id=stid))

        self.db.commit()
        self.db.refresh(user)

        return {
            "center_ids": [str(a.center_id) for a in user.center_access],
            "programme_ids": [str(a.programme_id) for a in user.programme_access],
            "session_template_ids": [
                str(a.session_template_id) for a in user.session_template_access
            ],
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

        # Verify role belongs to same org
        role = self.db.query(Role).filter_by(id=role_id, organization_id=org_id).first()
        if not role:
            raise NotFoundError("Role not found")

        # Check for duplicate mobile number (exclude current user)
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

    def delete_user(self, user_id: uuid.UUID, org_id: uuid.UUID, current_user_id: uuid.UUID) -> None:
        """Delete a user from the organization."""
        if user_id == current_user_id:
            raise ValidationError("You cannot delete yourself")

        user = self.db.query(User).filter_by(id=user_id, organization_id=org_id).first()
        if not user:
            raise NotFoundError("User not found")

        self.db.delete(user)
        self.db.commit()

    @staticmethod
    def get_access_ids(user: User) -> dict:
        """Extract access IDs from a user object (for use in filtering)."""
        return {
            "center_ids": [a.center_id for a in user.center_access],
            "programme_ids": [a.programme_id for a in user.programme_access],
            "session_template_ids": [a.session_template_id for a in user.session_template_access],
        }

    @staticmethod
    def has_full_access(user: User) -> bool:
        """Check if user has no access restrictions (admin-level)."""
        has_centers = len(user.center_access) > 0
        has_programmes = len(user.programme_access) > 0
        has_templates = len(user.session_template_access) > 0
        # If no access tags at all, user has full access (unrestricted)
        return not has_centers and not has_programmes and not has_templates
