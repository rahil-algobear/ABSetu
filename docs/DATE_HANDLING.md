# Date & DateTime Handling

Reference guide for how dates and datetimes should be handled across the backend and frontend.

## Core Principles

1. **Store UTC** — All datetimes in the database are stored as UTC (`DateTime(timezone=True)`)
2. **Send ISO 8601** — All API responses use ISO 8601 strings (never Unix timestamps)
3. **Display in browser timezone** — Frontend converts UTC to the user's local timezone for display
4. **Date-only fields are timezone-agnostic** — Fields like `admission_date` use `YYYY-MM-DD` with no time component

## API Response Format

### Standardized to ISO 8601

All date/datetime fields in API responses must be ISO 8601 strings. No Unix timestamps.

| Field Type | Format | Example |
|---|---|---|
| `DateTime` columns (`created_at`, `updated_at`, `start_date`, etc.) | ISO 8601 with UTC offset | `"2026-03-22T14:30:00+00:00"` |
| `Date` columns (`admission_date`, `release_date`, etc.) | `YYYY-MM-DD` | `"2026-03-22"` |

**Before (inconsistent):**
```json
{
  "updated_at": 1711108200.0,
  "start_date": "2026-03-22T14:30:00+00:00",
  "admission_date": "2026-03-22"
}
```

**After (standardized):**
```json
{
  "updated_at": "2026-03-22T09:00:00+00:00",
  "created_at": "2026-03-20T12:00:00+00:00",
  "start_date": "2026-03-22T14:30:00+00:00",
  "admission_date": "2026-03-22"
}
```

### `created_at` Included by Default

`BaseResponseSchema` should include `created_at` in all responses. It is useful metadata and costs nothing to include.

## API Request Format

No change from current behavior:

| Field Type | Format | Example |
|---|---|---|
| DateTime fields | ISO 8601 string | `"2026-03-22T14:30:00"` or `"2026-03-22T14:30:00+05:30"` |
| Date-only fields | `YYYY-MM-DD` | `"2026-03-22"` |

If the frontend sends a datetime without an offset, the backend should treat it as UTC.

## Frontend Display

### Timezone Strategy

- Use `Intl.DateTimeFormat().resolvedOptions().timeZone` to get the browser's timezone
- All UTC datetimes from the API are converted to the browser's local timezone before display
- Use `date-fns-tz` for timezone conversion (compatible with existing date-fns v4)
- **Future**: Allow users to explicitly select a timezone in their profile, overriding the browser default

### Display Formats

| Context | Format | Example |
|---|---|---|
| Date-only fields | `dd-MMM-yyyy` | `22-Mar-2026` |
| DateTime fields | `dd-MMM-yyyy 'at' h:mm a` | `22-Mar-2026 at 2:30 PM` |
| Timestamps (`created_at`, `updated_at`) | `dd-MMM-yyyy` or with time if relevant | `22-Mar-2026` |

### Date vs DateTime — Explicit Typing

The distinction between "date-only" and "datetime" values should be explicit, not inferred from midnight detection.

**Current (fragile):** `formatDateTime()` uses regex to check if time is `T00:00:00` and hides the time component.

**Target:** The caller knows whether the field is a date or datetime and calls the appropriate formatter:
- `formatDate(value)` — for `Date` fields, expects `YYYY-MM-DD`, displays `dd-MMM-yyyy`
- `formatDateTime(value)` — for `DateTime` fields, expects ISO 8601, converts to browser timezone and displays `dd-MMM-yyyy 'at' h:mm a`

No midnight sniffing needed.

### "Today" Helper

Replace `new Date().toISOString().split("T")[0]` with a timezone-aware helper:

```typescript
import { format } from "date-fns-tz";

function getToday(timezone: string): string {
  return format(new Date(), "yyyy-MM-dd", { timeZone: timezone });
}
```

This prevents the bug where UTC-based `.toISOString()` returns tomorrow's or yesterday's date near midnight in the user's local timezone.

## Date Filtering

### Request Format

Date range filters sent to the API:

```json
{
  "start_date": {
    "start": "2026-03-20",
    "end": "2026-03-31"
  }
}
```

- For `date_range` filters: values are `YYYY-MM-DD` strings, parsed with `_parse_date()`
- For `datetime_range` filters: values should support full ISO 8601, parsed with a `_parse_datetime()` helper

### Backend Filter Parsing

- `_parse_date()` — Existing. Parses `YYYY-MM-DD` into `date` objects.
- `_parse_datetime()` — New. Parses ISO 8601 strings into timezone-aware `datetime` objects. Falls back to `_parse_date()` behavior for date-only strings.
- For `datetime_range` on `DateTime` columns: use proper datetime comparisons instead of the `+ timedelta(days=1)` workaround.

## Meta Field Dates

Meta fields stored in JSONB columns:

| Meta field type | Stored format | Notes |
|---|---|---|
| `date` | `YYYY-MM-DD` | Timezone-agnostic, lexicographic sort works |
| `datetime` | ISO 8601 UTC (`2026-03-22T14:30:00+00:00`) | Must normalize to UTC on write for correct sorting |

Frontend displays meta dates using the same `formatDate()` / `formatDateTime()` helpers.

## Implementation Checklist

### Backend

- [ ] **`BaseResponseSchema`**: Remove Unix timestamp conversion from `_coerce_uuids_and_timestamps`. Let `datetime` objects serialize as ISO 8601 strings.
- [ ] **`BaseResponseSchema`**: Include `created_at` in default response fields.
- [ ] **Activity schemas**: Remove the custom `_dates_to_iso` validator (no longer needed once base uses ISO).
- [ ] **Pydantic model config**: Add `json_encoders` or use Pydantic v2's serialization to ensure `datetime` → ISO 8601 string and `date` → `YYYY-MM-DD`.
- [ ] **`list_query.py`**: Add `_parse_datetime()` helper for `datetime_range` filters.
- [ ] **Meta field validation**: Ensure `datetime` meta values are normalized to UTC on write.

### Frontend

- [ ] **Install `date-fns-tz`**.
- [ ] **`src/utils/date.ts`**: Refactor `formatDate()` — remove Unix timestamp detection, expect ISO strings only.
- [ ] **`src/utils/date.ts`**: Refactor `formatDateTime()` — remove midnight regex hack, convert UTC to browser timezone using `date-fns-tz`.
- [ ] **`src/utils/date.ts`**: Add `getToday()` timezone-aware helper.
- [ ] **`src/utils/date.ts`**: Add `getBrowserTimezone()` helper wrapping `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- [ ] **`src/types/index.ts`**: Change `updated_at: number | null` to `updated_at: string | null` across all entity types. Same for `created_at`.
- [ ] **All components rendering dates**: Audit calls to `formatDate()` / `formatDateTime()` to use the correct one based on field type (date vs datetime).
- [ ] **Form defaults**: Replace `new Date().toISOString().split("T")[0]` with `getToday()`.
- [ ] **Filter modal**: Ensure `datetime_range` filters can send full ISO 8601 values.
