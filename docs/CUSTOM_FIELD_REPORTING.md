# Custom Field Reporting

## Problem

Our meta field system lets orgs define custom fields (dates, numbers, selects, etc.) on activities, entities, enrollments, and participants. But the dashboard only reports on hardcoded columns — entity counts, activity counts, dimension breakdowns.

Example: A campaign activity type has custom `start_date` and `end_date` fields. Today there's no way to visualize campaign timelines, filter by date ranges, or aggregate by custom select fields on the dashboard.

**Custom fields are only as powerful as the insights you can extract from them.**

## Approach: Reportable Fields

Extend the existing meta field schema system with reporting metadata. No new tables — reporting config lives inside the existing `meta_field_schemas.fields` JSONB.

### Core Idea

1. Org admins mark specific meta fields as **reportable** when defining them
2. Backend uses field type + reporting config to build dynamic JSONB aggregation queries
3. Dashboard automatically renders charts for all reportable fields in the current filter context

## Design

### 1. Extend MetaFieldDefinition

Add `reportable` flag and `report_config` to field definitions:

```json
{
  "key": "campaign_start_date",
  "label": "Campaign Start Date",
  "type": "date",
  "required": true,
  "reportable": true,
  "report_config": {
    "aggregations": ["range", "timeline"],
    "chart_types": ["timeline", "bar"],
    "group_by": true
  }
}
```

```json
{
  "key": "region",
  "label": "Region",
  "type": "select",
  "options": ["North", "South", "East", "West"],
  "reportable": true,
  "report_config": {
    "aggregations": ["count_by_value"],
    "chart_types": ["pie", "bar"],
    "group_by": true
  }
}
```

The `report_config` is optional — sensible defaults can be inferred from field type.

### 2. Type-Aware Aggregation Strategies

Each field type maps to natural aggregation methods:

| Field Type    | Aggregations                                     | Default Chart  |
|---------------|--------------------------------------------------|----------------|
| `date`        | timeline, range overlap, min/max, distribution   | Timeline        |
| `number`      | sum, avg, min, max, histogram/buckets            | Bar / KPI card  |
| `select`      | count by value                                   | Pie / Bar       |
| `multiselect` | count by value (unnest + group by)               | Bar             |
| `boolean`     | count true/false                                 | Donut           |
| `text`        | count distinct (top N values)                    | Bar (top N)     |

### 3. Backend: Generic JSONB Aggregation Queries

A query builder that takes `(scope_key, field_key, field_type, aggregation_type)` and produces the right SQL using Postgres JSONB operators:

```sql
-- Select field: count by value
SELECT meta->>'region' AS value, COUNT(*)
FROM activities
WHERE activity_type_id = :activity_type_id
GROUP BY meta->>'region'

-- Date field: distribution by month
SELECT DATE_TRUNC('month', (meta->>'campaign_start_date')::date) AS month, COUNT(*)
FROM activities
WHERE organization_id = :org_id
GROUP BY month ORDER BY month

-- Number field: aggregates
SELECT
  AVG((meta->>'budget')::numeric) AS avg_val,
  SUM((meta->>'budget')::numeric) AS sum_val,
  MIN((meta->>'budget')::numeric) AS min_val,
  MAX((meta->>'budget')::numeric) AS max_val
FROM activities
WHERE organization_id = :org_id

-- Date range: activities where campaign overlaps a time window
SELECT * FROM activities
WHERE (meta->>'campaign_start_date')::date <= :end
  AND (meta->>'campaign_end_date')::date >= :start

-- Boolean field: true/false split
SELECT meta->>'is_recurring' AS value, COUNT(*)
FROM activities
WHERE organization_id = :org_id
GROUP BY meta->>'is_recurring'

-- Multiselect: unnest and count
SELECT jsonb_array_elements_text(meta->'target_groups') AS value, COUNT(*)
FROM activities
WHERE organization_id = :org_id
GROUP BY value
```

Safe casting is possible because the field type is known from the schema.

### 4. API Design

#### Option A: Extend existing dashboard endpoint

Add a `meta_field_stats` section to the existing `/api/dashboard/stats` response:

```python
class DashboardStats:
    # ... existing fields ...
    meta_field_stats: dict[str, list[MetaFieldAggregation]]
```

Response example:

```json
{
  "total_entities": 150,
  "total_activities": 320,
  "meta_field_stats": {
    "activity:type:abc123": [
      {
        "field_key": "campaign_start_date",
        "field_label": "Campaign Start Date",
        "field_type": "date",
        "aggregation": "timeline",
        "data": [
          {"label": "2025-01", "value": 5},
          {"label": "2025-02", "value": 12}
        ]
      },
      {
        "field_key": "region",
        "field_label": "Region",
        "field_type": "select",
        "aggregation": "count_by_value",
        "data": [
          {"label": "North", "value": 45},
          {"label": "South", "value": 32}
        ]
      }
    ]
  }
}
```

#### Option B: Separate endpoint for meta field reports

```
GET /api/dashboard/meta-report?scope_key=activity:type:{id}&field_key=campaign_start_date&aggregation=timeline
```

**Recommendation:** Start with Option A (extend existing endpoint) for simplicity. Move to Option B if performance requires lazy-loading individual charts.

### 5. Frontend: Generic Chart Renderer

Follow the existing pattern from `DimensionBreakdownChart` — dynamic charts driven by data:

```tsx
// In DashboardContent
{metaFieldStats.map(stat => (
  <MetaFieldChart key={stat.field_key} stat={stat} />
))}
```

`MetaFieldChart` selects visualization based on `field_type` + `aggregation`:

- `date` + `timeline` → Line chart
- `select` + `count_by_value` → Pie or bar chart
- `number` + `aggregates` → KPI card (sum, avg, min, max)
- `boolean` + `count` → Donut chart
- `multiselect` + `count_by_value` → Horizontal bar chart

### 6. Admin UX: Opting Fields Into Reporting

In the existing meta fields admin page (`/admin/meta-fields`), add a "Reportable" toggle when creating/editing a field. When enabled, show optional report config (preferred chart type, aggregation method) with sensible defaults pre-selected based on field type.

Fields are **not reportable by default** — admins opt in, keeping dashboards clean and focused.

## Why This Works With Our Architecture

1. **No new tables** — reporting config lives inside existing `meta_field_schemas.fields` JSONB
2. **Postgres JSONB is capable** — for NGO-scale volumes, `meta->>'field'` queries with indexes are performant
3. **Org-scoped by default** — the entire system already filters by `organization_id`, so custom reports are automatically tenant-isolated
4. **Progressive disclosure** — only opted-in fields appear on dashboards
5. **Follows existing patterns** — mirrors what Dimensions already do (dynamic grouping/filtering) but generalized to any meta field

## Performance Considerations

JSONB aggregation queries can slow down on large tables without indexes.

**Mitigations:**

- **GIN indexes** on `meta` columns for frequently queried paths:
  ```sql
  CREATE INDEX idx_activities_meta ON activities USING GIN (meta);
  ```
- **Expression indexes** for heavily queried specific fields:
  ```sql
  CREATE INDEX idx_activities_meta_region ON activities ((meta->>'region'))
  WHERE meta->>'region' IS NOT NULL;
  ```
- **Caching** — cache dashboard stats with a TTL and refresh periodically rather than querying live on every page load
- **Materialized views** — for complex cross-entity aggregations if needed later

## Implementation Order

1. **Extend `MetaFieldDefinition`** — add `reportable` and `report_config` to schema definition (backend types + frontend types)
2. **Admin UI** — add reportable toggle to meta field editor
3. **Backend query builder** — generic JSONB aggregation service that handles each field type
4. **Extend dashboard API** — add `meta_field_stats` to dashboard stats response
5. **Frontend charts** — generic `MetaFieldChart` component that picks visualization by type
6. **Indexing** — add GIN indexes on meta columns
