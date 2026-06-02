# Filtering & Sorting Guide

**Purpose:** Our query-param **conventions** for list/search endpoints. General SQL/query theory is assumed.

**Related:** [PAGINATION.md](./PAGINATION.md) | [API_DESIGN.md](../architecture/API_DESIGN.md) | [PERFORMANCE.md](./PERFORMANCE.md)

---

## Filtering

Format: `field=value` (exact) or `field[operator]=value`.

| Operator | Param | SQL |
|---|---|---|
| Equals | `status=confirmed` | `=` |
| Greater / ≥ | `amount[gt]=`, `appointmentDate[gte]=` | `>`, `>=` |
| Less / ≤ | `amount[lt]=`, `appointmentDate[lte]=` | `<`, `<=` |
| Not equal | `status[ne]=cancelled` | `!=` |
| In | `status[in]=confirmed,pending` | `IN (...)` |
| Contains (text) | `patientName[contains]=John` | `ILIKE '%text%'` |

- **MUST** validate filter values with Zod (e.g. `status` as an enum, dates as `z.string().datetime()`).

## Sorting

- Format: `sort=field` (asc) or `sort=-field` (desc); comma-separate for multiple (`sort=-createdAt,status`). Default sort: `created_at` desc.
- **MUST** whitelist allowed sort fields (e.g. `['createdAt','appointmentDate','status','amount']`) and throw `ValidationError` on anything else — never sort on arbitrary/sensitive columns.

## Combined response

When filtering/sorting alongside pagination, echo them in `data`:
```json
{ "data": { "items": [...], "pagination": { ... },
  "filters": { "status": "confirmed", "appointmentDate[gte]": "2026-02-01" },
  "sort": "-appointmentDate" } }
```

## Performance limits

- Add DB indexes for filtered/sorted columns (see [DB_SCHEMA.md](../architecture/DB_SCHEMA.md), [PERFORMANCE.md](./PERFORMANCE.md)).
- Cap query complexity: **max 5 filters, max 2 sort fields** per request; reject beyond that.

---

**Last updated:** 2026-05-31
