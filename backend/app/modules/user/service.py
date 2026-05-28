"""
User services for profile operations
"""

import json
import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.common.exceptions import NotFoundError, ValidationError
from app.common.helpers.list_query import _parse_date, apply_search, apply_sort, paginate
from app.common.schemas.list_params import ListParams
from app.modules.auth.model import User
from app.modules.dimension.model import DimensionValue, UserDimension
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

    def list_by_org_paginated(
        self,
        org_id: uuid.UUID,
        params: ListParams,
    ) -> tuple[list[User], int]:
        """Paginated list with search, filter, and sort support."""
        query = (
            self.db.query(User)
            .options(
                joinedload(User.role),
                selectinload(User.dimension_access),
            )
            .filter(User.organization_id == org_id)
        )

        # Search across first/last name + mobile
        query = apply_search(
            query,
            params.search,
            [User.first_name, User.last_name, User.mobile_number],
        )

        # Filters
        query = self._apply_user_filters(query, params.filters)

        # Sort — sort by "role" column joins the Role table
        sort_config: dict[str, Any] = {
            "name": User.first_name,
            "created_at": User.created_at,
        }
        if params.sort_by == "role":
            query = query.outerjoin(Role, User.role_id == Role.id)
            sort_config["role"] = Role.name

        query = apply_sort(
            query,
            params.sort_by,
            params.sort_order,
            sort_config,
            User.created_at.desc(),
        )

        return paginate(query, params.page, params.limit)

    def _apply_user_filters(self, query: Any, filters_json: str | None) -> Any:
        """Apply user-specific filters: role, created_at range, dimension (with all-access)."""
        if not filters_json:
            return query

        try:
            raw = json.loads(filters_json)
        except (json.JSONDecodeError, TypeError):
            return query
        if not isinstance(raw, dict):
            return query

        for key, value in raw.items():
            if value is None or value == "" or value == []:
                continue

            if key == "role_id":
                ids = value if isinstance(value, list) else [value]
                try:
                    coerced = [uuid.UUID(v) for v in ids]
                except (ValueError, AttributeError):
                    continue
                query = query.filter(User.role_id.in_(coerced))

            elif key == "created_at":
                if not isinstance(value, dict):
                    continue
                start = _parse_date(value.get("start"))
                end = _parse_date(value.get("end"))
                if start:
                    query = query.filter(User.created_at >= start)
                if end:
                    query = query.filter(User.created_at < end + timedelta(days=1))

            elif key.startswith("dim:"):
                try:
                    dim_id = uuid.UUID(key.split(":", 1)[1])
                except (ValueError, IndexError):
                    continue

                values = value if isinstance(value, list) else [value]
                real_dv_ids: list[uuid.UUID] = []
                all_access_selected = False
                for v in values:
                    if v == "all_access":
                        all_access_selected = True
                        continue
                    try:
                        real_dv_ids.append(uuid.UUID(v))
                    except (ValueError, AttributeError):
                        continue

                clauses = []
                if real_dv_ids:
                    clauses.append(
                        exists().where(
                            UserDimension.user_id == User.id,
                            UserDimension.dimension_value_id.in_(real_dv_ids),
                        )
                    )
                if all_access_selected:
                    # User is "all access" for this dimension when they have no
                    # UserDimension rows pointing to any value within it.
                    dim_value_ids = select(DimensionValue.id).where(
                        DimensionValue.dimension_id == dim_id
                    )
                    clauses.append(
                        ~exists().where(
                            UserDimension.user_id == User.id,
                            UserDimension.dimension_value_id.in_(dim_value_ids),
                        )
                    )
                if clauses:
                    query = query.filter(or_(*clauses))

        return query

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
        self.db.query(UserDimension).filter_by(user_id=user_id).delete()
        for dv_id in dimension_value_ids:
            self.db.add(UserDimension(user_id=user_id, dimension_value_id=dv_id))

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
