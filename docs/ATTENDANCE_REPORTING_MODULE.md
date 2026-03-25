# Attendance / Participation Reporting Module

## Overview

A reporting module that provides an **entity x time-period attendance matrix** — allowing NGOs to view participation across activities over configurable time periods. The design is generic and works across any activity type, entity type, and dimension combination.

## What It Looks Like

A spreadsheet-style view where:
- **Rows** = enrolled entities (e.g., beneficiaries)
- **Left columns** = entity info (configurable meta fields like name, age, education, etc.)
- **Right columns** = time periods (months, weeks, or days)
- **Cells** = count of sessions attended in that period
- **Final column** = total attendance across all periods

Filterable by activity type, dimensions (programme, centre), date range, and granularity.

---

## Data Model Context

No new database models are needed. The report is a **read-only aggregation** over existing entities:

```
ActivityParticipant (attendance records)
  → Activity (session instance, with date in meta)
    → ActivityDimension (links to programme/centre dimension values)
    → ActivityType (LSE Sessions, IT Classes, etc.)

Entity (beneficiary)
  → Enrollment (links to programme/centre via EnrollmentDimension)
    → EnrollmentDimension (scoping to specific programme/centre)

MetaFieldSchema (defines which custom fields exist per entity/activity type)
```

### Key Relationships for the Query

| Source | Provides |
|---|---|
| `ActivityParticipant` | Who attended which activity, with status |
| `Activity.meta.start_date` | When the activity occurred (for time bucketing) |
| `ActivityDimension` | Which programme/centre the activity belongs to |
| `Enrollment` + `EnrollmentDimension` | Full roster of enrolled entities (including those with 0 attendance) |
| `Enrollment.meta.admission_date / release_date` | Valid attendance window per entity |
| `Entity.meta` | Entity info columns (name, age, etc.) |
| `MetaFieldSchema` | Which meta fields are available for column selection |

---

## API Design

### Report Endpoint

```
GET /api/reports/attendance
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `activity_type_id` | UUID | Yes | Which activity type to report on |
| `dimension_value_ids` | UUID[] | No | Filter by programme/centre (comma-separated) |
| `entity_type_id` | UUID | No | Which entity type (defaults to primary beneficiary type) |
| `date_from` | Date | Yes | Start of reporting period |
| `date_to` | Date | Yes | End of reporting period |
| `granularity` | String | No | `monthly` (default), `weekly`, `daily` |
| `meta_fields` | String[] | No | Which entity/enrollment meta field keys to include as columns |
| `offset` | Int | No | Pagination offset |
| `limit` | Int | No | Pagination limit |

**Response:**

```json
{
  "periods": ["2025-01", "2025-02", "2025-03"],
  "total_sessions_by_period": {
    "2025-01": 5,
    "2025-02": 4,
    "2025-03": 5
  },
  "meta_field_labels": {
    "name": "Women Name",
    "age": "Age",
    "education": "Education"
  },
  "rows": [
    {
      "entity_id": "uuid",
      "entity_code": "K/SS/25/001",
      "entity_meta": {
        "name": "Lata Shaikh",
        "age": 25,
        "education": "NIL"
      },
      "enrollment_meta": {
        "admission_date": "2023-11",
        "release_date": "2025-04"
      },
      "attendance_by_period": {
        "2025-01": 5,
        "2025-02": 3,
        "2025-03": 0
      },
      "total": 8,
      "enrollment_active_periods": ["2025-01", "2025-02", "2025-03"]
    }
  ],
  "total_entities": 44,
  "offset": 0,
  "limit": 50
}
```

### Export Endpoint

```
GET /api/reports/attendance/export
```

Same query parameters as above, plus:

| Parameter | Type | Description |
|---|---|---|
| `format` | String | `xlsx` (default) or `csv` |

Returns a downloadable file with the same matrix layout.

**Technology:** `openpyxl` for Excel, `csv` (stdlib) for CSV.

---

## Backend Implementation

### Module Structure

```
backend/app/modules/report/
  __init__.py
  routes.py      # Report endpoints
  service.py     # Query logic and aggregation
  schemas.py     # Request/response Pydantic models
  export.py      # Excel/CSV generation
```

No `model.py` — this is a read-only module with no tables.

### Core Query Logic

The main SQL query is essentially:

```sql
-- 1. Get all enrolled entities for the given dimensions
-- 2. Get all activities of the given type in the date range for those dimensions
-- 3. Left join enrolled entities with activity participants
-- 4. Group by entity + time period (DATE_TRUNC)
-- 5. Count participations per group
```

Pseudocode:

```python
async def get_attendance_matrix(filters, user):
    # 1. Respect dimension-based access control
    accessible_dimension_values = get_user_dimension_values(user)
    effective_dimensions = intersect(filters.dimension_value_ids, accessible_dimension_values)

    # 2. Get enrolled entities (the roster)
    enrolled_entities = (
        select Entity, Enrollment
        join EnrollmentDimension
        where dimension_value_id in effective_dimensions
        and entity_type_id = filters.entity_type_id
    )

    # 3. Get activities in range
    activities = (
        select Activity
        join ActivityDimension
        where activity_type_id = filters.activity_type_id
        and dimension_value_id in effective_dimensions
        and start_date between date_from and date_to
    )

    # 4. Get participation counts grouped by entity + period
    attendance = (
        select participant_id, DATE_TRUNC(granularity, start_date) as period, COUNT(*)
        from ActivityParticipant
        join Activity
        where activity_id in activities
        group by participant_id, period
    )

    # 5. Build matrix: merge enrolled entities with attendance counts
    # Entities with no attendance in a period get 0
    # Periods outside enrollment window get null (N/A)
```

### Key Considerations

1. **Enrollment window awareness:** If `admission_date` is Mar-25 and we're reporting Jan-25 to Jun-25, Jan and Feb should show `null` (not enrolled yet), not `0` (enrolled but absent). Same for after `release_date`.

2. **Total sessions held per period:** Count distinct activities per period for the given filters. This allows the frontend to show "attended X out of Y" if desired.

3. **Access control:** Filter by `UserDimension` — users only see entities/activities within their assigned dimension values.

4. **Performance:** For large datasets, consider:
   - Pagination on entities (rows)
   - Limiting date range (max 12 months?)
   - Caching if needed

---

## Frontend Implementation

### Route

```
/reports/attendance
```

Gated by `reports:view` permission.

### Page Layout

```
+----------------------------------------------------------+
| Filters                                                    |
| [Activity Type v] [Programme v] [Centre v]                |
| [Date From] [Date To] [Granularity v] [Column Config]    |
|                                          [Export v]        |
+----------------------------------------------------------+
| Sticky Columns      | Scrollable Attendance Grid    | T  |
|----------------------|-------------------------------|-----|
| Code | Name | Age   | Jan | Feb | Mar | Apr | May  | Tot |
|------|------|-------|-----|-----|-----|-----|------|-----|
| 001  | Lata | 25    |  5  |  3  |  0  | N/A | N/A  |  8  |
| 002  | Neha | 32    |  0  |  1  |  0  |  0  |  0   |  1  |
| ...  | ...  | ...   | ... | ... | ... | ... | ...  | ... |
+----------------------------------------------------------+
| Summary Row          |  15 |  12 |  8  | ... | ...  | 35  |
+----------------------------------------------------------+
```

### Components

| Component | Purpose |
|---|---|
| `AttendanceReportPage` | Page container with filters and table |
| `ReportFilterBar` | Activity type, dimension, date range, granularity selectors |
| `AttendanceMatrix` | The core table with sticky left columns and scrollable grid |
| `MetaFieldColumnPicker` | Lets users choose which entity meta fields to show |
| `ExportButton` | Triggers download in xlsx/csv format |

### Technical Notes

- **TanStack Table** for virtualized, sticky-column table rendering
- **Sticky left columns:** Entity info columns stay fixed while attendance columns scroll horizontally (critical for mobile)
- **Conditional styling:** Differentiate between `0` (absent), `null`/N/A (not enrolled), and positive counts
- **Mobile:** On small screens, collapse entity info to just name + code, or switch to a card-based view per entity
- **TanStack Query** for data fetching with filter params as query keys

---

## Permissions

| Permission Key | Controls |
|---|---|
| `reports:view` | Access to the reports page and API |
| `reports:export` | Access to the export endpoint and button |

Plus implicit scoping via dimension-based access control (users only see data for their assigned dimension values).

---

## Phases

### Phase 1 (MVP)
- Attendance matrix endpoint with filters
- Monthly granularity
- Entity meta field columns (configurable)
- Excel and CSV export
- Frontend matrix table with sticky columns
- Dimension-based access control

### Phase 2
- Weekly/daily granularity
- Attendance percentage calculation (attended / total held)
- Summary statistics (avg attendance rate, most/least attended, trends)
- Multiple activity types in one report
- PDF export
- Saved report configurations (filters saved per user)
- Scheduled email reports

---

## Open Design Questions

1. **Expected frequency:** Should activity types define an "expected sessions per period" (e.g., 4/month for LSE)? This would enable attendance % vs. expected. Could be a meta field on `ActivityType`.

2. **Multi-activity-type reports:** The reference spreadsheet has both "LSE Sessions" and "Job Readiness" side by side. Support multiple activity types in one view, or keep it one-at-a-time with tabs?

3. **Facilitator view:** Should the report also show which facilitator(s) conducted each session? This would require a different axis (sessions as columns instead of periods).

4. **Beneficiary detail drilldown:** Click on a cell to see which specific sessions the entity attended in that period?

5. **Summary/aggregate reports:** Beyond the entity-level matrix, should there be an aggregate view showing attendance rates by programme, by centre, or by activity type — without individual entity rows?
