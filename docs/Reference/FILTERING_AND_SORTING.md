# Filtering & Sorting Guide

**Purpose:** Query parameter patterns for filtering and sorting list endpoints.

**Audience:** AI agents and developers implementing list/search endpoints.

**Related:** [PAGINATION.md](./PAGINATION.md) | [API_DESIGN.md](./API_DESIGN.md) | [PERFORMANCE.md](./PERFORMANCE.md)

---

## 🔍 Filtering Patterns

### Query Parameter Format

**Use:** `field=value` for exact match; `field[operator]=value` for other operators

**Example:**
```
GET /api/v1/appointments?status=confirmed
GET /api/v1/appointments?appointmentDate[gte]=2026-02-01
GET /api/v1/appointments?appointmentDate[lte]=2026-02-28&status=confirmed
```

### Supported Operators

| Operator | Query Param | SQL Equivalent | Example |
|----------|-------------|----------------|---------|
| **Equals** | `field=value` | `field = value` | `status=confirmed` |
| **Greater than** | `field[gt]=value` | `field > value` | `amount[gt]=5000` |
| **Greater or equal** | `field[gte]=value` | `field >= value` | `appointmentDate[gte]=2026-02-01` |
| **Less than** | `field[lt]=value` | `field < value` | `amount[lt]=10000` |
| **Less or equal** | `field[lte]=value` | `field <= value` | `appointmentDate[lte]=2026-02-28` |
| **Not equal** | `field[ne]=value` | `field != value` | `status[ne]=cancelled` |
| **In** | `field[in]=val1,val2` | `field IN (val1, val2)` | `status[in]=confirmed,pending` |
| **Contains** (text) | `field[contains]=text` | `field ILIKE '%text%'` | `patientName[contains]=John` |

### Implementation Example

```typescript
// Parse filter query params
const filters: Record<string, unknown> = {};
let query = supabase.from('appointments').select('*');

// Exact match
if (req.query.status) {
  query = query.eq('status', req.query.status as string);
}

// Date range
if (req.query['appointmentDate[gte]']) {
  query = query.gte('appointment_date', req.query['appointmentDate[gte]'] as string);
}
if (req.query['appointmentDate[lte]']) {
  query = query.lte('appointment_date', req.query['appointmentDate[lte]'] as string);
}

// In (multiple values)
if (req.query['status[in]']) {
  const statuses = (req.query['status[in]'] as string).split(',');
  query = query.in('status', statuses);
}

// Text search (case-insensitive)
if (req.query['patientName[contains]']) {
  query = query.ilike('patient_name', `%${req.query['patientName[contains]']}%`);
}

const { data } = await query;
```

### Validation

**MUST:** Validate filter values (use Zod)

```typescript
const filterSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']).optional(),
  'appointmentDate[gte]': z.string().datetime().optional(),
  'appointmentDate[lte]': z.string().datetime().optional(),
  'amount[gt]': z.string().transform(Number).optional(),
});

const filters = filterSchema.parse(req.query);
```

---

## 📊 Sorting Patterns

### Query Parameter Format

**Use:** `sort=field` (ascending) or `sort=-field` (descending)

**Example:**
```
GET /api/v1/appointments?sort=appointmentDate        # Ascending
GET /api/v1/appointments?sort=-appointmentDate       # Descending
GET /api/v1/appointments?sort=-createdAt,status      # Multiple fields
```

### Implementation

```typescript
const sortParam = req.query.sort as string;
let query = supabase.from('appointments').select('*');

if (sortParam) {
  const sortFields = sortParam.split(',');
  for (const field of sortFields) {
    const isDescending = field.startsWith('-');
    const fieldName = isDescending ? field.slice(1) : field;
    query = query.order(fieldName, { ascending: !isDescending });
  }
} else {
  // Default sort
  query = query.order('created_at', { ascending: false });
}

const { data } = await query;
```

### Allowed Sort Fields

**MUST:** Whitelist allowed sort fields (prevent sorting on non-indexed or sensitive fields)

```typescript
const ALLOWED_SORT_FIELDS = ['createdAt', 'appointmentDate', 'status', 'amount'];

function validateSortField(field: string): string {
  const fieldName = field.startsWith('-') ? field.slice(1) : field;
  if (!ALLOWED_SORT_FIELDS.includes(fieldName)) {
    throw new ValidationError(`Invalid sort field: ${fieldName}`);
  }
  return field;
}
```

---

## 🔍 Combined Filtering, Sorting, and Pagination

**Example request:**
```
GET /api/v1/appointments?status=confirmed&appointmentDate[gte]=2026-02-01&sort=-appointmentDate&page=1&limit=20
```

**Example response:**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3,
      "hasNext": true
    },
    "filters": {
      "status": "confirmed",
      "appointmentDate[gte]": "2026-02-01"
    },
    "sort": "-appointmentDate"
  },
  "meta": { ... }
}
```

**Implementation:**
```typescript
// 1. Parse and validate filters
const filters = filterSchema.parse(req.query);

// 2. Parse and validate sort
const sortParam = validateSortField(req.query.sort as string);

// 3. Parse pagination
const page = parseInt(req.query.page as string) || 1;
const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

// 4. Build query
let query = supabase.from('appointments').select('*', { count: 'exact' });

// Apply filters
if (filters.status) query = query.eq('status', filters.status);
if (filters['appointmentDate[gte]']) query = query.gte('appointment_date', filters['appointmentDate[gte]']);

// Apply sort
if (sortParam) {
  const isDesc = sortParam.startsWith('-');
  const field = isDesc ? sortParam.slice(1) : sortParam;
  query = query.order(field, { ascending: !isDesc });
}

// Apply pagination
const offset = (page - 1) * limit;
query = query.range(offset, offset + limit - 1);

// Execute
const { data: items, count } = await query;

// Return
return {
  items,
  pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit), hasNext: page < Math.ceil((count || 0) / limit) },
  filters,
  sort: sortParam,
};
```

---

## ⚡ Performance Considerations

### Indexes

**MUST:** Add database indexes for filtered and sorted fields

```sql
-- Index for common queries
CREATE INDEX idx_appointments_doctor_date ON appointments(doctor_id, appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_created_at ON appointments(created_at);
```

**See:** [PERFORMANCE.md](./PERFORMANCE.md) and [DB_SCHEMA.md](./DB_SCHEMA.md)

### Limit Query Complexity

**SHOULD:** Limit number of filters and sort fields per request

- Max 5 filters per query
- Max 2 sort fields per query
- Reject overly complex queries (prevents abuse and slow queries)

---

## 🧪 Testing Filtering & Sorting

### Test Cases

- [ ] **Single filter:** `status=confirmed` → returns only confirmed appointments
- [ ] **Multiple filters:** `status=confirmed&appointmentDate[gte]=2026-02-01` → returns only confirmed appointments after Feb 1
- [ ] **Sort ascending:** `sort=appointmentDate` → returns appointments ordered by date (earliest first)
- [ ] **Sort descending:** `sort=-appointmentDate` → returns appointments ordered by date (latest first)
- [ ] **Combined:** Filter + sort + pagination → correct items in correct order
- [ ] **Invalid filter field:** Returns ValidationError (400)
- [ ] **Invalid sort field:** Returns ValidationError (400)

---

## 🔗 Related Documentation

- [PAGINATION.md](./PAGINATION.md) — Pagination patterns
- [API_DESIGN.md](./API_DESIGN.md) — API contracts
- [PERFORMANCE.md](./PERFORMANCE.md) — Query optimization
- [TESTING.md](./TESTING.md) — Testing patterns

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**Status:** Active
