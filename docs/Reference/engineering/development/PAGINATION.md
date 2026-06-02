# Pagination Guide

**Purpose:** Our pagination **conventions** for list endpoints — the param names, defaults, and response shapes a model can't guess. General offset-vs-cursor theory is assumed.

**Related:** [API_DESIGN.md](../architecture/API_DESIGN.md) | [CONTRACTS.md](../architecture/CONTRACTS.md) | [PERFORMANCE.md](./PERFORMANCE.md)

---

## Defaults (MUST)

- **Default limit:** 20 · **Max limit:** 100 · **Default page:** 1
- Always clamp: `Math.min(parseInt(limit) || 20, 100)`.

## Which strategy

- **Offset** (`?page=&limit=`) — default; small datasets (<10K), admin lists, where a total count / page numbers are useful (doctor appointment list, patient search).
- **Cursor** (`?cursor=&limit=`, opaque base64) — large/real-time datasets (audit logs, IG message feed); no total count. Fetch `limit + 1` to compute `hasMore`.

## Response shapes

**Offset:**
```json
{ "success": true, "data": { "items": [...], "pagination": {
  "page": 2, "limit": 20, "total": 100, "totalPages": 5, "hasNext": true, "hasPrev": true
} }, "meta": { "timestamp": "...", "requestId": "..." } }
```

**Cursor:**
```json
{ "success": true, "data": { "items": [...], "pagination": {
  "nextCursor": "<base64>", "hasMore": true, "limit": 20
} }, "meta": { "timestamp": "...", "requestId": "..." } }
```

Edge cases to handle: beyond-last-page → empty `items` (still include pagination); invalid/oversized `limit` → clamp to default/max; empty dataset → empty `items` with metadata.

---

**Last updated:** 2026-05-31
