# Pagination Guide

**Purpose:** Pagination patterns for list endpoints to ensure efficient data retrieval and good UX.

**Audience:** AI agents and developers implementing list endpoints.

**Related:** [API_DESIGN.md](./API_DESIGN.md) | [PERFORMANCE.md](./PERFORMANCE.md) | [STANDARDS.md](./STANDARDS.md)

---

## 📄 Pagination Strategies

### Offset-Based Pagination (Simple)

**Use for:** Small datasets (<10K records); admin dashboards; where total count is useful

**Query params:**
- `page` (default: 1) — Page number
- `limit` (default: 20) — Items per page

**Example request:**
```
GET /api/v1/appointments?page=2&limit=20
```

**Example response:**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 2,
      "limit": 20,
      "total": 100,
      "totalPages": 5,
      "hasNext": true,
      "hasPrev": true
    }
  },
  "meta": { ... }
}
```

**Implementation:**
```typescript
const page = parseInt(req.query.page as string) || 1;
const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // Max 100

const offset = (page - 1) * limit;

const { data: items, count } = await supabase
  .from('appointments')
  .select('*', { count: 'exact' })
  .range(offset, offset + limit - 1)
  .order('created_at', { ascending: false });

const totalPages = Math.ceil((count || 0) / limit);

return {
  items,
  pagination: {
    page,
    limit,
    total: count || 0,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  },
};
```

**Pros:**
- Simple to understand and implement
- Can jump to any page
- Shows total count

**Cons:**
- Slow for large datasets (offset scan is O(n))
- Inconsistent results if data changes (items shift between pages)

---

### Cursor-Based Pagination (Efficient)

**Use for:** Large datasets (>10K records); real-time data; where total count is not needed

**Query params:**
- `cursor` (optional) — Opaque cursor (base64-encoded ID or timestamp)
- `limit` (default: 20) — Items per page

**Example request:**
```
GET /api/v1/appointments?cursor=eyJpZCI6ImFwdC0xMjMifQ&limit=20
```

**Example response:**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "nextCursor": "eyJpZCI6ImFwdC0xNDMifQ",
      "hasMore": true,
      "limit": 20
    }
  },
  "meta": { ... }
}
```

**Implementation:**
```typescript
const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
const cursorParam = req.query.cursor as string;

let query = supabase
  .from('appointments')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(limit + 1); // Fetch one extra to check if hasMore

if (cursorParam) {
  // Decode cursor (base64-encoded { id: '...' } or { created_at: '...' })
  const cursor = JSON.parse(Buffer.from(cursorParam, 'base64').toString());
  query = query.lt('created_at', cursor.created_at);
}

const { data: items } = await query;

const hasMore = items.length > limit;
const resultItems = hasMore ? items.slice(0, limit) : items;

const nextCursor = hasMore
  ? Buffer.from(JSON.stringify({ id: resultItems[resultItems.length - 1].id, created_at: resultItems[resultItems.length - 1].created_at })).toString('base64')
  : null;

return {
  items: resultItems,
  pagination: {
    nextCursor,
    hasMore,
    limit,
  },
};
```

**Pros:**
- Fast for large datasets (uses index; no offset scan)
- Consistent results (no duplicates or skips when data changes)
- Scalable

**Cons:**
- Cannot jump to arbitrary page
- No total count (would require separate query)
- More complex to implement

---

## 🎯 Which Pagination to Use?

| Use Case | Recommended |
|----------|-------------|
| Doctor's appointment list (<1000 items) | **Offset** (simple; total count useful) |
| Audit log (millions of records) | **Cursor** (fast; total count not needed) |
| Patient search (unknown size) | **Offset** (page numbers expected by users) |
| Real-time feed (Instagram messages) | **Cursor** (fast; new items added constantly) |

**Default:** Use **offset** for simplicity unless dataset is very large (>10K) or real-time.

---

## 🔢 Pagination Defaults

**MUST:** Set reasonable defaults and maximums

- **Default limit:** 20 items per page
- **Max limit:** 100 items per page (prevent abuse; large responses slow)
- **Default page:** 1 (for offset pagination)

**Example:**
```typescript
const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
```

---

## 📋 Pagination Response Format

### Offset-Based

```json
{
  "success": true,
  "data": {
    "items": [ /* array of items */ ],
    "pagination": {
      "page": 2,
      "limit": 20,
      "total": 100,
      "totalPages": 5,
      "hasNext": true,
      "hasPrev": true
    }
  },
  "meta": {
    "timestamp": "2026-01-30T12:00:00.000Z",
    "requestId": "corr-123"
  }
}
```

### Cursor-Based

```json
{
  "success": true,
  "data": {
    "items": [ /* array of items */ ],
    "pagination": {
      "nextCursor": "eyJpZCI6IjEyMyIsImNyZWF0ZWRfYXQiOiIyMDI2LTAxLTMwVDEyOjAwOjAwLjAwMFoifQ",
      "hasMore": true,
      "limit": 20
    }
  },
  "meta": {
    "timestamp": "2026-01-30T12:00:00.000Z",
    "requestId": "corr-123"
  }
}
```

---

## 🧪 Testing Pagination

### Test Cases

- [ ] **First page:** `page=1` or no cursor → returns first N items
- [ ] **Middle page:** `page=2` → returns correct items
- [ ] **Last page:** `page=lastPage` → hasNext=false
- [ ] **Beyond last page:** `page=999` → returns empty array
- [ ] **Invalid limit:** `limit=-1` or `limit=999999` → uses default or max
- [ ] **Empty dataset:** No items → returns empty array with pagination metadata

### Example Test

```typescript
it('returns paginated appointments', async () => {
  const response = await request(app)
    .get('/api/v1/appointments?page=1&limit=10')
    .set('Authorization', 'Bearer valid-token')
    .expect(200);

  expect(response.body.data.items).toBeInstanceOf(Array);
  expect(response.body.data.items.length).toBeLessThanOrEqual(10);
  expect(response.body.data.pagination).toMatchObject({
    page: 1,
    limit: 10,
    total: expect.any(Number),
    hasNext: expect.any(Boolean),
  });
});
```

---

## 🔗 Related Documentation

- [API_DESIGN.md](./API_DESIGN.md) — API contracts and response formats
- [PERFORMANCE.md](./PERFORMANCE.md) — Query optimization
- [STANDARDS.md](./STANDARDS.md) — Response contracts

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**Status:** Active
