"""
Bulk-create test sessions (activities) for end-to-end testing.

Creates a creative mix of session scenarios so every interesting code path
in the Session form / detail / list pages has data to exercise:

- Outreach + Institutions across multiple locations & interventions
- Outreach + Post-Institutions (Maharashtra) — visit/placement style sessions
- Outreach + Community (Turbhe / Kamathipura) — incl. Physical Health & Nutrition
- Transformation + Thane + Physical Health  →  beneficiary participants get
  the Physical Health participant meta filled in (Weight, H.B., Menstruation,
  Protein/Iron/Cal, Health Issues, Psychiatric Consultation)
- Transformation + Thane + Mental Health / Education / Life Skill Education /
  Skill Building  →  each gets a Sub-Intervention picked from its allowed pool
- Transformation + Thane + Job Readiness / Mentoring  →  no sub-intervention

Each session is populated with:
  - random Date in the last 90 days
  - 3-8 random beneficiaries as participants
  - 0-2 facilitator participants (if any facilitator entities exist)
  - a random user participant ~70% of the time (if any user exists)

Participant status is left null because the kshamata session participant
fields don't set ``capture_status`` — turn that on per-field if you want
present/absent semantics.

Sessions are tagged with ``meta._seed_marker = "test-session"`` so they can
be cleared cleanly on the next run. Re-running without ``--clear`` appends.

Usage:
    cd backend
    python -m app.seeds.test_sessions
    python -m app.seeds.test_sessions --count 50
    python -m app.seeds.test_sessions --clear
    python -m app.seeds.test_sessions --org KSHAMATA --count 100 --clear

Or via Make:
    make seed-test-sessions
    make seed-test-sessions n=50
    make seed-test-sessions n=100 clear=1
"""

import argparse
import random
import sys
import uuid
from datetime import date, timedelta

from app.core.database import SessionLocal
from app.modules.activity.model import (  # noqa: F401
    Activity,
    ActivityParticipant,
    ActivityType,
)
from app.modules.auth.model import User
from app.modules.dimension.model import (  # noqa: F401
    ActivityDimension,
    Dimension,
    DimensionValue,
    DimensionValueLink,
    EntityDimension,
)
from app.modules.enrollment.model import Enrollment  # noqa: F401
from app.modules.entity.model import Entity, EntityType
from app.modules.organization.model import (  # noqa: F401
    ListConfig,
    MetaFieldSchema,
    Organization,
)
from app.modules.role.model import Permission, Role, RolePermission  # noqa: F401

DEFAULT_ORG_CODE = "KSHAMATA"
DEFAULT_COUNT = 30
SEED_MARKER_KEY = "_seed_marker"
SEED_MARKER_VALUE = "test-session"

# (programme_name, project_name_or_None, location_name, intervention_name,
#  sub_intervention_pool_or_None, weight)
# Weights control how often a scenario is picked — higher = more sessions.
SCENARIOS = [
    # ── Outreach + Institutions ─────────────────────────────────────────
    ("Kshamata Outreach Programme", "Institutions", "ShantiSadan",
     "Life Skill Education", None, 2),
    ("Kshamata Outreach Programme", "Institutions", "ShantiSadan",
     "Job Readiness", None, 2),
    ("Kshamata Outreach Programme", "Institutions", "Kasturba",
     "Vocational Skill Training", None, 1),
    ("Kshamata Outreach Programme", "Institutions", "Navjeevan",
     "Basic Literacy", None, 1),
    ("Kshamata Outreach Programme", "Institutions", "Deonar Minor Home",
     "Financial Literacy", None, 1),
    ("Kshamata Outreach Programme", "Institutions", "Ulhasnagar Minor Home",
     "Digital Literacy", None, 1),
    # ── Outreach + Post-Institutions ────────────────────────────────────
    ("Kshamata Outreach Programme", "Post Institutions", "Maharashtra",
     "Home Visits", None, 1),
    ("Kshamata Outreach Programme", "Post Institutions", "Maharashtra",
     "Job Placement", None, 1),
    ("Kshamata Outreach Programme", "Post Institutions", "Maharashtra",
     "Monthly Meeting with Women Participants", None, 1),
    # ── Outreach + Community ────────────────────────────────────────────
    ("Kshamata Outreach Programme", "Community", "Turbhe",
     "Physical Health & Nutrition", None, 1),
    ("Kshamata Outreach Programme", "Community", "Turbhe",
     "Micro Business Training", None, 1),
    ("Kshamata Outreach Programme", "Community", "Kamathipura",
     "SHG", None, 1),
    ("Kshamata Outreach Programme", "Community", "Bhiwandi",
     "Self Help Group", None, 1),
    # ── Transformation + Thane (no projects) ────────────────────────────
    # Physical Health: participants get custom meta filled in.
    ("Kshamata Transformation Programme", None, "Thane",
     "Physical Health", None, 4),
    # These four have sub-intervention pools.
    ("Kshamata Transformation Programme", None, "Thane",
     "Mental Health",
     ["IC", "GC", "DMT", "Yoga", "Sound T. Meditation 2"], 3),
    ("Kshamata Transformation Programme", None, "Thane",
     "Life Skill Education",
     ["Karrate", "Vachashuddhi", "Basic", "Core", "Advanced", "Exposure"], 2),
    ("Kshamata Transformation Programme", None, "Thane",
     "Education",
     ["Formal", "Spoken English", "Maths", "Computer", "MSCIT",
      "Financial Literacy"], 2),
    ("Kshamata Transformation Programme", None, "Thane",
     "Skill Building",
     ["Tailoring", "Jewelry", "Exhibition"], 2),
    # No sub-intervention for these.
    ("Kshamata Transformation Programme", None, "Thane",
     "Job Readiness", None, 1),
    ("Kshamata Transformation Programme", None, "Thane",
     "Mentoring", None, 1),
]

def _field_def_by_label(fields: list[dict], label: str) -> dict | None:
    return next((f for f in (fields or []) if f.get("label") == label), None)


def _field_key(fields: list[dict], label: str) -> str | None:
    fd = _field_def_by_label(fields, label)
    return fd.get("key") if fd else None


def _random_date_within_last_n_days(n: int = 90) -> str:
    delta = random.randint(0, n)
    d = date.today() - timedelta(days=delta)
    return d.isoformat()


def _random_physical_health_meta(ph_keys: dict[str, str]) -> dict:
    """Generate realistic-ish Physical Health participant meta."""
    meta = {}
    if "Weight of the Woman" in ph_keys:
        meta[ph_keys["Weight of the Woman"]] = round(random.uniform(42, 78), 1)
    if "Menstruation" in ph_keys:
        meta[ph_keys["Menstruation"]] = random.choice(
            ["Regular", "Irregular", "Painful", "Heavy flow", "Normal"]
        )
    if "H.B." in ph_keys:
        meta[ph_keys["H.B."]] = round(random.uniform(8.0, 13.5), 1)
    if "Protein/Iron/Cal" in ph_keys:
        meta[ph_keys["Protein/Iron/Cal"]] = random.choice(
            ["Adequate", "Iron deficient", "Calcium low", "Protein low", "Balanced"]
        )
    if "Health Issues" in ph_keys:
        meta[ph_keys["Health Issues"]] = random.choice(
            ["", "Fatigue", "Headaches", "Back pain", "Anaemia", "PCOS", "None"]
        )
    if "Psychiatric Consultation" in ph_keys:
        meta[ph_keys["Psychiatric Consultation"]] = random.choice(
            ["", "Not required", "Recommended", "Ongoing", "Follow-up scheduled"]
        )
    return meta


def seed(org_code: str, count: int, clear: bool) -> None:
    db = SessionLocal()
    try:
        org = db.query(Organization).filter_by(code=org_code).first()
        if not org:
            print(f"ERROR: Organization with code '{org_code}' not found.")
            sys.exit(1)

        # ── Activity type: Session ──────────────────────────────────────
        sessions_type = (
            db.query(ActivityType)
            .filter_by(organization_id=org.id, key="session")
            .first()
        )
        if not sessions_type:
            # Tolerate legacy key.
            sessions_type = (
                db.query(ActivityType)
                .filter_by(organization_id=org.id, key="sessions")
                .first()
            )
        if not sessions_type:
            print(
                "ERROR: Sessions activity type not found in this org. "
                "Run `make seed-org file=kshamata` first."
            )
            sys.exit(1)

        # ── Session meta field schema → Date key ────────────────────────
        session_schema_row = (
            db.query(MetaFieldSchema)
            .filter_by(
                organization_id=org.id,
                scope_type="activity",
                activity_type_id=sessions_type.id,
            )
            .first()
        )
        if not session_schema_row or not session_schema_row.fields:
            print(
                "ERROR: Session meta field schema not found. "
                "Run `make seed-org file=kshamata` first."
            )
            sys.exit(1)
        session_fields = session_schema_row.fields
        date_key = _field_key(session_fields, "Date")
        if not date_key:
            print("ERROR: 'Date' field not found on Session schema.")
            sys.exit(1)

        # ── Entity types ────────────────────────────────────────────────
        bene_et = (
            db.query(EntityType)
            .filter_by(organization_id=org.id, key="beneficiary")
            .first()
        )
        if not bene_et:
            print("ERROR: Beneficiary entity type not found.")
            sys.exit(1)
        fac_et = (
            db.query(EntityType)
            .filter_by(organization_id=org.id, key="facilitator")
            .first()
        )

        # ── Dimensions and values ───────────────────────────────────────
        dims = {
            d.key: d
            for d in db.query(Dimension).filter_by(organization_id=org.id).all()
        }
        required_dim_keys = [
            "programme",
            "project",
            "location",
            "intervention",
            "sub_intervention",
        ]
        missing = [k for k in required_dim_keys if k not in dims]
        if missing:
            print(f"ERROR: Missing dimensions: {missing}")
            sys.exit(1)

        dv_by_dim_name: dict[str, dict[str, DimensionValue]] = {}
        for key, dim in dims.items():
            dv_by_dim_name[key] = {
                dv.name: dv
                for dv in db.query(DimensionValue)
                .filter_by(dimension_id=dim.id)
                .all()
            }

        # ── Physical Health participant meta schema (for beneficiaries) ──
        ph_dv = dv_by_dim_name["intervention"].get("Physical Health")
        ph_keys: dict[str, str] = {}
        if ph_dv:
            ph_schema = (
                db.query(MetaFieldSchema)
                .filter_by(
                    organization_id=org.id,
                    scope_type="participant",
                    entity_type_id=bene_et.id,
                    activity_type_id=sessions_type.id,
                    dimension_value_id=ph_dv.id,
                    dimension_id=dims["intervention"].id,
                )
                .first()
            )
            if ph_schema and ph_schema.fields:
                ph_keys = {f["label"]: f["key"] for f in ph_schema.fields}

        # ── Participants pool ───────────────────────────────────────────
        beneficiaries = (
            db.query(Entity)
            .filter_by(organization_id=org.id, entity_type_id=bene_et.id)
            .limit(500)
            .all()
        )
        if not beneficiaries:
            print(
                "ERROR: No beneficiaries found in this org. "
                "Run `make seed-test-entities` first."
            )
            sys.exit(1)
        facilitators = (
            db.query(Entity)
            .filter_by(organization_id=org.id, entity_type_id=fac_et.id)
            .all()
            if fac_et
            else []
        )
        users = db.query(User).filter_by(organization_id=org.id).limit(5).all()

        # ── Clear prior test sessions (optional) ────────────────────────
        # Bulk-delete via the query — Activity.participants has no ORM-side
        # cascade, so a per-row db.delete() makes SQLAlchemy try to NULL the
        # child FKs before DB CASCADE fires. The bulk delete bypasses the
        # session and lets `ondelete=CASCADE` do its job.
        if clear:
            stale_count = (
                db.query(Activity)
                .filter(
                    Activity.organization_id == org.id,
                    Activity.meta[SEED_MARKER_KEY].astext == SEED_MARKER_VALUE,
                )
                .delete(synchronize_session=False)
            )
            db.flush()
            print(f"Cleared {stale_count} prior test sessions.")

        # ── Pre-compute the weighted scenario pool ──────────────────────
        weighted_scenarios = []
        for s in SCENARIOS:
            weighted_scenarios.extend([s] * s[-1])

        # Pre-resolve dimension-field keys on the Session schema, by label.
        dim_field_key = {
            "Programme": _field_key(session_fields, "Programme"),
            "Project": _field_key(session_fields, "Project"),
            "Location": _field_key(session_fields, "Location"),
            "Intervention": _field_key(session_fields, "Intervention"),
            "Sub-Intervention": _field_key(session_fields, "Sub-Intervention"),
        }

        # ── Create sessions ─────────────────────────────────────────────
        created = 0
        skipped: list[str] = []
        intervention_counts: dict[str, int] = {}
        if count == 0:
            db.commit()
            return
        for _ in range(count):
            (
                prog_name,
                proj_name,
                loc_name,
                intervention_name,
                sub_pool,
                _weight,
            ) = random.choice(weighted_scenarios)

            dvs: dict[str, DimensionValue | None] = {
                "Programme": dv_by_dim_name["programme"].get(prog_name),
                "Project": (
                    dv_by_dim_name["project"].get(proj_name) if proj_name else None
                ),
                "Location": dv_by_dim_name["location"].get(loc_name),
                "Intervention": dv_by_dim_name["intervention"].get(intervention_name),
                "Sub-Intervention": (
                    dv_by_dim_name["sub_intervention"].get(random.choice(sub_pool))
                    if sub_pool
                    else None
                ),
            }
            missing_dvs = [
                k for k in ("Programme", "Location", "Intervention") if not dvs[k]
            ]
            if missing_dvs:
                skipped.append(
                    f"{prog_name}/{loc_name}/{intervention_name}: missing {missing_dvs}"
                )
                continue

            # Build meta dict using the random-suffixed keys.
            meta: dict = {
                date_key: _random_date_within_last_n_days(),
                SEED_MARKER_KEY: SEED_MARKER_VALUE,
            }
            for label, dv in dvs.items():
                fkey = dim_field_key.get(label)
                if fkey and dv is not None:
                    meta[fkey] = str(dv.id)

            activity = Activity(
                organization_id=org.id,
                activity_type_id=sessions_type.id,
                meta=meta,
                created_by=users[0].id if users else None,
            )
            db.add(activity)
            db.flush()

            # Activity ↔ DimensionValue links
            for dv in dvs.values():
                if dv is None:
                    continue
                db.add(
                    ActivityDimension(
                        activity_id=activity.id,
                        dimension_value_id=dv.id,
                    )
                )

            # ── Participants ────────────────────────────────────────────
            is_physical_health = intervention_name == "Physical Health"
            n_bene = random.randint(3, min(8, len(beneficiaries)))
            chosen_benes = random.sample(beneficiaries, n_bene)
            for b in chosen_benes:
                p_meta = (
                    _random_physical_health_meta(ph_keys)
                    if is_physical_health and ph_keys
                    else None
                )
                db.add(
                    ActivityParticipant(
                        activity_id=activity.id,
                        participant_type="entity",
                        participant_id=b.id,
                        section_key=str(bene_et.id),
                        status=None,
                        meta=p_meta,
                    )
                )

            if facilitators:
                n_fac = random.randint(0, min(2, len(facilitators)))
                for f in random.sample(facilitators, n_fac):
                    db.add(
                        ActivityParticipant(
                            activity_id=activity.id,
                            participant_type="entity",
                            participant_id=f.id,
                            section_key=str(fac_et.id),
                            status=None,
                            meta=None,
                        )
                    )

            if users and random.random() < 0.7:
                u = random.choice(users)
                db.add(
                    ActivityParticipant(
                        activity_id=activity.id,
                        participant_type="user",
                        participant_id=u.id,
                        section_key="user",
                        status=None,
                        meta=None,
                    )
                )

            created += 1
            intervention_counts[intervention_name] = (
                intervention_counts.get(intervention_name, 0) + 1
            )

        db.commit()

        # ── Summary ─────────────────────────────────────────────────────
        print(f"\nCreated {created} test sessions in org '{org_code}'.")
        if intervention_counts:
            print("  By intervention:")
            for name, n in sorted(
                intervention_counts.items(), key=lambda kv: -kv[1]
            ):
                print(f"    {name:<40} {n}")
        if skipped:
            print(f"  Skipped {len(skipped)} (missing dimension values):")
            for s in skipped[:10]:
                print(f"    {s}")
        total_sessions = (
            db.query(Activity)
            .filter_by(organization_id=org.id, activity_type_id=sessions_type.id)
            .count()
        )
        print(f"  Total session count in org: {total_sessions}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--org", default=DEFAULT_ORG_CODE, help="Organization code")
    parser.add_argument(
        "--count", type=int, default=DEFAULT_COUNT, help="Number of sessions"
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Delete sessions tagged as test-session before inserting new ones",
    )
    args = parser.parse_args()

    if args.count < 0:
        print("ERROR: --count must be >= 0")
        sys.exit(1)
    if args.count == 0 and not args.clear:
        print("Nothing to do — pass --count > 0 or --clear.")
        sys.exit(0)

    # Stable randomness within a single run is fine; seeding is intentionally
    # NOT fixed so each run produces a fresh mix.
    seed(org_code=args.org, count=args.count, clear=args.clear)


if __name__ == "__main__":
    main()
