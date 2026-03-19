"""
Prakriti Foundation seed script: an environmental conservation NGO
working across Karnataka with programmes for urban greening, wetland
conservation, community forestry, and environmental education.

This seeds a structurally different NGO from Kshamata to test multi-tenant
flexibility — different dimensions (Zone, Site instead of Project, Location),
different entity types (Volunteer, Community Leader), different activity types,
vocabulary, and meta fields.

Usage:
    cd backend
    python -m app.seeds.prakriti
    # or: make seed-org file=prakriti
"""

import logging
import sys

from app.core.database import SessionLocal
from app.modules.organization.model import MetaFieldSchema, Organization
from app.modules.dimension.model import Dimension, DimensionValue, DimensionValueLink
from app.modules.activity.model import ActivityCategory, ActivityForm, ActivityType
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
ADMIN_MOBILE = "9876543210"
ADMIN_COUNTRY_CODE = "+91"

# ---------------------------------------------------------------------------
# Organisation
# ---------------------------------------------------------------------------
ORG_NAME = "Prakriti Foundation"
ORG_CODE = "PRAKRITI"
ORG_LOGO_URL = None  # No logo yet

# ---------------------------------------------------------------------------
# Vocabulary mapping — org-level UI label overrides
# ---------------------------------------------------------------------------
VOCABULARY = {
    "activity": "Field Activity",
    "activity_type": "Service Type",
    "activity_category": "Activity Category",
    "participant": "Participant",
    "entity": "Individual",
    "enrollment": "Registration",
}

# ---------------------------------------------------------------------------
# Entity Types
# ---------------------------------------------------------------------------
ENTITY_TYPES = [
    {
        "name": "Volunteer",
        "config": {"case_number_enabled": True, "can_enroll": True},
        "sort_order": 0,
    },
    {
        "name": "Community Leader",
        "config": {"case_number_enabled": False, "can_enroll": False},
        "sort_order": 1,
    },
]

# ---------------------------------------------------------------------------
# Activity Category: Field Activities (form builder config)
# participant_source UUIDs are populated at seed time after entity types are created
# ---------------------------------------------------------------------------
FIELD_ACTIVITIES_CATEGORY_NAME = "Field Activities"
FIELD_ACTIVITIES_CATEGORY_SORT_ORDER = 0
FIELD_ACTIVITIES_SECTIONS_TEMPLATE = [
    {
        "key": "volunteers",
        "label": "Volunteers",
        "entity_type_name": "Volunteer",  # resolved to UUID at seed time
        "selection_mode": "enrolled_checklist",
        "min_count": 0,
        "max_count": None,
        "capture_status": True,
        "statuses": ["present", "absent"],
        "default_status": "present",
    },
    {
        "key": "community_leaders",
        "label": "Community Leaders",
        "entity_type_name": "Community Leader",  # resolved to UUID at seed time
        "selection_mode": "multi_select",
        "min_count": 0,
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
    ("URBAN_GREENING", "Urban Greening"),
    ("WETLAND_CONSERVATION", "Wetland Conservation"),
    ("COMMUNITY_FORESTRY", "Community Forestry"),
    ("ENV_EDUCATION", "Environmental Education"),
]

# ---------------------------------------------------------------------------
# Dimension: Zone
# ---------------------------------------------------------------------------
ZONES = [
    ("NORTH_KA", "North Karnataka"),
    ("SOUTH_KA", "South Karnataka"),
    ("COASTAL_KA", "Coastal Karnataka"),
]

# ---------------------------------------------------------------------------
# Dimension: Site
# ---------------------------------------------------------------------------
SITES = [
    # North Karnataka
    ("DANDELI_FOREST", "Dandeli Forest Reserve"),
    ("DHARWAD_CAMPUS", "Dharwad University Campus"),
    ("HUBLI_PARK", "Hubli Urban Park"),
    ("BELGAUM_LAKE", "Belgaum Lake"),
    # South Karnataka
    ("BANNERGHATTA", "Bannerghatta National Park Buffer"),
    ("HESARAGHATTA", "Hesaraghatta Lake"),
    ("LALBAGH", "Lalbagh Botanical Garden"),
    ("CUBBON_PARK", "Cubbon Park"),
    ("MANDYA_VILLAGES", "Mandya Village Cluster"),
    ("MYSORE_CAMPUS", "Mysore University Campus"),
    # Coastal Karnataka
    ("MANGALORE_COAST", "Mangalore Coastline"),
    ("UDUPI_MANGROVES", "Udupi Mangrove Belt"),
    ("KARWAR_WETLAND", "Karwar Wetland"),
    ("MURUDESHWAR_BEACH", "Murudeshwar Beach Zone"),
]

# ---------------------------------------------------------------------------
# Activity Types (Service Types)
# ---------------------------------------------------------------------------
ACTIVITY_TYPES = [
    # Urban Greening
    "Tree Planting Drive",
    "Sapling Distribution",
    "Urban Garden Setup",
    "Park Maintenance",
    "Green Audit",
    # Wetland Conservation
    "Lake Cleanup",
    "Water Quality Testing",
    "Invasive Species Removal",
    "Biodiversity Survey",
    "Wetland Restoration",
    # Community Forestry
    "Nursery Management",
    "Seed Collection",
    "Community Plantation",
    "Forest Fire Prevention Training",
    "Agroforestry Workshop",
    # Environmental Education
    "School Workshop",
    "Nature Walk",
    "Documentary Screening",
    "Citizen Science Training",
    "Eco-Club Formation",
    # Cross-cutting
    "Awareness Rally",
    "Stakeholder Meeting",
    "Government Liaison Visit",
    "Volunteer Orientation",
    "Impact Assessment",
]

# ---------------------------------------------------------------------------
# Dimension Value Links
# ---------------------------------------------------------------------------

# Programme → Zone
PROGRAMME_ZONES = {
    "URBAN_GREENING": ["SOUTH_KA", "NORTH_KA"],
    "WETLAND_CONSERVATION": ["SOUTH_KA", "COASTAL_KA"],
    "COMMUNITY_FORESTRY": ["NORTH_KA", "COASTAL_KA"],
    "ENV_EDUCATION": ["NORTH_KA", "SOUTH_KA", "COASTAL_KA"],
}

# Zone → Site
ZONE_SITES = {
    "NORTH_KA": [
        "DANDELI_FOREST",
        "DHARWAD_CAMPUS",
        "HUBLI_PARK",
        "BELGAUM_LAKE",
    ],
    "SOUTH_KA": [
        "BANNERGHATTA",
        "HESARAGHATTA",
        "LALBAGH",
        "CUBBON_PARK",
        "MANDYA_VILLAGES",
        "MYSORE_CAMPUS",
    ],
    "COASTAL_KA": [
        "MANGALORE_COAST",
        "UDUPI_MANGROVES",
        "KARWAR_WETLAND",
        "MURUDESHWAR_BEACH",
    ],
}

# Programme → Site
PROGRAMME_SITES = {
    "URBAN_GREENING": [
        "HUBLI_PARK",
        "DHARWAD_CAMPUS",
        "LALBAGH",
        "CUBBON_PARK",
        "MYSORE_CAMPUS",
    ],
    "WETLAND_CONSERVATION": [
        "BELGAUM_LAKE",
        "HESARAGHATTA",
        "UDUPI_MANGROVES",
        "KARWAR_WETLAND",
        "MANGALORE_COAST",
    ],
    "COMMUNITY_FORESTRY": [
        "DANDELI_FOREST",
        "BANNERGHATTA",
        "MANDYA_VILLAGES",
        "MURUDESHWAR_BEACH",
    ],
    "ENV_EDUCATION": [
        "DHARWAD_CAMPUS",
        "MYSORE_CAMPUS",
        "LALBAGH",
        "CUBBON_PARK",
        "MANGALORE_COAST",
        "HUBLI_PARK",
    ],
}

# Site → Activity Types
SITE_ACTIVITY_TYPES = {
    "DANDELI_FOREST": [
        "Nursery Management",
        "Seed Collection",
        "Community Plantation",
        "Forest Fire Prevention Training",
        "Biodiversity Survey",
        "Nature Walk",
        "Volunteer Orientation",
    ],
    "DHARWAD_CAMPUS": [
        "Tree Planting Drive",
        "Sapling Distribution",
        "Green Audit",
        "School Workshop",
        "Eco-Club Formation",
        "Citizen Science Training",
    ],
    "HUBLI_PARK": [
        "Tree Planting Drive",
        "Park Maintenance",
        "Urban Garden Setup",
        "Nature Walk",
        "Awareness Rally",
    ],
    "BELGAUM_LAKE": [
        "Lake Cleanup",
        "Water Quality Testing",
        "Invasive Species Removal",
        "Biodiversity Survey",
        "Stakeholder Meeting",
    ],
    "BANNERGHATTA": [
        "Community Plantation",
        "Biodiversity Survey",
        "Nature Walk",
        "Seed Collection",
        "Impact Assessment",
        "Volunteer Orientation",
    ],
    "HESARAGHATTA": [
        "Lake Cleanup",
        "Water Quality Testing",
        "Wetland Restoration",
        "Biodiversity Survey",
        "Awareness Rally",
        "Citizen Science Training",
    ],
    "LALBAGH": [
        "Tree Planting Drive",
        "Green Audit",
        "Nature Walk",
        "School Workshop",
        "Documentary Screening",
        "Eco-Club Formation",
    ],
    "CUBBON_PARK": [
        "Park Maintenance",
        "Urban Garden Setup",
        "Nature Walk",
        "School Workshop",
        "Awareness Rally",
        "Volunteer Orientation",
    ],
    "MANDYA_VILLAGES": [
        "Community Plantation",
        "Agroforestry Workshop",
        "Nursery Management",
        "Sapling Distribution",
        "Stakeholder Meeting",
    ],
    "MYSORE_CAMPUS": [
        "Tree Planting Drive",
        "Sapling Distribution",
        "School Workshop",
        "Eco-Club Formation",
        "Citizen Science Training",
        "Documentary Screening",
    ],
    "MANGALORE_COAST": [
        "Lake Cleanup",
        "Biodiversity Survey",
        "Awareness Rally",
        "School Workshop",
        "Government Liaison Visit",
        "Impact Assessment",
    ],
    "UDUPI_MANGROVES": [
        "Wetland Restoration",
        "Invasive Species Removal",
        "Biodiversity Survey",
        "Citizen Science Training",
        "Nature Walk",
    ],
    "KARWAR_WETLAND": [
        "Wetland Restoration",
        "Water Quality Testing",
        "Biodiversity Survey",
        "Lake Cleanup",
        "Stakeholder Meeting",
    ],
    "MURUDESHWAR_BEACH": [
        "Lake Cleanup",
        "Community Plantation",
        "Awareness Rally",
        "Volunteer Orientation",
        "Nature Walk",
    ],
}

# Programme → Activity Types (explicit, authoritative)
PROGRAMME_ACTIVITY_TYPES = {
    "URBAN_GREENING": [
        "Tree Planting Drive",
        "Sapling Distribution",
        "Urban Garden Setup",
        "Park Maintenance",
        "Green Audit",
        "Awareness Rally",
        "Volunteer Orientation",
        "Impact Assessment",
    ],
    "WETLAND_CONSERVATION": [
        "Lake Cleanup",
        "Water Quality Testing",
        "Invasive Species Removal",
        "Biodiversity Survey",
        "Wetland Restoration",
        "Stakeholder Meeting",
        "Government Liaison Visit",
        "Impact Assessment",
    ],
    "COMMUNITY_FORESTRY": [
        "Nursery Management",
        "Seed Collection",
        "Community Plantation",
        "Forest Fire Prevention Training",
        "Agroforestry Workshop",
        "Sapling Distribution",
        "Stakeholder Meeting",
        "Volunteer Orientation",
    ],
    "ENV_EDUCATION": [
        "School Workshop",
        "Nature Walk",
        "Documentary Screening",
        "Citizen Science Training",
        "Eco-Club Formation",
        "Awareness Rally",
        "Volunteer Orientation",
    ],
}

# ---------------------------------------------------------------------------
# Meta Field Schemas — custom fields for Volunteer entity type
# ---------------------------------------------------------------------------
VOLUNTEER_CUSTOM_FIELDS = [
    {
        "key": "date_of_birth",
        "label": "Date of Birth",
        "type": "text",
        "required": False,
    },
    {
        "key": "contact_number",
        "label": "Contact No.",
        "type": "text",
        "required": False,
    },
    {
        "key": "email",
        "label": "Email",
        "type": "text",
        "required": False,
    },
    {
        "key": "occupation",
        "label": "Occupation",
        "type": "select",
        "required": False,
        "options": ["Student", "Professional", "Retired", "Homemaker", "Self-employed", "Other"],
    },
    {
        "key": "skills",
        "label": "Skills / Expertise",
        "type": "text",
        "required": False,
    },
    {
        "key": "availability",
        "label": "Availability",
        "type": "select",
        "required": False,
        "options": ["Weekdays", "Weekends", "Both", "Flexible"],
    },
    {
        "key": "emergency_contact",
        "label": "Emergency Contact",
        "type": "text",
        "required": False,
    },
]

# ---------------------------------------------------------------------------
# Meta Field Schemas — custom fields for Community Leader entity type
# ---------------------------------------------------------------------------
COMMUNITY_LEADER_CUSTOM_FIELDS = [
    {
        "key": "contact_number",
        "label": "Contact No.",
        "type": "text",
        "required": False,
    },
    {
        "key": "village_or_ward",
        "label": "Village / Ward",
        "type": "text",
        "required": False,
    },
    {
        "key": "designation",
        "label": "Designation",
        "type": "select",
        "required": False,
        "options": [
            "Gram Panchayat Member",
            "Ward Councillor",
            "SHG Leader",
            "School Head",
            "Religious Leader",
            "Youth Leader",
            "Other",
        ],
    },
]


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

        # 2b. Meta Field Schemas — Volunteer custom fields
        volunteer_et = entity_type_map["Volunteer"]
        volunteer_scope_key = f"entity:{volunteer_et.id}"
        mfs = (
            db.query(MetaFieldSchema)
            .filter_by(organization_id=org.id, scope_key=volunteer_scope_key)
            .first()
        )
        if not mfs:
            mfs = MetaFieldSchema(
                organization_id=org.id,
                scope_key=volunteer_scope_key,
                fields=VOLUNTEER_CUSTOM_FIELDS,
            )
            db.add(mfs)
            db.flush()
            print(
                f"  Created volunteer meta field schema ({len(VOLUNTEER_CUSTOM_FIELDS)} fields)"
            )
        else:
            mfs.fields = VOLUNTEER_CUSTOM_FIELDS
            db.flush()
            print(
                f"  Updated volunteer meta field schema ({len(VOLUNTEER_CUSTOM_FIELDS)} fields)"
            )

        # 2c. Meta Field Schemas — Community Leader custom fields
        community_leader_et = entity_type_map["Community Leader"]
        community_leader_scope_key = f"entity:{community_leader_et.id}"
        mfs_cl = (
            db.query(MetaFieldSchema)
            .filter_by(
                organization_id=org.id,
                scope_key=community_leader_scope_key,
            )
            .first()
        )
        if not mfs_cl:
            mfs_cl = MetaFieldSchema(
                organization_id=org.id,
                scope_key=community_leader_scope_key,
                fields=COMMUNITY_LEADER_CUSTOM_FIELDS,
            )
            db.add(mfs_cl)
            db.flush()
            print(
                f"  Created community leader meta field schema"
                f" ({len(COMMUNITY_LEADER_CUSTOM_FIELDS)} fields)"
            )
        else:
            mfs_cl.fields = COMMUNITY_LEADER_CUSTOM_FIELDS
            db.flush()
            print(
                f"  Updated community leader meta field schema"
                f" ({len(COMMUNITY_LEADER_CUSTOM_FIELDS)} fields)"
            )

        # 3. Activity Category: Field Activities
        sections = []
        for tmpl in FIELD_ACTIVITIES_SECTIONS_TEMPLATE:
            et = entity_type_map[tmpl["entity_type_name"]]
            sections.append(
                {
                    "key": tmpl["key"],
                    "label": tmpl["label"],
                    "participant_source": f"entity_type:{et.id}",
                    "selection_mode": tmpl["selection_mode"],
                    "min_count": tmpl["min_count"],
                    "max_count": tmpl["max_count"],
                    "capture_status": tmpl["capture_status"],
                    "statuses": tmpl["statuses"],
                    "default_status": tmpl["default_status"],
                }
            )

        field_act_cat_key = slugify(FIELD_ACTIVITIES_CATEGORY_NAME)
        field_act_cat = (
            db.query(ActivityCategory)
            .filter_by(organization_id=org.id, key=field_act_cat_key)
            .first()
        )
        if not field_act_cat:
            field_act_cat = ActivityCategory(
                organization_id=org.id,
                name=FIELD_ACTIVITIES_CATEGORY_NAME,
                key=field_act_cat_key,
                sort_order=FIELD_ACTIVITIES_CATEGORY_SORT_ORDER,
            )
            db.add(field_act_cat)
            db.flush()
        print(f"  Ensured activity category: {field_act_cat.name}")

        # 3b. Activity Form (sections stored as elements on ActivityForm)
        act_form = (
            db.query(ActivityForm)
            .filter_by(activity_category_id=field_act_cat.id)
            .first()
        )
        if not act_form:
            act_form = ActivityForm(
                organization_id=org.id,
                activity_category_id=field_act_cat.id,
                elements=sections,
            )
            db.add(act_form)
            db.flush()
        else:
            act_form.elements = sections
            db.flush()
        print(f"  Ensured activity form for {field_act_cat.name}")

        # 4. Dimensions
        programme_dim = _ensure_dimension(db, org, "programme", "Programme", 0)
        zone_dim = _ensure_dimension(db, org, "zone", "Zone", 1)
        site_dim = _ensure_dimension(db, org, "site", "Site", 2)
        at_dim = _ensure_dimension(
            db, org, "activity_type", "Service Type", 3, is_system="activity_type"
        )

        # 5. Dimension values
        programme_map = _ensure_values(db, org, programme_dim, PROGRAMMES)
        zone_map = _ensure_values(db, org, zone_dim, ZONES)
        site_map = _ensure_values(db, org, site_dim, SITES)

        # 6. Activity Types + mirrored dimension values
        at_dv_map = {}
        for idx, at_name in enumerate(ACTIVITY_TYPES):
            at = db.query(ActivityType).filter_by(organization_id=org.id, name=at_name).first()
            if not at:
                at = ActivityType(
                    organization_id=org.id,
                    name=at_name,
                    category_id=field_act_cat.id,
                )
                db.add(at)
                db.flush()
            else:
                if not at.category_id:
                    at.category_id = field_act_cat.id
                    db.flush()

            at_code = _make_at_code(at_name)
            dv = db.query(DimensionValue).filter_by(dimension_id=at_dim.id, code=at_code).first()
            if not dv:
                legacy_code = (
                    at_name.upper()
                    .replace(" ", "_")
                    .replace("-", "_")
                    .replace("/", "_")
                    .replace(",", "")
                )
                dv = (
                    db.query(DimensionValue)
                    .filter_by(dimension_id=at_dim.id, code=legacy_code)
                    .first()
                )
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
            db, org, PROGRAMME_ZONES, programme_map, zone_map
        )
        new_links += _ensure_dimension_value_links(
            db, org, ZONE_SITES, zone_map, site_map
        )
        new_links += _ensure_dimension_value_links(
            db, org, PROGRAMME_SITES, programme_map, site_map
        )
        new_links += _ensure_dimension_value_links(
            db, org, SITE_ACTIVITY_TYPES, site_map, at_dv_map
        )
        new_links += _ensure_dimension_value_links(
            db, org, PROGRAMME_ACTIVITY_TYPES, programme_map, at_dv_map
        )
        _remove_stale_programme_at_links(db, programme_map, at_dv_map, PROGRAMME_ACTIVITY_TYPES)
        # Derive Zone→ActivityType links from Zone→Site→ActivityType
        zone_activity_types = {}
        for zone_code, site_codes in ZONE_SITES.items():
            at_set = set()
            for site_code in site_codes:
                at_set.update(SITE_ACTIVITY_TYPES.get(site_code, []))
            zone_activity_types[zone_code] = list(at_set)
        new_links += _ensure_dimension_value_links(
            db, org, zone_activity_types, zone_map, at_dv_map
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
                first_name="Ananya",
                last_name="Sharma",
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
            print(f"  Updated existing user to Prakriti admin: {ADMIN_MOBILE}")

        db.commit()

        # Summary
        total_site_at_links = sum(len(v) for v in SITE_ACTIVITY_TYPES.values())
        total_links = (
            sum(len(v) for v in PROGRAMME_ZONES.values())
            + sum(len(v) for v in ZONE_SITES.values())
            + sum(len(v) for v in PROGRAMME_SITES.values())
            + total_site_at_links
        )
        print(f"\nPrakriti Foundation seed completed successfully!")
        print(f"  Organisation        : {ORG_NAME}")
        print(f"  Vocabulary          : {len(VOCABULARY)} term overrides")
        print(f"  Entity Types        : {len(ENTITY_TYPES)}")
        print(f"  Activity Categories : 1 (Field Activities)")
        print(f"  Roles               : 2 (Admin [system], Team Member [default])")
        print(f"  Dimensions          : 4 (Programme, Zone, Site, Service Type [system])")
        print(f"  Programmes          : {len(PROGRAMMES)}")
        print(f"  Zones               : {len(ZONES)}")
        print(f"  Sites               : {len(SITES)}")
        print(f"  Activity Types      : {len(ACTIVITY_TYPES)}")
        print(f"  Dimension Links     : {total_links} combos")
        print(f"    Programme<>Zone   : {sum(len(v) for v in PROGRAMME_ZONES.values())}")
        print(f"    Zone<>Site        : {sum(len(v) for v in ZONE_SITES.values())}")
        print(f"    Programme<>Site   : {sum(len(v) for v in PROGRAMME_SITES.values())}")
        print(f"    Site<>Activity    : {total_site_at_links}")

    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
