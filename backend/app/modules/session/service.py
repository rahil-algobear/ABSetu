"""
Session, SessionTemplate, Facilitator, Attendance services
"""
import uuid

from sqlalchemy.orm import Session, joinedload

from app.common.exceptions import NotFoundError, ValidationError
from app.modules.session.model import (
    Attendance,
    Facilitator,
    Session as SessionModel,
    SessionFacilitator,
    SessionTemplate,
)
from app.modules.organization.model import Programme, ProgrammeCenter


class SessionTemplateService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(self, org_id: uuid.UUID) -> list[SessionTemplate]:
        return (
            self.db.query(SessionTemplate)
            .filter_by(organization_id=org_id)
            .all()
        )

    def get_by_id(
        self, template_id: uuid.UUID, org_id: uuid.UUID
    ) -> SessionTemplate:
        template = (
            self.db.query(SessionTemplate)
            .filter_by(id=template_id, organization_id=org_id)
            .first()
        )
        if not template:
            raise NotFoundError("Session template not found")
        return template

    def create(self, org_id: uuid.UUID, data: dict) -> SessionTemplate:
        template = SessionTemplate(organization_id=org_id, **data)
        self.db.add(template)
        self.db.commit()
        self.db.refresh(template)
        return template

    def update(
        self, template_id: uuid.UUID, org_id: uuid.UUID, data: dict
    ) -> SessionTemplate:
        template = self.get_by_id(template_id, org_id)
        for key, value in data.items():
            if value is not None:
                setattr(template, key, value)
        self.db.commit()
        self.db.refresh(template)
        return template

    def delete(self, template_id: uuid.UUID, org_id: uuid.UUID) -> None:
        template = self.get_by_id(template_id, org_id)
        self.db.delete(template)
        self.db.commit()


class FacilitatorService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(self, org_id: uuid.UUID) -> list[Facilitator]:
        return (
            self.db.query(Facilitator)
            .filter_by(organization_id=org_id)
            .all()
        )

    def get_by_id(
        self, facilitator_id: uuid.UUID, org_id: uuid.UUID
    ) -> Facilitator:
        facilitator = (
            self.db.query(Facilitator)
            .filter_by(id=facilitator_id, organization_id=org_id)
            .first()
        )
        if not facilitator:
            raise NotFoundError("Facilitator not found")
        return facilitator

    def create(self, org_id: uuid.UUID, data: dict) -> Facilitator:
        facilitator = Facilitator(organization_id=org_id, **data)
        self.db.add(facilitator)
        self.db.commit()
        self.db.refresh(facilitator)
        return facilitator

    def update(
        self, facilitator_id: uuid.UUID, org_id: uuid.UUID, data: dict
    ) -> Facilitator:
        facilitator = self.get_by_id(facilitator_id, org_id)
        for key, value in data.items():
            if value is not None:
                setattr(facilitator, key, value)
        self.db.commit()
        self.db.refresh(facilitator)
        return facilitator

    def delete(self, facilitator_id: uuid.UUID, org_id: uuid.UUID) -> None:
        facilitator = self.get_by_id(facilitator_id, org_id)
        self.db.delete(facilitator)
        self.db.commit()


class SessionService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(self, org_id: uuid.UUID) -> list[SessionModel]:
        return (
            self.db.query(SessionModel)
            .join(ProgrammeCenter)
            .join(Programme)
            .filter(Programme.organization_id == org_id)
            .options(
                joinedload(SessionModel.session_template),
                joinedload(SessionModel.programme_center).joinedload(
                    ProgrammeCenter.programme
                ),
                joinedload(SessionModel.programme_center).joinedload(
                    ProgrammeCenter.center
                ),
                joinedload(SessionModel.session_facilitators).joinedload(
                    SessionFacilitator.facilitator
                ),
            )
            .order_by(SessionModel.date.desc())
            .all()
        )

    def get_by_id(self, session_id: uuid.UUID) -> SessionModel:
        session = (
            self.db.query(SessionModel)
            .options(
                joinedload(SessionModel.session_template),
                joinedload(SessionModel.programme_center).joinedload(
                    ProgrammeCenter.programme
                ),
                joinedload(SessionModel.programme_center).joinedload(
                    ProgrammeCenter.center
                ),
                joinedload(SessionModel.session_facilitators).joinedload(
                    SessionFacilitator.facilitator
                ),
            )
            .filter_by(id=session_id)
            .first()
        )
        if not session:
            raise NotFoundError("Session not found")
        return session

    def create(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: dict,
        facilitator_ids: list[str],
    ) -> SessionModel:
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

        # Verify session template belongs to org
        template = (
            self.db.query(SessionTemplate)
            .filter_by(
                id=uuid.UUID(data["session_template_id"]),
                organization_id=org_id,
            )
            .first()
        )
        if not template:
            raise ValidationError("Session template not found in this organization")

        session = SessionModel(
            session_template_id=template.id,
            programme_center_id=pc.id,
            date=data["date"],
            notes=data.get("notes"),
            meta=data.get("meta"),
            created_by=user_id,
        )
        self.db.add(session)
        self.db.flush()

        # Add facilitators
        for fid in facilitator_ids:
            sf = SessionFacilitator(
                session_id=session.id, facilitator_id=uuid.UUID(fid)
            )
            self.db.add(sf)

        self.db.commit()
        self.db.refresh(session)
        return self.get_by_id(session.id)

    def update(self, session_id: uuid.UUID, data: dict) -> SessionModel:
        session = self.get_by_id(session_id)
        for key, value in data.items():
            if value is not None:
                setattr(session, key, value)
        self.db.commit()
        self.db.refresh(session)
        return self.get_by_id(session.id)

    def delete(self, session_id: uuid.UUID) -> None:
        session = self.get_by_id(session_id)
        self.db.delete(session)
        self.db.commit()


class AttendanceService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_session(self, session_id: uuid.UUID) -> list[Attendance]:
        return (
            self.db.query(Attendance)
            .filter_by(session_id=session_id)
            .all()
        )

    def bulk_create(
        self, session_id: uuid.UUID, records: list[dict]
    ) -> list[Attendance]:
        # Verify session exists
        session = (
            self.db.query(SessionModel).filter_by(id=session_id).first()
        )
        if not session:
            raise NotFoundError("Session not found")

        # Delete existing attendance for this session, then recreate
        self.db.query(Attendance).filter_by(session_id=session_id).delete()

        attendances = []
        for record in records:
            attendance = Attendance(
                session_id=session_id,
                beneficiary_id=uuid.UUID(record["beneficiary_id"]),
                status=record.get("status", "present"),
            )
            self.db.add(attendance)
            attendances.append(attendance)

        self.db.commit()
        for a in attendances:
            self.db.refresh(a)
        return attendances
