# List Infrastructure — Search, Filter, Sort & Pagination

> **Status:** Planning
> **Scope:** Reusable infrastructure for all list pages (Entities, Activities, Enrollments, etc.)

## Goal

Every list page in ABSetu should support:
1. **Search bar** (left) + **Filter button** (right) in a top toolbar, with a filter chip carousel below
2. **Sortable table columns** (configurable per list, including custom meta fields with `is_sortable`)
3. **URL param persistence** — shareable URLs that reproduce the exact view (filters → sort → page)
4. **Server-side pagination** using the existing `PaginatedResponse` and `Pagination` component

The infrastructure must be **entity-agnostic** so wiring up a new list page is configuration, not new code.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Any List Page (entities, activities, enrollments, etc.)    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ListToolbar                                           │  │
│  │  [🔍 Search input ............] [Filter ▼]            │  │
│  │  [chip: Gender=Male] [chip: Age>18] [chip: ...]       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ PageTable (sortable columns)                          │  │
│  │  Name ▼ | Case # | Type | Location | Created         │  │
│  │  ─────────────────────────────────────────────        │  │
│  │  row...                                               │  │
│  │  row...                                               │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Pagination                                            │  │
│  │  Showing 1-25 of 142  [< ] [1] [2] [3] ... [6] [> ]  │  │
│  │                                    Items per page [25] │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Backend — Generic List Query Infrastructure

### 1A. Common List Query Params

Add reusable Pydantic schemas to `backend/app/common/schemas/`.

**New file: `backend/app/common/schemas/list_params.py`**

```python
class PaginateParams(BaseModel):
    page: int = Field(1, ge=1)
    limit: int = Field(25, ge=1, le=100)

class PaginateSortParams(PaginateParams):
    sort_by: str | None = None      # column name or meta field key
    sort_order: str = "desc"        # "asc" | "desc"

class ListParams(PaginateSortParams):
    search: str | None = None
    filters: str | None = None      # JSON string of filter dict
```

### 1B. Generic List Query Helper

Add a reusable helper to `backend/app/common/helpers/`.

**New file: `backend/app/common/helpers/list_query.py`**

A utility module with functions that operate on SQLAlchemy queries:

```python
def apply_search(query, model, search_term, columns):
    """
    Apply ILIKE search across multiple columns.
    columns: list of SQLAlchemy column objects
    For meta fields: use model.meta['key'].astext
    """

def apply_filters(query, model, filters_dict, filter_config):
    """
    Apply filters to query based on a config that maps filter keys to behavior.

    filter_config example:
    {
        "entity_type_id": {"type": "exact", "column": Entity.entity_type_id},
        "dim:location": {"type": "dimension", "dimension_id": "..."},
        "meta:age": {"type": "range", "column": Entity.meta['age'].astext.cast(Integer)},
        "meta:gender": {"type": "exact", "column": Entity.meta['gender'].astext},
        "created_at": {"type": "date_range", "column": Entity.created_at},
    }
    """

def apply_sort(query, model, sort_by, sort_order, sort_config, default_sort):
    """
    Apply sorting. sort_config maps allowed sort keys to columns.
    Falls back to default_sort if sort_by is None or not in allowlist.

    sort_config example:
    {
        "name": Entity.name,
        "case_number": Entity.case_number,
        "created_at": Entity.created_at,
        "meta:age": Entity.meta['age'].astext.cast(Integer),
    }
    """

def paginate(query, page, limit):
    """
    Apply pagination. Returns (items, total_count).
    Uses a single query with window function or two queries (count + slice).
    """
```

Each function takes a query and returns a query — they compose. A typical service call:

```python
def list_entities(self, org_id, params: ListParams, accessible_dv_ids, filter_config, sort_config):
    query = self._build_base_query(org_id, accessible_dv_ids)
    query = apply_search(query, Entity, params.search, [Entity.name, Entity.case_number])
    query = apply_filters(query, Entity, params.filters, filter_config)
    query = apply_sort(query, Entity, params.sort_by, params.sort_order, sort_config, Entity.created_at.desc())
    items, total = paginate(query, params.page, params.limit)
    return items, total
```

### 1C. Update Entity List Endpoint

Modify `GET /api/entities/` to accept the new params and return `PaginatedResponse`.

**Before:**
```
GET /api/entities/?entity_type_id=...
→ [entity1, entity2, ...]
```

**After:**
```
GET /api/entities/?entity_type_id=...&search=john&sort_by=name&sort_order=asc&page=2&limit=25&filters={...}
→ { "count": 142, "data": [entity1, entity2, ...] }
```

The `entity_type_id` filter moves into the `filters` JSON (or stays as a top-level param for backwards compatibility — TBD based on preference).

### 1D. Filter Definitions Endpoint

**New endpoint: `GET /api/entities/filters?entity_type_id=...`**

Returns the available filters for a given context, so the frontend can dynamically build the filter UI:

```json
{
  "filters": [
    {
      "key": "entity_type_id",
      "label": "Entity Type",
      "type": "select",
      "options": [
        { "value": "uuid-1", "label": "Beneficiary" },
        { "value": "uuid-2", "label": "Volunteer" }
      ]
    },
    {
      "key": "dim:location",
      "label": "Location",
      "type": "select",
      "options": [
        { "value": "uuid-a", "label": "Mumbai" },
        { "value": "uuid-b", "label": "Delhi" }
      ]
    },
    {
      "key": "meta:gender",
      "label": "Gender",
      "type": "select",
      "options": ["Male", "Female", "Other"]
    },
    {
      "key": "meta:age",
      "label": "Age",
      "type": "range",
      "min": 0,
      "max": 100
    },
    {
      "key": "created_at",
      "label": "Created Date",
      "type": "date_range"
    }
  ]
}
```

This endpoint reads:
- Entity types for the org
- Dimensions (non-system) with their values
- Meta field schemas where `is_filterable = true`
- Static date fields

**Reusability:** Each module (entities, activities, enrollments) implements its own `/filters` endpoint, but all share the same response format. The frontend FilterModal renders any filter list in this shape.

### 1E. Meta Field Schema Extension

Add `is_filterable` and `is_sortable` to the meta field definition JSON:

```json
{
  "key": "age",
  "label": "Age",
  "type": "number",
  "required": false,
  "is_filterable": true,
  "is_sortable": true
}
```

This is a JSONB schema change — no migration needed. Just update:
- Backend: `MetaFieldSchemaUpdate` validation to accept the new fields
- Frontend: `MetaFieldDefinition` type + admin meta-field editor UI (add two toggle switches)

**Filter/sort type mapping:**

| Meta Field Type | Filterable As | Sortable As |
|----------------|---------------|-------------|
| `text` | ILIKE search | Alphabetical |
| `number` | Min/max range | Numeric |
| `date` | Date range | Chronological |
| `select` | Exact match (multi-select) | Alphabetical |
| `multiselect` | Contains any | Not sortable |
| `boolean` | True/false toggle | Not sortable |

---

## Phase 2: Frontend — Reusable Hook & Components

### 2A. `useListParams` Hook

**New file: `frontend/src/hooks/useListParams.ts`**

Adapted from ABWealth's `useUrlParamsForLists`. Manages all list state via URL search params.

**URL format:**
```
?search=john&filter_entity_type_id=uuid&filter_dim_location=uuid-a,uuid-b&filter_meta_gender=Male&sort_by=name&sort_order=asc&page=2&show=25
```

**URL param ordering** (for clean, shareable URLs):
1. `search`
2. `filter_*` params (dimensions, meta fields, entity_type)
3. `sort_by`, `sort_order`
4. `page`, `show`

**Interface:**

```typescript
interface UseListParamsOptions {
  defaultSortBy?: string;
  defaultSortOrder?: "asc" | "desc";
  allowedSortKeys?: string[];
  defaultLimit?: number;          // default: 25
}

interface UseListParamsReturn {
  // Search
  search: string;
  setSearch: (term: string) => void;          // debounced, resets page

  // Filters
  activeFilters: FilterValue[];               // parsed from URL
  setActiveFilters: (filters: FilterValue[]) => void;  // resets page
  removeFilter: (key: string, value?: string) => void;

  // Sort
  sortBy: string | null;
  sortOrder: "asc" | "desc";
  setSorting: (key: string, order: "asc" | "desc") => void;  // preserves page

  // Pagination
  page: number;
  limit: number;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;          // resets page

  // For API calls
  apiParams: {
    search?: string;
    filters?: string;            // JSON string for backend
    sort_by?: string;
    sort_order: string;
    page: number;
    limit: number;
  };
}
```

**Page reset rules** (proven in ABWealth):
- Search changes → reset to page 1
- Filter changes → reset to page 1
- Sort changes → keep current page
- Limit changes → reset to page 1

### 2B. `ListToolbar` Component

**New file: `frontend/src/components/ui/list-toolbar.tsx`**

```typescript
interface ListToolbarProps {
  search: string;
  onSearchChange: (term: string) => void;
  filterDefinitions: FilterDefinition[];      // from /filters endpoint
  activeFilters: FilterValue[];
  onFiltersChange: (filters: FilterValue[]) => void;
  onRemoveFilter: (key: string, value?: string) => void;
  searchPlaceholder?: string;
}
```

Contains:
- **Search input** (left, with debounce built in — 500ms)
- **Filter button** (right, opens FilterModal)
- **FilterCarousel** (below, shows active filter chips)

### 2C. `FilterModal` Component

**New file: `frontend/src/components/ui/filter-modal.tsx`**

Renders dynamically based on `FilterDefinition[]` from the backend. Full-screen on mobile (using existing Dialog component), centered modal on desktop.

**Sections rendered per filter type:**
- `select` → multi-select checkboxes (grouped by filter key)
- `range` → min/max number inputs
- `date_range` → date picker (start + end)
- `boolean` → toggle switch

**Behavior:**
- Local state until "Apply" is pressed (no premature URL updates)
- "Clear All" resets all filters
- Re-initializes from `activeFilters` each time it opens

### 2D. `FilterCarousel` Component

**New file: `frontend/src/components/ui/filter-carousel.tsx`**

Horizontal scrolling strip of active filter chips. Each chip shows `[Label: Value] [X]`. Clicking X calls `onRemoveFilter`.

### 2E. `SortableTableHead` Component

**New file: `frontend/src/components/ui/sortable-table-head.tsx`**

Wraps existing `TableHead` from `page-table.tsx`. Adds click-to-sort behavior:

```typescript
interface SortableTableHeadProps {
  label: string;
  sortKey: string;
  currentSortBy: string | null;
  currentSortOrder: "asc" | "desc";
  onSort: (key: string, order: "asc" | "desc") => void;
}
```

**Behavior:**
- Click unsorted column → sort descending
- Click already-sorted column → toggle direction
- Visual: arrow icon (up/down) + blue highlight when active
- No icon when column is not sortable (just render plain `TableHead`)

### 2F. `Pagination` Component

**New file: `frontend/src/components/ui/pagination.tsx`**

Adapted from ABWealth/Algotrade (shared pattern):

```typescript
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (limit: number) => void;
  itemLabel?: string;                         // "entities", "activities", etc.
}
```

**Features:**
- "Showing X to Y of Z {itemLabel}" summary
- Prev/Next buttons
- Numbered page buttons with ellipsis for gaps
- Items-per-page dropdown: 10, 25, 50
- Mobile-compact layout (fewer page buttons, stacked)

---

## Phase 3: Wiring Up a List Page

### The Pattern (Entity List as Example)

```typescript
// entities/page.tsx

export default function EntitiesPage() {
  // 1. Fetch filter definitions
  const { data: filterDefs } = useQuery({
    queryKey: ["entity-filters"],
    queryFn: () => entityApi.getFilters(),
  });

  // 2. Initialize list params hook
  const listParams = useListParams({
    defaultSortBy: "created_at",
    defaultSortOrder: "desc",
    allowedSortKeys: ["name", "case_number", "created_at", ...dynamicSortKeys],
  });

  // 3. Fetch paginated data
  const { data: response, isLoading } = useQuery({
    queryKey: ["entities", listParams.apiParams],
    queryFn: () => entityApi.list(listParams.apiParams),
  });

  // 4. Render
  return (
    <PageLayout>
      <PageHeader title="Entities" actions={...} />

      <ListToolbar
        search={listParams.search}
        onSearchChange={listParams.setSearch}
        filterDefinitions={filterDefs?.filters || []}
        activeFilters={listParams.activeFilters}
        onFiltersChange={listParams.setActiveFilters}
        onRemoveFilter={listParams.removeFilter}
        searchPlaceholder="Search by name or case number..."
      />

      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead label="Name" sortKey="name" ... />
            <SortableTableHead label="Case #" sortKey="case_number" ... />
            <TableHead>Type</TableHead>
            <SortableTableHead label="Created" sortKey="created_at" ... />
          </TableRow>
        </TableHeader>
        <TableBody>
          {response?.data.map(entity => <TableRow>...</TableRow>)}
        </TableBody>
      </Table>

      <Pagination
        currentPage={listParams.page}
        totalPages={Math.ceil((response?.count || 0) / listParams.limit)}
        totalItems={response?.count || 0}
        itemsPerPage={listParams.limit}
        onPageChange={listParams.setPage}
        onItemsPerPageChange={listParams.setLimit}
        itemLabel="entities"
      />
    </PageLayout>
  );
}
```

### Wiring Up Activities (Same Pattern)

```typescript
// activities/page.tsx — same structure, different config:

const { data: filterDefs } = useQuery({
  queryKey: ["activity-filters"],
  queryFn: () => activityApi.getFilters(),     // different endpoint
});

const listParams = useListParams({
  defaultSortBy: "start_date",                 // different default
  allowedSortKeys: ["title", "start_date", "activity_type", ...],
});

const { data: response } = useQuery({
  queryKey: ["activities", listParams.apiParams],
  queryFn: () => activityApi.list(listParams.apiParams),
});

// Same ListToolbar, Table, Pagination — just different columns
```

### Checklist: Adding List Infrastructure to a New Page

1. **Backend:**
   - [ ] Add `GET /{module}/filters` endpoint (return `FilterDefinition[]`)
   - [ ] Update `GET /{module}/` to accept `ListParams` and return `PaginatedResponse`
   - [ ] Define `filter_config` and `sort_config` dicts in service
   - [ ] Use `apply_search()`, `apply_filters()`, `apply_sort()`, `paginate()` helpers

2. **Frontend:**
   - [ ] Add API functions for list (with params) and filters
   - [ ] Use `useListParams` hook
   - [ ] Use `ListToolbar` with filter definitions
   - [ ] Render table with `SortableTableHead` columns
   - [ ] Add `Pagination` at bottom

---

## Phase 4: Meta Field Admin UI Update

Update the existing meta field admin page (`/admin/meta-fields`) to show `is_filterable` and `is_sortable` toggles per field.

**Rules enforced in UI:**
- `multiselect` and `boolean` types: `is_sortable` toggle disabled (greyed out)
- Toggling `is_filterable` or `is_sortable` takes effect immediately for list pages (since filter definitions are fetched dynamically)

---

## Implementation Order

| Step | Layer | What | Depends On |
|------|-------|------|------------|
| 1 | Backend | `list_params.py` schemas + `list_query.py` helpers | — |
| 2 | Backend | Update `GET /api/entities/` to accept params, return `PaginatedResponse` | Step 1 |
| 3 | Frontend | `useListParams` hook | — |
| 4 | Frontend | `Pagination` component | — |
| 5 | Frontend | `SortableTableHead` component | — |
| 6 | Frontend | Refactor entity list page: cards → table + pagination + sort | Steps 2-5 |
| 7 | Backend | `GET /api/entities/filters` endpoint | — |
| 8 | Backend | Meta field schema: add `is_filterable`, `is_sortable` | — |
| 9 | Frontend | `FilterModal` + `FilterCarousel` + `ListToolbar` | Step 7 |
| 10 | Frontend | Wire filters into entity list page | Steps 6, 9 |
| 11 | Frontend | Meta field admin: add filterable/sortable toggles | Step 8 |
| 12 | Backend + Frontend | Apply same pattern to activity list | Steps 1-10 |
| 13 | Backend + Frontend | Apply to enrollment list, other pages | Steps 1-10 |

**Parallelizable:** Steps 3-5 (frontend components) can happen in parallel with Steps 1-2 (backend). Step 7-8 can happen in parallel with Step 6.

---

## URL Examples

**Unfiltered first page:**
```
/entities
```

**Filtered + sorted + page 2:**
```
/entities?search=john&filter_entity_type_id=uuid-1&filter_dim_location=uuid-a&sort_by=name&sort_order=asc&page=2&show=25
```

**Defaults omitted from URL:**
- `sort_order=desc` (default) → omitted
- `page=1` → omitted
- `show=25` → omitted

---

## Open Questions

1. **Entity type filter**: Keep as top-level query param (`entity_type_id=...`) or move into the filter system (`filter_entity_type_id=...`)? Moving it in makes the URL more consistent but loses the quick-select dropdown UX.

2. **Cards vs Table on mobile**: Entity list currently uses cards. Tables can be hard to read on small screens. Options:
   - Table on desktop, cards on mobile (two render paths)
   - Responsive table that stacks columns on mobile
   - Table-only with horizontal scroll

3. **Search scope**: Should search also search meta field values (JSONB text search)? This is powerful but slower. Could start with core columns only and add meta search later.

4. **Filter chip limit**: If 10+ filters are active, the carousel gets long. Show first N chips + "+X more" badge?
