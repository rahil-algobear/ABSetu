"""
Kshamata seed script: creates org, dimensions (Programme, Project, Location,
Activity Type [system-managed]), entity types, activity types, activity category,
dimension value links, vocabulary, and admin user.

Usage:
    cd backend
    python -m app.seeds.kshamata
"""

import logging
import sys

from app.core.database import SessionLocal
from app.modules.organization.model import Organization
from app.modules.dimension.model import Dimension, DimensionValue, DimensionValueLink
from app.modules.activity.model import ActivityCategory, ActivityType
from app.modules.entity.model import EntityType
from app.modules.auth.model import User
from app.modules.role.model import Permission, Role, RolePermission
from app.modules.entity.model import Entity  # noqa: F401
from app.modules.beneficiary.model import Enrollment  # noqa: F401
from app.modules.activity.model import Activity, ActivityParticipant  # noqa: F401

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
    "activity_category": "Activity Category",
    "participant": "Participant",
    "entity": "Person",
    "enrollment": "Enrollment",
}

# ---------------------------------------------------------------------------
# Entity Types
# ---------------------------------------------------------------------------
ENTITY_TYPES = [
    {
        "name": "Beneficiary",
        "key": "beneficiary",
        "config": {"case_number_enabled": True, "can_enroll": True},
        "sort_order": 0,
    },
    {
        "name": "Facilitator",
        "key": "facilitator",
        "config": {"case_number_enabled": False, "can_enroll": False},
        "sort_order": 1,
    },
]

# ---------------------------------------------------------------------------
# Activity Category: Sessions (form builder config)
# ---------------------------------------------------------------------------
SESSIONS_CATEGORY = {
    "name": "Sessions",
    "key": "sessions",
    "sort_order": 0,
    "sections": [
        {
            "key": "beneficiaries",
            "label": "Beneficiaries",
            "participant_source": "entity_type:beneficiary",
            "selection_mode": "enrolled_checklist",
            "min_count": 0,
            "max_count": None,
            "capture_status": True,
            "statuses": ["present", "absent"],
            "default_status": "present",
        },
        {
            "key": "facilitators",
            "label": "Facilitators",
            "participant_source": "entity_type:facilitator",
            "selection_mode": "multi_select",
            "min_count": 1,
            "max_count": None,
            "capture_status": False,
            "statuses": [],
            "default_status": None,
        },
    ],
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
# Dimension Value Links
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
    # MANKHURD: no interventions yet
}

# ---------------------------------------------------------------------------
# Programme → Activity Types (explicit, authoritative)
# ---------------------------------------------------------------------------
PROGRAMME_ACTIVITY_TYPES = {
    "OUTREACH": [
        # Institutions
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
    ],
    "TRANSFORMATION": [
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
    # UNLIMITED: no interventions per spreadsheet
}


def _make_at_code(name: str) -> str:
    """Convert activity type name to a slugified dimension value code."""
    import re
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    return slug.strip("_")


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


def _slugify(name):
    """Generate a slug/code from a name."""
    import re
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    return slug.strip("_")


def _ensure_values(db, org, dimension, values_list):
    value_map = {}
    for idx, (seed_key, name) in enumerate(values_list):
        slug = _slugify(name)
        # Look up by slug (current convention) or legacy seed_key
        dv = db.query(DimensionValue).filter_by(dimension_id=dimension.id, code=slug).first()
        if not dv:
            dv = db.query(DimensionValue).filter_by(dimension_id=dimension.id, code=seed_key).first()
            if dv:
                # Migrate legacy code to slugified name
                dv.code = slug
                db.flush()
        if not dv:
            dv = DimensionValue(
                organization_id=org.id,
                dimension_id=dimension.id,
                name=name,
                code=slug,
                sort_order=idx,
            )
            db.add(dv)
            db.flush()
        value_map[seed_key] = dv
    print(f"  Ensured {len(values_list)} {dimension.name.lower()} values")
    return value_map


def _ensure_dimension_value_links(db, org, mapping, source_map, target_map):
    count = 0
    for src_code, target_codes in mapping.items():
        src_dv = source_map[src_code]
        for tgt_code in target_codes:
            tgt_dv = target_map[tgt_code]
            existing = (
                db.query(DimensionValueLink)
                .filter_by(
                    dimension_value_id_1=src_dv.id,
                    dimension_value_id_2=tgt_dv.id,
                )
                .first()
            )
            if not existing:
                # Also check reverse
                existing = (
                    db.query(DimensionValueLink)
                    .filter_by(
                        dimension_value_id_1=tgt_dv.id,
                        dimension_value_id_2=src_dv.id,
                    )
                    .first()
                )
            if not existing:
                link = DimensionValueLink(
                    organization_id=org.id,
                    dimension_value_id_1=src_dv.id,
                    dimension_value_id_2=tgt_dv.id,
                )
                db.add(link)
                count += 1
    db.flush()
    return count


def _remove_stale_programme_at_links(db, programme_map, at_dv_map, valid_mapping):
    """Remove Programme<>ActivityType dimension value links for programmes not in valid_mapping."""
    all_at_dv_ids = {dv.id for dv in at_dv_map.values()}
    removed = 0
    for prog_code, prog_dv in programme_map.items():
        if prog_code in valid_mapping:
            continue
        stale = (
            db.query(DimensionValueLink)
            .filter(
                (
                    (DimensionValueLink.dimension_value_id_1 == prog_dv.id)
                    & (DimensionValueLink.dimension_value_id_2.in_(all_at_dv_ids))
                )
                | (
                    (DimensionValueLink.dimension_value_id_2 == prog_dv.id)
                    & (DimensionValueLink.dimension_value_id_1.in_(all_at_dv_ids))
                )
            )
            .all()
        )
        for link in stale:
            db.delete(link)
            removed += 1
    if removed:
        db.flush()
        print(f"  Removed {removed} stale programme<>activity-type dimension value links")


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
            meta = dict(org.meta or {})
            meta["vocabulary"] = VOCABULARY
            org.meta = meta
            db.flush()
            print(f"Updated organization: {org.name} ({org.code})")

        # 2. Entity Types
        for et_data in ENTITY_TYPES:
            et = db.query(EntityType).filter_by(organization_id=org.id, key=et_data["key"]).first()
            if not et:
                et = EntityType(
                    organization_id=org.id,
                    name=et_data["name"],
                    key=et_data["key"],
                    config=et_data["config"],
                    sort_order=et_data["sort_order"],
                )
                db.add(et)
                db.flush()
        print(f"  Ensured {len(ENTITY_TYPES)} entity types")

        # 3. Activity Category: Sessions
        sessions_cat = (
            db.query(ActivityCategory)
            .filter_by(organization_id=org.id, key=SESSIONS_CATEGORY["key"])
            .first()
        )
        if not sessions_cat:
            sessions_cat = ActivityCategory(
                organization_id=org.id,
                name=SESSIONS_CATEGORY["name"],
                key=SESSIONS_CATEGORY["key"],
                sections=SESSIONS_CATEGORY["sections"],
                sort_order=SESSIONS_CATEGORY["sort_order"],
            )
            db.add(sessions_cat)
            db.flush()
        else:
            sessions_cat.sections = SESSIONS_CATEGORY["sections"]
            db.flush()
        print(f"  Ensured activity category: {sessions_cat.name}")

        # 4. Dimensions
        programme_dim = _ensure_dimension(db, org, "programme", "Programme", 0)
        project_dim = _ensure_dimension(db, org, "project", "Project", 1)
        location_dim = _ensure_dimension(db, org, "location", "Location", 2)
        at_dim = _ensure_dimension(
            db, org, "activity_type", "Activity Type", 3, is_system="activity_type"
        )

        # 5. Dimension values
        programme_map = _ensure_values(db, org, programme_dim, PROGRAMMES)
        project_map = _ensure_values(db, org, project_dim, PROJECTS)
        location_map = _ensure_values(db, org, location_dim, LOCATIONS)

        # 6. Activity Types + mirrored dimension values
        at_dv_map = {}
        for idx, at_name in enumerate(ACTIVITY_TYPES):
            at = db.query(ActivityType).filter_by(organization_id=org.id, name=at_name).first()
            if not at:
                at = ActivityType(
                    organization_id=org.id,
                    name=at_name,
                    category_id=sessions_cat.id,
                )
                db.add(at)
                db.flush()
            else:
                # Assign to sessions category if not already
                if not at.category_id:
                    at.category_id = sessions_cat.id
                    db.flush()

            at_code = _make_at_code(at_name)
            dv = db.query(DimensionValue).filter_by(dimension_id=at_dim.id, code=at_code).first()
            if not dv:
                # Check for legacy uppercase code
                legacy_code = at_name.upper().replace(" ", "_").replace("-", "_").replace("/", "_").replace(",", "")
                dv = db.query(DimensionValue).filter_by(dimension_id=at_dim.id, code=legacy_code).first()
                if dv:
                    dv.code = at_code
                    db.flush()
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

        # 7. Dimension Value Links
        new_links = 0
        new_links += _ensure_dimension_value_links(
            db, org, PROGRAMME_PROJECTS, programme_map, project_map
        )
        new_links += _ensure_dimension_value_links(
            db, org, PROJECT_LOCATIONS, project_map, location_map
        )
        new_links += _ensure_dimension_value_links(
            db, org, PROGRAMME_LOCATIONS, programme_map, location_map
        )
        new_links += _ensure_dimension_value_links(
            db, org, LOCATION_ACTIVITY_TYPES, location_map, at_dv_map
        )
        new_links += _ensure_dimension_value_links(
            db, org, PROGRAMME_ACTIVITY_TYPES, programme_map, at_dv_map
        )
        _remove_stale_programme_at_links(db, programme_map, at_dv_map, PROGRAMME_ACTIVITY_TYPES)
        project_activity_types = {}
        for proj_code, loc_codes in PROJECT_LOCATIONS.items():
            at_set = set()
            for loc_code in loc_codes:
                at_set.update(LOCATION_ACTIVITY_TYPES.get(loc_code, []))
            project_activity_types[proj_code] = list(at_set)
        new_links += _ensure_dimension_value_links(
            db, org, project_activity_types, project_map, at_dv_map
        )
        print(f"  Ensured dimension value links ({new_links} new)")

        # 8. Admin role (all permissions — always syncs missing ones)
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
            print(f"  Created admin user: {ADMIN_COUNTRY_CODE} {ADMIN_MOBILE}")
        else:
            admin_user.organization_id = org.id
            admin_user.role_id = admin_role.id
            print(f"  Updated existing user to Kshamata admin: {ADMIN_MOBILE}")

        db.commit()

        # Summary
        total_loc_at_links = sum(len(v) for v in LOCATION_ACTIVITY_TYPES.values())
        total_links = (
            sum(len(v) for v in PROGRAMME_PROJECTS.values())
            + sum(len(v) for v in PROJECT_LOCATIONS.values())
            + sum(len(v) for v in PROGRAMME_LOCATIONS.values())
            + total_loc_at_links
        )
        print(f"\nKshamata seed completed successfully!")
        print(f"  Organisation        : {ORG_NAME}")
        print(f"  Vocabulary          : {len(VOCABULARY)} term overrides")
        print(f"  Entity Types        : {len(ENTITY_TYPES)}")
        print(f"  Activity Categories : 1 (Sessions)")
        print(f"  Dimensions          : 4 (Programme, Project, Location, Activity Type [system])")
        print(f"  Programmes          : {len(PROGRAMMES)}")
        print(f"  Projects            : {len(PROJECTS)}")
        print(f"  Locations           : {len(LOCATIONS)}")
        print(f"  Activity Types      : {len(ACTIVITY_TYPES)}")
        print(f"  Dimension Links     : {total_links} combos")
        print(f"    Programme<>Project : {sum(len(v) for v in PROGRAMME_PROJECTS.values())}")
        print(f"    Project<>Location  : {sum(len(v) for v in PROJECT_LOCATIONS.values())}")
        print(f"    Programme<>Location: {sum(len(v) for v in PROGRAMME_LOCATIONS.values())}")
        print(f"    Location<>Activity : {total_loc_at_links}")

    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
