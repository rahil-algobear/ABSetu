"""Import all models so SQLAlchemy can resolve string-based relationships."""

from app.modules.auth.model import OTP, RefreshToken, User, UserCenterAssignment  # noqa: F401
from app.modules.organization.model import (  # noqa: F401
    Center,
    Organization,
    Programme,
    ProgrammeCenter,
)
from app.modules.session.model import (  # noqa: F401
    Attendance,
    Facilitator,
    Session,
    SessionFacilitator,
    SessionTemplate,
)
from app.modules.beneficiary.model import Beneficiary, Enrollment  # noqa: F401
from app.modules.role.model import Permission, Role, RolePermission  # noqa: F401
