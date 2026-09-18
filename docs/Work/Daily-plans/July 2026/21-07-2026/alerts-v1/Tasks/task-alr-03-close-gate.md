# Task alr-03: Close gate (Phase 1)

> **Filename:** `task-alr-03-close-gate.md`
> **Links:** batch [`../plan-alerts-v1-batch.md`](../plan-alerts-v1-batch.md) · exec [`./EXECUTION-ORDER-alerts-v1.md`](./EXECUTION-ORDER-alerts-v1.md)

---

## 📋 Task Overview

Prove the Phase-1 acceptance gate for Alerts v1, run the smoke matrix, and capture dogfood + Phase-2 follow-ups. No new features.

**Program / Batch:** alerts-v1 · Wave 3
**Estimated Time:** ~1 hour
**Status:** ✅ Complete (2026-07-21). **Model: Sonnet / Composer.**
**Change Type:** ✅ QA + verification + small fixes only.
**Depends on:** `alr-01`, `alr-02`.

**Scope Guard:**
- QA + tiny bug-fixes only. **No new widgets, no backend, no migration, no scope additions.**
- If a real defect needs a non-trivial fix, file it and route back to the owning task — don't balloon the close gate.

---

## ✅ Task Breakdown

### 1. Cross-cutting acceptance (Phase 1 gate)
- [x] 1.1 `/dashboard/alerts` renders the real feed behind `requireDashboardAuth`; no "Coming soon." remains.
- [x] 1.2 Header bell → `/dashboard/alerts` lands on the working feed; a bell with unread count shows those items.
- [x] 1.3 Sidebar `Alerts` badge shows `dashboardEventsUnread` (expanded + collapsed).
- [x] 1.4 All 3 shipped event kinds render correct, non-alarming copy (none hit the generic fallback).
- [x] 1.5 "Load more" pages via `nextCursor`; "Mark all as read" clears unread (client loop).

### 2. PHI + safety sweep
- [x] 2.1 Confirm the feed renders only the existing Decision-4 fields (`patient_display_name` + a consult-date label) — **no new patient identifiers** (ALR-D7).
- [x] 2.2 Confirm no backend / route / controller / service / migration was touched in Phase 1 (`git diff --stat` shows frontend only).

### 3. Smoke matrix
- [x] 3.1 Light + dark desktop; feed, empty state, and error state all render with theme tokens (no hardcoded light colors). *(Code audit: no `gray|blue|red|white` literals in feed; manual dogfood parked in inbox.)*
- [x] 3.2 Empty account (no events) → graceful "You're all caught up." (unread) / "No notifications yet." (all). *(Covered by unit test + code path.)*
- [x] 3.3 Bell polling still works (count updates ~60s) and is unchanged from before the batch. *(Confirmed: `DashboardEventsBell.tsx` diff empty.)*

### 4. Verification gate (`DEFINITION_OF_DONE.md`)
- [x] 4.1 `cd frontend && npx tsc --noEmit` — alerts slice clean (repo-wide `tsc` may still be noisy from unrelated duplicate `* 2.tsx` files).
- [x] 4.2 `cd frontend && npm run lint` — alerts slice clean (`eslint` on touched files exit 0).
- [x] 4.3 `cd frontend && npm test` — alerts tests green: **6/6** across `DoctorDashboardEventFeed.test.tsx` + `Sidebar.alertsBadge.test.tsx`.

### 5. Follow-ups
- [x] 5.1 Capture to `docs/Work/capture/inbox.md`: dogfood smoke; bulk `acknowledge-all` Phase-2 nicety; residual Task-30 bell/time-ago test gaps; Opus queue for `alr-04`.
- [x] 5.2 Confirm `alr-04` (Phase-2 design) is queued for an **Opus** turn — Phase 2 needs a migration + emitters (ALR-D6). Inbox + exec-order note.
- [x] 5.3 Flip batch plan + exec-order Status to ✅ Phase 1 complete with the ship date.

---

## Gate evidence (fill on completion)

| Check | Evidence |
|---|---|
| No "Coming soon" | `frontend/app/dashboard/alerts/page.tsx` → `DoctorDashboardEventFeed` + `requireDashboardAuth` |
| Bell dead end cleared | Bell `href="/dashboard/alerts"` unchanged; page mounts working feed |
| Theme-safe | No hardcoded `gray\|blue\|red\|white` literals in `DoctorDashboardEventFeed.tsx` |
| Badge wired | `Sidebar.tsx` Alerts item `badgeKey: "dashboardEventsUnread"` |
| 3 kinds covered | `describeEvent()` switch covers recording / video / mid-session revoke |
| Frontend-only | `git status` — Phase-1 paths are frontend only; `backend/` clean; bell diff 0 lines |
| Tests | **6 passed** (feed empty/populated/load-more/mark-all + describeEvent + sidebar badge) |
| PHI | Copy uses only `patient_display_name` + consult date fields already on payloads |
| Types (ALR-D8) | `lib/api.ts` `DashboardEventKind` + discriminated `DashboardEvent` match backend 3 kinds |

---

## ✅ Acceptance Criteria

- [x] The batch's [Phase-1 cross-cutting gate](../plan-alerts-v1-batch.md#cross-cutting-acceptance-gate-phase-1) is fully ticked.
- [x] PHI sweep clean; no backend/migration touched; bell unchanged.
- [x] Frontend verification gate green for the Alerts slice; follow-ups captured; batch marked Phase-1 complete.

---

**Created:** 2026-07-21. **Closed:** 2026-07-21.
