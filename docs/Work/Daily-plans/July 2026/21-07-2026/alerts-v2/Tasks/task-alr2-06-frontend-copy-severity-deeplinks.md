# Task alr2-06: Frontend — copy + severity styling/sort + deep-links + type sync (frontend)

> **Filename:** `task-alr2-06-frontend-copy-severity-deeplinks.md`
> **Links:** batch [`../plan-alerts-v2-batch.md`](../plan-alerts-v2-batch.md) · exec [`./EXECUTION-ORDER-alerts-v2.md`](./EXECUTION-ORDER-alerts-v2.md)

---

## 📋 Task Overview

Render the two new kinds in the Alerts feed: non-alarming copy, severity-aware styling + sort (action-needed above info), and deep-links to the owning surface. Sync the frontend read-model types to match the backend (mirrors v1 ALR-D8). **Frontend-only.**

**Program / Batch:** alerts-v2 · Wave 6
**Estimated Time:** ~2–3 hours
**Status:** ✅ Complete (2026-07-21). **Model: Sonnet.**
**Change Type:** ✅ Frontend read-model + UI.
**Depends on:** `alr2-02` (payload shapes), `alr2-03`/`04` (events actually emit).

**Current State:**
- ✅ Feed: `DoctorDashboardEventFeed.tsx` — copy for 5 kinds; severity sort/style; deep-links; Load more + Mark all read.
- ✅ Read-model: `frontend/lib/api.ts` — 5 kinds + `severity` on v2 payloads.
- ✅ Deep-link does **not** auto-acknowledge (ack stays explicit via Mark as read).

**Scope Guard:**
- **DO NOT** touch backend (kinds/payloads come from `alr2-02`).
- **DO NOT** add inline triage actions (ALR2-D9) — deep-link only.
- Keep the existing replay copy + behavior unchanged.

---

## ✅ Task Breakdown

### 1. Read-model type sync (ALR2-D6/D7)
- [x] 1.1 In `frontend/lib/api.ts`, extend `DashboardEventKind` + the `DashboardEvent` payload union with `booking_review_sla_breach` + `appointment_no_show` shapes (incl. `severity`). Read-model only — no endpoint change.

### 2. Copy (Decision-4 tone)
- [x] 2.1 Extend `describeEvent()`:
  - `booking_review_sla_breach` → "A booking request for {name} is past its review deadline."
  - `appointment_no_show` → "{name} didn't show for their appointment on {date}." (`{name}` falls back to "A patient").

### 3. Severity styling + sort (ALR2-D6)
- [x] 3.1 `action_needed` rows: `bg-destructive/5` + "Action needed" tag; sorted above `info` within unread. `info` keeps neutral `bg-primary/5` when unread.
- [x] 3.2 Theme-token based (light/dark safe).

### 4. Deep-links (ALR2-D9)
- [x] 4.1 `booking_review_sla_breach` → `/dashboard/booking-review`.
- [x] 4.2 `appointment_no_show` → `/dashboard/appointments/{appointment_id}`.
- [x] 4.3 Navigation only — does not auto-acknowledge.

### 5. Tests
- [x] 5.1 Copy pinned for both new kinds; action-needed sorts above info; deep-link href correct per kind. Feed tests **8/8**.

### 6. Verification
- [x] 6.1 ESLint clean for the slice; project `tsc` has pre-existing unrelated errors (duplicate `* 2.*` cockpit files).
- [x] 6.2 Feed tests green.
- [ ] 6.3 Manual: seed/emit both kinds; light + dark; action-needed on top; deep-links land. *(deferred to close gate / dogfood)*

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/api.ts                                          (2 kinds + severity — read-model only)
UPDATE: frontend/components/dashboard/DoctorDashboardEventFeed.tsx    (copy + severity style/sort + deep-links)
UPDATE: frontend/components/dashboard/__tests__/DoctorDashboardEventFeed.test.tsx
DO NOT TOUCH: backend; inline triage actions
```

---

## 🧠 Design Constraints

- **Notifier, not console** — deep-link only, no inline triage (ALR2-D9).
- **Severity first** — action-needed visually + ordinally above info.
- **Theme tokens** (light/dark); **no new PHI** beyond name + date.

---

## ✅ Acceptance Criteria

- [x] Both new kinds render correct, non-alarming copy; none hit the generic fallback.
- [x] Action-needed sorts/styles above info; rows deep-link to the owning surface.
- [x] Read-model types match the backend; feed tests green; theme tokens used.

---

**Created:** 2026-07-21. **Closed:** 2026-07-21.
