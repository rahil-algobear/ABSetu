"""
Session, SessionTemplate, Facilitator, Attendance routes
"""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import get_current_user, require_permissions
from app.modules.auth.model import User
from app.modules.session.schemas import (
    AttendanceBulkCreate,
    AttendanceResponse,
    FacilitatorCreate,
    FacilitatorResponse,
    FacilitatorUpdate,
    SessionCreate,
    SessionResponse,
    SessionTemplateCreate,
    SessionTemplateResponse,
    SessionTemplateUpdate,
    SessionUpdate,
)
from app.modules.session.service import (
    AttendanceService,
    FacilitatorService,
    SessionService,
    SessionTemplateService,
)

router = APIRouter(tags=["sessions"])


# --- Session Templates ---

template_router = APIRouter(prefix="/session-templates")


@template_router.get("/", dependencies=[Depends(require_permissions("session_template:view"))])
def list_session_templates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = SessionTemplateService(db)
    templates = service.list_by_org(current_user.organization_id)
    return [SessionTemplateResponse.dump_from_model(t) for t in templates]


@template_router.get("/{template_id}", dependencies=[Depends(require_permissions("session_template:view"))])
def get_session_template(
    template_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = SessionTemplateService(db)
    template = service.get_by_id(template_id, current_user.organization_id)
    return SessionTemplateResponse.dump_from_model(template)


@template_router.post("/", dependencies=[Depends(require_permissions("session_template:manage"))], status_code=201)
def create_session_template(
    data: SessionTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = SessionTemplateService(db)
    template = service.create(
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return SessionTemplateResponse.dump_from_model(template)


@template_router.put("/{template_id}", dependencies=[Depends(require_permissions("session_template:manage"))])
def update_session_template(
    template_id: uuid.UUID,
    data: SessionTemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = SessionTemplateService(db)
    template = service.update(
        template_id, current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return SessionTemplateResponse.dump_from_model(template)


@template_router.delete("/{template_id}", dependencies=[Depends(require_permissions("session_template:manage"))])
def delete_session_template(
    template_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = SessionTemplateService(db)
    service.delete(template_id, current_user.organization_id)
    return {"message": "Session template deleted"}


# --- Facilitators ---

facilitator_router = APIRouter(prefix="/facilitators")


@facilitator_router.get("/", dependencies=[Depends(require_permissions("facilitator:view"))])
def list_facilitators(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = FacilitatorService(db)
    facilitators = service.list_by_org(current_user.organization_id)
    return [FacilitatorResponse.dump_from_model(f) for f in facilitators]


@facilitator_router.get("/{facilitator_id}", dependencies=[Depends(require_permissions("facilitator:view"))])
def get_facilitator(
    facilitator_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = FacilitatorService(db)
    facilitator = service.get_by_id(facilitator_id, current_user.organization_id)
    return FacilitatorResponse.dump_from_model(facilitator)


@facilitator_router.post("/", dependencies=[Depends(require_permissions("facilitator:manage"))], status_code=201)
def create_facilitator(
    data: FacilitatorCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = FacilitatorService(db)
    facilitator = service.create(
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return FacilitatorResponse.dump_from_model(facilitator)


@facilitator_router.put("/{facilitator_id}", dependencies=[Depends(require_permissions("facilitator:manage"))])
def update_facilitator(
    facilitator_id: uuid.UUID,
    data: FacilitatorUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = FacilitatorService(db)
    facilitator = service.update(
        facilitator_id, current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return FacilitatorResponse.dump_from_model(facilitator)


@facilitator_router.delete("/{facilitator_id}", dependencies=[Depends(require_permissions("facilitator:manage"))])
def delete_facilitator(
    facilitator_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = FacilitatorService(db)
    service.delete(facilitator_id, current_user.organization_id)
    return {"message": "Facilitator deleted"}


# --- Sessions ---

session_router = APIRouter(prefix="/sessions")


@session_router.get("/", dependencies=[Depends(require_permissions("session:view"))])
def list_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = SessionService(db)
    sessions = service.list_by_org(current_user.organization_id)
    results = []
    for s in sessions:
        facilitators = [
            FacilitatorResponse.dump_from_model(sf.facilitator)
            for sf in s.session_facilitators
            if sf.facilitator
        ]
        resp = SessionResponse(
            id=str(s.id),
            updated_at=s.updated_at,
            session_template_id=str(s.session_template_id),
            programme_center_id=str(s.programme_center_id),
            date=s.date,
            notes=s.notes,
            created_by=str(s.created_by) if s.created_by else None,
            meta=s.meta,
            template_name=s.session_template.name if s.session_template else None,
            programme_name=(
                s.programme_center.programme.name
                if s.programme_center and s.programme_center.programme
                else None
            ),
            center_name=(
                s.programme_center.center.name
                if s.programme_center and s.programme_center.center
                else None
            ),
            facilitators=facilitators,
        )
        results.append(resp.dump())
    return results


@session_router.get("/{session_id}", dependencies=[Depends(require_permissions("session:view"))])
def get_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    service = SessionService(db)
    s = service.get_by_id(session_id)
    facilitators = [
        FacilitatorResponse.dump_from_model(sf.facilitator)
        for sf in s.session_facilitators
        if sf.facilitator
    ]
    return SessionResponse(
        id=str(s.id),
        updated_at=s.updated_at,
        session_template_id=str(s.session_template_id),
        programme_center_id=str(s.programme_center_id),
        date=s.date,
        notes=s.notes,
        created_by=str(s.created_by) if s.created_by else None,
        meta=s.meta,
        template_name=s.session_template.name if s.session_template else None,
        programme_name=(
            s.programme_center.programme.name
            if s.programme_center and s.programme_center.programme
            else None
        ),
        center_name=(
            s.programme_center.center.name
            if s.programme_center and s.programme_center.center
            else None
        ),
        facilitators=facilitators,
    ).dump()


@session_router.post("/", dependencies=[Depends(require_permissions("session:create"))], status_code=201)
def create_session(
    data: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = SessionService(db)
    session = service.create(
        current_user.organization_id,
        current_user.id,
        data.model_dump(exclude={"facilitator_ids"}),
        data.facilitator_ids,
    )
    facilitators = [
        FacilitatorResponse.dump_from_model(sf.facilitator)
        for sf in session.session_facilitators
        if sf.facilitator
    ]
    return SessionResponse(
        id=str(session.id),
        updated_at=session.updated_at,
        session_template_id=str(session.session_template_id),
        programme_center_id=str(session.programme_center_id),
        date=session.date,
        notes=session.notes,
        created_by=str(session.created_by) if session.created_by else None,
        meta=session.meta,
        template_name=session.session_template.name if session.session_template else None,
        programme_name=(
            session.programme_center.programme.name
            if session.programme_center and session.programme_center.programme
            else None
        ),
        center_name=(
            session.programme_center.center.name
            if session.programme_center and session.programme_center.center
            else None
        ),
        facilitators=facilitators,
    ).dump()


@session_router.put("/{session_id}", dependencies=[Depends(require_permissions("session:create"))])
def update_session(
    session_id: uuid.UUID,
    data: SessionUpdate,
    db: Session = Depends(get_db),
):
    service = SessionService(db)
    session = service.update(session_id, data.model_dump(exclude_none=True))
    facilitators = [
        FacilitatorResponse.dump_from_model(sf.facilitator)
        for sf in session.session_facilitators
        if sf.facilitator
    ]
    return SessionResponse(
        id=str(session.id),
        updated_at=session.updated_at,
        session_template_id=str(session.session_template_id),
        programme_center_id=str(session.programme_center_id),
        date=session.date,
        notes=session.notes,
        created_by=str(session.created_by) if session.created_by else None,
        meta=session.meta,
        template_name=session.session_template.name if session.session_template else None,
        programme_name=(
            session.programme_center.programme.name
            if session.programme_center and session.programme_center.programme
            else None
        ),
        center_name=(
            session.programme_center.center.name
            if session.programme_center and session.programme_center.center
            else None
        ),
        facilitators=facilitators,
    ).dump()


@session_router.delete("/{session_id}", dependencies=[Depends(require_permissions("session:create"))])
def delete_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    service = SessionService(db)
    service.delete(session_id)
    return {"message": "Session deleted"}


# --- Attendance ---


@session_router.get("/{session_id}/attendance", dependencies=[Depends(require_permissions("session:view"))])
def get_attendance(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    service = AttendanceService(db)
    attendances = service.list_by_session(session_id)
    results = []
    for a in attendances:
        resp = AttendanceResponse(
            id=str(a.id),
            updated_at=a.updated_at,
            session_id=str(a.session_id),
            beneficiary_id=str(a.beneficiary_id),
            status=a.status,
            beneficiary_name=a.beneficiary.name if a.beneficiary else None,
        )
        results.append(resp.dump())
    return results


@session_router.post("/{session_id}/attendance", dependencies=[Depends(require_permissions("session:create"))], status_code=201)
def mark_attendance(
    session_id: uuid.UUID,
    data: AttendanceBulkCreate,
    db: Session = Depends(get_db),
):
    service = AttendanceService(db)
    attendances = service.bulk_create(
        session_id,
        [r.model_dump() for r in data.records],
    )
    return [
        AttendanceResponse(
            id=str(a.id),
            updated_at=a.updated_at,
            session_id=str(a.session_id),
            beneficiary_id=str(a.beneficiary_id),
            status=a.status,
        ).dump()
        for a in attendances
    ]


# Include sub-routers
router.include_router(template_router)
router.include_router(facilitator_router)
router.include_router(session_router)
