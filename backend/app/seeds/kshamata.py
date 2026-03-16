"""
Kshamata seed script: creates org, dimensions (Programme, Project, Location,
Activity Type [system-managed]), activity types, tag rules, vocabulary, and
admin user using the generic dimension system.

Usage:
    cd backend
    python -m app.seeds.kshamata
"""

import logging
import sys

from app.core.database import SessionLocal
from app.modules.organization.model import Organization
from app.modules.dimension.model import Dimension, DimensionValue, TagRule
from app.modules.activity.model import ActivityType
from app.modules.auth.model import User
from app.modules.role.model import Permission, Role, RolePermission
from app.modules.beneficiary.model import Beneficiary, Enrollment  # noqa: F401
from app.modules.activity.model import (  # noqa: F401
    Activity,
    ActivityFacilitator,
    Facilitator,
    Participation,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Admin user
# ---------------------------------------------------------------------------
ADMIN_MOBILE = "9820833010"
ADMIN_COUNTRY_CODE = "+91"

# ---------------------------------------------------------------------------
# Organisation
# ---------------------------------------------------------------------------
ORG_NAME = "Kshamata"
ORG_CODE = "KSHAMATA"
ORG_LOGO_URL = "https://kshamata.org/wp-content/uploads/2022/06/revised-logo.png"

# ---------------------------------------------------------------------------
# Vocabulary mapping — org-level UI label overrides
# ---------------------------------------------------------------------------
VOCABULARY = {
    "activity": "Session",
    "activity_type": "Intervention",
    "participation": "Attendance",
    "facilitator": "Facilitator",
    "beneficiary": "Beneficiary",
    "enrollment": "Enrollment",
}

# ---------------------------------------------------------------------------
# Dimension: Programme
# ---------------------------------------------------------------------------
PROGRAMMES = [
    ("OUTREACH", "Kshamata Outreach Programme"),
    ("TRANSFORMATION", "Kshamata Transformation Programme"),
    ("UNLIMITED", "Kshamata Unlimited"),
]

# ---------------------------------------------------------------------------
# Dimension: Project
# ---------------------------------------------------------------------------
PROJECTS = [
    ("INSTITUTIONS", "Institutions"),
    ("POST_INSTITUTIONS", "Post Institutions"),
    ("COMMUNITY", "Community"),
]

# ---------------------------------------------------------------------------
# Dimension: Location
# ---------------------------------------------------------------------------
LOCATIONS = [
    # Institutions
    ("SHANTISADAN", "ShantiSadan"),
    ("KASTURBA", "Kasturba"),
    ("NAVJEEVAN", "Navjeevan"),
    ("ULHASNAGAR_MH", "Ulhasnagar Minor Home"),
    ("BHIWANDI_MH", "Bhiwandi Minor Home"),
    ("BKN", "BKN"),
    ("DONGRI_MH", "Dongri Minor Home"),
    ("DEONAR_MH", "Deonar Minor Home"),
    # Post Institutions
    ("MAHARASHTRA", "Maharashtra"),
    # Community
    ("TURBHE", "Turbhe"),
    ("KAMATHIPURA", "Kamathipura"),
    ("SONAPUR", "Sonapur"),
    ("BHIWANDI_COMM", "Bhiwandi"),
    # Transformation & Unlimited
    ("THANE", "Thane"),
    ("MANKHURD", "Mankhurd"),
]

# ---------------------------------------------------------------------------
# Activity Types (Interventions from the master sheet)
# ---------------------------------------------------------------------------
ACTIVITY_TYPES = [
    # Common across Institutions
    "Life Skill Education",
    "Job Readiness",
    "Vocational Skill Training",
    "Digital Literacy",
    "Basic Literacy - Languages & Calculations",
    "Financial Literacy",
    "Counselling",
    # Post Institutions
    "Telephonic Call to Women Post Released",
    "Home Visits",
    "Institution Visits",
    "Job Placement",
    "Workplace Visits",
    "Monthly Meeting with Women Participants",
    # Community
    "Micro Business Training",
    "Institute Visits - Super 50",
    "Physical Health & Nutrition",
    "Vocational Skill Training - Stitching, Mehandi",
    "Self Help Group",
    "Job Placement - Boxer",
    "Day Care",
    "SHG",
    # Transformation Programme
    "Physical Health",
    "Mental Health",
    "Education",
    "Skill Building",
    "Job Readiness - Sessions / Visits",
    "Visits",
    "External Training",
    "Mentoring",
    "Job / OJT Placement",
]

# ---------------------------------------------------------------------------
# Tag Rules
# ---------------------------------------------------------------------------

# Programme → Project (only Outreach has projects)
PROGRAMME_PROJECTS = {
    "OUTREACH": ["INSTITUTIONS", "POST_INSTITUTIONS", "COMMUNITY"],
}

# Project → Location
PROJECT_LOCATIONS = {
    "INSTITUTIONS": [
        "SHANTISADAN",
        "KASTURBA",
        "NAVJEEVAN",
        "ULHASNAGAR_MH",
        "BHIWANDI_MH",
        "BKN",
        "DONGRI_MH",
        "DEONAR_MH",
    ],
    "POST_INSTITUTIONS": [
        "MAHARASHTRA",
    ],
    "COMMUNITY": [
        "TURBHE",
        "KAMATHIPURA",
        "SONAPUR",
        "BHIWANDI_COMM",
    ],
}

# Programme → Location
PROGRAMME_LOCATIONS = {
    "OUTREACH": [
        # Institutions
        "SHANTISADAN",
        "KASTURBA",
        "NAVJEEVAN",
        "ULHASNAGAR_MH",
        "BHIWANDI_MH",
        "BKN",
        "DONGRI_MH",
        "DEONAR_MH",
        # Post Institutions
        "MAHARASHTRA",
        # Community
        "TURBHE",
        "KAMATHIPURA",
        "SONAPUR",
        "BHIWANDI_COMM",
    ],
    "TRANSFORMATION": [
        "THANE",
    ],
    "UNLIMITED": [
        "THANE",
        "MANKHURD",
    ],
}

# Location → Activity Types (from the master spreadsheet)
LOCATION_ACTIVITY_TYPES = {
    "SHANTISADAN": [
        "Life Skill Education",
        "Job Readiness",
        "Vocational Skill Training",
        "Digital Literacy",
        "Basic Literacy - Languages & Calculations",
        "Financial Literacy",
    ],
    "KASTURBA": [
        "Life Skill Education",
        "Job Readiness",
        "Vocational Skill Training",
        "Basic Literacy - Languages & Calculations",
        "Financial Literacy",
        "Counselling",
    ],
    "NAVJEEVAN": [
        "Life Skill Education",
        "Job Readiness",
        "Vocational Skill Training",
        "Basic Literacy - Languages & Calculations",
        "Financial Literacy",
        "Counselling",
    ],
    "ULHASNAGAR_MH": [
        "Life Skill Education",
        "Vocational Skill Training",
        "Basic Literacy - Languages & Calculations",
        "Digital Literacy",
    ],
    "BHIWANDI_MH": [
        "Life Skill Education",
        "Vocational Skill Training",
        "Basic Literacy - Languages & Calculations",
        "Digital Literacy",
    ],
    "BKN": [
        "Vocational Skill Training",
    ],
    "DONGRI_MH": [
        "Vocational Skill Training",
    ],
    "DEONAR_MH": [
        "Life Skill Education",
        "Job Readiness",
        "Vocational Skill Training",
        "Basic Literacy - Languages & Calculations",
        "Financial Literacy",
    ],
    "MAHARASHTRA": [
        "Telephonic Call to Women Post Released",
        "Home Visits",
        "Institution Visits",
        "Job Placement",
        "Workplace Visits",
        "Monthly Meeting with Women Participants",
    ],
    "TURBHE": [
        "Life Skill Education",
        "Job Readiness",
        "Micro Business Training",
        "Basic Literacy - Languages & Calculations",
        "Financial Literacy",
        "Digital Literacy",
        "Physical Health & Nutrition",
        "Counselling",
        "Vocational Skill Training - Stitching, Mehandi",
        "Home Visits",
        "Institution Visits",
        "Workplace Visits",
        "Monthly Meeting with Women Participants",
        "Self Help Group",
        "Job Placement - Boxer",
        "Day Care",
    ],
    "KAMATHIPURA": [
        "Life Skill Education",
        "Job Readiness",
        "Financial Literacy",
        "Micro Business Training",
        "Institute Visits - Super 50",
        "Job Placement",
        "Workplace Visits",
        "SHG",
    ],
    "SONAPUR": [
        "Life Skill Education",
        "Job Readiness",
        "Financial Literacy",
        "Micro Business Training",
        "Institute Visits - Super 50",
        "Job Placement",
        "Workplace Visits",
        "SHG",
    ],
    "BHIWANDI_COMM": [
        "Life Skill Education",
        "Job Readiness",
        "Micro Business Training",
        "Basic Literacy - Languages & Calculations",
        "Financial Literacy",
        "Digital Literacy",
        "Physical Health & Nutrition",
        "Counselling",
        "Vocational Skill Training - Stitching, Mehandi",
        "Home Visits",
        "Institution Visits",
        "Workplace Visits",
        "Monthly Meeting with Women Participants",
        "Self Help Group",
        "Job Placement - Boxer",
        "Day Care",
    ],
    "THANE": [
        "Physical Health",
        "Mental Health",
        "Life Skill Education",
        "Education",
        "Skill Building",
        "Job Readiness - Sessions / Visits",
        "Visits",
        "External Training",
        "Mentoring",
        "Job / OJT Placement",
    ],
}


def _make_at_code(name: str) -> str:
    """Convert activity type name to a dimension value code."""
    return name.upper().replace(" ", "_").replace("-", "_").replace("/", "_").replace(",", "")


def _ensure_dimension(db, org, key, name, sort_order, is_system=None):
    dim = db.query(Dimension).filter_by(organization_id=org.id, key=key).first()
    if not dim:
        dim = Dimension(
            organization_id=org.id,
            name=name,
            key=key,
            sort_order=sort_order,
            is_system=is_system,
        )
        db.add(dim)
        db.flush()
    else:
        if name and dim.name != name:
            dim.name = name
        if is_system and not dim.is_system:
            dim.is_system = is_system
        db.flush()
    print(f"  Ensured dimension: {dim.name}" + (" [system]" if dim.is_system else ""))
    return dim


def _ensure_values(db, org, dimension, values_list):
    value_map = {}
    for idx, (code, name) in enumerate(values_list):
        dv = (
            db.query(DimensionValue)
            .filter_by(dimension_id=dimension.id, code=code)
            .first()
        )
        if not dv:
            dv = DimensionValue(
                organization_id=org.id,
                dimension_id=dimension.id,
                name=name,
                code=code,
                sort_order=idx,
            )
            db.add(dv)
            db.flush()
        value_map[code] = dv
    print(f"  Ensured {len(values_list)} {dimension.name.lower()} values")
    return value_map


def _ensure_tag_rules(db, org, mapping, source_map, target_map):
    count = 0
    for src_code, target_codes in mapping.items():
        src_dv = source_map[src_code]
        for tgt_code in target_codes:
            tgt_dv = target_map[tgt_code]
            existing = (
                db.query(TagRule)
                .filter_by(
                    dimension_value_id_1=src_dv.id,
                    dimension_value_id_2=tgt_dv.id,
                )
                .first()
            )
            if not existing:
                # Also check reverse
                existing = (
                    db.query(TagRule)
                    .filter_by(
                        dimension_value_id_1=tgt_dv.id,
                        dimension_value_id_2=src_dv.id,
                    )
                    .first()
                )
            if not existing:
                rule = TagRule(
                    organization_id=org.id,
                    dimension_value_id_1=src_dv.id,
                    dimension_value_id_2=tgt_dv.id,
                )
                db.add(rule)
                count += 1
    db.flush()
    return count


def seed():
    db = SessionLocal()
    try:
        # 1. Organisation (upsert)
        org = db.query(Organization).filter_by(code=ORG_CODE).first()
        if not org:
            org = Organization(
                name=ORG_NAME,
                code=ORG_CODE,
                case_number_format="{ORG_CODE}-{YY}-{SERIAL}",
                logo_url=ORG_LOGO_URL,
                meta={"vocabulary": VOCABULARY},
            )
            db.add(org)
            db.flush()
            print(f"Created organization: {org.name} ({org.code})")
        else:
            org.name = ORG_NAME
            org.logo_url = ORG_LOGO_URL
            # Merge vocabulary into existing meta (deep copy to trigger change detection)
            meta = dict(org.meta or {})
            meta["vocabulary"] = VOCABULARY
            org.meta = meta
            db.flush()
            print(f"Updated organization: {org.name} ({org.code})")

        # 2. Dimensions
        programme_dim = _ensure_dimension(db, org, "programme", "Programme", 0)
        project_dim = _ensure_dimension(db, org, "project", "Project", 1)
        location_dim = _ensure_dimension(db, org, "location", "Location", 2)
        at_dim = _ensure_dimension(
            db, org, "activity_type", "Intervention", 3, is_system="activity_type"
        )

        # 3. Dimension values
        programme_map = _ensure_values(db, org, programme_dim, PROGRAMMES)
        project_map = _ensure_values(db, org, project_dim, PROJECTS)
        location_map = _ensure_values(db, org, location_dim, LOCATIONS)

        # 4. Activity Types + mirrored dimension values
        at_dv_map = {}  # activity type name → dimension value
        for idx, at_name in enumerate(ACTIVITY_TYPES):
            at = (
                db.query(ActivityType)
                .filter_by(organization_id=org.id, name=at_name)
                .first()
            )
            if not at:
                at = ActivityType(
                    organization_id=org.id,
                    name=at_name,
                )
                db.add(at)
                db.flush()

            # Mirror as dimension value in the system Activity Type dimension
            at_code = _make_at_code(at_name)
            dv = (
                db.query(DimensionValue)
                .filter_by(dimension_id=at_dim.id, code=at_code)
                .first()
            )
            if not dv:
                dv = DimensionValue(
                    organization_id=org.id,
                    dimension_id=at_dim.id,
                    name=at_name,
                    code=at_code,
                    sort_order=idx,
                )
                db.add(dv)
                db.flush()
            at_dv_map[at_name] = dv
        print(f"  Ensured {len(ACTIVITY_TYPES)} activity types + dimension values")

        # 5. Tag Rules
        new_rules = 0
        # Programme ↔ Project
        new_rules += _ensure_tag_rules(
            db, org, PROGRAMME_PROJECTS, programme_map, project_map
        )
        # Project ↔ Location
        new_rules += _ensure_tag_rules(
            db, org, PROJECT_LOCATIONS, project_map, location_map
        )
        # Programme ↔ Location
        new_rules += _ensure_tag_rules(
            db, org, PROGRAMME_LOCATIONS, programme_map, location_map
        )
        # Location ↔ Activity Type
        new_rules += _ensure_tag_rules(
            db, org, LOCATION_ACTIVITY_TYPES, location_map, at_dv_map
        )
        # Programme ↔ Activity Type (derived: union of activity types across
        # all locations belonging to each programme)
        programme_activity_types = {}
        for prog_code, loc_codes in PROGRAMME_LOCATIONS.items():
            at_set = set()
            for loc_code in loc_codes:
                at_set.update(LOCATION_ACTIVITY_TYPES.get(loc_code, []))
            programme_activity_types[prog_code] = list(at_set)
        new_rules += _ensure_tag_rules(
            db, org, programme_activity_types, programme_map, at_dv_map
        )
        # Project ↔ Activity Type (derived: union of activity types across
        # all locations belonging to each project)
        project_activity_types = {}
        for proj_code, loc_codes in PROJECT_LOCATIONS.items():
            at_set = set()
            for loc_code in loc_codes:
                at_set.update(LOCATION_ACTIVITY_TYPES.get(loc_code, []))
            project_activity_types[proj_code] = list(at_set)
        new_rules += _ensure_tag_rules(
            db, org, project_activity_types, project_map, at_dv_map
        )
        print(f"  Ensured tag rules ({new_rules} new)")

        # 6. Admin role (all permissions — always syncs missing ones)
        admin_role = db.query(Role).filter_by(organization_id=org.id, name="Admin").first()
        if not admin_role:
            admin_role = Role(
                organization_id=org.id,
                name="Admin",
                is_default=False,
            )
            db.add(admin_role)
            db.flush()
            print(f"  Created Admin role")

        # Sync: grant any current permissions the role doesn't have yet
        from app.seeds.initial import PERMISSIONS as CANONICAL_PERMISSIONS
        canonical_keys = [key for key, _ in CANONICAL_PERMISSIONS]
        all_perms = db.query(Permission).filter(Permission.key.in_(canonical_keys)).all()
        existing_perm_ids = {
            rp.permission_id
            for rp in db.query(RolePermission).filter_by(role_id=admin_role.id).all()
        }
        added = 0
        for perm in all_perms:
            if perm.id not in existing_perm_ids:
                db.add(RolePermission(role_id=admin_role.id, permission_id=perm.id))
                added += 1
        if added:
            db.flush()
            print(f"  Admin role: added {added} missing permissions (total: {len(all_perms)})")
        else:
            print(f"  Admin role: all {len(all_perms)} permissions present")

        # 7. Admin user
        admin_user = db.query(User).filter_by(mobile_number=ADMIN_MOBILE).first()
        if not admin_user:
            admin_user = User(
                first_name="Rahil",
                last_name="Admin",
                country_code=ADMIN_COUNTRY_CODE,
                mobile_number=ADMIN_MOBILE,
                is_verified=True,
                organization_id=org.id,
                role_id=admin_role.id,
            )
            db.add(admin_user)
            print(f"  Created admin user: {ADMIN_COUNTRY_CODE} {ADMIN_MOBILE}")
        else:
            admin_user.organization_id = org.id
            admin_user.role_id = admin_role.id
            print(f"  Updated existing user to Kshamata admin: {ADMIN_MOBILE}")

        db.commit()

        # Summary
        total_loc_at_rules = sum(len(v) for v in LOCATION_ACTIVITY_TYPES.values())
        total_rules = (
            sum(len(v) for v in PROGRAMME_PROJECTS.values())
            + sum(len(v) for v in PROJECT_LOCATIONS.values())
            + sum(len(v) for v in PROGRAMME_LOCATIONS.values())
            + total_loc_at_rules
        )
        print(f"\nKshamata seed completed successfully!")
        print(f"  Organisation        : {ORG_NAME}")
        print(f"  Vocabulary          : {len(VOCABULARY)} term overrides")
        print(f"  Dimensions          : 4 (Programme, Project, Location, Activity Type [system])")
        print(f"  Programmes          : {len(PROGRAMMES)}")
        print(f"  Projects            : {len(PROJECTS)}")
        print(f"  Locations           : {len(LOCATIONS)}")
        print(f"  Activity Types      : {len(ACTIVITY_TYPES)}")
        print(f"  Tag Rules           : {total_rules} combos")
        print(f"    Programme↔Project : {sum(len(v) for v in PROGRAMME_PROJECTS.values())}")
        print(f"    Project↔Location  : {sum(len(v) for v in PROJECT_LOCATIONS.values())}")
        print(f"    Programme↔Location: {sum(len(v) for v in PROGRAMME_LOCATIONS.values())}")
        print(f"    Location↔Activity : {total_loc_at_rules}")

    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
