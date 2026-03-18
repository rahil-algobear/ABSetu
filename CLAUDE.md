# ABSetu

Multi-tenant NGO outreach management platform. Helps NGOs track beneficiaries, programmes, sessions, and attendance.

## Project Structure

- `/backend` — FastAPI (Python) API server
- `/frontend` — Next.js (React/TypeScript) web app
- `/docs` — Product documentation

Monorepo with two independent apps sharing a PostgreSQL database.

## Key Concepts

- **Multi-tenant:** Each Organization (NGO) is a tenant. All data is org-scoped.
- **Meta fields:** Every major entity has a `meta` JSONB column for org-specific custom data. NGOs define field schemas; frontend renders dynamic forms.
- **Permissions-driven UI:** Frontend checks permission keys (not role names) to decide what to render. Roles are org-defined bundles of permissions.
- **Mobile-first:** All UI must work well on mobile. Bottom tab navigation on mobile, sidebar on desktop.

## Entity Hierarchy

```
Organization → Centers, Programmes, Session Templates, Facilitators, Beneficiaries, Roles, Users
Programme + Center → Programme-Center (M2M join)
Programme-Center → Sessions, Enrollments, User Assignments
Session → Attendance records, Facilitator assignments
```

## Development

### Backend
```bash
cd backend
make install        # Install dependencies
make run-local      # Run on port 8100
make migrate msg='description'  # Create migration
make upgrade        # Apply migrations
make lint           # Lint
make format         # Format
```

### Frontend
```bash
cd frontend
npm install         # Install dependencies
npm run dev         # Run on port 3100
npm run build       # Production build
npm run lint        # Lint
```

## Conventions

- All models inherit from `BaseModel` (UUID pk, created_at, updated_at)
- Backend modules live in `backend/app/modules/{module_name}/` with `model.py`, `routes.py`, `service.py`, `schemas.py`
- Use existing patterns: service layer, dependency injection, Pydantic schemas
- API routes prefixed with `/api/{module_name}`
- Frontend pages in `src/app/`, components in `src/components/`, services in `src/services/`
- Use TanStack Query for server state, Axios for HTTP
- Tailwind CSS for styling, Radix UI primitives for accessible components

## Documentation

- PRD: `docs/PRD.md` — full product requirements, entity definitions, permission keys
