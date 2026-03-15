"""
Role and Permission services
"""

import uuid

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.modules.role.model import Permission, Role, RolePermission


class PermissionService:
    def __init__(self, db: Session):
        self.db = db

    def list_all(self) -> list[Permission]:
        return self.db.query(Permission).order_by(Permission.key).all()


class RoleService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(self, org_id: uuid.UUID) -> list[Role]:
        return self.db.query(Role).filter_by(organization_id=org_id).order_by(Role.name).all()

    def get_by_id(self, role_id: uuid.UUID, org_id: uuid.UUID) -> Role:
        role = self.db.query(Role).filter_by(id=role_id, organization_id=org_id).first()
        if not role:
            raise NotFoundError("Role not found")
        return role

    def create(self, org_id: uuid.UUID, data: dict) -> Role:
        permission_ids = data.pop("permission_ids", [])
        is_default = data.get("is_default", False)

        # If setting as default, unset other defaults
        if is_default:
            self._unset_defaults(org_id)

        role = Role(organization_id=org_id, **data)
        self.db.add(role)
        self.db.flush()

        self._sync_permissions(role, permission_ids)
        self.db.commit()
        self.db.refresh(role)
        return role

    def update(self, role_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> Role:
        role = self.get_by_id(role_id, org_id)
        if role.is_system:
            raise ValidationError("Cannot modify a system role.")
        permission_ids = data.pop("permission_ids", None)

        if data.get("is_default"):
            self._unset_defaults(org_id)

        for key, value in data.items():
            if value is not None:
                setattr(role, key, value)

        if permission_ids is not None:
            self._sync_permissions(role, permission_ids)

        self.db.commit()
        self.db.refresh(role)
        return role

    def delete(self, role_id: uuid.UUID, org_id: uuid.UUID) -> None:
        role = self.get_by_id(role_id, org_id)
        if role.is_system:
            raise ValidationError("Cannot delete a system role.")

        # Check if any users are assigned to this role
        from app.modules.auth.model import User

        user_count = self.db.query(User).filter_by(role_id=role_id).count()
        if user_count > 0:
            raise ValidationError(
                f"Cannot delete role with {user_count} assigned user(s). " "Reassign them first."
            )

        self.db.delete(role)
        self.db.commit()

    def _unset_defaults(self, org_id: uuid.UUID) -> None:
        self.db.query(Role).filter_by(organization_id=org_id, is_default=True).update(
            {"is_default": False}
        )

    def _sync_permissions(self, role: Role, permission_ids: list[str]) -> None:
        # Remove existing
        self.db.query(RolePermission).filter_by(role_id=role.id).delete()

        # Add new
        for pid in permission_ids:
            perm = self.db.query(Permission).filter_by(id=uuid.UUID(pid)).first()
            if perm:
                rp = RolePermission(role_id=role.id, permission_id=perm.id)
                self.db.add(rp)
