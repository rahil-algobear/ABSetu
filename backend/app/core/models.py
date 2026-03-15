"""Import all models so SQLAlchemy can resolve string-based relationships."""

from app.modules.auth.model import (  # noqa: F401
    OTP,
    RefreshToken,
    User,
)
from app.modules.organization.model import Organization  # noqa: F401
from app.modules.dimension.model import (  # noqa: F401
    ActivityTag,
    BeneficiaryTag,
    Dimension,
    DimensionValue,
    EnrollmentTag,
    TagRule,
    UserDimensionAccess,
)
from app.modules.activity.model import (  # noqa: F401
    Activity,
    ActivityFacilitator,
    ActivityType,
    Facilitator,
    Participation,
)
from app.modules.beneficiary.model import Beneficiary, Enrollment  # noqa: F401
from app.modules.role.model import Permission, Role, RolePermission  # noqa: F401
