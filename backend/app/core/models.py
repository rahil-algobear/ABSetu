"""Import all models so SQLAlchemy can resolve string-based relationships."""

from app.modules.auth.model import (  # noqa: F401
    OTP,
    RefreshToken,
    User,
)
from app.modules.organization.model import MetaFieldSchema, Organization  # noqa: F401
from app.modules.dimension.model import (  # noqa: F401
    ActivityTag,
    Dimension,
    DimensionValue,
    DimensionValueLink,
    EnrollmentTag,
    EntityTag,
    UserDimensionAccess,
)
from app.modules.activity.model import (  # noqa: F401
    Activity,
    ActivityCategory,
    ActivityParticipant,
    ActivityType,
)
from app.modules.entity.model import Entity, EntityType  # noqa: F401
from app.modules.beneficiary.model import Enrollment  # noqa: F401
from app.modules.role.model import Permission, Role, RolePermission  # noqa: F401
