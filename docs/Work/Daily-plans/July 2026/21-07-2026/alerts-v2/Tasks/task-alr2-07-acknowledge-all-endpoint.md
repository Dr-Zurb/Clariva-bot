# Task alr2-07: (Optional) bulk `acknowledge-all` endpoint (backend + frontend)

> **Filename:** `task-alr2-07-acknowledge-all-endpoint.md`
> **Links:** batch [`../plan-alerts-v2-batch.md`](../plan-alerts-v2-batch.md) · exec [`./EXECUTION-ORDER-alerts-v2.md`](./EXECUTION-ORDER-alerts-v2.md)

---

## ❓ Optional — gate on dogfood (ALR2-D10)

Only build this if action-needed volume makes the Phase-1 **client-loop** "Mark all as read" (N POSTs) feel slow. If volume stays low, skip it — the client loop already works.

## 📋 Task Overview

Replace the client-side acknowledge loop with a single doctor-scoped bulk endpoint that marks all (or all currently-loaded) unread events read in one round-trip.

**Program / Batch:** alerts-v2 · Wave 6 (optional)
**Estimated Time:** ~1 hour
**Status:** ⏭️ Skipped at close gate (2026-07-21) — OPTIONAL / dogfood-gated (ALR2-D10). Client loop remains. Promote from inbox if N-round-trips feel slow.
**Change Type:** ✅ Add one read-scoped mutation endpoint + swap the client call.
**Depends on:** `alr2-06` (frontend feed) — or independent.

**Current State:**
- ✅ Per-event ack: `POST /api/v1/dashboard/events/:eventId/acknowledge` (204); service `markDashboardEventAcknowledged` (auth = `WHERE doctor_id = ?`).
- ✅ v1 "Mark all as read" loops this per row (ALR-D5) — still the live path after v2 close.
- ❌ No bulk endpoint (deferred).

**Scope Guard:**
- **DO NOT** add a migration. Auth stays `req.user.id`-scoped; the UPDATE filters `doctor_id = caller`.
- **DO NOT** acknowledge another doctor's rows — the `WHERE doctor_id = ?` filter is the auth check.
- Controllers orchestrate only (validate → service → respond).

---

## ✅ Task Breakdown

### 1. Service
- [ ] 1.1 `markAllDashboardEventsAcknowledged({ doctorId })`: `UPDATE doctor_dashboard_events SET acknowledged_at = now() WHERE doctor_id = ? AND acknowledged_at IS NULL`; return `{ acknowledged: <count> }`.

### 2. Controller + route
- [ ] 2.1 `acknowledgeAllDashboardEventsHandler` (mirror `acknowledgeDashboardEventHandler`): `asyncHandler`, `req.user.id` only, `successResponse` (or 204).
- [ ] 2.2 `POST /api/v1/dashboard/events/acknowledge-all` in `dashboard-events.ts` (auth required). Register order: keep `/:eventId/acknowledge` from shadowing (`acknowledge-all` is a distinct static path).

### 3. Frontend swap
- [ ] 3.1 Add `acknowledgeAllDashboardEvents(token)` to `frontend/lib/api.ts`.
- [ ] 3.2 In `DoctorDashboardEventFeed.tsx`, swap the "Mark all as read" client loop for the single call (keep optimistic clear + rollback on error).

### 4. Tests
- [ ] 4.1 Backend: marks only the caller's unread rows; another doctor's rows untouched; returns count; missing auth → 401.
- [ ] 4.2 Frontend: "Mark all as read" fires one call; unread clears; rollback on error.

### 5. Verification
- [ ] 5.1 Backend + frontend verification gates green for the slice.

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/services/dashboard-events-service.ts             (markAllDashboardEventsAcknowledged)
UPDATE: backend/src/controllers/dashboard-events-controller.ts       (bulk handler)
UPDATE: backend/src/routes/api/v1/dashboard-events.ts               (POST /acknowledge-all)
UPDATE: frontend/lib/api.ts                                          (acknowledgeAllDashboardEvents)
UPDATE: frontend/components/dashboard/DoctorDashboardEventFeed.tsx    (swap loop → single call)
UPDATE: backend/tests/… , frontend/…__tests__/…
DO NOT TOUCH: migration
```

---

## 🧠 Design Constraints

- **Doctor-scoped UPDATE** is the auth check — never trust a body/param doctor id.
- **Idempotent** — already-acked rows are excluded by `acknowledged_at IS NULL`.
- **Optional** — skip unless dogfood shows the client loop is too slow.

---

## ✅ Acceptance Criteria

- [ ] `POST /dashboard/events/acknowledge-all` marks only the caller's unread rows; returns a count; 401 without auth.
- [ ] Feed uses the single call; optimistic clear + rollback intact.
- [ ] No migration; cross-doctor isolation proven; gates green.

---

**Created:** 2026-07-21.
