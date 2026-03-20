"""
Kshamata seed script: creates org, dimensions (Programme, Project, Location,
Intervention), entity types, activity type, dimension value links,
and admin user.

Interventions are regular dimension values — no ActivityType entity needed.

Usage:
    cd backend
    python -m app.seeds.kshamata
"""

import logging
import sys

from app.core.database import SessionLocal
from app.modules.organization.model import MetaFieldSchema, Organization
from app.modules.dimension.model import Dimension, DimensionValue, DimensionValueLink
from app.modules.activity.model import ActivityType
from app.modules.entity.model import EntityType
from app.modules.auth.model import User
from app.modules.role.model import Permission, Role, RolePermission
from app.common.helpers.slugify import slugify
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
# Entity Types
# ---------------------------------------------------------------------------
ENTITY_TYPES = [
    {
        "name": "Beneficiary",
        "config": {"case_number_enabled": True, "can_enroll": True},
        "sort_order": 0,
    },
    {
        "name": "Facilitator",
        "config": {"case_number_enabled": False, "can_enroll": False},
        "sort_order": 1,
    },
]

# ---------------------------------------------------------------------------
# Activity Type: Sessions (form builder config)
# participant_source UUIDs are populated at seed time after entity types are created
# ---------------------------------------------------------------------------
SESSIONS_TYPE_NAME = "Sessions"
SESSIONS_TYPE_SORT_ORDER = 0
SESSIONS_SECTIONS_TEMPLATE = [
    {
        "key": "beneficiaries",
        "label": "Beneficiaries",
        "entity_type_name": "Beneficiary",  # resolved to UUID at seed time
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
        "entity_type_name": "Facilitator",  # resolved to UUID at seed time
        "selection_mode": "multi_select",
        "min_count": 1,
        "max_count": None,
        "capture_status": False,
        "statuses": [],
        "default_status": None,
    },
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
# Dimension: Intervention (formerly ActivityType)
# Now just regular dimension values like Location, Programme, etc.
# ---------------------------------------------------------------------------
INTERVENTIONS = [
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

# Location → Interventions (from the master spreadsheet)
LOCATION_INTERVENTIONS = {
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
# Programme → Interventions (explicit, authoritative)
# ---------------------------------------------------------------------------
PROGRAMME_INTERVENTIONS = {
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


# ---------------------------------------------------------------------------
# Meta Field Schemas — custom fields for Beneficiary entity type
# ---------------------------------------------------------------------------
BENEFICIARY_CUSTOM_FIELDS = [
    {
        "key": "nationality",
        "label": "Nationality",
        "type": "select",
        "required": False,
        "options": ["Indian", "Bangladeshi"],
    },
    {
        "key": "contact_number",
        "label": "Contact No.",
        "type": "text",
        "required": False,
    },
    {
        "key": "current_address",
        "label": "Current Address",
        "type": "text",
        "required": False,
    },
    {
        "key": "native_place",
        "label": "Native Place",
        "type": "text",
        "required": False,
    },
    {
        "key": "age",
        "label": "Age",
        "type": "number",
        "required": False,
    },
    {
        "key": "education",
        "label": "Education",
        "type": "text",
        "required": False,
    },
]


# ---------------------------------------------------------------------------
# Meta Field Schemas — custom fields for Facilitator entity type
# ---------------------------------------------------------------------------
FACILITATOR_CUSTOM_FIELDS = [
    {
        "key": "contact_number",
        "label": "Contact No.",
        "type": "text",
        "required": False,
    },
]


def _make_intervention_code(name: str) -> str:
    """Convert intervention name to a slugified dimension value code."""
    import re

    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    return slug.strip("_")


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
    else:
        if name and dim.name != name:
            dim.name = name
        db.flush()
    print(f"  Ensured dimension: {dim.name}")
    return dim


def _ensure_values(db, org, dimension, values_list):
    value_map = {}
    for idx, (seed_key, name) in enumerate(values_list):
        slug = slugify(name)
        # Look up by slug (current convention) or legacy seed_key
        dv = db.query(DimensionValue).filter_by(dimension_id=dimension.id, code=slug).first()
        if not dv:
            dv = (
                db.query(DimensionValue).filter_by(dimension_id=dimension.id, code=seed_key).first()
            )
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


def _ensure_intervention_values(db, org, dimension, names):
    """Create dimension values for interventions (name-based, no seed key)."""
    value_map = {}
    for idx, name in enumerate(names):
        code = _make_intervention_code(name)
        dv = db.query(DimensionValue).filter_by(dimension_id=dimension.id, code=code).first()
        if not dv:
            # Check for legacy uppercase code (from old ActivityType sync)
            legacy_code = (
                name.upper().replace(" ", "_").replace("-", "_").replace("/", "_").replace(",", "")
            )
            dv = (
                db.query(DimensionValue)
                .filter_by(dimension_id=dimension.id, code=legacy_code)
                .first()
            )
            if dv:
                dv.code = code
                db.flush()
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
        value_map[name] = dv
    print(f"  Ensured {len(names)} intervention dimension values")
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


def _remove_stale_programme_intervention_links(db, programme_map, intervention_map, valid_mapping):
    """Remove Programme<>Intervention links for programmes not in valid_mapping."""
    all_intervention_dv_ids = {dv.id for dv in intervention_map.values()}
    removed = 0
    for prog_code, prog_dv in programme_map.items():
        if prog_code in valid_mapping:
            continue
        stale = (
            db.query(DimensionValueLink)
            .filter(
                (
                    (DimensionValueLink.dimension_value_id_1 == prog_dv.id)
                    & (DimensionValueLink.dimension_value_id_2.in_(all_intervention_dv_ids))
                )
                | (
                    (DimensionValueLink.dimension_value_id_2 == prog_dv.id)
                    & (DimensionValueLink.dimension_value_id_1.in_(all_intervention_dv_ids))
                )
            )
            .all()
        )
        for link in stale:
            db.delete(link)
            removed += 1
    if removed:
        db.flush()
        print(f"  Removed {removed} stale programme<>intervention dimension value links")


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
                meta={},
            )
            db.add(org)
            db.flush()
            print(f"Created organization: {org.name} ({org.code})")
        else:
            org.name = ORG_NAME
            org.logo_url = ORG_LOGO_URL
            meta = dict(org.meta or {})
            meta.pop("vocabulary", None)
            org.meta = meta
            db.flush()
            print(f"Updated organization: {org.name} ({org.code})")

        # 2. Entity Types
        entity_type_map = {}  # name -> EntityType
        for et_data in ENTITY_TYPES:
            slug = slugify(et_data["name"])
            et = db.query(EntityType).filter_by(organization_id=org.id, key=slug).first()
            if not et:
                et = EntityType(
                    organization_id=org.id,
                    name=et_data["name"],
                    key=slug,
                    config=et_data["config"],
                    sort_order=et_data["sort_order"],
                )
                db.add(et)
                db.flush()
            entity_type_map[et_data["name"]] = et
        print(f"  Ensured {len(ENTITY_TYPES)} entity types")

        # 2b. Meta Field Schemas — Beneficiary custom fields
        beneficiary_et = entity_type_map["Beneficiary"]
        mfs = (
            db.query(MetaFieldSchema)
            .filter_by(
                organization_id=org.id,
                scope_type="entity",
                entity_type_id=beneficiary_et.id,
            )
            .first()
        )
        if not mfs:
            mfs = MetaFieldSchema(
                organization_id=org.id,
                scope_type="entity",
                entity_type_id=beneficiary_et.id,
                fields=BENEFICIARY_CUSTOM_FIELDS,
            )
            db.add(mfs)
            db.flush()
            print(
                f"  Created beneficiary meta field schema ({len(BENEFICIARY_CUSTOM_FIELDS)} fields)"
            )
        else:
            mfs.fields = BENEFICIARY_CUSTOM_FIELDS
            db.flush()
            print(
                f"  Updated beneficiary meta field schema ({len(BENEFICIARY_CUSTOM_FIELDS)} fields)"
            )

        # 2c. Meta Field Schemas — Facilitator custom fields
        facilitator_et = entity_type_map["Facilitator"]
        mfs_f = (
            db.query(MetaFieldSchema)
            .filter_by(
                organization_id=org.id,
                scope_type="entity",
                entity_type_id=facilitator_et.id,
            )
            .first()
        )
        if not mfs_f:
            mfs_f = MetaFieldSchema(
                organization_id=org.id,
                scope_type="entity",
                entity_type_id=facilitator_et.id,
                fields=FACILITATOR_CUSTOM_FIELDS,
            )
            db.add(mfs_f)
            db.flush()
            print(
                f"  Created facilitator meta field schema"
                f" ({len(FACILITATOR_CUSTOM_FIELDS)} fields)"
            )
        else:
            mfs_f.fields = FACILITATOR_CUSTOM_FIELDS
            db.flush()
            print(
                f"  Updated facilitator meta field schema"
                f" ({len(FACILITATOR_CUSTOM_FIELDS)} fields)"
            )

        # 3. Activity Type: Sessions
        sessions_type_key = slugify(SESSIONS_TYPE_NAME)
        sessions_type = (
            db.query(ActivityType).filter_by(organization_id=org.id, key=sessions_type_key).first()
        )
        if not sessions_type:
            sessions_type = ActivityType(
                organization_id=org.id,
                name=SESSIONS_TYPE_NAME,
                key=sessions_type_key,
                sort_order=SESSIONS_TYPE_SORT_ORDER,
            )
            db.add(sessions_type)
            db.flush()
        print(f"  Ensured activity type: {sessions_type.name}")

        # 4. Dimensions (intervention is now a regular dimension, not system)
        programme_dim = _ensure_dimension(db, org, "programme", "Programme", 0)
        project_dim = _ensure_dimension(db, org, "project", "Project", 1)
        location_dim = _ensure_dimension(db, org, "location", "Location", 2)
        intervention_dim = _ensure_dimension(db, org, "intervention", "Intervention", 3)

        # 5. Dimension values
        programme_map = _ensure_values(db, org, programme_dim, PROGRAMMES)
        project_map = _ensure_values(db, org, project_dim, PROJECTS)
        location_map = _ensure_values(db, org, location_dim, LOCATIONS)

        # 6. Intervention dimension values (regular dimension values, no ActivityType)
        intervention_map = _ensure_intervention_values(db, org, intervention_dim, INTERVENTIONS)

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
            db, org, LOCATION_INTERVENTIONS, location_map, intervention_map
        )
        new_links += _ensure_dimension_value_links(
            db, org, PROGRAMME_INTERVENTIONS, programme_map, intervention_map
        )
        _remove_stale_programme_intervention_links(
            db, programme_map, intervention_map, PROGRAMME_INTERVENTIONS
        )
        project_interventions = {}
        for proj_code, loc_codes in PROJECT_LOCATIONS.items():
            intervention_set = set()
            for loc_code in loc_codes:
                intervention_set.update(LOCATION_INTERVENTIONS.get(loc_code, []))
            project_interventions[proj_code] = list(intervention_set)
        new_links += _ensure_dimension_value_links(
            db, org, project_interventions, project_map, intervention_map
        )
        print(f"  Ensured dimension value links ({new_links} new)")

        # 8. Ensure permissions exist (in case initial seed hasn't run)
        from app.seeds.initial import PERMISSIONS as CANONICAL_PERMISSIONS
        from app.seeds.initial import TEAM_MEMBER_PERMISSIONS

        permission_map = {}
        for key, description in CANONICAL_PERMISSIONS:
            perm = db.query(Permission).filter_by(key=key).first()
            if not perm:
                perm = Permission(key=key, description=description)
                db.add(perm)
                db.flush()
            permission_map[key] = perm
        print(f"  Ensured {len(CANONICAL_PERMISSIONS)} permissions exist")

        # 9. Admin role (all permissions — always syncs missing ones)
        admin_role = db.query(Role).filter_by(organization_id=org.id, name="Admin").first()
        if not admin_role:
            admin_role = Role(
                organization_id=org.id,
                name="Admin",
                is_default=False,
                is_system=True,
            )
            db.add(admin_role)
            db.flush()
            print("  Created Admin role")
        else:
            if not admin_role.is_system:
                admin_role.is_system = True
                db.flush()

        existing_admin_perm_ids = {
            rp.permission_id
            for rp in db.query(RolePermission).filter_by(role_id=admin_role.id).all()
        }
        added = 0
        for perm in permission_map.values():
            if perm.id not in existing_admin_perm_ids:
                db.add(RolePermission(role_id=admin_role.id, permission_id=perm.id))
                added += 1
        if added:
            db.flush()
            print(f"  Admin role: added {added} missing permissions (total: {len(permission_map)})")
        else:
            print(f"  Admin role: all {len(permission_map)} permissions present")

        # 10. Team Member role (default role for new users)
        team_role = db.query(Role).filter_by(organization_id=org.id, name="Team Member").first()
        if not team_role:
            team_role = Role(
                organization_id=org.id,
                name="Team Member",
                is_default=True,
            )
            db.add(team_role)
            db.flush()
            print("  Created Team Member role")

        existing_team_perm_ids = {
            rp.permission_id
            for rp in db.query(RolePermission).filter_by(role_id=team_role.id).all()
        }
        added = 0
        for key in TEAM_MEMBER_PERMISSIONS:
            perm = permission_map[key]
            if perm.id not in existing_team_perm_ids:
                db.add(RolePermission(role_id=team_role.id, permission_id=perm.id))
                added += 1
        if added:
            db.flush()
            print(f"  Team Member role: added {added} missing permissions")
        else:
            print(f"  Team Member role: all {len(TEAM_MEMBER_PERMISSIONS)} permissions present")

        # 11. Admin user
        admin_user = db.query(User).filter_by(mobile_number=ADMIN_MOBILE).first()
        if not admin_user:
            admin_user = User(
                first_name="Rahil",
                last_name="Bhansali",
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
        total_loc_intervention_links = sum(len(v) for v in LOCATION_INTERVENTIONS.values())
        total_links = (
            sum(len(v) for v in PROGRAMME_PROJECTS.values())
            + sum(len(v) for v in PROJECT_LOCATIONS.values())
            + sum(len(v) for v in PROGRAMME_LOCATIONS.values())
            + total_loc_intervention_links
        )
        print("\nKshamata seed completed successfully!")
        print(f"  Organisation        : {ORG_NAME}")
        print(f"  Entity Types        : {len(ENTITY_TYPES)}")
        print(f"  Activity Types : 1 (Sessions)")
        print(f"  Roles               : 2 (Admin [system], Team Member [default])")
        print(f"  Dimensions          : 4 (Programme, Project, Location, Intervention)")
        print(f"  Programmes          : {len(PROGRAMMES)}")
        print(f"  Projects            : {len(PROJECTS)}")
        print(f"  Locations           : {len(LOCATIONS)}")
        print(f"  Interventions       : {len(INTERVENTIONS)}")
        print(f"  Dimension Links     : {total_links} combos")
        print(f"    Programme<>Project      : {sum(len(v) for v in PROGRAMME_PROJECTS.values())}")
        print(f"    Project<>Location       : {sum(len(v) for v in PROJECT_LOCATIONS.values())}")
        print(f"    Programme<>Location     : {sum(len(v) for v in PROGRAMME_LOCATIONS.values())}")
        print(f"    Location<>Intervention  : {total_loc_intervention_links}")

    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
