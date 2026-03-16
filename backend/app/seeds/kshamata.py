"""
Kshamata seed script: creates org, dimensions (Programme, Project, Location),
activity types, tag rules, and admin user using the generic dimension system.

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

# Programme → Location (for programmes without projects)
PROGRAMME_LOCATIONS = {
    "TRANSFORMATION": [
        "THANE",
    ],
    "UNLIMITED": [
        "THANE",
        "MANKHURD",
    ],
}


def _ensure_dimension(db, org, key, name, sort_order):
    dim = db.query(Dimension).filter_by(organization_id=org.id, key=key).first()
    if not dim:
        dim = Dimension(
            organization_id=org.id,
            name=name,
            key=key,
            sort_order=sort_order,
        )
        db.add(dim)
        db.flush()
    print(f"  Ensured dimension: {dim.name}")
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
            )
            db.add(org)
            db.flush()
            print(f"Created organization: {org.name} ({org.code})")
        else:
            org.name = ORG_NAME
            org.logo_url = ORG_LOGO_URL
            db.flush()
            print(f"Updated organization: {org.name} ({org.code})")

        # 2. Dimensions
        programme_dim = _ensure_dimension(db, org, "programme", "Programme", 0)
        project_dim = _ensure_dimension(db, org, "project", "Project", 1)
        location_dim = _ensure_dimension(db, org, "location", "Location", 2)

        # 3. Dimension values
        programme_map = _ensure_values(db, org, programme_dim, PROGRAMMES)
        project_map = _ensure_values(db, org, project_dim, PROJECTS)
        location_map = _ensure_values(db, org, location_dim, LOCATIONS)

        # 4. Activity Types
        for at_name in ACTIVITY_TYPES:
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
        print(f"  Ensured {len(ACTIVITY_TYPES)} activity types")

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
        # Programme ↔ Location (Transformation, Unlimited — no project layer)
        new_rules += _ensure_tag_rules(
            db, org, PROGRAMME_LOCATIONS, programme_map, location_map
        )
        print(f"  Ensured tag rules ({new_rules} new)")

        # 6. Admin role (all permissions)
        admin_role = db.query(Role).filter_by(organization_id=org.id, name="Admin").first()
        if not admin_role:
            admin_role = Role(
                organization_id=org.id,
                name="Admin",
                is_default=False,
            )
            db.add(admin_role)
            db.flush()

            all_perms = db.query(Permission).all()
            for perm in all_perms:
                rp = RolePermission(role_id=admin_role.id, permission_id=perm.id)
                db.add(rp)
            print(f"  Created Admin role with {len(all_perms)} permissions")
        else:
            print("  Admin role already exists")

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
        total_rules = (
            sum(len(v) for v in PROGRAMME_PROJECTS.values())
            + sum(len(v) for v in PROJECT_LOCATIONS.values())
            + sum(len(v) for v in PROGRAMME_LOCATIONS.values())
        )
        print(f"\nKshamata seed completed successfully!")
        print(f"  Organisation   : {ORG_NAME}")
        print(f"  Dimensions     : 3 (Programme, Project, Location)")
        print(f"  Programmes     : {len(PROGRAMMES)}")
        print(f"  Projects       : {len(PROJECTS)}")
        print(f"  Locations      : {len(LOCATIONS)}")
        print(f"  Activity Types : {len(ACTIVITY_TYPES)}")
        print(f"  Tag Rules      : {total_rules} combos")

    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
