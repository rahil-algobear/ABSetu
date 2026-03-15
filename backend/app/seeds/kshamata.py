"""
Kshamata seed script: creates org, centres, programmes, session templates,
and programme-center links based on the Kshamata organisational workflow chart.

Usage:
    cd backend
    python -m app.seeds.kshamata
"""
import logging
import sys

from app.core.database import SessionLocal
from app.modules.organization.model import (
    Center,
    Organization,
    Programme,
    ProgrammeCenter,
)
from app.modules.session.model import SessionTemplate
from app.modules.auth.model import User
from app.modules.role.model import Permission, Role, RolePermission
from app.modules.beneficiary.model import Beneficiary, Enrollment  # noqa: F401
from app.modules.session.model import (  # noqa: F401
    Facilitator,
    Session,
    SessionFacilitator,
    Attendance,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Admin user (mobile number)
# ---------------------------------------------------------------------------
ADMIN_MOBILE = "9820833010"
ADMIN_COUNTRY_CODE = "+91"

# ---------------------------------------------------------------------------
# Organisation
# ---------------------------------------------------------------------------
ORG_NAME = "Kshamata"
ORG_CODE = "KSHAMATA"

# ---------------------------------------------------------------------------
# Centres (code, name, address hint)
# ---------------------------------------------------------------------------
CENTERS = [
    # Institutions
    ("SHANTISADAN", "ShantiSadan", "Institution"),
    ("KASTURBA", "Kasturba", "Institution"),
    ("NAVJEEVAN", "Navjeevan", "Institution"),
    ("ULHASNAGAR_MH", "Ulhasnagar Minor Home", "Institution"),
    ("BHIWANDI_MH", "Bhiwandi Minor Home", "Institution"),
    ("BKN", "BKN", "Institution"),
    ("DONGRI_MH", "Dongri Minor Home", "Institution"),
    ("DEONAR_MH", "Deonar Minor Home", "Institution"),
    # Post Institutions
    ("MAHARASHTRA", "Maharashtra", "Post Institution"),
    # Community
    ("TURBHE", "Turbhe", "Community"),
    ("KAMATHIPURA", "Kamathipura", "Community"),
    ("SONAPUR", "Sonapur", "Community"),
    ("BHIWANDI_COMM", "Bhiwandi", "Community"),
    # Shared across Transformation & Unlimited
    ("THANE", "Thane", None),
    ("MANKHURD", "Mankhurd", None),
]

# ---------------------------------------------------------------------------
# Programmes
# ---------------------------------------------------------------------------
PROGRAMMES = [
    "Kshamata Outreach Programme",
    "Kshamata Transformation Programme",
    "Kshamata Unlimited",
]

# ---------------------------------------------------------------------------
# Session Templates (unique intervention names across all programmes)
# ---------------------------------------------------------------------------
SESSION_TEMPLATES = [
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
# Programme → Centre mapping
# ---------------------------------------------------------------------------
PROGRAMME_CENTERS = {
    "Kshamata Outreach Programme": [
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
    "Kshamata Transformation Programme": [
        "THANE",
    ],
    "Kshamata Unlimited": [
        "THANE",
        "MANKHURD",
    ],
}

# ---------------------------------------------------------------------------
# Interventions matrix: which session templates run at which centres
# Key = centre code, Value = list of session template names
# ---------------------------------------------------------------------------
CENTRE_INTERVENTIONS = {
    # --- Institutions ---
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
        "Job Readiness",
    ],
    "DEONAR_MH": [
        "Life Skill Education",
        "Vocational Skill Training",
        "Basic Literacy - Languages & Calculations",
        "Financial Literacy",
    ],
    # --- Post Institutions ---
    "MAHARASHTRA": [
        "Telephonic Call to Women Post Released",
        "Home Visits",
        "Institution Visits",
        "Job Placement",
        "Workplace Visits",
        "Monthly Meeting with Women Participants",
        "Physical Health & Nutrition",
        "Counselling",
        "Vocational Skill Training - Stitching, Mehandi",
        "Self Help Group",
        "Job Placement - Boxer",
        "Day Care",
    ],
    # --- Community ---
    "TURBHE": [
        "Life Skill Education",
        "Job Readiness",
        "Micro Business Training",
        "Basic Literacy - Languages & Calculations",
        "Financial Literacy",
        "Digital Literacy",
        "Workplace Visits",
        "SHG",
        "Job Placement",
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
        "Micro Business Training",
        "Institute Visits - Super 50",
        "Job Placement",
        "Workplace Visits",
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
    # --- Transformation Programme & Unlimited (Thane shared) ---
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
    # --- Unlimited (no interventions visible in chart) ---
    "MANKHURD": [],
}


def seed():
    db = SessionLocal()
    try:
        # 1. Organisation
        org = db.query(Organization).filter_by(code=ORG_CODE).first()
        if not org:
            org = Organization(
                name=ORG_NAME,
                code=ORG_CODE,
                case_number_format="{ORG_CODE}-{YY}-{SERIAL}",
            )
            db.add(org)
            db.flush()
            print(f"Created organization: {org.name} ({org.code})")
        else:
            print(f"Organization already exists: {org.name}")

        # 2. Centres
        center_map = {}
        for code, name, address in CENTERS:
            center = (
                db.query(Center)
                .filter_by(organization_id=org.id, code=code)
                .first()
            )
            if not center:
                center = Center(
                    organization_id=org.id,
                    name=name,
                    code=code,
                    address=address,
                )
                db.add(center)
                db.flush()
            center_map[code] = center
        print(f"Ensured {len(CENTERS)} centres exist")

        # 3. Programmes
        programme_map = {}
        for prog_name in PROGRAMMES:
            programme = (
                db.query(Programme)
                .filter_by(organization_id=org.id, name=prog_name)
                .first()
            )
            if not programme:
                programme = Programme(
                    organization_id=org.id,
                    name=prog_name,
                )
                db.add(programme)
                db.flush()
            programme_map[prog_name] = programme
        print(f"Ensured {len(PROGRAMMES)} programmes exist")

        # 4. Session Templates
        template_map = {}
        for tmpl_name in SESSION_TEMPLATES:
            tmpl = (
                db.query(SessionTemplate)
                .filter_by(organization_id=org.id, name=tmpl_name)
                .first()
            )
            if not tmpl:
                tmpl = SessionTemplate(
                    organization_id=org.id,
                    name=tmpl_name,
                )
                db.add(tmpl)
                db.flush()
            template_map[tmpl_name] = tmpl
        print(f"Ensured {len(SESSION_TEMPLATES)} session templates exist")

        # 5. Programme-Centre links
        pc_count = 0
        pc_map = {}  # (programme_name, center_code) → ProgrammeCenter
        for prog_name, center_codes in PROGRAMME_CENTERS.items():
            programme = programme_map[prog_name]
            for center_code in center_codes:
                center = center_map[center_code]
                pc = (
                    db.query(ProgrammeCenter)
                    .filter_by(
                        programme_id=programme.id,
                        center_id=center.id,
                    )
                    .first()
                )
                if not pc:
                    pc = ProgrammeCenter(
                        programme_id=programme.id,
                        center_id=center.id,
                    )
                    db.add(pc)
                    db.flush()
                    pc_count += 1
                pc_map[(prog_name, center_code)] = pc
        print(f"Ensured programme-centre links ({pc_count} new)")

        # 6. Admin role (all permissions)
        admin_role = (
            db.query(Role)
            .filter_by(organization_id=org.id, name="Admin")
            .first()
        )
        if not admin_role:
            admin_role = Role(
                organization_id=org.id,
                name="Admin",
                is_default=False,
            )
            db.add(admin_role)
            db.flush()

            # Attach all existing permissions
            all_perms = db.query(Permission).all()
            for perm in all_perms:
                rp = RolePermission(
                    role_id=admin_role.id, permission_id=perm.id
                )
                db.add(rp)
            print(f"Created Admin role with {len(all_perms)} permissions")
        else:
            print("Admin role already exists")

        # 7. Admin user
        admin_user = (
            db.query(User)
            .filter_by(mobile_number=ADMIN_MOBILE)
            .first()
        )
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
        total_interventions = sum(
            len(v) for v in CENTRE_INTERVENTIONS.values()
        )
        print(f"\nKshamata seed completed successfully!")
        print(f"  Organisation : {ORG_NAME}")
        print(f"  Centres      : {len(CENTERS)}")
        print(f"  Programmes   : {len(PROGRAMMES)}")
        print(f"  Templates    : {len(SESSION_TEMPLATES)}")
        print(f"  Prog-Centres : {len(pc_map)}")
        print(f"  Interventions: {total_interventions} (centre × template combos)")
        print(
            "\nNote: The CENTRE_INTERVENTIONS dict maps which session "
            "templates are offered at each centre. Use this data to "
            "pre-populate session records or guide the UI."
        )

    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
