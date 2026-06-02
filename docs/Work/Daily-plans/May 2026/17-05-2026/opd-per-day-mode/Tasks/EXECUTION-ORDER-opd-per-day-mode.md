# opd-per-day-mode — execution order

> Sibling document of [`plan-opd-per-day-mode-batch.md`](../plan-opd-per-day-mode-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

**Wave / lane / shape conventions:** [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md)

---

## Wave plan (6 waves)

```
Wave 1 (Data foundation — ~10h, single lane sequential):
  Lane α  ──── pdm-01 (M, Opus 4.7) ──> pdm-02 (M, Auto) ──> pdm-03 (M, Auto)

Wave 2 (Conversion service + preview UX — ~10h, single lane sequential):
  Lane α  ──── pdm-04 (M-L, Opus 4.7) ──> pdm-05 (S, Auto)

Wave 3 (Notification debounce + dispatch — ~7h, single lane sequential):
  Lane α  ──── pdm-06 (M, Auto)

Wave 4 (Mode-scheduling policy + booking widget — ~14h, single lane sequential):
  Lane α  ──── pdm-07 (M, Auto) ──> pdm-08 (M, Auto)

Wave 5 (Session-overrun handling — ~10h, single lane sequential):
  Lane α  ──── pdm-09 (M, Auto) ──> pdm-10 (M, Auto)

Wave 6 (In-page shortcut + polish — ~5h, single lane sequential):
  Lane α  ──── pdm-11 (S, Auto) ──> pdm-12 (XS, Composer 2)
```

**Total wall-clock with parallelism:** ~56h (~9–10 dev-days, no inter-wave parallelism — every wave's tasks touch overlapping files, so single-lane sequential is the safe shape).

**Total agent-time (sequential equivalent):** ~56h. Same as wall-clock because no parallel lanes are used; the bottleneck dictates the schedule.

The bottleneck is **Wave 4 (~14h)** — `pdm-07` (resolver + booking integration) and `pdm-08` (settings UI + TestDateWidget) are the biggest two tasks in the batch combined. Both consume the unified endpoint from Wave 1 and the conversion service from Wave 2, so they cannot start before Wave 2 ships.

**Why no Shape B (parallel) lanes anywhere?** Three reasons:

1. **File overlap.** Every wave with > 1 task either modifies `OpdTodayClient.tsx` twice (read-path swap → tray UI → pill dropdown), modifies `opd-mode-service.ts` twice (helpers → policy resolver), or rewrites the conversion service while the dialog consumes it. The §5 lane gate fails on file disjointness for all candidate splits.
2. **Schema-ordering risk.** pdm-01 ships a migration; pdm-04 ships a service that consumes the migration's tables. Any "Wave 2 starts before Wave 1's migration is reviewed" pattern risks the conversion service shipping with stale schema assumptions. Sequential gating is the responsible choice.
3. **The §11 authoring rule:** "Default every task into Lane α (sequential). Only then ask whether any subset can be lifted into Lane β." Nothing in this batch passes the lane test, so Shape A throughout.

A future polish batch (when `doctor_settings.opd_mode` is finally dropped per PD-D4 + the multi-session-per-day work per PD-D1 begins) may legitimately use Shape B because the resolver / policy / UI surfaces will then be on disjoint code paths.

---

## Lane-by-lane details

### Wave 1 — Data foundation (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [pdm-01](./task-pdm-01-session-modes-schema-migration.md) | M | **Opus 4.7** | `backend/migrations/028_opd_modes.sql`, `backend/migrations/030_opd_session_delay.sql`, `backend/migrations/031_appointments_opd_edge_cases.sql`, `backend/migrations/099_doctor_cockpit_layout_presets.sql`, `backend/src/services/appointment-service.ts` (lines 421–434 — the `opd_queue_entries` creation that drives the PD-Q6 backfill heuristic) | New migration `100_opd_session_modes.sql`. Two tables (fact + audit). RLS doctor-owned + service-role bypass. `updated_at` trigger. Backfill in the same migration file via `INSERT … SELECT`. **Opus per hard-rules list** (new migration + RLS). |
| 1 | [pdm-02](./task-pdm-02-unified-session-endpoint.md) | M | Auto | `backend/src/services/opd/opd-mode-service.ts`, `backend/src/services/opd-doctor-service.ts` (listDoctorQueueSession shape), `backend/src/services/opd-slot-session-service.ts` (listDoctorSlotSession shape, shipped 15-05), `backend/src/routes/api/v1/opd.ts`, `backend/src/controllers/opd-doctor-controller.ts`, `frontend/lib/api.ts`, `frontend/types/opd-doctor.ts` | Adds `resolveSessionDayMode(doctorId, date)` to `opd-mode-service.ts` (extends, doesn't replace `resolveOpdModeFromSettings`). New unified route. Frontend discriminated union types. Legacy `/opd/slot-session` + `/opd/queue-session` proxy to the unified handler for the deprecation window. |
| 2 | [pdm-03](./task-pdm-03-read-path-swap.md) | M | Auto | `frontend/components/opd/OpdTodayClient.tsx`, `backend/src/services/opd-snapshot-service.ts`, `backend/src/services/opd/opd-policy-service.ts` (`assertSlotJoinAllowedForPatient`), `frontend/hooks/useDoctorDayPipeline.ts` | The three read-sites swap to `resolveSessionDayMode(...)` per the appointment's date, not the doctor's `opd_mode`. **The visible bug fix.** Slot-hub UI is unchanged behaviourally; only the data source moves. |

**Branch suggestion:** `feature/opd-per-day-mode-foundation`. pdm-01 is a separately reviewable migration commit; pdm-02 and pdm-03 stack on it.

### Wave 2 — Conversion service + preview UX (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [pdm-04](./task-pdm-04-conversion-service.md) | M–L | **Opus 4.7** | `backend/src/services/appointment-service.ts` (lines 380–460 — `opd_queue_entries` creation), `backend/src/services/opd/opd-mode-service.ts` (post-pdm-02), `backend/migrations/100_opd_session_modes.sql` (post-pdm-01), `backend/src/services/opd-doctor-service.ts` (slot-grid computation for queue→slot), `backend/src/services/opd/opd-slot-status.ts` (slot status vocab), source plan §DL-4, §PD-Q5 | New `backend/src/services/opd/opd-mode-conversion-service.ts` (~300 LOC). Two pure-helper exports `applySlotToQueue` and `applyQueueToSlot` for unit tests. `pg_advisory_xact_lock` per `(doctor_id, session_date)`. 5 fixture days minimum for each direction. **Opus per hard-rules:** multi-file service surface (5+ files), audit-log path, payment-flow race interaction, concurrency-sensitive transaction. |
| 1 | [pdm-05](./task-pdm-05-conversion-preview-dialog.md) | S | Auto | `frontend/components/ui/dialog.tsx`, `frontend/components/opd/OpdTodayClient.tsx`, `frontend/lib/api.ts`, source plan §DL-12 (preview dialog) + §PD-Q4 (telemed advisory) | New `frontend/components/opd/SessionModeConversionDialog.tsx` (~180 LOC). Two phases: preview (calls `POST /opd/session/preview-convert` — a non-mutating endpoint added in pdm-04) and confirm (calls `POST /opd/session/convert`). Reused from both pdm-08 settings-flip path and pdm-11 OPD-tab pill dropdown. |

**Branch suggestion:** `feature/opd-per-day-mode-conversion` (stacks on Wave 1).

### Wave 3 — Notification debounce + dispatch (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [pdm-06](./task-pdm-06-notifications-debounce-dispatch.md) | M | Auto | `backend/src/services/notification-service.ts` (or wherever the existing patient SMS/IG primitive lives — task identifies it), `backend/src/workers/` (existing cron entry points), `backend/migrations/100_opd_session_modes.sql` (post-pdm-01), `backend/src/services/opd/opd-mode-conversion-service.ts` (post-pdm-04), source plan §DL-5, §DL-6, §PD-Q2 | New table `doctor_opd_pending_mode_notifications` via migration `101_opd_pending_mode_notifications.sql`. New worker / cron entry to drain every 60s with the `first_flip_at + 30 min` hard ceiling. Three DL-6 templates. Conversion service (pdm-04) writes to this table during the same transaction. |

**Branch suggestion:** `feature/opd-per-day-mode-notifications` (stacks on Wave 2).

### Wave 4 — Mode-scheduling policy + booking widget (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [pdm-07](./task-pdm-07-mode-policy-resolver-and-booking-integration.md) | M | Auto | `backend/src/services/opd/opd-mode-service.ts` (post-pdm-02), `backend/src/controllers/booking-controller.ts`, `backend/src/services/slot-selection-service.ts`, `backend/src/types/doctor-settings.ts`, `backend/src/utils/validation.ts`, source plan §DL-9, §DL-10, §DL-16, §PD-Q8 | Adds `resolveModePolicyForDate` + `resolveModePolicyForDateRange` to `opd-mode-service.ts`. JSONB validator for `mode_schedule`. Reroutes `booking-controller.ts` + `slot-selection-service.ts` through the resolver per target booking date. New public endpoint `GET /api/v1/public/doctors/:id/mode-schedule?from=&to=`. |
| 1 | [pdm-08](./task-pdm-08-mode-schedule-settings-ui.md) | M | Auto | `frontend/components/settings/doctor/opd/` (existing settings tree — task identifies the right folder), `frontend/components/ui/` (shadcn primitives), `@dnd-kit/*` (verify in `package.json`), `frontend/lib/api.ts`, source plan §DL-9 (overlap disambiguation = "later in array wins"), §PD-Q8 (past-start advisory), §PD-D3 (no calendar viz) | New `ModeScheduleEditor.tsx` (~350 LOC) with three sub-editors + `TestDateWidget` (~80 LOC). PUT through the existing `PUT /api/v1/settings/doctor` controller; only the `opd_policies.mode_schedule` sub-object is written. Drag-to-reorder via `dnd-kit`. |

**Branch suggestion:** `feature/opd-per-day-mode-policy` (stacks on Wave 2; independent of Waves 3 / 5).

### Wave 5 — Session-overrun handling (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [pdm-09](./task-pdm-09-overrun-flagging-and-fallback.md) | M | Auto | `backend/src/services/appointment-service.ts`, `backend/src/services/reschedule-service.ts` (if it exists; task verifies — otherwise the reschedule primitive lives in `appointment-service.ts`), `backend/src/workers/` (existing cron entries), source plan §DL-7, §DL-8, §PD-Q3 | Tiny migration `102_appointments_session_overrun.sql` adds `appointments.session_overrun_at TIMESTAMPTZ NULL` + two partial indexes — locked in pdm-09 step 0 (rationale: the 24h fallback predicate must be indexable). New cron worker `opd-overrun-cron.ts` runs every 5 min (flagging) + hourly (24h fallback). `bulkResolveSessionOverrun` service in a new `opd-overrun-service.ts` implementing all 5 DL-7 actions, reuses pdm-04's advisory-lock helper. New endpoints `POST /opd/session/overrun/bulk-resolve` + `GET /opd/session/overrun`. |
| 1 | [pdm-10](./task-pdm-10-overrun-tray-ui.md) | M | Auto | `frontend/components/opd/OpdTodayClient.tsx` (post-pdm-03), `frontend/lib/api.ts`, `frontend/components/ui/dialog.tsx`, source plan §DL-7, §DL-8 | New `frontend/components/opd/OpdOverrunTray.tsx` (~180 LOC) + `OpdOverrunBulkActionDialog.tsx` (~220 LOC). Mounts at the top of `OpdTodayClient.tsx` for the chosen date when overrun rows exist (snapshot payload from pdm-02 includes an `overrunCount` field — extend in this task if not done earlier). |

**Branch suggestion:** `feature/opd-per-day-mode-overrun` (stacks on Wave 2; independent of Waves 3 / 4).

### Wave 6 — In-page shortcut + polish (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [pdm-11](./task-pdm-11-opd-tab-mode-shortcut.md) | S | Auto | `frontend/components/opd/OpdModeBadge.tsx`, `frontend/components/opd/OpdSlotSessionToolbar.tsx`, `frontend/components/opd/OpdQueueSessionToolbar.tsx`, `frontend/components/opd/OpdTodayClient.tsx` (post-pdm-03 + pdm-10), `frontend/components/opd/SessionModeConversionDialog.tsx` (post-pdm-05), source plan §DL-12, §DL-14, §DL-15 | Replace `<OpdModeBadge>` usage in both toolbars with `<OpdModeDropdown>` (new component, wraps `<OpdModeBadge>` + a dropdown). DL-14 advisory inside the dropdown when `change_count >= 2` (the snapshot payload includes `modeChangeCount` — extend in pdm-02 if not already). Telemetry: `opd_session.mode_flipped` event. |
| 1 | [pdm-12](./task-pdm-12-polish-and-cleanup.md) | XS | Composer 2 Fast | `backend/src/routes/api/v1/opd.ts` (post-pdm-02), `docs/Reference/engineering/architecture/CONTRACTS.md`, `docs/Reference/engineering/operations/OPD_SUPPORT_RUNBOOK.md` | Deprecation headers on `/opd/slot-session` + `/opd/queue-session` (`Sunset` + `Deprecation` + `Link`). Docs updates. PD-Q4 final telemed copy review in `SessionModeConversionDialog.tsx`. |

**Branch suggestion:** `feature/opd-per-day-mode-shortcut-polish` (stacks on Waves 2 + 5; Wave 4 nice-to-have but not strictly required for the shortcut).

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| pdm-01 | M | **Opus 4.7 Extra High** | New migration with RLS + audit table + backfill — squarely on the hard-rules list per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` § "When to escalate to Opus"](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#when-to-escalate-to-opus-the-hard-rules) (rule #3: "new migration"). |
| pdm-02 | M | Auto | Pure plumbing: helper function + route + types. Well-spec'd by precedent (`opd-slot-session-service.ts` is the model). Bounded; no concurrency or PHI risk. |
| pdm-03 | M | Auto | Read-path swap across 3 files. Mechanical: replace one helper call with another. The risk is subtle (forgetting a callsite), so the task spec lists every grep pattern that must return zero / one matches. |
| pdm-04 | M–L | **Opus 4.7 Extra High** | Multi-file service surface (5+ files touched: appointment-service, conversion-service, opd-mode-service, route, controller). `pg_advisory_xact_lock` semantics. Audit-log path. Payment-flow race interaction. On the hard-rules list per rule #5 ("cross-cutting refactors") and rule #4 ("touches audit-logging path"). |
| pdm-05 | S | Auto | Dialog with two phases. Reused by two callsites. Bounded UI work; ~180 LOC. |
| pdm-06 | M | Auto | New table + worker + 3 copy templates. The hardest part — the debounce ceiling — is spelled out in the task spec; nothing for the agent to invent. |
| pdm-07 | M | Auto | Resolver + booking-controller swap. Per-target-date semantic; well-spec'd. |
| pdm-08 | M | Auto | Form-heavy settings UI with drag-to-reorder. Standard `dnd-kit` patterns. |
| pdm-09 | M | Auto | Cron worker + service + endpoint. Borrows reschedule primitive from `appointment-service.ts`; no novel concurrency. |
| pdm-10 | M | Auto | Tray UI + bulk-action dialog with per-row override. Standard React form patterns. |
| pdm-11 | S | Auto | Replace one pill with a dropdown in two toolbars + add advisory line + emit one telemetry event. Bounded. |
| pdm-12 | XS | **Composer 2 Fast** | Two `res.set('Sunset', ...)` lines + two markdown docs. Composer's sweet spot. |

**Opus caps:** ≤ 1 per wave (Wave 1: pdm-01; Wave 2: pdm-04) — at the cap. ≤ 2 per batch (pdm-01 + pdm-04) — at the cap. Cannot add a third Opus task without rescoping. The natural escalation candidates (pdm-06's 30-min ceiling, pdm-09's auto-reschedule fallback) all have non-novel implementations per their task specs; Auto with per-message escalation is the right call.

---

## Acceptance gates per wave

### Wave 1 gate (after pdm-03)

- [ ] `pnpm --filter backend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] Migration `100_opd_session_modes.sql` applies cleanly on a fresh database and on a database with existing OPD appointments (backfill verified).
- [ ] `rg "doctor_settings\.opd_mode" backend/src/services/opd-snapshot-service.ts backend/src/services/opd/opd-policy-service.ts frontend/components/opd/OpdTodayClient.tsx` returns **zero matches** — every read-path consumer has been swapped to `resolveSessionDayMode(...)`.
- [ ] `GET /api/v1/opd/session?date=2026-05-17` returns `{ mode: 'slot' | 'queue', entries: [...], counts: {...}, snapshotAt: ISO, date: '2026-05-17' }`. Auth gate active.
- [ ] **Visible bug fix smoke** — set a doctor's `doctor_settings.opd_mode = 'slot'`, then view a date that has only `opd_queue_entries` rows. The hub renders the queue list (not "no slots").
- [ ] Legacy `/opd/slot-session` + `/opd/queue-session` still return the old shapes (clients haven't been updated yet — they call the unified endpoint internally but expose the same payload).

### Wave 2 gate (after pdm-05)

- [ ] All Wave 1 gates still green.
- [ ] `POST /api/v1/opd/session/preview-convert` returns `{ affected, overflowed, telemedCount, notificationCount }` with no state change.
- [ ] `POST /api/v1/opd/session/convert` writes one row to `doctor_opd_session_modes` (upsert) + one row to `doctor_opd_session_mode_changes` + one row to `doctor_opd_pending_mode_notifications` (only if pdm-06 has merged; otherwise the notification row write is skipped via a feature flag in the task spec).
- [ ] **Conversion fixture tests** — 5 slot→queue fixtures pass; 5 queue→slot fixtures pass (one of which produces overflow rows).
- [ ] **Concurrency test** — two simultaneous `POST /convert` requests for the same `(doctor, date)` → one succeeds, the other gets `409 Conflict` with a `Retry-After` header.
- [ ] **Dialog smoke** — open the preview dialog manually (from a dev page that mounts it in isolation); preview phase shows non-zero counts on a fixture day; confirm phase triggers the convert endpoint.

### Wave 3 gate (after pdm-06)

- [ ] All Wave 2 gates still green.
- [ ] Migration `101_opd_pending_mode_notifications.sql` applies cleanly.
- [ ] **Debounce test** — fixture: flip slot→queue, then queue→slot 90s later → zero notifications dispatched after waiting 6 minutes.
- [ ] **One-flip test** — fixture: flip slot→queue, wait > 5 min → exactly N notifications dispatched (one per affected patient), with the right DL-6 template per patient (regular-grid vs overflow).
- [ ] **30-min ceiling test** — fixture: flip every 60s for 35 min → notification dispatches at minute 30 with the latest-state batch.
- [ ] Three DL-6 templates render correctly (snapshot test of each rendered SMS / IG message).

### Wave 4 gate (after pdm-08)

- [ ] All Wave 3 gates still green.
- [ ] `resolveModePolicyForDate` returns the expected mode for ≥ 6 unit-test cases (one per hierarchy level: fact, date_override, date_range_override, weekly_override, default_mode, fallback `'slot'`).
- [ ] `resolveModePolicyForDateRange(from, to)` returns a map covering every date in the inclusive range.
- [ ] JSONB validator rejects `to`-less `date_range_overrides`.
- [ ] **Booking-widget smoke** — public booking for a doctor with `weekly_overrides.tue = 'queue'` on a future Tuesday shows the queue token-request UI, not the slot grid.
- [ ] **Settings UI smoke** — `<ModeScheduleEditor>` renders, all three list editors work (default + weekly + range + date overrides), drag-to-reorder persists, PUT through `/api/v1/settings/doctor` writes only the `mode_schedule` sub-object.
- [ ] **TestDateWidget** — entering a date returns `→ {mode} (from {source})` matching the actual resolver path.
- [ ] **PD-Q8 advisory** — saving a `date_range_override` with `from < today` renders the inline warning.

### Wave 5 gate (after pdm-10)

- [ ] All Wave 4 gates still green.
- [ ] **Overrun flagging** — fixture: 3 `pending` appointments at `09:00 / 09:30 / 10:00` on a day with `session_end = 11:00`. At 11:31 simulated clock, all 3 flag as `session_overrun`.
- [ ] **Bulk-resolve** — calling `POST /opd/session/overrun/bulk-resolve` with `action: 'reschedule_all'` and `perRowOverrides: { aptId: 'cancel' }` reschedules 2 and cancels 1.
- [ ] **24h auto-reschedule** — fixture: flagged row sits for 24h without doctor action → fallback worker reschedules to next-available. Doctor's editable window persists for 7 days.
- [ ] **Tray UI smoke** — open `/dashboard/opd-today` on a fixture date with overrun rows; tray renders at top with row count. Bulk-action dialog opens; per-row override grid functions; PUT through works.

### Wave 6 gate (after pdm-12) — batch close-gate

- [ ] All Wave 5 gates still green.
- [ ] **OPD-tab shortcut** — doctor on `/dashboard/opd-today` opens the pill dropdown → "Switch to queue mode" → confirm dialog → conversion completes. ≤ 2 clicks per DL-12.
- [ ] **DL-14 advisory** — third flip of the same day shows the advisory line in the dropdown ("You've changed this day's mode 2 times already…"). Doctor can still flip.
- [ ] **DL-15 past-date pinning** — dropdown is disabled on a past date with the correct tooltip.
- [ ] **Telemetry** — `opd_session.mode_flipped` event fires with `{ from, to, affected_count, overflow_count, source }`.
- [ ] **Sunset headers** — `curl -i /opd/slot-session` returns `Sunset: <90-day-future-date>` + `Deprecation: true` + `Link: </opd/session>; rel="successor-version"`. Same for `/opd/queue-session`.
- [ ] **Docs synced** — `docs/Reference/engineering/architecture/CONTRACTS.md` lists the unified endpoint as the canonical source; `docs/Reference/engineering/operations/OPD_SUPPORT_RUNBOOK.md` documents conversion semantics + overrun handling + the audit-table support query.
- [ ] **Cross-cutting acceptance gate** (from [`plan-opd-per-day-mode-batch.md` § Cross-cutting acceptance gate](../plan-opd-per-day-mode-batch.md#cross-cutting-acceptance-gate-whole-batch)) all green.
- [ ] **Optional Opus close-gate review** — one fresh Opus 4.7 Extra High chat with the full Wave 1–6 diff grading against the cross-cutting gate. Skip if every deterministic check above passes cleanly.

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | pdm-01, pdm-02, pdm-03 | 2/3 | 0/3 | 1/3 | ~10h |
| Wave 2 | pdm-04, pdm-05 | 1/2 | 0/2 | 1/2 | ~10h |
| Wave 3 | pdm-06 | 1/1 | 0/1 | 0/1 | ~7h |
| Wave 4 | pdm-07, pdm-08 | 2/2 | 0/2 | 0/2 | ~14h |
| Wave 5 | pdm-09, pdm-10 | 2/2 | 0/2 | 0/2 | ~10h |
| Wave 6 | pdm-11, pdm-12 | 1/2 | 1/2 | 0/2 | ~5h |
| **Total** | **12** | **9** | **1** | **2** | **~56h** |

Token estimate (rough, per [`plan-opd-per-day-mode-batch.md` § Cost estimate](../plan-opd-per-day-mode-batch.md#cost-estimate)): ~750k input / ~580k output across the batch. Two Opus tasks draw from the API pool (~$15–25 per Opus chat at ~50k–100k tokens each); the other ten draw from the Auto+Composer pool ($1.25 in / $6.00 out per M for Auto, $0.50 in / $2.50 out per M for Composer).

**One optional Opus close-gate turn after pdm-12** budgeted on top of the 2 in-batch Opus tasks. Skip if the deterministic gates pass cleanly.

---

## References

- [plan-opd-per-day-mode-batch.md](../plan-opd-per-day-mode-batch.md) — the *what / why* sibling.
- [Product plans/plan-opd-per-day-mode.md](../../../../Product%20plans/plan-opd-per-day-mode.md) — source product plan with DL-1..DL-16, PD-Q1..Q8, PD-D1..D7, S1.1..S1.9.
- [Daily-plans/May 2026/15-05-2026/opd-slot-hub/Tasks/EXECUTION-ORDER-opd-slot-hub.md](../../../15-05-2026/opd-slot-hub/Tasks/EXECUTION-ORDER-opd-slot-hub.md) — sibling exec-order from yesterday (same conventions, same ASCII shape).
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules; the hard-rules list that drives pdm-01 / pdm-04 → Opus.
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used to draft this doc.
