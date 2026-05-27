"""
Enrollment service
"""

import uuid

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.common.helpers.meta_normalize import normalize_meta_datetimes
from app.modules.dimension.model import DimensionValue, EnrollmentDimension
from app.modules.enrollment.model import Enrollment
from app.modules.entity.model import Entity
from app.modules.organization.service import MetaFieldSchemaService


class EnrollmentService:
    def __init__(self, db: Session):
        self.db = db

    # ── Validation helpers ─────────────────────────────────────────

    def _check_active_enrollment_limits(
        self,
        entity: Entity,
        incoming_dv_ids: set[uuid.UUID],
        exclude_enrollment_id: uuid.UUID | None = None,
    ) -> None:
        """Validate active-enrollment rules for this entity.

        Runs two independent checks:
          1. Total cap from entity_type.max_active_enrollments
          2. Composite-key check from per-dimension-field
             max_active_enrollments (AND semantics on the combined key)

        Either or both may fire. Existing data that already violates
        a rule is left alone — enforcement is for new writes only.

        `exclude_enrollment_id` skips a specific row when counting,
        used by update() to avoid counting the enrollment being
        transitioned to active against itself.
        """
        org_id = entity.organization_id
        entity_type = entity.entity_type

        # ── 1. Total cap ──
        if entity_type.max_active_enrollments is not None:
            q = self.db.query(Enrollment).filter(
                Enrollment.entity_id == entity.id,
                Enrollment.is_active.is_(True),
            )
            if exclude_enrollment_id is not None:
                q = q.filter(Enrollment.id != exclude_enrollment_id)
            current = q.count()
            # New write would push count to current + 1
            if current + 1 > entity_type.max_active_enrollments:
                raise ValidationError(
                    f"This {entity_type.name.lower()} already has {current} "
                    f"active enrollment{'s' if current != 1 else ''} "
                    f"(max allowed: {entity_type.max_active_enrollments}). "
                    f"End an existing one before adding another."
                )

        # ── 2. Composite-key check ──
        # Resolve which dimension fields are part of the key for this
        # enrollment's scope (base + entity-type + each dim-value the
        # incoming enrollment carries).
        capped_fields = self._collect_capped_dimension_fields(
            org_id, entity_type.id, incoming_dv_ids
        )
        if not capped_fields:
            return

        # Map dimension_id → incoming value (one per dimension; multi-value
        # per dimension isn't supported in the enrollment form today).
        incoming_dim_values = self._index_dvs_by_dimension(incoming_dv_ids)

        # Build composite key: each capped field contributes its dimension's
        # incoming value. If a capped field has no incoming value (e.g. the
        # admin marked it as a key but the enrollment didn't fill it), skip
        # the check — there's nothing to be unique on.
        key: dict[uuid.UUID, uuid.UUID] = {}
        for field in capped_fields:
            dim_id = uuid.UUID(field["dimension_id"])
            if dim_id in incoming_dim_values:
                key[dim_id] = incoming_dim_values[dim_id]
        if not key:
            return

        cap = min(int(f["max_active_enrollments"]) for f in capped_fields)

        # Find active enrollments for this entity that match every value in
        # the composite key.
        candidates_q = self.db.query(Enrollment).filter(
            Enrollment.entity_id == entity.id,
            Enrollment.is_active.is_(True),
        )
        if exclude_enrollment_id is not None:
            candidates_q = candidates_q.filter(Enrollment.id != exclude_enrollment_id)

        target_dv_ids = set(key.values())
        matching = 0
        for cand in candidates_q.all():
            cand_dvs = {d.dimension_value_id for d in (cand.dimensions or [])}
            # Match iff candidate carries every target dimension value.
            if target_dv_ids.issubset(cand_dvs):
                matching += 1
        if matching + 1 > cap:
            raise ValidationError(self._composite_key_error(key))

    def _collect_capped_dimension_fields(
        self,
        org_id: uuid.UUID,
        entity_type_id: uuid.UUID,
        incoming_dv_ids: set[uuid.UUID],
    ) -> list[dict]:
        """Return enrollment-scoped dimension field defs that have a
        max_active_enrollments cap and apply to this enrollment.

        Scopes considered: base, entity-type, and each incoming
        dimension-value. Dedup by field key (last writer wins per
        MetaFieldSchemaService convention)."""
        meta_service = MetaFieldSchemaService(self.db)
        seen: dict[str, dict] = {}
        for fd in meta_service.get_schema_by_scope(org_id, "enrollment"):
            seen[fd["key"]] = fd
        for fd in meta_service.get_schema_by_scope(
            org_id, "enrollment", entity_type_id=entity_type_id
        ):
            seen[fd["key"]] = fd
        for dv_id in incoming_dv_ids:
            for fd in meta_service.get_schema_by_scope(
                org_id, "enrollment", dimension_value_id=dv_id
            ):
                seen[fd["key"]] = fd
        return [
            fd
            for fd in seen.values()
            if fd.get("type") == "dimension"
            and fd.get("dimension_id")
            and fd.get("max_active_enrollments") is not None
        ]

    def _index_dvs_by_dimension(self, dv_ids: set[uuid.UUID]) -> dict[uuid.UUID, uuid.UUID]:
        if not dv_ids:
            return {}
        rows = (
            self.db.query(DimensionValue.id, DimensionValue.dimension_id)
            .filter(DimensionValue.id.in_(dv_ids))
            .all()
        )
        # If somehow multiple values for one dimension (shouldn't happen
        # in current UI), keep the last — composite check will see it.
        return {row.dimension_id: row.id for row in rows}

    def _composite_key_error(self, key: dict[uuid.UUID, uuid.UUID]) -> str:
        # Build "Dimension=Value, Dimension=Value" for the message.
        rows = self.db.query(DimensionValue).filter(DimensionValue.id.in_(set(key.values()))).all()
        dv_by_id = {dv.id: dv for dv in rows}
        from app.modules.dimension.model import Dimension

        dims = self.db.query(Dimension).filter(Dimension.id.in_(set(key.keys()))).all()
        dim_by_id = {d.id: d for d in dims}
        parts = []
        for dim_id, dv_id in key.items():
            dim_name = dim_by_id.get(dim_id).name if dim_by_id.get(dim_id) else "?"
            dv_name = dv_by_id.get(dv_id).name if dv_by_id.get(dv_id) else "?"
            parts.append(f"{dim_name}={dv_name}")
        return (
            "An active enrollment with "
            + ", ".join(parts)
            + " already exists for this beneficiary."
        )

    # ── Public API ─────────────────────────────────────────────────

    def list_by_entity(self, entity_id: uuid.UUID) -> list[Enrollment]:
        return (
            self.db.query(Enrollment)
            .filter_by(entity_id=entity_id)
            .order_by(Enrollment.created_at.asc())
            .all()
        )

    def list_by_org(self, org_id: uuid.UUID) -> list[Enrollment]:
        return (
            self.db.query(Enrollment)
            .filter_by(organization_id=org_id)
            .order_by(Enrollment.created_at.asc())
            .all()
        )

    def create(
        self,
        org_id: uuid.UUID,
        data: dict,
        dimension_value_ids: list[str] | None = None,
    ) -> Enrollment:
        # Verify entity belongs to org
        entity = (
            self.db.query(Entity)
            .filter_by(
                id=uuid.UUID(data["entity_id"]),
                organization_id=org_id,
            )
            .first()
        )
        if not entity:
            raise ValidationError("Entity not found in this organization")

        # Verify entity type allows enrollment
        if not entity.entity_type.can_enroll:
            raise ValidationError(
                f"Entity type '{entity.entity_type.name}' does not support enrollments"
            )

        is_active = data.get("is_active", True)

        # Active-enrollment limits (total cap + composite-key uniqueness)
        # — only fire when the new enrollment is going to be active.
        if is_active:
            incoming_dvs = {uuid.UUID(d) for d in (dimension_value_ids or [])}
            self._check_active_enrollment_limits(entity, incoming_dvs)

        meta = normalize_meta_datetimes(dict(data.get("meta") or {}))

        enrollment = Enrollment(
            organization_id=org_id,
            entity_id=entity.id,
            meta=meta,
            is_active=is_active,
        )
        self.db.add(enrollment)
        self.db.flush()

        for dv_id in dimension_value_ids or []:
            dim = EnrollmentDimension(
                enrollment_id=enrollment.id,
                dimension_value_id=uuid.UUID(dv_id),
            )
            self.db.add(dim)

        self.db.commit()
        self.db.refresh(enrollment)
        return enrollment

    def update(self, enrollment_id: uuid.UUID, data: dict) -> Enrollment:
        enrollment = self.db.query(Enrollment).filter_by(id=enrollment_id).first()
        if not enrollment:
            raise NotFoundError("Enrollment not found")

        # Re-validate active-enrollment limits when transitioning inactive
        # → active. Without this, staff could bypass the cap by deactivating
        # one enrollment and reactivating a different one.
        new_is_active = data.get("is_active", enrollment.is_active)
        if new_is_active and not enrollment.is_active:
            entity = enrollment.entity
            existing_dvs = {d.dimension_value_id for d in (enrollment.dimensions or [])}
            self._check_active_enrollment_limits(
                entity, existing_dvs, exclude_enrollment_id=enrollment.id
            )

        # Merge existing meta with updates
        if "meta" in data:
            existing_meta = dict(enrollment.meta or {})
            incoming_meta = data.get("meta") or {}
            existing_meta.update(incoming_meta)
            enrollment.meta = normalize_meta_datetimes(existing_meta)

        if "is_active" in data:
            enrollment.is_active = data["is_active"]

        self.db.commit()
        self.db.refresh(enrollment)
        return enrollment

    def delete(self, enrollment_id: uuid.UUID, org_id: uuid.UUID) -> None:
        enrollment = (
            self.db.query(Enrollment).filter_by(id=enrollment_id, organization_id=org_id).first()
        )
        if not enrollment:
            raise NotFoundError("Enrollment not found")
        # EnrollmentDimension rows cascade via ondelete="CASCADE".
        self.db.delete(enrollment)
        self.db.commit()

    def update_dimensions(
        self, enrollment_id: uuid.UUID, dimension_value_ids: list[str]
    ) -> Enrollment:
        enrollment = self.db.query(Enrollment).filter_by(id=enrollment_id).first()
        if not enrollment:
            raise NotFoundError("Enrollment not found")

        self.db.query(EnrollmentDimension).filter_by(enrollment_id=enrollment.id).delete()
        for dv_id in dimension_value_ids:
            dim = EnrollmentDimension(
                enrollment_id=enrollment.id,
                dimension_value_id=uuid.UUID(dv_id),
            )
            self.db.add(dim)

        self.db.commit()
        self.db.refresh(enrollment)
        return enrollment
