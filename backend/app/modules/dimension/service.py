"""
Dimension, DimensionValue, DimensionValueLink services
"""

import uuid

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.common.helpers.slugify import slugify
from app.modules.dimension.model import Dimension, DimensionValue, DimensionValueLink, UserDimension


class DimensionService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(self, org_id: uuid.UUID) -> list[Dimension]:
        return (
            self.db.query(Dimension)
            .filter_by(organization_id=org_id)
            .order_by(Dimension.sort_order, Dimension.name)
            .all()
        )

    def get_by_id(self, dimension_id: uuid.UUID, org_id: uuid.UUID) -> Dimension:
        dimension = (
            self.db.query(Dimension).filter_by(id=dimension_id, organization_id=org_id).first()
        )
        if not dimension:
            raise NotFoundError("Dimension not found")
        return dimension

    def create(self, org_id: uuid.UUID, data: dict) -> Dimension:
        data["key"] = slugify(data["name"])
        existing = (
            self.db.query(Dimension).filter_by(organization_id=org_id, key=data["key"]).first()
        )
        if existing:
            raise ValidationError(f"Dimension with key '{data['key']}' already exists")
        dimension = Dimension(organization_id=org_id, **data)
        self.db.add(dimension)
        self.db.commit()
        self.db.refresh(dimension)
        return dimension

    def update(self, dimension_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> Dimension:
        dimension = self.get_by_id(dimension_id, org_id)
        if "name" in data and data["name"] is not None:
            data["key"] = slugify(data["name"])
        for key, value in data.items():
            if value is not None:
                setattr(dimension, key, value)
        self.db.commit()
        self.db.refresh(dimension)
        return dimension

    def delete(self, dimension_id: uuid.UUID, org_id: uuid.UUID) -> None:
        dimension = self.get_by_id(dimension_id, org_id)
        self.db.delete(dimension)
        self.db.commit()


class DimensionValueService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_dimension(
        self,
        dimension_id: uuid.UUID,
        accessible_dv_ids: list[uuid.UUID] | None = None,
    ) -> list[DimensionValue]:
        query = self.db.query(DimensionValue).filter_by(dimension_id=dimension_id)
        if accessible_dv_ids is not None:
            # Only filter if the user has assignments for THIS dimension.
            # If none of the user's assigned values belong to this dimension,
            # they have no restriction on it → return all values.
            scoped_ids = (
                self.db.query(DimensionValue.id)
                .filter(
                    DimensionValue.dimension_id == dimension_id,
                    DimensionValue.id.in_(accessible_dv_ids),
                )
                .all()
            )
            if scoped_ids:
                query = query.filter(DimensionValue.id.in_([r[0] for r in scoped_ids]))
        return query.order_by(DimensionValue.sort_order, DimensionValue.name).all()

    def get_by_id(self, value_id: uuid.UUID) -> DimensionValue:
        value = self.db.query(DimensionValue).filter_by(id=value_id).first()
        if not value:
            raise NotFoundError("Dimension value not found")
        return value

    def create(self, org_id: uuid.UUID, dimension_id: uuid.UUID, data: dict) -> DimensionValue:
        data["code"] = slugify(data["name"])
        value = DimensionValue(organization_id=org_id, dimension_id=dimension_id, **data)
        self.db.add(value)
        self.db.commit()
        self.db.refresh(value)
        return value

    def update(self, value_id: uuid.UUID, data: dict) -> DimensionValue:
        value = self.get_by_id(value_id)
        if "name" in data and data["name"] is not None:
            data["code"] = slugify(data["name"])
        for key, val in data.items():
            if val is not None:
                setattr(value, key, val)
        self.db.commit()
        self.db.refresh(value)
        return value

    def delete(self, value_id: uuid.UUID) -> None:
        value = self.get_by_id(value_id)
        self.db.delete(value)
        self.db.commit()


class DimensionValueLinkService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(
        self,
        org_id: uuid.UUID,
        dimension_id_1: uuid.UUID | None = None,
        dimension_id_2: uuid.UUID | None = None,
    ) -> list[DimensionValueLink]:
        query = self.db.query(DimensionValueLink).filter_by(organization_id=org_id)

        if dimension_id_1 and dimension_id_2:
            vals_1 = (
                self.db.query(DimensionValue.id).filter_by(dimension_id=dimension_id_1).subquery()
            )
            vals_2 = (
                self.db.query(DimensionValue.id).filter_by(dimension_id=dimension_id_2).subquery()
            )
            from sqlalchemy import and_, or_

            query = query.filter(
                or_(
                    and_(
                        DimensionValueLink.dimension_value_id_1.in_(vals_1),
                        DimensionValueLink.dimension_value_id_2.in_(vals_2),
                    ),
                    and_(
                        DimensionValueLink.dimension_value_id_1.in_(vals_2),
                        DimensionValueLink.dimension_value_id_2.in_(vals_1),
                    ),
                )
            )
        return query.all()

    # Link rules are intentionally open to any axis pair, regardless of
    # whether either dimension has controls_access=true. If you ever need
    # to restrict links to access-control dimensions only, add a guard
    # here (and in bulk_sync) that joins DimensionValue → Dimension and
    # rejects rows where Dimension.controls_access is false.

    def create(
        self, org_id: uuid.UUID, dv_id_1: uuid.UUID, dv_id_2: uuid.UUID
    ) -> DimensionValueLink:
        if str(dv_id_1) > str(dv_id_2):
            dv_id_1, dv_id_2 = dv_id_2, dv_id_1

        existing = (
            self.db.query(DimensionValueLink)
            .filter_by(
                dimension_value_id_1=dv_id_1,
                dimension_value_id_2=dv_id_2,
            )
            .first()
        )
        if existing:
            raise ValidationError("This dimension value link already exists")

        link = DimensionValueLink(
            organization_id=org_id,
            dimension_value_id_1=dv_id_1,
            dimension_value_id_2=dv_id_2,
        )
        self.db.add(link)
        self.db.commit()
        self.db.refresh(link)
        return link

    def delete(self, link_id: uuid.UUID) -> None:
        link = self.db.query(DimensionValueLink).filter_by(id=link_id).first()
        if not link:
            raise NotFoundError("Dimension value link not found")
        self.db.delete(link)
        self.db.commit()

    def bulk_sync(
        self,
        org_id: uuid.UUID,
        dimension_id_1: uuid.UUID,
        dimension_id_2: uuid.UUID,
        pairs: list[tuple[uuid.UUID, uuid.UUID]],
    ) -> list[DimensionValueLink]:
        """Sync dimension value links: add missing, remove stale."""
        normalized = set()
        for a, b in pairs:
            if str(a) > str(b):
                a, b = b, a
            normalized.add((a, b))

        existing_links = self.list_by_org(org_id, dimension_id_1, dimension_id_2)
        existing_pairs = {
            (r.dimension_value_id_1, r.dimension_value_id_2): r for r in existing_links
        }

        for pair, link in existing_pairs.items():
            if pair not in normalized:
                self.db.delete(link)

        for a, b in normalized:
            if (a, b) not in existing_pairs:
                link = DimensionValueLink(
                    organization_id=org_id,
                    dimension_value_id_1=a,
                    dimension_value_id_2=b,
                )
                self.db.add(link)

        self.db.commit()
        return self.list_by_org(org_id, dimension_id_1, dimension_id_2)


class UserDimensionAccessService:
    def __init__(self, db: Session):
        self.db = db

    def get_access(self, user_id: uuid.UUID) -> list[UserDimension]:
        return self.db.query(UserDimension).filter_by(user_id=user_id).all()

    def get_access_value_ids(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        rows = self.get_access(user_id)
        return [r.dimension_value_id for r in rows]

    def validate_dimension_values(
        self,
        accessible_dv_ids: list[uuid.UUID] | None,
        submitted_dv_ids: list[str],
    ) -> None:
        """
        Validate that submitted dimension value IDs are within user's scope.

        Per-dimension logic: if the user has no assignments for a particular
        dimension, they have unrestricted access to that dimension's values.
        Only rejects values from dimensions where the user HAS assignments
        but the specific value is not in their allowed set.
        """
        # TODO: empty submission short-circuits all checks. A restricted user
        # can create an activity untagged on a restricted dimension and lose
        # visibility of it — activity listing uses include_untagged=False
        # (see dimension_scoping.py), so the record shows up only for admins.
        # Deferred pending a UX decision: should "optional on the activity
        # type" override "restricted for this user", or does restriction
        # imply required?
        if accessible_dv_ids is None or not submitted_dv_ids:
            return

        allowed = {str(dv_id) for dv_id in accessible_dv_ids}

        # Find which dimensions the user has restrictions on
        restricted_dim_ids = set()
        if accessible_dv_ids:
            rows = (
                self.db.query(DimensionValue.dimension_id)
                .filter(DimensionValue.id.in_(accessible_dv_ids))
                .distinct()
                .all()
            )
            restricted_dim_ids = {row[0] for row in rows}

        # Look up which dimension each submitted value belongs to
        submitted_uuids = [uuid.UUID(v) for v in submitted_dv_ids]
        submitted_rows = (
            self.db.query(DimensionValue.id, DimensionValue.dimension_id)
            .filter(DimensionValue.id.in_(submitted_uuids))
            .all()
        )

        from app.common.exceptions import ForbiddenError

        for dv_id, dim_id in submitted_rows:
            # Only enforce if user has restrictions for this dimension
            if dim_id in restricted_dim_ids and str(dv_id) not in allowed:
                raise ForbiddenError(
                    "You do not have access to one or more selected dimension values"
                )

    def check_record_access(
        self,
        accessible_dv_ids: list[uuid.UUID] | None,
        record_dv_ids: list[uuid.UUID],
    ) -> None:
        """
        Check that a user can access a record based on its dimension values.

        Per-dimension logic: for each restricted dimension, the record must
        have at least one allowed value OR no values from that dimension.
        Raises ForbiddenError if the record is outside the user's scope.
        """
        if accessible_dv_ids is None or not record_dv_ids:
            return

        from app.common.exceptions import ForbiddenError

        allowed = {dv_id for dv_id in accessible_dv_ids}

        # Find which dimensions the user has restrictions on
        rows = (
            self.db.query(DimensionValue.dimension_id)
            .filter(DimensionValue.id.in_(accessible_dv_ids))
            .distinct()
            .all()
        )
        restricted_dim_ids = {row[0] for row in rows}

        # Group record's dimension values by dimension
        record_rows = (
            self.db.query(DimensionValue.id, DimensionValue.dimension_id)
            .filter(DimensionValue.id.in_(record_dv_ids))
            .all()
        )
        dims_to_values: dict[uuid.UUID, list[uuid.UUID]] = {}
        for dv_id, dim_id in record_rows:
            dims_to_values.setdefault(dim_id, []).append(dv_id)

        # For each restricted dimension the record has values for,
        # at least one value must be in the allowed set
        for dim_id in restricted_dim_ids:
            record_values = dims_to_values.get(dim_id)
            if not record_values:
                continue  # record has no values for this dimension → ok
            if not any(v in allowed for v in record_values):
                raise ForbiddenError("You do not have access to this record")

    def update_access(
        self, user_id: uuid.UUID, dimension_value_ids: list[uuid.UUID]
    ) -> list[UserDimension]:
        """Bulk-replace a user's dimension access.

        Only values belonging to access-control dimensions (controls_access=true)
        may be assigned. Tag-like axes are silently ineligible.
        """
        if dimension_value_ids:
            ineligible = (
                self.db.query(Dimension.name)
                .join(DimensionValue, DimensionValue.dimension_id == Dimension.id)
                .filter(DimensionValue.id.in_(dimension_value_ids))
                .filter(Dimension.controls_access.is_(False))
                .first()
            )
            if ineligible:
                raise ValidationError(
                    f"Dimension '{ineligible[0]}' is not used for access control "
                    "and cannot be assigned to a user."
                )

        self.db.query(UserDimension).filter_by(user_id=user_id).delete()
        for dv_id in dimension_value_ids:
            self.db.add(UserDimension(user_id=user_id, dimension_value_id=dv_id))
        self.db.commit()
        return self.get_access(user_id)
