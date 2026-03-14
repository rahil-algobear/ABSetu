"""
Beneficiary and Enrollment services
"""
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.modules.beneficiary.model import Beneficiary, Enrollment
from app.modules.organization.model import Organization, Programme, ProgrammeCenter


class BeneficiaryService:
    def __init__(self, db: Session):
        self.db = db

    def _generate_case_number(self, org: Organization) -> str:
        """Generate the next case number for an organization."""
        fmt = org.case_number_format or "{ORG_CODE}-{SERIAL}"
        year_2 = datetime.now().strftime("%y")
        year_4 = datetime.now().strftime("%Y")

        # Count existing beneficiaries for serial
        count = (
            self.db.query(Beneficiary)
            .filter_by(organization_id=org.id)
            .count()
        )
        serial = str(count + 1).zfill(3)

        return (
            fmt.replace("{ORG_CODE}", org.code)
            .replace("{YY}", year_2)
            .replace("{YYYY}", year_4)
            .replace("{SERIAL}", serial)
        )

    def list_by_org(self, org_id: uuid.UUID) -> list[Beneficiary]:
        return (
            self.db.query(Beneficiary)
            .filter_by(organization_id=org_id)
            .order_by(Beneficiary.created_at.desc())
            .all()
        )

    def get_by_id(
        self, beneficiary_id: uuid.UUID, org_id: uuid.UUID
    ) -> Beneficiary:
        beneficiary = (
            self.db.query(Beneficiary)
            .filter_by(id=beneficiary_id, organization_id=org_id)
            .first()
        )
        if not beneficiary:
            raise NotFoundError("Beneficiary not found")
        return beneficiary

    def create(self, org_id: uuid.UUID, data: dict) -> Beneficiary:
        org = self.db.query(Organization).filter_by(id=org_id).first()
        if not org:
            raise NotFoundError("Organization not found")

        case_number = self._generate_case_number(org)
        beneficiary = Beneficiary(
            organization_id=org_id,
            case_number=case_number,
            name=data["name"],
            meta=data.get("meta"),
        )
        self.db.add(beneficiary)
        self.db.commit()
        self.db.refresh(beneficiary)
        return beneficiary

    def update(
        self, beneficiary_id: uuid.UUID, org_id: uuid.UUID, data: dict
    ) -> Beneficiary:
        beneficiary = self.get_by_id(beneficiary_id, org_id)
        for key, value in data.items():
            if value is not None:
                setattr(beneficiary, key, value)
        self.db.commit()
        self.db.refresh(beneficiary)
        return beneficiary


class EnrollmentService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_beneficiary(
        self, beneficiary_id: uuid.UUID
    ) -> list[Enrollment]:
        return (
            self.db.query(Enrollment)
            .filter_by(beneficiary_id=beneficiary_id)
            .order_by(Enrollment.admission_date.desc())
            .all()
        )

    def list_by_programme_center(
        self, programme_center_id: uuid.UUID
    ) -> list[Enrollment]:
        return (
            self.db.query(Enrollment)
            .filter_by(programme_center_id=programme_center_id)
            .order_by(Enrollment.admission_date.desc())
            .all()
        )

    def create(self, org_id: uuid.UUID, data: dict) -> Enrollment:
        # Verify beneficiary belongs to org
        beneficiary = (
            self.db.query(Beneficiary)
            .filter_by(
                id=uuid.UUID(data["beneficiary_id"]),
                organization_id=org_id,
            )
            .first()
        )
        if not beneficiary:
            raise ValidationError("Beneficiary not found in this organization")

        # Verify programme_center belongs to org
        pc = (
            self.db.query(ProgrammeCenter)
            .join(Programme)
            .filter(
                ProgrammeCenter.id == uuid.UUID(data["programme_center_id"]),
                Programme.organization_id == org_id,
            )
            .first()
        )
        if not pc:
            raise ValidationError("Programme-Center not found in this organization")

        enrollment = Enrollment(
            beneficiary_id=beneficiary.id,
            programme_center_id=pc.id,
            admission_date=data["admission_date"],
            release_date=data.get("release_date"),
            meta=data.get("meta"),
        )
        self.db.add(enrollment)
        self.db.commit()
        self.db.refresh(enrollment)
        return enrollment

    def update(
        self, enrollment_id: uuid.UUID, data: dict
    ) -> Enrollment:
        enrollment = (
            self.db.query(Enrollment).filter_by(id=enrollment_id).first()
        )
        if not enrollment:
            raise NotFoundError("Enrollment not found")

        for key, value in data.items():
            if value is not None:
                setattr(enrollment, key, value)
        self.db.commit()
        self.db.refresh(enrollment)
        return enrollment
