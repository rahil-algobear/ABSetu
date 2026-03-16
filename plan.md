# V2 Implementation Plan

## Scope

Implement the V2 architecture changes: Entity/EntityType, Activity Categories, Activity Participants, updated Enrollments, Form Fields rename, and all supporting backend + frontend changes.

## Phase 1: Backend — Database & Models

### 1.1 New Models + Migration

Create a single Alembic migration that:

**New tables:**
- `entity_types` — org-defined person categories (name, key, config JSONB, sort_order)
- `entities` — all tracked people (entity_type_id FK, case_number, name, meta)
- `entity_tags` — links entities to dimension_values
- `activity_categories` — form builder config (name, key, sections JSONB, sort_order)
- `activity_participants` — polymorphic (participant_type, participant_id, section_key, status, meta)

**Modified tables:**
- `activity_types` — add `category_id` FK to activity_categories
- `enrollments` — change `beneficiary_id` to `entity_id`

**Data migration within the same Alembic migration:**
- Migrate `beneficiaries` → `entities` (create "Beneficiary" entity_type first)
- Migrate `facilitators` → `entities` (create "Facilitator" entity_type first)
- Migrate `beneficiary_tags` → `entity_tags`
- Migrate `participations` → `activity_participants` (participant_type="entity", section_key="entity_type:beneficiary")
- Migrate `activity_facilitators` → `activity_participants` (participant_type="entity", section_key="entity_type:facilitator")
- Create default "Sessions" activity_category, link all existing activity_types to it

**Drop old tables:**
- `beneficiaries`, `facilitators`, `activity_facilitators`, `participations`, `beneficiary_tags`

### 1.2 Update SQLAlchemy Models

- **New module:** `app/modules/entity/` with model.py, schemas.py, service.py, routes.py
  - EntityType model + CRUD
  - Entity model + CRUD (replaces Beneficiary + Facilitator)
  - EntityTag model
- **Update:** `app/modules/activity/model.py`
  - Add ActivityCategory model
  - Add ActivityParticipant model (replaces Participation + ActivityFacilitator)
  - Add category_id to ActivityType
  - Remove Facilitator, ActivityFacilitator, Participation models
- **Update:** `app/modules/beneficiary/` → remove module entirely (replaced by entity module)
- **Update:** `app/modules/dimension/model.py` — remove BeneficiaryTag, replace with EntityTag import or move EntityTag here

### 1.3 Update Schemas

- **New:** EntityType schemas (Create, Update, Response)
- **New:** Entity schemas (Create, Update, Response) — includes entity_type info
- **New:** ActivityCategory schemas (Create, Update, Response) — sections config validation
- **New:** ActivityParticipant schemas (replaces ParticipationRecord/Response)
- **Update:** ActivityType schemas — add category_id
- **Update:** Enrollment schemas — entity_id instead of beneficiary_id

### 1.4 Update Services

- **New:** EntityTypeService, EntityService (absorbs BeneficiaryService + FacilitatorService logic)
- **New:** ActivityCategoryService
- **Update:** ActivityService — use ActivityParticipant instead of Participation
- **Update:** ParticipationService → ActivityParticipantService
- **Remove:** BeneficiaryService, FacilitatorService (logic moves to EntityService)

### 1.5 Update Routes

- **New:** `/api/entity-types` — CRUD (permissions: entity_type:view, entity_type:manage)
- **New:** `/api/entities` — CRUD (permissions: entity:view, entity:create, entity:edit, entity:manage)
- **New:** `/api/activity-categories` — CRUD (permissions: activity_type:manage — categories are part of activity type config)
- **Update:** `/api/activities/{id}/participants` — replaces /participations endpoint
- **Update:** `/api/enrollments` — use entity_id
- **Remove:** `/api/beneficiaries`, `/api/facilitators` routes (replaced by /api/entities)

### 1.6 Update Permissions

Update `app/seeds/initial.py`:
- Remove: `beneficiary:view`, `beneficiary:create`, `beneficiary:edit`, `facilitator:view`, `facilitator:manage`
- Add: `entity:view`, `entity:create`, `entity:edit`, `entity:manage`, `entity_type:view`, `entity_type:manage`

### 1.7 Update Seeds

- **initial.py:** Update permission keys, default role assignments
- **kshamata.py:** Create entity_types (Beneficiary, Facilitator), activity_category (Sessions with sections config), migrate dimension references

## Phase 2: Frontend

### 2.1 Types

Update `src/types/index.ts`:
- Add: EntityType, Entity, ActivityCategory, ActivityParticipant
- Remove: Beneficiary, Facilitator types
- Update: Enrollment (entity_id), Activity (participants)

### 2.2 API Services

Update `src/services/api.ts`:
- Add: entityTypeApi, entityApi, activityCategoryApi
- Replace: beneficiaryApi → entityApi, facilitatorApi → entityApi
- Update: activityApi.getParticipations → getParticipants, markParticipations → markParticipants
- Update: enrollmentApi — entity_id instead of beneficiary_id

### 2.3 Pages — Entity Management

- `/beneficiaries` → `/entities` (or keep URL, update to use entity API)
- `/beneficiaries/[id]` → `/entities/[id]` (entity detail with enrollments)
- `/admin/beneficiaries` → remove (replaced by entity type tabs)
- `/admin/facilitators` → remove (replaced by entity type tabs)
- New: `/admin/entities/[entityTypeKey]` — generic entity list page per type
- New: `/admin/entity-types` — entity type CRUD

### 2.4 Pages — Activity Categories

- New: `/admin/activity-categories` — CRUD with sections builder UI
- Update: `/admin/activity-types` — add category_id selector

### 2.5 Pages — Activities

- Update: `/activities/page.tsx` — activity creation form uses category sections
- Update: `/activities/[id]/page.tsx` — show participants grouped by section, use ActivityParticipant

### 2.6 Pages — Admin Layout

- Update: `/admin/layout.tsx` — dynamic tabs for entity types, add Activity Categories tab

### 2.7 Meta Fields → Form Fields

- Rename: `/admin/meta-fields` → `/admin/form-fields`
- Update entity type selector to include participant:{category_key} and activity:{category_key}
- Update Navigation references

### 2.8 Permissions

- Update all `<Can>` and `can()` checks from beneficiary/facilitator permissions to entity permissions

## Execution Order

1. Backend models + migration (1.1 - 1.2)
2. Backend schemas + services + routes (1.3 - 1.5)
3. Backend permissions + seeds (1.6 - 1.7)
4. Frontend types + API (2.1 - 2.2)
5. Frontend pages (2.3 - 2.8)

Each step builds on the previous. Backend first so frontend has APIs to work with.
