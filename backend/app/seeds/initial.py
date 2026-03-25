"""
Initial seed script: creates org, permissions, roles, and admin user.

Usage:
    cd backend
    python -m app.seeds.initial
"""

import logging
import sys

from app.core.database import SessionLocal
from app.modules.organization.model import Organization
from app.modules.role.model import Permission, Role, RolePermission
from app.modules.auth.model import User

# Import all models so SQLAlchemy can resolve relationship strings
from app.modules.dimension.model import Dimension, DimensionValue  # noqa: F401
from app.modules.activity.model import ActivityType, Activity  # noqa: F401
from app.modules.entity.model import Entity, EntityType  # noqa: F401
from app.modules.enrollment.model import Enrollment  # noqa: F401

logger = logging.getLogger(__name__)

# All permission keys
PERMISSIONS = [
    ("org:settings", "Manage organization settings"),
    ("dimension:view", "View dimensions and dimension values"),
    ("dimension:manage", "Create/edit/delete dimensions and values"),
    ("activity_type:view", "View activity types and form builder config"),
    ("activity_type:manage", "Create/edit/delete activity types and form builder config"),
    ("activity:view", "View activities"),
    ("activity:create", "Create activities and record participants"),
    ("entity:view", "View entities"),
    ("entity:create", "Create entities"),
    ("entity:edit", "Edit entity details"),
    ("entity_type:view", "View entity types"),
    ("entity_type:manage", "Create/edit/delete entity types"),
    ("enrollment:view", "View enrollments"),
    ("enrollment:manage", "Create/edit enrollments"),
    ("user:view", "View users"),
    ("user:manage", "Manage users and their roles"),
    ("role:view", "View roles"),
    ("role:manage", "Create/edit roles and permissions"),
    ("reports:view", "View reports"),
    ("reports:export", "Export data (CSV/Excel)"),
]

# Team member gets view + limited create permissions
TEAM_MEMBER_PERMISSIONS = [
    "dimension:view",
    "activity_type:view",
    "activity:view",
    "activity:create",
    "entity:view",
    "entity:create",
    "entity:edit",
    "entity_type:view",
    "enrollment:view",
    "enrollment:manage",
    "reports:view",
]


def seed():
    db = SessionLocal()
    try:
        # 1. Create organization
        org = db.query(Organization).filter_by(code="ABSETU").first()
        if not org:
            org = Organization(
                name="ABSetu",
                code="ABSETU",
                case_number_format="{ORG_CODE}-{YY}-{SERIAL}",
            )
            db.add(org)
            db.flush()
            print(f"Created organization: {org.name} ({org.code})")
        else:
            print(f"Organization already exists: {org.name}")

        # 2. Create permissions
        permission_map = {}
        for key, description in PERMISSIONS:
            perm = db.query(Permission).filter_by(key=key).first()
            if not perm:
                perm = Permission(key=key, description=description)
                db.add(perm)
                db.flush()
            permission_map[key] = perm

        print(f"Ensured {len(PERMISSIONS)} permissions exist")

        # 2b. Remove stale permissions no longer in the canonical list
        canonical_keys = {key for key, _ in PERMISSIONS}
        stale_perms = db.query(Permission).filter(~Permission.key.in_(canonical_keys)).all()
        if stale_perms:
            stale_ids = [p.id for p in stale_perms]
            stale_keys = [p.key for p in stale_perms]
            db.query(RolePermission).filter(RolePermission.permission_id.in_(stale_ids)).delete(
                synchronize_session="fetch"
            )
            db.query(Permission).filter(Permission.id.in_(stale_ids)).delete(
                synchronize_session="fetch"
            )
            db.flush()
            print(f"Removed {len(stale_perms)} stale permissions: {stale_keys}")

        # 3. Create Admin role (all permissions — always syncs missing ones)
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
            print("Created Admin role")

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
            print(f"Admin role: added {added} missing permissions")
        else:
            print(f"Admin role: all {len(permission_map)} permissions present")

        # 4. Create Team Member role (scoped permissions — always syncs)
        team_role = db.query(Role).filter_by(organization_id=org.id, name="Team Member").first()
        if not team_role:
            team_role = Role(
                organization_id=org.id,
                name="Team Member",
                is_default=True,
            )
            db.add(team_role)
            db.flush()
            print("Created Team Member role")

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
            print(f"Team Member role: added {added} missing permissions")
        else:
            print(f"Team Member role: all {len(TEAM_MEMBER_PERMISSIONS)} permissions present")

        # 5. Create admin user (or assign role to existing)
        admin_mobile = "9999999999"
        admin_user = db.query(User).filter_by(mobile_number=admin_mobile).first()
        if not admin_user:
            admin_user = User(
                first_name="Admin",
                last_name="User",
                country_code="+91",
                mobile_number=admin_mobile,
                is_verified=True,
                organization_id=org.id,
                role_id=admin_role.id,
            )
            db.add(admin_user)
            print(f"Created admin user: +91 {admin_mobile}")
        else:
            admin_user.organization_id = org.id
            admin_user.role_id = admin_role.id
            print(f"Updated existing user to admin: +91 {admin_mobile}")

        db.commit()
        print("\nSeed completed successfully!")

    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
