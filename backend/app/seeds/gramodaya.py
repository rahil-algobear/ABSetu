"""
Gramodaya Foundation seed script: a field-work NGO operating across rural
villages on Agriculture, WASH, Rural Health, and Education programmes.

Mirrors the surface area of the Kshamata seeder (entity types, dimensions,
dimension value links, activity type meta fields, enrollment fields,
participant fields, list configs, roles, admin user) but with completely
different domain content. Intentionally uses different names ("Field Visit"
instead of "Session", "Region" instead of "Location", "Activity Theme"
instead of "Intervention", 3 entity types instead of 2) so we catch any
place where the platform has accidentally hardcoded Kshamata-specific
labels or shapes.

Usage:
    cd backend
    python -m app.seeds.gramodaya
"""

import logging
import sys

from app.common.helpers.slugify import slugify
from app.core.database import SessionLocal
from app.modules.activity.model import Activity, ActivityParticipant, ActivityType  # noqa: F401
from app.modules.auth.model import User
from app.modules.dimension.model import Dimension, DimensionValue, DimensionValueLink
from app.modules.enrollment.model import Enrollment  # noqa: F401
from app.modules.entity.model import Entity  # noqa: F401
from app.modules.entity.model import EntityType
from app.modules.organization.model import ListConfig, MetaFieldSchema, Organization
from app.modules.role.model import Permission, Role, RolePermission

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Admin user
# ---------------------------------------------------------------------------
ADMIN_MOBILE = "9322006489"
ADMIN_COUNTRY_CODE = "+91"

# ---------------------------------------------------------------------------
# Organisation
# ---------------------------------------------------------------------------
ORG_NAME = "Gramodaya Foundation"
ORG_CODE = "GRAMODAYA"
ORG_LOGO_URL = None

# ---------------------------------------------------------------------------
# Entity Types — 3 of them, to test cardinality different from Kshamata
# ---------------------------------------------------------------------------
ENTITY_TYPES = [
    {
        "name": "Household",
        "can_enroll": True,
        "sort_order": 0,
    },
    {
        "name": "Self Help Group",
        "can_enroll": True,
        "sort_order": 1,
    },
    {
        "name": "Field Worker",
        "can_enroll": False,
        "sort_order": 2,
    },
]

# ---------------------------------------------------------------------------
# Activity Type: Field Visit (intentionally NOT "Session")
# ---------------------------------------------------------------------------
FIELD_VISIT_TYPE_NAME = "Field Visit"
FIELD_VISIT_TYPE_SORT_ORDER = 0

# ---------------------------------------------------------------------------
# Dimension: Programme
# ---------------------------------------------------------------------------
PROGRAMMES = [
    ("AGRI_LIVELIHOODS", "Agriculture & Livelihoods"),
    ("WASH", "Water, Sanitation & Hygiene"),
    ("RURAL_HEALTH", "Rural Health"),
    ("EDUCATION", "Education Access"),
]

# ---------------------------------------------------------------------------
# Dimension: Project (sub-initiatives within programmes — often donor-funded)
# ---------------------------------------------------------------------------
PROJECTS = [
    # Agriculture
    ("SUSTAINABLE_FARMING", "Sustainable Farming"),
    ("DRIP_IRRIGATION", "Drip Irrigation"),
    ("DAIRY_DEVELOPMENT", "Dairy Development"),
    ("WOMEN_FARMERS", "Women Farmer Empowerment"),
    # WASH
    ("WASH_SCHOOLS", "WASH in Schools"),
    ("VILLAGE_SANITATION", "Village Sanitation"),
    # Health
    ("MOBILE_CLINIC", "Mobile Health Clinic"),
    ("MATERNAL_CARE", "Maternal & Child Care"),
    # Education
    ("ANGANWADI_SUPPORT", "Anganwadi Support"),
    ("REMEDIAL_EDUCATION", "Remedial Education"),
]

# ---------------------------------------------------------------------------
# Dimension: Region (intentionally NOT "Location") — districts across MH/MP/KA
# ---------------------------------------------------------------------------
REGIONS = [
    # Maharashtra
    ("NASHIK", "Nashik"),
    ("AURANGABAD", "Aurangabad"),
    ("PUNE_RURAL", "Pune Rural"),
    ("PALGHAR", "Palghar"),
    # Madhya Pradesh
    ("INDORE_RURAL", "Indore Rural"),
    ("BHOPAL_RURAL", "Bhopal Rural"),
    ("UJJAIN", "Ujjain"),
    # Karnataka
    ("BAGALKOT", "Bagalkot"),
    ("GULBARGA", "Gulbarga"),
]

# ---------------------------------------------------------------------------
# Dimension: Activity Theme (intentionally NOT "Intervention")
# ---------------------------------------------------------------------------
ACTIVITY_THEMES = [
    # Agriculture
    "Farmer Training",
    "Crop Demonstration",
    "Soil Health Testing",
    "Seed Distribution",
    "Livestock Vaccination",
    "Dairy Demonstration",
    "Market Linkage Visit",
    "SHG Meeting",
    "Microfinance Training",
    # WASH
    "Borewell Survey",
    "Water Quality Testing",
    "Toilet Construction Drive",
    "Hygiene Campaign",
    "Handwashing Workshop",
    "Menstrual Hygiene Session",
    # Health
    "Health Camp",
    "Vaccination Drive",
    "Maternal Health Visit",
    "Child Nutrition Survey",
    "ASHA Worker Training",
    "Eye Camp",
    # Education
    "After-School Tutoring",
    "Teacher Training",
    "Library Distribution",
    "Career Counselling",
    "Parent Engagement Meeting",
]

# ---------------------------------------------------------------------------
# Dimension: Sub-Theme (free-form tag axis, controls_access=False)
# Parallels Kshamata's Sub-Intervention dimension.
# ---------------------------------------------------------------------------
SUB_THEMES = {
    "Crop Demonstration": ["Paddy", "Maize", "Pulses", "Vegetables", "Millets", "Cotton"],
    "Health Camp": ["General OPD", "Eye", "Dental", "Maternal", "Diabetes Screening"],
    "Hygiene Campaign": ["School", "Community", "Workplace"],
    "Farmer Training": ["Organic", "Drip Irrigation", "Pest Management", "Post-Harvest"],
    "After-School Tutoring": ["Maths", "Science", "Language", "Computer Basics"],
}

# ---------------------------------------------------------------------------
# Dimension Value Links
# ---------------------------------------------------------------------------

# Programme → Project
PROGRAMME_PROJECTS = {
    "AGRI_LIVELIHOODS": [
        "SUSTAINABLE_FARMING",
        "DRIP_IRRIGATION",
        "DAIRY_DEVELOPMENT",
        "WOMEN_FARMERS",
    ],
    "WASH": ["WASH_SCHOOLS", "VILLAGE_SANITATION"],
    "RURAL_HEALTH": ["MOBILE_CLINIC", "MATERNAL_CARE"],
    "EDUCATION": ["ANGANWADI_SUPPORT", "REMEDIAL_EDUCATION"],
}

# Project → Region (which regions each project operates in)
PROJECT_REGIONS = {
    "SUSTAINABLE_FARMING": ["NASHIK", "AURANGABAD", "INDORE_RURAL", "BAGALKOT"],
    "DRIP_IRRIGATION": ["AURANGABAD", "UJJAIN", "GULBARGA"],
    "DAIRY_DEVELOPMENT": ["PUNE_RURAL", "BHOPAL_RURAL"],
    "WOMEN_FARMERS": ["PALGHAR", "INDORE_RURAL", "BAGALKOT"],
    "WASH_SCHOOLS": ["NASHIK", "PALGHAR", "BHOPAL_RURAL"],
    "VILLAGE_SANITATION": ["AURANGABAD", "UJJAIN", "GULBARGA"],
    "MOBILE_CLINIC": ["PALGHAR", "BHOPAL_RURAL", "GULBARGA"],
    "MATERNAL_CARE": ["NASHIK", "INDORE_RURAL", "BAGALKOT"],
    "ANGANWADI_SUPPORT": ["PUNE_RURAL", "UJJAIN", "GULBARGA"],
    "REMEDIAL_EDUCATION": ["PALGHAR", "BHOPAL_RURAL", "BAGALKOT"],
}

# Programme → Region (union of project regions per programme)
PROGRAMME_REGIONS = {
    "AGRI_LIVELIHOODS": [
        "NASHIK",
        "AURANGABAD",
        "PUNE_RURAL",
        "PALGHAR",
        "INDORE_RURAL",
        "BHOPAL_RURAL",
        "UJJAIN",
        "BAGALKOT",
        "GULBARGA",
    ],
    "WASH": ["NASHIK", "AURANGABAD", "PALGHAR", "BHOPAL_RURAL", "UJJAIN", "GULBARGA"],
    "RURAL_HEALTH": ["NASHIK", "PALGHAR", "INDORE_RURAL", "BHOPAL_RURAL", "BAGALKOT", "GULBARGA"],
    "EDUCATION": ["PUNE_RURAL", "PALGHAR", "BHOPAL_RURAL", "UJJAIN", "BAGALKOT", "GULBARGA"],
}

# Region → Activity Themes (what themes happen in each region)
REGION_THEMES = {
    "NASHIK": [
        "Farmer Training",
        "Crop Demonstration",
        "Soil Health Testing",
        "Seed Distribution",
        "Hygiene Campaign",
        "Toilet Construction Drive",
        "Maternal Health Visit",
    ],
    "AURANGABAD": [
        "Farmer Training",
        "Crop Demonstration",
        "Soil Health Testing",
        "Borewell Survey",
        "Water Quality Testing",
        "Toilet Construction Drive",
    ],
    "PUNE_RURAL": [
        "Dairy Demonstration",
        "Livestock Vaccination",
        "Market Linkage Visit",
        "After-School Tutoring",
        "Parent Engagement Meeting",
    ],
    "PALGHAR": [
        "SHG Meeting",
        "Microfinance Training",
        "Hygiene Campaign",
        "Menstrual Hygiene Session",
        "Health Camp",
        "Vaccination Drive",
        "Child Nutrition Survey",
        "After-School Tutoring",
        "Library Distribution",
    ],
    "INDORE_RURAL": [
        "Farmer Training",
        "Crop Demonstration",
        "SHG Meeting",
        "Microfinance Training",
        "Maternal Health Visit",
        "Child Nutrition Survey",
    ],
    "BHOPAL_RURAL": [
        "Dairy Demonstration",
        "Livestock Vaccination",
        "Handwashing Workshop",
        "Hygiene Campaign",
        "Health Camp",
        "ASHA Worker Training",
        "Library Distribution",
        "Teacher Training",
    ],
    "UJJAIN": [
        "Borewell Survey",
        "Water Quality Testing",
        "Toilet Construction Drive",
        "Career Counselling",
        "Teacher Training",
    ],
    "BAGALKOT": [
        "Farmer Training",
        "Seed Distribution",
        "Market Linkage Visit",
        "SHG Meeting",
        "Maternal Health Visit",
        "Eye Camp",
        "After-School Tutoring",
        "Career Counselling",
    ],
    "GULBARGA": [
        "Borewell Survey",
        "Water Quality Testing",
        "Hygiene Campaign",
        "Health Camp",
        "Vaccination Drive",
        "ASHA Worker Training",
        "Parent Engagement Meeting",
        "Teacher Training",
    ],
}

# Programme → Activity Themes (explicit, authoritative)
PROGRAMME_THEMES = {
    "AGRI_LIVELIHOODS": [
        "Farmer Training",
        "Crop Demonstration",
        "Soil Health Testing",
        "Seed Distribution",
        "Livestock Vaccination",
        "Dairy Demonstration",
        "Market Linkage Visit",
        "SHG Meeting",
        "Microfinance Training",
    ],
    "WASH": [
        "Borewell Survey",
        "Water Quality Testing",
        "Toilet Construction Drive",
        "Hygiene Campaign",
        "Handwashing Workshop",
        "Menstrual Hygiene Session",
    ],
    "RURAL_HEALTH": [
        "Health Camp",
        "Vaccination Drive",
        "Maternal Health Visit",
        "Child Nutrition Survey",
        "ASHA Worker Training",
        "Eye Camp",
    ],
    "EDUCATION": [
        "After-School Tutoring",
        "Teacher Training",
        "Library Distribution",
        "Career Counselling",
        "Parent Engagement Meeting",
    ],
}


# ---------------------------------------------------------------------------
# Meta Field Schemas — Household entity type
# ---------------------------------------------------------------------------
HOUSEHOLD_CUSTOM_FIELDS = [
    {"label": "Head of Household", "type": "text", "required": True},
    {"label": "Mobile Number", "type": "text", "required": False},
    {"label": "Village", "type": "text", "required": False},
    {"label": "Block / Tehsil", "type": "text", "required": False},
    {"label": "District", "type": "text", "required": False},
    {
        "label": "State",
        "type": "select",
        "required": False,
        "options": ["Maharashtra", "Madhya Pradesh", "Karnataka", "Other"],
    },
    {"label": "Family Members", "type": "number", "required": False},
    {"label": "Land Holding (Acres)", "type": "number", "required": False},
    {
        "label": "Primary Occupation",
        "type": "select",
        "required": False,
        "options": [
            "Farming",
            "Daily Wage Labour",
            "Livestock",
            "Small Business",
            "Salaried",
            "Other",
        ],
    },
    {
        "label": "Annual Income (INR)",
        "type": "select",
        "required": False,
        "options": ["<50,000", "50,000-1,00,000", "1,00,000-2,50,000", "2,50,000+"],
    },
]

# ---------------------------------------------------------------------------
# Meta Field Schemas — Self Help Group entity type
# ---------------------------------------------------------------------------
SHG_CUSTOM_FIELDS = [
    {"label": "Group Name", "type": "text", "required": True},
    {"label": "Formation Date", "type": "date", "required": False},
    {"label": "Number of Members", "type": "number", "required": False},
    {"label": "Bank Account No.", "type": "text", "required": False},
    {"label": "Village", "type": "text", "required": False},
    {"label": "Contact Person", "type": "text", "required": False},
    {"label": "Contact Number", "type": "text", "required": False},
]

# ---------------------------------------------------------------------------
# Meta Field Schemas — Field Worker entity type
# ---------------------------------------------------------------------------
FIELD_WORKER_CUSTOM_FIELDS = [
    {"label": "Name", "type": "text", "required": True},
    {"label": "Mobile Number", "type": "text", "required": False},
    {
        "label": "Designation",
        "type": "select",
        "required": False,
        "options": [
            "Field Coordinator",
            "Community Mobilizer",
            "Agronomist",
            "Health Worker",
            "Educator",
            "Volunteer",
        ],
    },
    {"label": "Base Village", "type": "text", "required": False},
]


# ---------------------------------------------------------------------------
# Meta Field Schemas — Field Visit activity type
# ---------------------------------------------------------------------------
FIELD_VISIT_META_FIELDS = [
    {"label": "Date", "type": "date", "required": True, "stage": "create", "sort_order": 0},
    {
        "label": "Notes",
        "type": "text",
        "required": False,
        "stage": "edit",
        "sort_order": 10,
    },
]

# Dimension fields added to Field Visit scope (create only)
# (dimension_name, required, sort_order) — dimension_id resolved at seed time
FIELD_VISIT_DIMENSION_FIELDS = [
    ("Programme", True, 1),
    ("Region", True, 2),
    ("Activity Theme", False, 3),
    ("Project", False, 4),
    ("Sub-Theme", False, 5),
]

# Participant fields added to Field Visit scope (edit only, search_select)
# (field_type, entity_type_name_or_none, label, sort_order)
FIELD_VISIT_PARTICIPANT_FIELDS = [
    ("user_list", None, "Users", 6),
    ("entity_list", "Field Worker", "Field Workers", 7),
    ("entity_list", "Household", "Households", 8),
    ("entity_list", "Self Help Group", "Self Help Groups", 9),
]


# ---------------------------------------------------------------------------
# Meta Field Schemas — enrollment fields (apply to all enrollments)
# (dimension_name, required, sort_order)
# ---------------------------------------------------------------------------
ENROLLMENT_DIMENSION_FIELDS = [
    ("Programme", True, 0),
    ("Region", True, 1),
]

# (label, required, sort_order)
ENROLLMENT_DATE_FIELDS = [
    ("Date of Joining", True, 2),
    ("Date of Exit", False, 3),
]


# ---------------------------------------------------------------------------
# Participant fields for the "Health Camp" activity theme
# Mirrors Kshamata's Physical Health participant-fields pattern but on a
# totally different theme and with field-medicine specific data points.
# ---------------------------------------------------------------------------
HEALTH_CAMP_PARTICIPANT_FIELDS = [
    {
        "label": "Weight (kg)",
        "type": "number",
        "required": False,
        "stage": "edit",
        "sort_order": 0,
    },
    {
        "label": "Height (cm)",
        "type": "number",
        "required": False,
        "stage": "edit",
        "sort_order": 1,
    },
    {
        "label": "Blood Pressure",
        "type": "text",
        "required": False,
        "stage": "edit",
        "sort_order": 2,
    },
    {
        "label": "Hemoglobin (g/dL)",
        "type": "number",
        "required": False,
        "stage": "edit",
        "sort_order": 3,
    },
    {
        "label": "Chief Complaint",
        "type": "text",
        "required": False,
        "stage": "edit",
        "sort_order": 4,
    },
    {
        "label": "Medication Prescribed",
        "type": "text",
        "required": False,
        "stage": "edit",
        "sort_order": 5,
    },
    {
        "label": "Follow-up Required",
        "type": "select",
        "required": False,
        "stage": "edit",
        "sort_order": 6,
        "options": ["No", "Yes - Routine", "Yes - Urgent"],
    },
]


def _make_theme_code(name: str) -> str:
    """Convert activity-theme name to a slugified dimension value code."""
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
            controls_access=True,
        )
        db.add(dim)
        db.flush()
    else:
        if name and dim.name != name:
            dim.name = name
        if not dim.controls_access:
            dim.controls_access = True
        db.flush()
    print(f"  Ensured dimension: {dim.name}")
    return dim


def _ensure_values(db, org, dimension, values_list):
    value_map = {}
    for idx, (seed_key, name) in enumerate(values_list):
        slug = slugify(name)
        dv = db.query(DimensionValue).filter_by(dimension_id=dimension.id, code=slug).first()
        if not dv:
            dv = (
                db.query(DimensionValue).filter_by(dimension_id=dimension.id, code=seed_key).first()
            )
            if dv:
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


def _ensure_sub_theme_dimension(db, org):
    """Like _ensure_dimension, but creates with controls_access=False."""
    key, name, sort_order = "sub_theme", "Sub-Theme", 4
    dim = db.query(Dimension).filter_by(organization_id=org.id, key=key).first()
    if not dim:
        dim = Dimension(
            organization_id=org.id,
            name=name,
            key=key,
            sort_order=sort_order,
            controls_access=False,
        )
        db.add(dim)
        db.flush()
    else:
        if dim.name != name:
            dim.name = name
        if dim.sort_order != sort_order:
            dim.sort_order = sort_order
        if dim.controls_access:
            dim.controls_access = False
        db.flush()
    print(f"  Ensured dimension: {dim.name}")
    return dim


def _ensure_theme_values(db, org, dimension, names):
    """Create dimension values for themes/sub-themes (name-based, no seed key)."""
    value_map = {}
    for idx, name in enumerate(names):
        code = _make_theme_code(name)
        dv = db.query(DimensionValue).filter_by(dimension_id=dimension.id, code=code).first()
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
    print(f"  Ensured {len(names)} {dimension.name.lower()} dimension values")
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


def seed():
    db = SessionLocal()
    try:
        # 1. Organisation (upsert)
        org = db.query(Organization).filter_by(code=ORG_CODE).first()
        if not org:
            org = Organization(
                name=ORG_NAME,
                code=ORG_CODE,
                logo_url=ORG_LOGO_URL,
                meta={},
            )
            db.add(org)
            db.flush()
            print(f"Created organization: {org.name} ({org.code})")
        else:
            org.name = ORG_NAME
            if ORG_LOGO_URL is not None:
                org.logo_url = ORG_LOGO_URL
            db.flush()
            print(f"Updated organization: {org.name} ({org.code})")

        # 2. Entity Types
        entity_type_map = {}
        for et_data in ENTITY_TYPES:
            slug = slugify(et_data["name"])
            et = db.query(EntityType).filter_by(organization_id=org.id, key=slug).first()
            if not et:
                et = EntityType(
                    organization_id=org.id,
                    name=et_data["name"],
                    key=slug,
                    can_enroll=et_data["can_enroll"],
                    sort_order=et_data["sort_order"],
                )
                db.add(et)
                db.flush()
            entity_type_map[et_data["name"]] = et
        print(f"  Ensured {len(ENTITY_TYPES)} entity types")

        # 2b. Meta Field Schemas — per entity type
        from app.modules.organization.service import MetaFieldSchemaService

        meta_service = MetaFieldSchemaService(db)

        meta_service.update_schema(
            org.id,
            "entity",
            HOUSEHOLD_CUSTOM_FIELDS,
            entity_type_id=entity_type_map["Household"].id,
        )
        print(f"  Ensured Household meta field schema ({len(HOUSEHOLD_CUSTOM_FIELDS)} fields)")

        meta_service.update_schema(
            org.id,
            "entity",
            SHG_CUSTOM_FIELDS,
            entity_type_id=entity_type_map["Self Help Group"].id,
        )
        print(f"  Ensured Self Help Group meta field schema ({len(SHG_CUSTOM_FIELDS)} fields)")

        meta_service.update_schema(
            org.id,
            "entity",
            FIELD_WORKER_CUSTOM_FIELDS,
            entity_type_id=entity_type_map["Field Worker"].id,
        )
        print(
            f"  Ensured Field Worker meta field schema ({len(FIELD_WORKER_CUSTOM_FIELDS)} fields)"
        )

        # 3. Activity Type: Field Visit
        field_visit_key = slugify(FIELD_VISIT_TYPE_NAME)
        field_visit_type = (
            db.query(ActivityType).filter_by(organization_id=org.id, key=field_visit_key).first()
        )
        if not field_visit_type:
            field_visit_type = ActivityType(
                organization_id=org.id,
                name=FIELD_VISIT_TYPE_NAME,
                key=field_visit_key,
                sort_order=FIELD_VISIT_TYPE_SORT_ORDER,
            )
            db.add(field_visit_type)
            db.flush()
        else:
            if field_visit_type.name != FIELD_VISIT_TYPE_NAME:
                field_visit_type.name = FIELD_VISIT_TYPE_NAME
                db.flush()
        print(f"  Ensured activity type: {field_visit_type.name}")

        # 4. Dimensions
        programme_dim = _ensure_dimension(db, org, "programme", "Programme", 0)
        project_dim = _ensure_dimension(db, org, "project", "Project", 1)
        region_dim = _ensure_dimension(db, org, "region", "Region", 2)
        theme_dim = _ensure_dimension(db, org, "activity_theme", "Activity Theme", 3)
        sub_theme_dim = _ensure_sub_theme_dimension(db, org)

        # 5. Dimension values
        programme_map = _ensure_values(db, org, programme_dim, PROGRAMMES)
        project_map = _ensure_values(db, org, project_dim, PROJECTS)
        region_map = _ensure_values(db, org, region_dim, REGIONS)
        theme_map = _ensure_theme_values(db, org, theme_dim, ACTIVITY_THEMES)
        sub_theme_names = [sub for subs in SUB_THEMES.values() for sub in subs]
        sub_theme_map = _ensure_theme_values(db, org, sub_theme_dim, sub_theme_names)

        # 7. Dimension Value Links
        new_links = 0
        new_links += _ensure_dimension_value_links(
            db, org, PROGRAMME_PROJECTS, programme_map, project_map
        )
        new_links += _ensure_dimension_value_links(
            db, org, PROJECT_REGIONS, project_map, region_map
        )
        new_links += _ensure_dimension_value_links(
            db, org, PROGRAMME_REGIONS, programme_map, region_map
        )
        new_links += _ensure_dimension_value_links(
            db, org, REGION_THEMES, region_map, theme_map
        )
        new_links += _ensure_dimension_value_links(
            db, org, PROGRAMME_THEMES, programme_map, theme_map
        )

        # Project → Theme (union of region themes per project)
        project_themes = {}
        for proj_code, reg_codes in PROJECT_REGIONS.items():
            theme_set = set()
            for reg_code in reg_codes:
                theme_set.update(REGION_THEMES.get(reg_code, []))
            project_themes[proj_code] = list(theme_set)
        new_links += _ensure_dimension_value_links(
            db, org, project_themes, project_map, theme_map
        )

        # Sub-Theme links: parent Theme, plus each Programme/Region the parent
        # theme is linked to. The cascading form ANDs across selected
        # dimensions, so Sub-Theme needs a link rule for every cascading axis.
        new_links += _ensure_dimension_value_links(
            db, org, SUB_THEMES, theme_map, sub_theme_map
        )
        # Sub-Theme ↔ Programme: derive from parent theme's programme links
        sub_theme_to_programmes = {}
        for parent_theme, subs in SUB_THEMES.items():
            parent_programmes = [
                p for p, themes in PROGRAMME_THEMES.items() if parent_theme in themes
            ]
            for sub in subs:
                sub_theme_to_programmes.setdefault(sub, set()).update(parent_programmes)
        programme_to_sub_themes = {}
        for sub, progs in sub_theme_to_programmes.items():
            for p in progs:
                programme_to_sub_themes.setdefault(p, []).append(sub)
        new_links += _ensure_dimension_value_links(
            db, org, programme_to_sub_themes, programme_map, sub_theme_map
        )
        # Sub-Theme ↔ Region: derive from parent theme's region links
        region_to_sub_themes = {}
        for parent_theme, subs in SUB_THEMES.items():
            parent_regions = [
                r for r, themes in REGION_THEMES.items() if parent_theme in themes
            ]
            for sub in subs:
                for r in parent_regions:
                    region_to_sub_themes.setdefault(r, []).append(sub)
        new_links += _ensure_dimension_value_links(
            db, org, region_to_sub_themes, region_map, sub_theme_map
        )
        print(f"  Ensured dimension value links ({new_links} new)")

        # 7b. Field Visit meta field schema
        dim_name_to_id = {
            "Programme": str(programme_dim.id),
            "Project": str(project_dim.id),
            "Region": str(region_dim.id),
            "Activity Theme": str(theme_dim.id),
            "Sub-Theme": str(sub_theme_dim.id),
        }
        visit_fields = list(FIELD_VISIT_META_FIELDS)
        for dim_name, required, sort_order in FIELD_VISIT_DIMENSION_FIELDS:
            visit_fields.append(
                {
                    "label": dim_name,
                    "type": "dimension",
                    "dimension_id": dim_name_to_id[dim_name],
                    "required": required,
                    "stage": "create",
                    "sort_order": sort_order,
                }
            )
        for field_type, et_name, label, sort_order in FIELD_VISIT_PARTICIPANT_FIELDS:
            field_def = {
                "label": label,
                "type": field_type,
                "required": False,
                "stage": "edit",
                "display_type": "search_select",
                "sort_order": sort_order,
            }
            if field_type == "entity_list":
                field_def["entity_type_id"] = str(entity_type_map[et_name].id)
            visit_fields.append(field_def)
        meta_service.update_schema(
            org.id,
            "activity",
            visit_fields,
            activity_type_id=field_visit_type.id,
        )
        print(f"  Ensured field visit meta field schema ({len(visit_fields)} fields)")

        # 7b-i. Enrollment fields
        enrollment_fields: list[dict] = []
        for dim_name, required, sort_order in ENROLLMENT_DIMENSION_FIELDS:
            enrollment_fields.append(
                {
                    "label": dim_name,
                    "type": "dimension",
                    "dimension_id": dim_name_to_id[dim_name],
                    "required": required,
                    "stage": "create",
                    "sort_order": sort_order,
                    "max_active_enrollments": 1,
                }
            )
        for label, required, sort_order in ENROLLMENT_DATE_FIELDS:
            enrollment_fields.append(
                {
                    "label": label,
                    "type": "date",
                    "required": required,
                    "stage": "both",
                    "sort_order": sort_order,
                }
            )
        meta_service.update_schema(org.id, "enrollment", enrollment_fields)
        print(f"  Ensured enrollment meta field schema ({len(enrollment_fields)} fields)")

        # 7b-ii. Participant fields for "Health Camp" theme (Household only)
        health_camp_dv = theme_map.get("Health Camp")
        if health_camp_dv:
            meta_service.update_schema(
                org.id,
                "participant",
                HEALTH_CAMP_PARTICIPANT_FIELDS,
                activity_type_id=field_visit_type.id,
                entity_type_id=entity_type_map["Household"].id,
                dimension_value_id=health_camp_dv.id,
                dimension_id=theme_dim.id,
            )
            print(
                f"  Ensured Health Camp participant fields "
                f"({len(HEALTH_CAMP_PARTICIPANT_FIELDS)} fields)"
            )

        # 7c. List configs — Household, SHG, Field Worker
        from app.modules.organization.service import ListConfigService

        list_service = ListConfigService(db)

        # Household
        hh_et = entity_type_map["Household"]
        hh_scope = f"entity:{hh_et.id}"
        hh_catalog = {c["label"]: c for c in list_service._all_meta_columns(org.id, hh_scope)}
        hh_static = list_service._static_defaults(hh_scope)
        HH_LIST_SPEC = [
            ("Head of Household", {"sortable": True, "searchable": True}),
            ("Mobile Number", {}),
            ("Village", {"sortable": True, "filterable": True}),
            ("District", {"filterable": True, "sortable": True}),
            ("State", {"filterable": True}),
            ("Primary Occupation", {"filterable": True}),
            ("Land Holding (Acres)", {"sortable": True}),
            ("Family Members", {"sortable": True}),
        ]
        hh_static_by_key = {s["key"]: s for s in hh_static}
        hh_cols = []
        for i, (label, overrides) in enumerate(HH_LIST_SPEC):
            col = hh_catalog.get(label)
            if col:
                hh_cols.append({**col, "sort_order": i, **overrides})
            if label == "Head of Household" and "code" in hh_static_by_key:
                cn = hh_static_by_key.pop("code")
                hh_cols.append(
                    {
                        **cn,
                        "sort_order": len(hh_cols),
                        "searchable": True,
                        "search_supported": True,
                    }
                )
        for s in hh_static_by_key.values():
            hh_cols.append({**s, "sort_order": len(hh_cols)})
        list_service.update_config(org.id, hh_scope, hh_cols)
        print(f"  Seeded household list config ({len(hh_cols)} columns)")

        # SHG
        shg_et = entity_type_map["Self Help Group"]
        shg_scope = f"entity:{shg_et.id}"
        shg_catalog = {c["label"]: c for c in list_service._all_meta_columns(org.id, shg_scope)}
        shg_static = list_service._static_defaults(shg_scope)
        SHG_LIST_SPEC = [
            ("Group Name", {"sortable": True, "searchable": True}),
            ("Village", {"sortable": True, "filterable": True}),
            ("Number of Members", {"sortable": True}),
            ("Formation Date", {"sortable": True, "filterable": True}),
            ("Contact Person", {}),
            ("Contact Number", {}),
        ]
        shg_cols = []
        for i, (label, overrides) in enumerate(SHG_LIST_SPEC):
            col = shg_catalog.get(label)
            if col:
                shg_cols.append({**col, "sort_order": i, **overrides})
        for s in shg_static:
            shg_cols.append({**s, "sort_order": len(shg_cols)})
        list_service.update_config(org.id, shg_scope, shg_cols)
        print(f"  Seeded SHG list config ({len(shg_cols)} columns)")

        # Field Worker
        fw_et = entity_type_map["Field Worker"]
        fw_scope = f"entity:{fw_et.id}"
        fw_catalog = {c["label"]: c for c in list_service._all_meta_columns(org.id, fw_scope)}
        fw_static = list_service._static_defaults(fw_scope)
        FW_LIST_SPEC = [
            ("Name", {"sortable": True, "searchable": True}),
            ("Mobile Number", {}),
            ("Designation", {"filterable": True}),
            ("Base Village", {"sortable": True}),
        ]
        fw_cols = []
        for i, (label, overrides) in enumerate(FW_LIST_SPEC):
            col = fw_catalog.get(label)
            if col:
                fw_cols.append({**col, "sort_order": i, **overrides})
        for s in fw_static:
            fw_cols.append({**s, "sort_order": len(fw_cols)})
        list_service.update_config(org.id, fw_scope, fw_cols)
        print(f"  Seeded field worker list config ({len(fw_cols)} columns)")

        # 7d. List config — Field Visit activities
        visit_scope = f"activity:{field_visit_type.id}"
        visit_catalog = {
            c["label"]: c for c in list_service._all_meta_columns(org.id, visit_scope)
        }
        visit_static = list_service._static_defaults(visit_scope)
        VISIT_LIST_SPEC = [
            ("Date", {"filterable": True, "sortable": True}),
            ("Activity Theme", {"filterable": True, "searchable": True}),
            ("Region", {"filterable": True}),
            ("Programme", {"filterable": True}),
            ("Project", {"filterable": True}),
        ]
        visit_cols = []
        for i, (label, overrides) in enumerate(VISIT_LIST_SPEC):
            col = visit_catalog.get(label)
            if col:
                visit_cols.append({**col, "sort_order": i, **overrides})
        for s in visit_static:
            visit_cols.append({**s, "sort_order": len(visit_cols)})
        list_service.update_config(org.id, visit_scope, visit_cols)
        print(f"  Seeded field visit list config ({len(visit_cols)} columns)")

        # 8. Permissions
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

        # 9. Admin role (all permissions)
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

        # 10. Team Member role
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
            print(f"  Updated existing user to Gramodaya admin: {ADMIN_MOBILE}")

        db.commit()

        # Summary
        total_region_theme_links = sum(len(v) for v in REGION_THEMES.values())
        total_sub_theme_count = sum(len(v) for v in SUB_THEMES.values())
        print("\nGramodaya Foundation seed completed successfully!")
        print(f"  Organisation       : {ORG_NAME}")
        print(f"  Entity Types       : {len(ENTITY_TYPES)}")
        print(f"  Activity Types     : 1 (Field Visit)")
        print(f"  Roles              : 2 (Admin [system], Team Member [default])")
        print(
            f"  Dimensions         : 5 (Programme, Project, Region, "
            f"Activity Theme, Sub-Theme)"
        )
        print(f"  Programmes         : {len(PROGRAMMES)}")
        print(f"  Projects           : {len(PROJECTS)}")
        print(f"  Regions            : {len(REGIONS)}")
        print(f"  Activity Themes    : {len(ACTIVITY_THEMES)}")
        print(f"  Sub-Themes         : {total_sub_theme_count}")
        print(f"  Region<>Theme links: {total_region_theme_links}")
        print(f"  Admin              : {ADMIN_COUNTRY_CODE} {ADMIN_MOBILE}")

    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
