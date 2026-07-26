# Task alr-02: Sidebar badge + Load-more + Mark-all-read + event-kind copy + type sync (frontend)

> **Filename:** `task-alr-02-feed-polish-and-badge.md`
> **Links:** batch [`../plan-alerts-v1-batch.md`](../plan-alerts-v1-batch.md) · exec [`./EXECUTION-ORDER-alerts-v1.md`](./EXECUTION-ORDER-alerts-v1.md)

---

## 📋 Task Overview

Make the now-real Alerts surface genuinely usable: light the sidebar unread badge, add cursor "Load more" and a client-loop "Mark all as read", render correct copy for **all three** shipped event kinds, and sync the stale frontend event-kind types to the backend. **Frontend-only, no backend.**

**Program / Batch:** alerts-v1 · Wave 2
**Estimated Time:** ~2–3 hours
**Status:** ⬜ Not started. **Model: Sonnet.**
**Change Type:** ✅ Frontend polish + read-model type sync.
**Depends on:** `alr-01` (page mounts the feed; feed is theme-safe).

**Current State:**
- ✅ Badge plumbing: `useDashboardCounts` exposes `dashboardEventsUnread`; `Sidebar.tsx` `Alerts` item has **no `badgeKey`**.
- ✅ Pagination: `getDashboardEvents` returns `nextCursor`; `DoctorDashboardEventFeed` renders **page 1 only** (already stores `nextCursor` in state but no "Load more" button).
- ✅ Acknowledge: `acknowledgeDashboardEvent(token, eventId)` (per-event, 204). **No bulk endpoint** (ALR-D5 → client loop).
- ✅ Copy: `describeEvent()` handles only `patient_replayed_recording`; the other two kinds hit the generic "New activity on a recent consult."
- ⚠️ Type drift: `frontend/lib/api.ts` `DashboardEventKind = "patient_replayed_recording"` and `PatientReplayedRecordingPayload.artifact_type` omits `"video"`. Backend (`dashboard-events-service.ts`) ships **3 kinds** + `video`.

**Scope Guard:**
- **DO NOT** touch any backend file/route/controller/service/migration (ALR-D2).
- **DO NOT** add a bulk `acknowledge-all` endpoint — v1 loops client-side (ALR-D5).
- **DO NOT** change the bell polling logic (ALR-D4).
- **DO NOT** render new PHI (ALR-D7) — new copy uses only fields already in the payloads.
- Type sync is **read-model only** — no wire/endpoint change (ALR-D8).

---

## ✅ Task Breakdown

### 1. Sidebar badge
- [ ] 1.1 Add `badgeKey: "dashboardEventsUnread"` to the `Alerts` nav item in `frontend/components/layout/Sidebar.tsx` (the count already flows through `counts`).
- [ ] 1.2 Verify badge renders in both expanded (numeric pill) and collapsed (dot) states, and the tooltip includes the count — same as the OPD / Booking-review badges.

### 2. Sync frontend event-kind types (ALR-D8)
- [ ] 2.1 In `frontend/lib/api.ts`, widen `DashboardEventKind` to the 3 backend values (`patient_replayed_recording` | `patient_revoked_video_mid_session` | `patient_replayed_video`) and add `"video"` to `artifact_type`.
- [ ] 2.2 Add the `patient_revoked_video_mid_session` payload shape (mirror `PatientRevokedVideoMidSessionPayload` in `dashboard-events-service.ts`: `video_escalation_audit_id`, `revoked_at`, `patient_display_name`, `consult_started_at`) and make `DashboardEvent.payload` a discriminated union on `eventKind`.
- [ ] 2.3 Fix any resulting type errors at the feed call sites (the union narrows `describeEvent`).

### 3. Event-kind copy fidelity
- [ ] 3.1 Extend `describeEvent()` in `DoctorDashboardEventFeed.tsx` to handle all three kinds with non-alarming copy (Decision-4 tone from migration 066):
  - `patient_replayed_recording` — audio/transcript (existing) + `action_kind` (`reviewed`/`downloaded`) if present.
  - `patient_replayed_video` — "…replayed the **video** of your consult on <date>." (🎥 affordance optional).
  - `patient_revoked_video_mid_session` — "…turned off video recording during your consult on <date>." (uses `consult_started_at`, falls back to "Your patient").
- [ ] 3.2 Keep the `default` fallback for forward-compat (future kinds), but no shipped kind should hit it.

### 4. Load more (cursor)
- [ ] 4.1 When `state.nextCursor` is set, render a "Load more" button; on click, `getDashboardEvents(token, { unreadOnly, limit, cursor })`, append results, update `nextCursor`. Respect the current `unreadOnly` toggle.
- [ ] 4.2 Loading + error states for the paginated fetch (don't wipe the already-shown page on a failed "Load more").

### 5. Mark all as read (client loop — ALR-D5)
- [ ] 5.1 Add a "Mark all as read" action in the feed header, visible only when ≥1 unread row is shown.
- [ ] 5.2 On click, loop `acknowledgeDashboardEvent` over the currently-loaded unread events (optimistic per-row, same rollback pattern as the existing single-ack). Disable the button while in flight; surface a partial-failure message if any fail.
- [ ] 5.3 After success, the sidebar badge + bell should converge on next poll (no manual cache poke required for v1).

### 6. Tests
- [ ] 6.1 If the harness covers this dir: copy pinning for all 3 kinds; "Load more" appends + advances cursor; "Mark all read" fires N acknowledges + clears unread; badge shows when `dashboardEventsUnread > 0`. *(Else capture in `alr-03`.)*

### 7. Verification
- [ ] 7.1 `cd frontend && npx tsc --noEmit` — clean for touched files (incl. the widened `lib/api.ts` union).
- [ ] 7.2 `cd frontend && npm run lint` — clean for touched files.
- [ ] 7.3 Manual: badge shows unread count; "Load more" pages; "Mark all read" clears; all 3 kinds render correct copy; light + dark.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/layout/Sidebar.tsx                       (Alerts badgeKey)
UPDATE: frontend/lib/api.ts                                          (widen event-kind union + payloads — read-model only)
UPDATE: frontend/components/dashboard/DoctorDashboardEventFeed.tsx    (copy for 3 kinds + Load more + Mark all read)
READ:   backend/src/services/dashboard-events-service.ts             (event-kind + payload source of truth — do not edit)
READ:   frontend/hooks/useDashboardCounts.ts                         (dashboardEventsUnread)
DO NOT TOUCH: any backend file/route/controller/service/migration; the bell polling logic
```

---

## 🧠 Design Constraints

- **Frontend-only** (ALR-D2); **client-loop bulk read** (ALR-D5); **bell untouched** (ALR-D4).
- **Non-alarming copy** — mirror the existing Decision-4 tone; informational, not urgent.
- **No new PHI** (ALR-D7) — new copy reads only fields already present in each payload.
- **Type sync is read-model only** (ALR-D8) — align to the backend; do not change the endpoint.

---

## ✅ Acceptance Criteria

- [ ] Sidebar `Alerts` shows the unread badge (expanded pill + collapsed dot + tooltip count).
- [ ] All 3 shipped event kinds render correct, non-alarming copy (none hit the generic fallback).
- [ ] "Load more" pages via `nextCursor`; "Mark all as read" clears unread via client loop.
- [ ] Frontend event-kind types match the backend's 3 kinds; `tsc` clean.
- [ ] No backend / migration touched; no new PHI; bell polling untouched.
- [ ] Frontend verification gate green for the slice.

---

**Created:** 2026-07-21.
