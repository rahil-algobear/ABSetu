# Tags System

## Purpose

A lightweight, org-defined tagging taxonomy that can be applied to Entities, Enrollments, and Activities to make filtering and reporting easier.

Tags are **flat labels** grouped under a **TagType**. Unlike Dimensions, tags do not carry access-control semantics, cross-type linking, or per-dimension scoping — they are purely descriptive metadata.

## Relationship to Dimensions

The Dimension module already supports classification and access scoping. Tags are intentionally simpler and serve a different purpose:

| Concern | Dimensions | Tags |
|---|---|---|
| Org-scoped taxonomy | Yes | Yes |
| Applied to Entity / Enrollment / Activity | Yes | Yes |
| Used for filtering & reporting | Yes | Yes |
| Used for user access scoping (`UserDimension`) | Yes | **No** |
| Cross-type linking (`DimensionValueLink`) | Yes | **No** |
| Color for UI display | No | **Yes** |
| Description field on the type | No | **Yes** |
| Intended weight | Structural, governed | Lightweight, ad-hoc |

Rule of thumb: if a label gates *who can see what*, it belongs in Dimensions. If it just helps users slice, filter, and report on data, it belongs in Tags.

---

## Data Model

### TagType

Org-scoped tag taxonomy (e.g. "Priority", "Campaign", "Risk Level").

```python
class TagType(BaseModel):
    __tablename__ = "tag_types"

    organization_id = Column(UUID, ForeignKey("organizations.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    name = Column(String, nullable=False)
    key = Column(String, nullable=False)           # slugified from name
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)

    organization = relationship("Organization", back_populates="tag_types")
    tags = relationship("Tag", back_populates="tag_type",
                        cascade="all, delete-orphan", lazy="dynamic")

    __table_args__ = (
        UniqueConstraint("organization_id", "key", name="uq_tag_type_org_key"),
    )
```

### Tag

A single label under a TagType (e.g. under "Priority": "High", "Medium", "Low").

```python
class Tag(BaseModel):
    __tablename__ = "tags"

    organization_id = Column(UUID, ForeignKey("organizations.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    tag_type_id = Column(UUID, ForeignKey("tag_types.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    name = Column(String, nullable=False)
    code = Column(String, nullable=False)          # slugified from name
    color = Column(String(7), nullable=True)       # hex e.g. "#FF6B6B"
    sort_order = Column(Integer, nullable=False, default=0)
    meta = Column(JSONB, nullable=True, default=dict)

    tag_type = relationship("TagType", back_populates="tags")
    organization = relationship("Organization")

    __table_args__ = (
        UniqueConstraint("tag_type_id", "code", name="uq_tag_code"),
    )
```

`organization_id` is denormalized onto `Tag` (same as `DimensionValue`) so queries filtering tags by org don't need a join through `TagType`.

### Join tables

Three parallel M2M join models, one per taggable entity. Each follows the same shape as `EntityDimension` / `EnrollmentDimension` / `ActivityDimension`.

```python
class EntityTag(BaseModel):
    __tablename__ = "entity_tags"
    entity_id = Column(UUID, ForeignKey("entities.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    tag_id    = Column(UUID, ForeignKey("tags.id", ondelete="CASCADE"),
                       nullable=False, index=True)

    entity = relationship("Entity", back_populates="tags")
    tag    = relationship("Tag")

    __table_args__ = (UniqueConstraint("entity_id", "tag_id", name="uq_entity_tag"),)


class EnrollmentTag(BaseModel):
    __tablename__ = "enrollment_tags"
    enrollment_id = Column(UUID, ForeignKey("enrollments.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    tag_id        = Column(UUID, ForeignKey("tags.id", ondelete="CASCADE"),
                           nullable=False, index=True)

    enrollment = relationship("Enrollment", back_populates="tags")
    tag        = relationship("Tag")

    __table_args__ = (UniqueConstraint("enrollment_id", "tag_id", name="uq_enrollment_tag"),)


class ActivityTag(BaseModel):
    __tablename__ = "activity_tags"
    activity_id = Column(UUID, ForeignKey("activities.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    tag_id      = Column(UUID, ForeignKey("tags.id", ondelete="CASCADE"),
                         nullable=False, index=True)

    activity = relationship("Activity", back_populates="tags")
    tag      = relationship("Tag")

    __table_args__ = (UniqueConstraint("activity_id", "tag_id", name="uq_activity_tag"),)
```

### Related model changes

- `Organization.tag_types` relationship added.
- `Entity.tags`, `Enrollment.tags`, `Activity.tags` relationships added (`cascade="all, delete-orphan"`, `lazy="joined"` matching the existing dimension relationships).

---

## Backend Module Layout

```
backend/app/modules/tag/
    __init__.py
    model.py      # TagType, Tag, EntityTag, EnrollmentTag, ActivityTag
    schemas.py    # Create/Update/Response
    service.py    # TagTypeService, TagService, TagAssignmentService
    routes.py     # /api/tag-types, /api/tags, assignment endpoints
```

The dimension module (`backend/app/modules/dimension/`) is the reference pattern and should be followed closely for naming, slugify-on-create, org-scoped queries, and response schemas.

### Permission Keys

Two new permission keys, registered via the standard role seeding path:

- `tag:view`   — list and read tag types, tags, and assignments
- `tag:manage` — create/update/delete tag types and tags; assign and unassign tags on entities, enrollments, activities

Assignment is gated by `tag:manage` rather than `entity:manage` / `enrollment:manage` / `activity:manage` so that tag administration can be delegated independently of core record editing. (Open for review — an alternative is to require *both* `tag:manage` and the target entity's manage permission.)

### REST Endpoints

Admin — tag types and tags:

```
GET    /api/tag-types/                      list tag types for org
POST   /api/tag-types/                      create tag type
GET    /api/tag-types/{id}                  get one
PUT    /api/tag-types/{id}                  update
DELETE /api/tag-types/{id}                  delete (cascades to tags & assignments)

GET    /api/tag-types/{id}/tags             list tags for a type
POST   /api/tag-types/{id}/tags             create tag
PUT    /api/tag-types/{id}/tags/{tag_id}    update tag
DELETE /api/tag-types/{id}/tags/{tag_id}    delete tag (cascades to assignments)
```

Assignment — applying tags to records:

```
GET    /api/entities/{id}/tags              list tag_ids on entity
PUT    /api/entities/{id}/tags              bulk replace (body: {tag_ids: [...]})
POST   /api/entities/{id}/tags/{tag_id}     add one
DELETE /api/entities/{id}/tags/{tag_id}     remove one

(same shape for /api/enrollments/{id}/tags and /api/activities/{id}/tags)
```

Bulk-replace (`PUT`) is the primary pattern — it matches how the frontend multi-select picker will work and avoids the client having to diff. Individual add/remove endpoints are kept for incremental updates (e.g. a chip-style tag input).

Response shape for a tag on a record includes the full tag object (name, code, color, tag_type_id, tag_type_key) so the frontend can render chips without extra lookups.

### Service Responsibilities

- `TagTypeService`: CRUD, slugify `name → key`, enforce `(org, key)` uniqueness.
- `TagService`: CRUD within a tag type, slugify `name → code`, enforce `(tag_type, code)` uniqueness, validate `color` is a valid hex if provided.
- `TagAssignmentService`: a single service with `assign(record_type, record_id, tag_ids)` / `unassign(...)` / `list_for_record(...)`. Keeps M2M logic in one place across the three join tables.

All services accept `db: Session` via constructor, same DI pattern as `DimensionService`.

### Filtering on list endpoints

The existing list endpoints for entities, enrollments, and activities get a new optional query param:

```
?tag_ids=<uuid>,<uuid>,...           records having ALL listed tags (AND)
?tag_ids_any=<uuid>,<uuid>,...       records having ANY listed tag (OR)
```

Implementation: `EXISTS` subqueries against the relevant join table — one `EXISTS` per tag for AND semantics, one `IN` subquery for OR semantics. Indexes on the join tables' `(record_id, tag_id)` cover this.

---

## Migration

Single Alembic migration creates five new tables in order:

1. `tag_types`
2. `tags`
3. `entity_tags`
4. `enrollment_tags`
5. `activity_tags`

Plus one data-only migration to register the `tag:view` and `tag:manage` permissions and attach them to the default admin role (matching how dimension permissions are seeded).

No backfill needed — this is pure additive data.

---

## Frontend

### Admin UI

New admin route `/admin/tag-types` modeled on `/admin/dimensions`:

- Top-level list of TagTypes (name, description, tag count, sort order).
- Drill-in page `/admin/tag-types/[key]` to manage tags within a type — table with name, code, color swatch, sort order.
- Reuses existing primitives: `PageHeader`, `Table`, `Dialog`, `Can` for permission gating.
- Color field: simple hex input with a swatch preview; no color picker dependency needed in v1.

### Tag Picker Component

New reusable component `<TagPicker recordType record={...} />` for use on entity / enrollment / activity detail pages:

- Fetches tag types + tags for the org (cached via React Query).
- Renders a grouped multi-select (group = TagType).
- Applies changes via the bulk `PUT` endpoint on blur / save.
- Chips render with the tag's `color` if set, otherwise a neutral default.

### List Filters

Entity / Enrollment / Activity list pages get a new "Tags" filter in their existing filter bar, sending `tag_ids` to the backend. Matches the dimension filter affordance so the UX is consistent.

### API Service

New `tagApi` in `services/api.ts`, structured like `dimensionApi`:

```ts
tagApi.listTypes()
tagApi.createType(data)
tagApi.updateType(id, data)
tagApi.deleteType(id)
tagApi.listTags(typeId)
tagApi.createTag(typeId, data)
tagApi.updateTag(typeId, tagId, data)
tagApi.deleteTag(typeId, tagId)

tagApi.getForEntity(entityId)
tagApi.setForEntity(entityId, tagIds)
// + same for enrollments and activities
```

---

## Out of Scope (v1)

- **Tag-based access control.** If this is needed, it should be a future extension modeled on `UserDimension`.
- **Cross-type tag relationships** (equivalent of `DimensionValueLink`). Not proven useful for flat labels; add only if a real use case appears.
- **Tagging Users, Roles, Organizations, or Sessions.** Only Entity / Enrollment / Activity in v1 per the task spec.
- **Auto-tagging rules** (e.g. "if meta.age > 60 then tag 'Senior'"). Possible future enhancement.
- **Tag usage analytics** (counts per tag across the org). Can be derived from the join tables when needed; no dedicated materialized view in v1.

---

## Open Questions

1. Should assignment endpoints require only `tag:manage`, or both `tag:manage` *and* the target record's manage permission? Defaulting to `tag:manage` only; revisit if orgs report accidental tagging.
2. Do we want a "system tags" concept (tags seeded per-org on creation, e.g. "Flagged", "Archived")? Not in v1 — orgs can create their own.
3. Should `Tag.meta` participate in the `MetaFieldSchema` system? No for v1 — keep tags lightweight.
