"""
Bulk-create test entities for load-testing list pages, search, pagination, etc.

For each entity it sets one meta field (looked up by label) to
``"<prefix> <N>"`` and generates a code in the same format as the app's
normal entity creation (``{ORG_CODE}-{YY}-{SERIAL}``), reserving a serial
range atomically via the ``code_counters`` table.

Re-running is safe — each run appends a fresh batch with continuing serials.

Usage:
    cd backend
    python -m app.seeds.test_entities --org KSHAMATA --type Beneficiary --count 1000
    python -m app.seeds.test_entities --count 500 --prefix "Load Test"
    python -m app.seeds.test_entities --org KSHAMATA --type Facilitator --count 50

Or via Make:
    make seed-test-entities                   # defaults: KSHAMATA / Beneficiary / 1000
    make seed-test-entities count=500
    make seed-test-entities org=KSHAMATA type=Facilitator count=50 prefix="Load Test"
"""

import argparse
import sys
import uuid
from datetime import datetime

# Import every model so SQLAlchemy can resolve relationship() string refs.
from app.core.database import SessionLocal
from app.modules.activity.model import (  # noqa: F401
    Activity,
    ActivityParticipant,
    ActivityType,
)
from app.modules.auth.model import User  # noqa: F401
from app.modules.dimension.model import (  # noqa: F401
    Dimension,
    DimensionValue,
    DimensionValueLink,
    EntityDimension,
)
from app.modules.enrollment.model import Enrollment  # noqa: F401
from app.modules.entity.model import CodeCounter, Entity, EntityType
from app.modules.organization.model import (  # noqa: F401
    ListConfig,
    MetaFieldSchema,
    Organization,
)
from app.modules.role.model import Permission, Role, RolePermission  # noqa: F401

DEFAULT_ORG_CODE = "KSHAMATA"
DEFAULT_ENTITY_TYPE = "Beneficiary"
DEFAULT_COUNT = 1000
DEFAULT_PREFIX = "Auto-Test Beneficiary"
DEFAULT_NAME_FIELD_LABEL = "Name"


def _resolve_name_field_key(
    db, org_id: uuid.UUID, entity_type_id: uuid.UUID, label: str
) -> str | None:
    """Find the meta field key for the given label on this entity type.

    Meta field keys have random suffixes (e.g. ``ojlq_name``), so we look
    them up by their human label.
    """
    schema = (
        db.query(MetaFieldSchema)
        .filter_by(
            organization_id=org_id,
            scope_type="entity",
            entity_type_id=entity_type_id,
        )
        .first()
    )
    if not schema:
        return None
    for field in schema.fields or []:
        if field.get("label") == label:
            return field.get("key")
    return None


def seed(
    org_code: str,
    entity_type_name: str,
    count: int,
    prefix: str,
    name_field_label: str,
) -> None:
    db = SessionLocal()
    try:
        org = db.query(Organization).filter_by(code=org_code).first()
        if not org:
            print(f"ERROR: Organization with code '{org_code}' not found.")
            sys.exit(1)

        entity_type = (
            db.query(EntityType)
            .filter_by(organization_id=org.id, name=entity_type_name)
            .first()
        )
        if not entity_type:
            print(
                f"ERROR: Entity type '{entity_type_name}' not found in org "
                f"'{org_code}'."
            )
            sys.exit(1)

        name_key = _resolve_name_field_key(
            db, org.id, entity_type.id, name_field_label
        )
        if not name_key:
            print(
                f"ERROR: No meta field labelled '{name_field_label}' found on "
                f"entity type '{entity_type_name}'. The script needs one text "
                f"field to write the generated names into. Pass a different "
                f"label with --name-field if needed."
            )
            sys.exit(1)

        # Reserve a contiguous serial range under the row lock so concurrent
        # runs (and concurrent normal entity creation) cannot collide.
        year_2 = datetime.now().strftime("%y")
        counter = (
            db.query(CodeCounter)
            .filter_by(organization_id=org.id, year=year_2)
            .with_for_update()
            .first()
        )
        if not counter:
            counter = CodeCounter(
                organization_id=org.id, year=year_2, last_serial=0
            )
            db.add(counter)
            db.flush()
            counter = (
                db.query(CodeCounter)
                .filter_by(organization_id=org.id, year=year_2)
                .with_for_update()
                .first()
            )

        start_serial = counter.last_serial + 1
        end_serial = counter.last_serial + count
        counter.last_serial = end_serial
        db.flush()

        rows = []
        for i in range(count):
            serial = start_serial + i
            code = f"{org.code}-{year_2}-{str(serial).zfill(3)}"
            rows.append(
                {
                    "id": uuid.uuid4(),
                    "organization_id": org.id,
                    "entity_type_id": entity_type.id,
                    "code": code,
                    "created_by": None,
                    "meta": {name_key: f"{prefix} {i + 1}"},
                }
            )

        db.bulk_insert_mappings(Entity, rows)
        db.commit()

        total = (
            db.query(Entity)
            .filter_by(organization_id=org.id, entity_type_id=entity_type.id)
            .count()
        )
        print(
            f"Inserted {count} {entity_type_name} entities in org '{org_code}'."
        )
        print(f"  Name field key: {name_key}")
        print(f"  Codes:          {rows[0]['code']} .. {rows[-1]['code']}")
        print(f"  Names:          '{prefix} 1' .. '{prefix} {count}'")
        print(f"  Total {entity_type_name} count now: {total}")
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--org", default=DEFAULT_ORG_CODE, help="Organization code")
    parser.add_argument(
        "--type", default=DEFAULT_ENTITY_TYPE, help="Entity type name"
    )
    parser.add_argument(
        "--count", type=int, default=DEFAULT_COUNT, help="Number of entities"
    )
    parser.add_argument(
        "--prefix",
        default=DEFAULT_PREFIX,
        help="Name prefix (suffixed with ' 1', ' 2', ...)",
    )
    parser.add_argument(
        "--name-field",
        default=DEFAULT_NAME_FIELD_LABEL,
        help="Label of the meta field to write the generated name into",
    )
    args = parser.parse_args()

    if args.count <= 0:
        print("ERROR: --count must be > 0")
        sys.exit(1)

    seed(
        org_code=args.org,
        entity_type_name=args.type,
        count=args.count,
        prefix=args.prefix,
        name_field_label=args.name_field,
    )


if __name__ == "__main__":
    main()
