# ABSetu Backend

FastAPI + SQLAlchemy + PostgreSQL backend.

## Quick Reference

```bash
make install        # Install deps
make run-local      # Dev server on :8100
make migrate msg='description'  # New Alembic migration
make upgrade        # Apply migrations
make lint           # flake8 + black --check + isort --check
make format         # black + isort
```

## Architecture

```
app/
├── main.py                         # FastAPI app, middleware, exception handlers
├── core/
│   ├── config.py                   # Settings (pydantic-settings, .env loading)
│   ├── database.py                 # SQLAlchemy engine, session, Base
│   └── logging.py                  # Logging setup
├── modules/{module_name}/          # Feature modules
│   ├── model.py                    # SQLAlchemy models
│   ├── routes.py                   # FastAPI router
│   ├── service.py                  # Business logic
│   └── schemas.py                  # Pydantic request/response schemas
├── common/
│   ├── models/base_model.py        # BaseModel (UUID pk, timestamps, pagination)
│   ├── schemas/base_response.py    # BaseResponseSchema, PaginatedResponse
│   ├── dependencies.py             # get_current_user, get_db
│   ├── exceptions.py               # Custom exceptions
│   └── helpers/                    # Utilities (SMS, JWT, rate limiting)
└── migrations/                     # Alembic migrations
```

## Patterns to Follow

### Adding a New Module

1. Create `app/modules/{name}/` with `model.py`, `routes.py`, `service.py`, `schemas.py`
2. Models inherit from `BaseModel` — gives you `id` (UUID), `created_at`, `updated_at` automatically
3. Register router in `main.py`
4. Create Alembic migration: `make migrate msg='add {name} tables'`

### Models
- Inherit from `BaseModel` (see `app/common/models/base_model.py`)
- Table name auto-generated from class name (CamelCase → snake_case)
- Use `JSONB` for meta fields: `meta = Column(JSONB, nullable=True, default=dict)`
- FKs use `UUID(as_uuid=True)` with appropriate `ondelete` cascades

### Schemas
- Request schemas: plain `pydantic.BaseModel`
- Response schemas: inherit `BaseResponseSchema` — handles UUID→str, datetime→timestamp
- Use `PaginatedResponse` for list endpoints

### Services
- Accept `db: Session` in constructor
- Handle SQLAlchemy exceptions with rollback
- Business logic lives here, not in routes

### Routes
- Use FastAPI `Depends()` for DB session and auth
- Return consistent response format
- Prefix: `/api/{module_name}`
- **Every route must declare required permissions** using `require_permissions`:
  ```python
  @router.post("/", dependencies=[Depends(require_permissions("beneficiary:create"))])
  ```
- `require_permissions` resolves user → role → permission keys, returns 403 if missing
- Located in `app/common/dependencies.py` alongside `get_current_user`

## Auth
- OTP-based login (phone number + OTP)
- JWT access tokens (15 min) + DB-backed refresh tokens (30 days)
- `get_current_user` dependency for protected routes
- Token rotation on refresh, reuse detection

## Database
- PostgreSQL with SQLAlchemy 2.0
- Alembic for migrations
- Connection: `DATABASE_URL` env var
- All UUIDs, all timestamps with timezone

## Environment
- `.env` + `.env.{APP_ENV}` loading pattern
- `APP_ENV=local` for development
- See `core/config.py` for all settings
