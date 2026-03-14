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

logger = logging.getLogger(__name__)

# All permission keys for Phase 1
PERMISSIONS = [
    ("org:settings", "Manage organization settings"),
    ("center:view", "View centers"),
    ("center:manage", "Create/edit/delete centers"),
    ("programme:view", "View programmes"),
    ("programme:manage", "Create/edit/delete programmes"),
    ("session_template:view", "View session templates"),
    ("session_template:manage", "Create/edit/delete session templates"),
    ("session:view", "View sessions"),
    ("session:create", "Create sessions and mark attendance"),
    ("beneficiary:view", "View beneficiaries"),
    ("beneficiary:create", "Create beneficiaries"),
    ("beneficiary:edit", "Edit beneficiary details"),
    ("enrollment:view", "View enrollments"),
    ("enrollment:manage", "Create/edit enrollments"),
    ("facilitator:view", "View facilitators"),
    ("facilitator:manage", "Create/edit/delete facilitators"),
    ("user:view", "View users"),
    ("user:manage", "Manage users and their roles"),
    ("role:view", "View roles"),
    ("role:manage", "Create/edit roles and permissions"),
    ("reports:view", "View reports"),
    ("reports:export", "Export data (CSV/Excel)"),
]

# Team member gets view + limited create permissions
TEAM_MEMBER_PERMISSIONS = [
    "center:view",
    "programme:view",
    "session_template:view",
    "session:view",
    "session:create",
    "beneficiary:view",
    "beneficiary:create",
    "beneficiary:edit",
    "enrollment:view",
    "enrollment:manage",
    "facilitator:view",
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

        # 3. Create Admin role (all permissions)
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

            for perm in permission_map.values():
                rp = RolePermission(
                    role_id=admin_role.id, permission_id=perm.id
                )
                db.add(rp)

            print("Created Admin role with all permissions")
        else:
            print("Admin role already exists")

        # 4. Create Team Member role (scoped permissions)
        team_role = (
            db.query(Role)
            .filter_by(organization_id=org.id, name="Team Member")
            .first()
        )
        if not team_role:
            team_role = Role(
                organization_id=org.id,
                name="Team Member",
                is_default=True,
            )
            db.add(team_role)
            db.flush()

            for key in TEAM_MEMBER_PERMISSIONS:
                perm = permission_map[key]
                rp = RolePermission(
                    role_id=team_role.id, permission_id=perm.id
                )
                db.add(rp)

            print("Created Team Member role with scoped permissions")
        else:
            print("Team Member role already exists")

        # 5. Create admin user (or assign role to existing)
        admin_mobile = "9999999999"
        admin_user = (
            db.query(User).filter_by(mobile_number=admin_mobile).first()
        )
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
