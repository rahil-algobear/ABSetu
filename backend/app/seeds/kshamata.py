"""
Kshamata seed script: creates org, dimensions (Location, Programme),
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
# Dimension: Location (code, name)
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
    # Shared across Transformation & Unlimited
    ("THANE", "Thane"),
    ("MANKHURD", "Mankhurd"),
]

# ---------------------------------------------------------------------------
# Dimension: Programme
# ---------------------------------------------------------------------------
PROGRAMMES = [
    ("OUTREACH", "Kshamata Outreach Programme"),
    ("TRANSFORMATION", "Kshamata Transformation Programme"),
    ("UNLIMITED", "Kshamata Unlimited"),
]

# ---------------------------------------------------------------------------
# Activity Types (formerly Session Templates)
# ---------------------------------------------------------------------------
ACTIVITY_TYPES = [
    "Life Skill Education",
    "Job Readiness",
    "Vocational Skill Training",
    "Digital Literacy",
    "Basic Literacy - Languages & Calculations",
    "Financial Literacy",
    "Counselling",
    "Telephonic Call to Women Post Released",
    "Home Visits",
    "Institution Visits",
    "Job Placement",
    "Workplace Visits",
    "Monthly Meeting with Women Participants",
    "Physical Health & Nutrition",
    "Vocational Skill Training - Stitching, Mehandi",
    "Self Help Group",
    "Job Placement - Boxer",
    "Day Care",
    "Micro Business Training",
    "Institute Visits - Super 50",
    "SHG",
    # Transformation Programme specific
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
# Tag Rules: Programme → Location mapping
# ---------------------------------------------------------------------------
PROGRAMME_LOCATIONS = {
    "OUTREACH": [
        "SHANTISADAN",
        "KASTURBA",
        "NAVJEEVAN",
        "ULHASNAGAR_MH",
        "BHIWANDI_MH",
        "BKN",
        "DONGRI_MH",
        "DEONAR_MH",
        "MAHARASHTRA",
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

        # 2. Dimension: Location
        location_dim = db.query(Dimension).filter_by(organization_id=org.id, key="location").first()
        if not location_dim:
            location_dim = Dimension(
                organization_id=org.id,
                name="Location",
                key="location",
                sort_order=0,
            )
            db.add(location_dim)
            db.flush()
        print(f"Ensured dimension: {location_dim.name}")

        # 3. Dimension: Programme
        programme_dim = (
            db.query(Dimension).filter_by(organization_id=org.id, key="programme").first()
        )
        if not programme_dim:
            programme_dim = Dimension(
                organization_id=org.id,
                name="Programme",
                key="programme",
                sort_order=1,
            )
            db.add(programme_dim)
            db.flush()
        print(f"Ensured dimension: {programme_dim.name}")

        # 4. Location dimension values
        location_map = {}
        for idx, (code, name) in enumerate(LOCATIONS):
            dv = db.query(DimensionValue).filter_by(dimension_id=location_dim.id, code=code).first()
            if not dv:
                dv = DimensionValue(
                    organization_id=org.id,
                    dimension_id=location_dim.id,
                    name=name,
                    code=code,
                    sort_order=idx,
                )
                db.add(dv)
                db.flush()
            location_map[code] = dv
        print(f"Ensured {len(LOCATIONS)} location values")

        # 5. Programme dimension values
        programme_map = {}
        for idx, (code, name) in enumerate(PROGRAMMES):
            dv = (
                db.query(DimensionValue).filter_by(dimension_id=programme_dim.id, code=code).first()
            )
            if not dv:
                dv = DimensionValue(
                    organization_id=org.id,
                    dimension_id=programme_dim.id,
                    name=name,
                    code=code,
                    sort_order=idx,
                )
                db.add(dv)
                db.flush()
            programme_map[code] = dv
        print(f"Ensured {len(PROGRAMMES)} programme values")

        # 6. Activity Types
        for at_name in ACTIVITY_TYPES:
            at = db.query(ActivityType).filter_by(organization_id=org.id, name=at_name).first()
            if not at:
                at = ActivityType(
                    organization_id=org.id,
                    name=at_name,
                )
                db.add(at)
                db.flush()
        print(f"Ensured {len(ACTIVITY_TYPES)} activity types")

        # 7. Tag Rules: Programme → Location
        rule_count = 0
        for prog_code, location_codes in PROGRAMME_LOCATIONS.items():
            prog_dv = programme_map[prog_code]
            for loc_code in location_codes:
                loc_dv = location_map[loc_code]
                existing = (
                    db.query(TagRule)
                    .filter_by(
                        dimension_value_id_1=prog_dv.id,
                        dimension_value_id_2=loc_dv.id,
                    )
                    .first()
                )
                if not existing:
                    rule = TagRule(
                        organization_id=org.id,
                        dimension_value_id_1=prog_dv.id,
                        dimension_value_id_2=loc_dv.id,
                    )
                    db.add(rule)
                    rule_count += 1
        db.flush()
        print(f"Ensured tag rules ({rule_count} new)")

        # 8. Admin role (all permissions)
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
            print(f"Created Admin role with {len(all_perms)} permissions")
        else:
            print("Admin role already exists")

        # 9. Admin user
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
            print(f"Created admin user: {ADMIN_COUNTRY_CODE} {ADMIN_MOBILE}")
        else:
            admin_user.organization_id = org.id
            admin_user.role_id = admin_role.id
            print(f"Updated existing user to Kshamata admin: {ADMIN_MOBILE}")

        db.commit()

        # Summary
        total_rules = sum(len(v) for v in PROGRAMME_LOCATIONS.values())
        print(f"\nKshamata seed completed successfully!")
        print(f"  Organisation   : {ORG_NAME}")
        print(f"  Dimensions     : 2 (Location, Programme)")
        print(f"  Locations      : {len(LOCATIONS)}")
        print(f"  Programmes     : {len(PROGRAMMES)}")
        print(f"  Activity Types : {len(ACTIVITY_TYPES)}")
        print(f"  Tag Rules      : {total_rules} (programme × location combos)")

    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
