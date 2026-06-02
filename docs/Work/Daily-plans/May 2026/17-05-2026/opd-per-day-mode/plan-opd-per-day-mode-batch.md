# OPD Per-Day Mode — 17 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR rule #1: **plan with Opus, execute with Auto, polish with Composer**. This batch has **two Opus tasks**: pdm-01 (new migration — hard-rules list) and pdm-04 (conversion algorithm, concurrency-sensitive, multi-file refactor). The remaining ten tasks default to **Auto**; the final polish/docs task can be **Composer 2 Fast**.
>
> **Source plan:** [`Product plans/plan-opd-per-day-mode.md`](../../../Product%20plans/plan-opd-per-day-mode.md). Decision locks `DL-1..DL-16`, open-question locks `PD-Q1..Q8`, deferred items `PD-D1..D7`, and S-items `S1.1..S1.9` originate there.
>
> **Upstream OPD modes spec:** [`Daily-plans/March 2026/2026-03-24/OPD modes/opd-systems-plan.md`](../../../March%202026/2026-03-24/OPD%20modes/opd-systems-plan.md) §5.1a, §5.1b, §6.2, §6.4, §8.4 — the original two-mode model this batch reshapes around the session-day fact.
>
> **Predecessor batches:**
> - [Daily-plans/May 2026/15-05-2026/opd-slot-hub](../../15-05-2026/opd-slot-hub/) — the slot-mode operational surface (toolbar, status filter, list, row actions) this batch leaves visually untouched but reroutes onto the unified `/opd/session` endpoint.
> - [Daily-plans/May 2026/08-05-2026/](../../08-05-2026/) — the queue-mode operational surface; ditto.
> - [backend/migrations/028_opd_modes.sql](../../../../../backend/migrations/028_opd_modes.sql) — original `doctor_settings.opd_mode` + `opd_queue_entries` + `opd_policies` JSONB. This plan demotes the column to a fallback.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-opd-per-day-mode.md`](./Tasks/EXECUTION-ORDER-opd-per-day-mode.md).

---

## Why this batch

The doctor-global `doctor_settings.opd_mode` column is currently the operational authority for three independent code paths:

1. **`OpdTodayClient.tsx`** — which session shape (slot vs queue) the doctor's `/dashboard/opd-today` renders for the chosen date.
2. **`opd-snapshot-service.ts`** — which session shape the patient sees in their appointment snapshot.
3. **`opd-policy-service.ts` → `assertSlotJoinAllowedForPatient`** — whether the slot-join grace gate enforces (queue-mode bookings join freely; slot-mode bookings are time-windowed).

Flipping the column changes all three at once for **every existing booking**, regardless of the mode the booking was made under. This produces the three concrete bugs in [`plan-opd-per-day-mode.md` § Why this is worth doing now](../../../Product%20plans/plan-opd-per-day-mode.md#why-this-is-worth-doing-now):

1. Doctor in slot mode opens a past queue-mode date → empty list, no UI for the queue-mode bookings that exist.
2. Doctor flips slot → queue for a future date with 20 bookings → all 20 patients silently re-rendered as token-bearers; no notification.
3. No way to express "Mondays slot, Tuesdays queue".

This batch closes those gaps with **12 tasks across 6 waves**, **~9–10 dev-days wall-clock**, **single sequential lane per wave** (every wave's tasks touch overlapping files), **1 new migration** (`100_opd_session_modes.sql`), and **2 Opus tasks** (pdm-01 + pdm-04). The slot-hub and queue-hub UIs ship untouched — only their data source moves from `/opd/slot-session` / `/opd/queue-session` to `/opd/session`.

---

## Decision lock (copied from source plan, frozen for batch duration)

These match `DL-1..DL-16` in [`plan-opd-per-day-mode.md`](../../../Product%20plans/plan-opd-per-day-mode.md). Re-opening any of them belongs in a new batch.

- **DL-1: Mode is a session-day fact, not a doctor-global setting.** Read path: `doctor_opd_session_modes (doctor_id, session_date, mode, source, changed_at, change_count)` → policy resolver → legacy `doctor_settings.opd_mode` (fallback only).
- **DL-2: No locks.** Doctor flips any number of times; debounce protects patients (DL-5).
- **DL-3: Conversions are automatic, deterministic, bidirectional.** No mid-flow ask-the-patient.
- **DL-4: Conversion algorithms.** Slot→queue is lossless (sort by `appointment_date`, tiebreak `created_at`); queue→slot may overflow (sort by `token_number`, surplus → `opd_event_type='return_after_completed'`).
- **DL-5: 5-minute notification debounce.** Net-zero flips → zero notifications.
- **DL-6: Three notification copy templates only.** Slot→queue / Queue→slot-regular / Queue→slot-overflow. Reschedule link always present.
- **DL-7: Session-overrun = explicit doctor action.** Five bulk actions: reschedule-all, reschedule-per-patient, mark-completed, cancel-with-refund, mark-no-show. Per-row override supported.
- **DL-8: 24h auto-reschedule fallback.** Then a 7-day editable window before hardening.
- **DL-9: Policy lives in `opd_policies.mode_schedule` JSONB.** Resolver order: fact → date_overrides → date_range_overrides → weekly_overrides → default_mode → `'slot'`. Array-position overlap disambiguation. `to` required on date ranges.
- **DL-10: Materialisation is lazy.** Fact row written on first booking OR first manual flip. Policy edits never retroactively overwrite materialised days.
- **DL-11: OPD tab is date-driven.** Unified `GET /api/v1/opd/session?date=` returns `{ mode, entries, counts, snapshotAt, date }` discriminated on `mode`.
- **DL-12: In-page mode-switch shortcut.** Toolbar mode pill is a clickable dropdown on today/future dates; reuses the conversion preview dialog from the settings flip path.
- **DL-13: Audit table — `doctor_opd_session_mode_changes`.** One immutable row per flip; powers support diagnostics + DL-14 nudge.
- **DL-14: Soft nudge after 2+ flips.** Advisory line in the dropdown; not a block.
- **DL-15: Past dates are mode-pinned.** Disabled dropdown with tooltip.
- **DL-16: Public booking widget resolves mode per booking date.** Bulk resolver feeds the 30-day picker.

Open-question defaults locked in chat 2026-05-17:

- **PD-Q1: Overflow patient CTA = accept overflow slot, reschedule as secondary.** Locked.
- **PD-Q2: Debounce window = 5 min.** Locked.
- **PD-Q3: Catalog/multi-service doesn't block queue flips.** Locked. Per-service constraints deferred (PD-D5).
- **PD-Q4: Telemed-in-queue advisory = soft warning at flip time.** Locked. No block.
- **PD-Q5: Race window = advisory lock per `(doctor, session_date)` during conversion.** Locked.
- **PD-Q6: Backfill = `queue` if any `opd_queue_entries` row exists for the day, else `slot`. `source='backfill'`, `change_count=0`.** Locked.
- **PD-Q7: Single-session-day toolbar shape preserved exactly.** Locked. Multi-session UX deferred (PD-D1).
- **PD-Q8: Past-start policy edits = visible warn in settings UI.** Locked.

Decisions explicitly **not** in scope for this batch (deferred):

- **PD-D1 — Multi-session-per-day** (morning queue + afternoon slot). Captured for `plan-opd-intraday-sessions.md`. This batch's data layer is designed so PD-D1 is additive (a `session_instance_id` FK), not a rewrite.
- **PD-D2 — Per-session capacity caps for queue mode.**
- **PD-D3 — 60-day calendar preview in settings UI.**
- **PD-D4 — `doctor_settings.opd_mode` column deprecation.** Survives this batch as the lowest-priority resolver fallback.
- **PD-D5 — Per-service mode constraints.**
- **PD-D6 — Doctor-custom notification copy templates.**
- **PD-D7 — Advanced recurrence patterns (RRULE-style).** Captured for `plan-opd-mode-recurrence.md`.

---

## Phases

### Wave 1 — Data foundation (3 tasks, ~10h, single sequential lane)

The dependency cliff per [EXECUTION-ORDER-GUIDELINES § 0.5 Cut 1](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves). Until the session-mode fact table exists, every downstream surface is reading a value that doesn't exist.

- [`task-pdm-01-session-modes-schema-migration.md`](./Tasks/task-pdm-01-session-modes-schema-migration.md) — **M, Opus 4.7** — New migration `100_opd_session_modes.sql`. Creates `doctor_opd_session_modes` (fact table, PK `(doctor_id, session_date)`, mutable) + `doctor_opd_session_mode_changes` (audit table, immutable, one row per flip). RLS doctor-owned + service-role bypass. `updated_at` trigger. **Backfill** (PD-Q6): one INSERT … SELECT pass that classifies every historical `(doctor, session_date)` with at least one non-cancelled appointment, using "any `opd_queue_entries` row exists for the day" as the queue heuristic. **Opus per hard-rules list** (new migration + RLS).
- [`task-pdm-02-unified-session-endpoint.md`](./Tasks/task-pdm-02-unified-session-endpoint.md) — **M, Auto** — Backend helpers + endpoint. `resolveSessionDayMode(doctorId, date)` in `backend/src/services/opd/opd-mode-service.ts` (extends, doesn't replace). New route `GET /api/v1/opd/session?date=YYYY-MM-DD` in `backend/src/routes/api/v1/opd.ts` that fans out to `listDoctorSlotSession` or `listDoctorQueueSession` based on the resolved mode and returns `{ mode, entries, counts, snapshotAt, date }`. The two legacy endpoints (`/opd/slot-session`, `/opd/queue-session`) keep working — they internally call the unified path. New frontend types `OpdSessionPayload` (discriminated union) and API helper `getDoctorOpdSession`.
- [`task-pdm-03-read-path-swap.md`](./Tasks/task-pdm-03-read-path-swap.md) — **M, Auto** — Read-path consumers swap to the new authority. `OpdTodayClient.tsx` calls `/opd/session` (one endpoint, mode discriminator picks render shape). `opd-snapshot-service.ts` reads `resolveSessionDayMode(appointment.doctor_id, appointment.appointment_date)` for the row's date instead of `doctor_settings.opd_mode`. `assertSlotJoinAllowedForPatient` does the same. **Acceptance:** flipping `doctor_settings.opd_mode` no longer rewrites how existing bookings render anywhere. The "past dates don't show in current mode" bug is closed.

### Wave 2 — Conversion service + preview UX (2 tasks, ~10h, single sequential lane)

The artifact change per Cut 2: doctors can now flip a day's mode and have the existing bookings rearrange automatically.

- [`task-pdm-04-conversion-service.md`](./Tasks/task-pdm-04-conversion-service.md) — **M–L, Opus 4.7** — `convertSessionDayMode(doctorId, date, toMode, correlationId)` orchestrator in `backend/src/services/opd/opd-mode-conversion-service.ts`. Acquires the PD-Q5 advisory lock (`pg_advisory_xact_lock` keyed on `(doctor_id, session_date)`), runs the DL-4 algorithm for the chosen direction, writes the fact row + audit row + notification batch row (drained by S1.5 / pdm-06), returns a summary `{ affected, overflowed, mode, correlationId }`. Pure helpers `applySlotToQueue(...)` / `applyQueueToSlot(slotGrid, ...)` exposed for unit tests. Five fixture days minimum (empty, all-pending, mixed, queue-larger-than-grid, overflow-only). **Opus** per hard-rules: multi-file service surface (5+ files), concurrency-sensitive, audit-log path, payment-flow race interaction.
- [`task-pdm-05-conversion-preview-dialog.md`](./Tasks/task-pdm-05-conversion-preview-dialog.md) — **S, Auto** — `<SessionModeConversionDialog>` frontend component. Two callsites: settings-flip path (pdm-08) and OPD-tab pill dropdown (pdm-11). Two phases: (a) **preview** — calls a new `previewSessionDayModeConversion` backend helper that simulates the conversion in a transaction and rolls back (no state change), returning `{ affected, overflowed, telemedCount, notificationCount }`; (b) **confirm** — POSTs to `/api/v1/opd/session/convert` (added in pdm-04's route). PD-Q4 telemed warning copy when `telemedCount > 0`. Disabled-with-tooltip when target date is past (DL-15).

### Wave 3 — Notifications (1 task, ~7h, single sequential lane)

Cut 3 — kind-of-work change (durable queue / cron worker layer, independent surface).

- [`task-pdm-06-notifications-debounce-dispatch.md`](./Tasks/task-pdm-06-notifications-debounce-dispatch.md) — **M, Auto** — New table `doctor_opd_pending_mode_notifications (doctor_id, session_date, scheduled_for, payload_json, first_flip_at, latest_flip_at)` (one row per (doctor, date)). Cron worker drains every 60s. Upsert semantics from pdm-04: each conversion writes the row with `scheduled_for = now() + 5 min` and updates `latest_flip_at`. Net-zero flip (intermediate fact rows show the day returned to original mode within 5 min) deletes the row. Hard ceiling of 30 min via `first_flip_at + 30 min` floor. Three DL-6 copy templates wired through the existing patient notification primitive (`notifyConversionAffectedPatients(doctorId, date)`). Migration adds the table; updates to `backend/src/workers/opd-cron.ts` (or new file).

### Wave 4 — Mode-scheduling policy + booking widget integration (2 tasks, ~14h, single sequential lane)

Cut 2 — second visible artifact: doctors can now express week/range/date-override schedules and new bookings respect them.

- [`task-pdm-07-mode-policy-resolver-and-booking-integration.md`](./Tasks/task-pdm-07-mode-policy-resolver-and-booking-integration.md) — **M, Auto** — Backend resolver `resolveModePolicyForDate(doctorId, date)` + bulk `resolveModePolicyForDateRange(doctorId, from, to)` in `backend/src/services/opd/opd-mode-service.ts`. Implements DL-9 hierarchy with array-position overlap disambiguation. JSONB validator (Zod or hand-rolled) rejects `to`-less ranges (DL-9), allows past-dated rules (PD-Q8 — visible warn lives in the settings UI, not in the validator). Updates `backend/src/controllers/booking-controller.ts` + `backend/src/services/slot-selection-service.ts` to call the resolver per target booking date instead of reading `doctor_settings.opd_mode`. Bulk endpoint `GET /api/v1/public/doctors/:id/mode-schedule?from=&to=` returns the resolved map for the public booking widget's date picker.
- [`task-pdm-08-mode-schedule-settings-ui.md`](./Tasks/task-pdm-08-mode-schedule-settings-ui.md) — **M, Auto** — `<ModeScheduleEditor>` in `frontend/components/settings/doctor/opd/ModeScheduleEditor.tsx` (or wherever the existing OPD settings live; identify in the task). Three list-builders: default mode (radio), weekly (7 weekday rows, slot/queue/inherit radio each), date-range overrides (drag-to-reorder list with `from`/`to`/`mode`), date overrides (drag-to-reorder list with `date`/`mode`). `<TestDateWidget>` inside the editor: single date input + live readout *"→ {mode} (from {source})"* — calls pdm-07's resolver every 300ms. PD-Q8 inline advisory rendered when a saved rule starts before today. POST to existing `PUT /api/v1/settings/doctor` (the `doctor_settings.opd_policies` field already exists; this UI writes its `mode_schedule` sub-object).

### Wave 5 — Session-overrun handling (2 tasks, ~10h, single sequential lane)

Cut 2 — third visible artifact: doctors see a "Needs attention" tray at end of session for patients not seen.

- [`task-pdm-09-overrun-flagging-and-fallback.md`](./Tasks/task-pdm-09-overrun-flagging-and-fallback.md) — **M, Auto** — Backend cron worker that runs every 5 min and flags `pending|confirmed` appointments past `session_end + 30 min` as `session_overrun` (a new boolean column added in pdm-09's small DDL change, OR a derived-on-read flag — task picks one and locks the choice). `bulkResolveSessionOverrun(doctorId, date, action, perRowOverrides)` implements the 5 DL-7 actions, reusing the existing reschedule primitive (`reschedule-service.ts`) for action `reschedule_all`. 24h auto-reschedule fallback worker (separate cron entry) handles DL-8. New routes: `POST /api/v1/opd/session/overrun/bulk-resolve` + the worker entry points.
- [`task-pdm-10-overrun-tray-ui.md`](./Tasks/task-pdm-10-overrun-tray-ui.md) — **M, Auto** — "Needs attention" tray UI mounts at the top of `OpdTodayClient.tsx`'s `OpdTodayClient` for the chosen date when overrun rows exist. Collapsible card with row count + bulk-action button. Bulk-action dialog with a 5-option radio (DL-7 actions) + a per-row override grid (defaults to bulk action; doctor can change any row individually). PUT through to pdm-09's bulk-resolve endpoint.

### Wave 6 — In-page shortcut + polish (2 tasks, ~5h, single sequential lane)

Cut 3 — kind-of-work change (operational polish + telemetry + docs).

- [`task-pdm-11-opd-tab-mode-shortcut.md`](./Tasks/task-pdm-11-opd-tab-mode-shortcut.md) — **S, Auto** — Toolbar mode pill (rendered today as a static `<OpdModeBadge>` next to the date picker) becomes a clickable dropdown for today/future dates per DL-12. Opens the `<SessionModeConversionDialog>` from pdm-05. Disabled on past dates with the DL-15 tooltip. DL-14 advisory line shown when the conversion preview's `change_count >= 2`. Telemetry event `opd_session.mode_flipped` with `{ from, to, affected_count, overflow_count, source: 'opd_tab' | 'settings' }`.
- [`task-pdm-12-polish-and-cleanup.md`](./Tasks/task-pdm-12-polish-and-cleanup.md) — **XS, Composer 2 Fast** — `/opd/slot-session` + `/opd/queue-session` marked deprecated with `Sunset` and `Deprecation` headers pointing at `/opd/session`. Docs updates: `docs/Reference/engineering/architecture/CONTRACTS.md` § Patient OPD session snapshot — note the unified endpoint and the discriminated union shape. `docs/Reference/engineering/operations/OPD_SUPPORT_RUNBOOK.md` — new sections for conversion semantics, overrun handling, and how to read `doctor_opd_session_mode_changes` for support tickets ("when did Dr. X flip Tuesday?").

---

## Cross-cutting acceptance gate (whole batch)

Before declaring this batch shipped, all of the following must be true:

- [ ] **Display follows date, not doctor toggle.** With a doctor where `doctor_settings.opd_mode = 'queue'`, opening a past date that was operating in slot mode renders the slot list (and vice-versa). The "past dates don't show" bug is closed.
- [ ] **Unified endpoint.** `GET /api/v1/opd/session?date=YYYY-MM-DD` returns `{ mode: 'slot' | 'queue', entries, counts, snapshotAt, date }`. Doctor-only auth gate. Past dates return their materialised mode; today / future dates return the resolved mode (fact → policy → fallback).
- [ ] **Legacy endpoints still work.** `GET /opd/slot-session` and `GET /opd/queue-session` continue to return their existing shapes (for the deprecation window) AND emit `Sunset` + `Deprecation` headers pointing at `/opd/session`.
- [ ] **Conversion is automatic, deterministic, lossless (slot→queue) or overflow-honoured (queue→slot).** Fixture: 25 booked patients, 20-slot grid, flipped queue→slot → 20 grid-mounted + 5 `opd_event_type='return_after_completed'` rows. Zero drops.
- [ ] **Notifications debounce.** Fixture: flip slot→queue, then queue→slot 90s later → zero notifications dispatched. Flip slot→queue and wait > 5 min → exactly N notifications (one per affected patient). Flip-flop loop after 30 min from first flip → latest-state batch dispatches (hard ceiling).
- [ ] **OPD-tab shortcut.** Doctor on `/dashboard/opd-today` can flip today's mode in ≤ 2 clicks (open pill dropdown → confirm in preview dialog).
- [ ] **Settings policy editor.** Weekly/range/date-override edits persist to `opd_policies.mode_schedule`. A new booking on an unmaterialised future date lands in the resolver's chosen mode. `<TestDateWidget>` returns the same mode the actual booking flow uses.
- [ ] **Past-start advisory.** Adding a `date_range_override` with `from < today` shows the PD-Q8 inline advisory in the editor. The rule still saves.
- [ ] **Session-overrun tray.** Bookings past `session_end + 30 min` surface in the tray. Doctor's bulk-resolve moves them all with one notification each. The 24h auto-reschedule fallback worker runs against rows that the doctor didn't action.
- [ ] **Past-date pinning.** Mode dropdown is disabled on past dates with the DL-15 tooltip.
- [ ] **Public booking widget.** Booking flow respects the target-date mode (DL-16). Booking a slot 3 weeks ahead on a weekly-override-queue weekday produces a queue-shape booking, not a slot. Bulk resolver returns the 30-day picker map in one call.
- [ ] **Audit table populated.** Every flip (doctor-initiated OR system-policy OR system-overrun-fallback) writes one row to `doctor_opd_session_mode_changes` with the correct `triggered_by`.
- [ ] **Soft nudge after 2+ flips.** The DL-14 advisory appears in the dropdown on a third flip of the same day. Doctor can still flip.
- [ ] **Backwards compatibility.** Slot-hub UI (toolbar / filter / list / row actions, shipped 15-05-2026) and queue-hub UI (shipped 08-05-2026) survive untouched — only the data source changed.
- [ ] **`doctor_settings.opd_mode` column untouched.** Still writable, still read as the tertiary fallback when no fact row and no `mode_schedule` policy exists. No lint / runtime block on writes; just demoted in the resolver hierarchy.
- [ ] **Type-check + lint.** `pnpm --filter frontend tsc --noEmit` clean. `pnpm --filter backend tsc --noEmit` clean. Lint clean on both.
- [ ] **Tests.** New unit tests for the conversion algorithms (both directions, 5 fixtures each), the resolver hierarchy (≥ 6 cases covering each priority level), the debounce window, the overrun flagging cron, and the bulk-resolve action handlers. Existing OPD test suites still pass.
- [ ] **No regression** in any existing test suite that touches `OpdTodayClient`, `OpdQueueSessionToolbar`, `OpdSlotSessionToolbar`, `appointment-service.ts`, `opd-snapshot-service.ts`, `opd-policy-service.ts`, `slot-selection-service.ts`, or the booking flow controllers.

---

## Risk register

Inherited verbatim from [`plan-opd-per-day-mode.md` § Risk register](../../../Product%20plans/plan-opd-per-day-mode.md#risk-register), with batch-specific mitigations:

| Risk | Severity | Mitigation in this batch |
|---|---|---|
| Conversion runs against a row mid-payment-flow → token minted before payment fails → orphan queue entry | **M** | pdm-04 uses `pg_advisory_xact_lock` keyed on `(doctor_id, session_date)` for the conversion transaction. Conversion query excludes rows in `pending_payment` substates (`appointments.status IN ('pending', 'confirmed')` only). Payment webhook handler in `appointment-service.ts` already uses upsert semantics — idempotent under both modes. |
| Notification debounce holds a batch indefinitely | **L** | pdm-06 enforces a hard 30-min ceiling via `first_flip_at + 30 min` in the cron worker's eligibility query. After 30 min, the latest-state batch dispatches. |
| Backfill mis-classifies historical mode (PD-Q6) | **L** | pdm-01's backfill uses "any `opd_queue_entries` row on the day" as the queue heuristic. Per `appointment-service.ts` line 421–434 (verify in task spec), queue entries are only created in queue mode; presence is sufficient. Spot-check 20 random historical days post-backfill (in pdm-01's acceptance step). |
| Conversion preview dialog slow on 100+ booking days | **L** | pdm-05 uses aggregated counts only, never per-row data. Backend `previewSessionDayModeConversion` uses one COUNT-grouped query. Verify with 200-booking fixture in pdm-04's tests. |
| Queue→slot overflow surprises the doctor | **M** | pdm-05's preview dialog renders overflow count prominently with the DL-6 copy ("5 patients will be assigned overflow slots; they may not be seen if the day runs long"). The doctor sees the cost before committing. |
| Multi-session deferral (PD-D1) forces data-model rewrite later | **L** | pdm-01's schema is designed as a 1:1 special case of a future session-instance table; PD-D1's migration will add `session_instance_id` to `appointments` + `opd_queue_entries` and demote the day-level row to "first session of the day". No rewrite. |
| Public booking widget calls resolver 30 times for a 30-day picker | **L** | pdm-07 ships `resolveModePolicyForDateRange(from, to)` bulk variant + the public endpoint that consumes it. Frontend widget uses one call. |
| `doctor_settings.opd_mode` drifts from `mode_schedule.default_mode` | **L** | pdm-08 mirrors the first edit: when a doctor saves `mode_schedule.default_mode`, the same controller call writes `doctor_settings.opd_mode` to match (one-time alignment). After that, `opd_mode` is read-only — a follow-up lint rule on the controller layer prevents direct writes outside of this single code path. |
| Overrun tray surfaces stale rows | **L** | pdm-09 scopes the flagging query to "rows where `session_end + 30 min < now < first_flag_at + 7 days`" — rows drop out of the tray once auto-resolved (or after 7 days regardless). |
| Notification copy assumes English + en-IN time format | **L** | DL-6 templates plug into the existing patient notification primitive, which already handles locale + TZ via doctor settings. No new locale logic in this batch. |
| Read-path swap (pdm-03) accidentally breaks the slot-hub UI | **M** | pdm-03 changes only the data source (one endpoint call). Slot-hub component props remain identical. pdm-03's acceptance gate explicitly runs the slot-hub batch's smoke test (toolbar / filter / list / row actions) verbatim. |
| Settings UI's drag-to-reorder for date-range overrides feels heavy on mobile | **L** | pdm-08 uses `dnd-kit` (already a dep — verify in task spec) with touch handlers. Acceptance step includes a 375px-width mobile smoke. |

---

## Cost estimate

Expected model-mix per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Pool drawn from | Tokens (rough) |
|---|---|---|---|---|---|---|
| Wave 1 | pdm-01, pdm-02, pdm-03 | 2/3 | 0/3 | **1/3** (pdm-01) | API pool (Opus only) + Auto pool (the other two) | ~150k in / ~120k out |
| Wave 2 | pdm-04, pdm-05 | 1/2 | 0/2 | **1/2** (pdm-04) | API pool (Opus) + Auto pool (pdm-05) | ~180k in / ~140k out |
| Wave 3 | pdm-06 | 1/1 | 0/1 | 0/1 | Auto pool | ~80k in / ~60k out |
| Wave 4 | pdm-07, pdm-08 | 2/2 | 0/2 | 0/2 | Auto pool | ~160k in / ~120k out |
| Wave 5 | pdm-09, pdm-10 | 2/2 | 0/2 | 0/2 | Auto pool | ~130k in / ~100k out |
| Wave 6 | pdm-11, pdm-12 | 1/2 | 1/2 (pdm-12) | 0/2 | Auto+Composer pool | ~50k in / ~40k out |
| **Total** | **12** | **9** | **1** | **2** | **Auto pool + API pool (Opus only)** | **~750k in / ~580k out** |

**Pool note:** the two Opus tasks (pdm-01, pdm-04) draw from the **$20/mo API pool**; the other ten draw from the **Auto+Composer pool** (the cheaper one). Within the Opus cap rules ([guidelines §8](../../../../process/EXECUTION-ORDER-GUIDELINES.md#8-inline-model-pick-annotation)): ≤ 1 Opus task per wave (Wave 1: pdm-01; Wave 2: pdm-04), ≤ 2 Opus tasks per batch (total: 2). At the cap; would not be sustainable to add a third without rescoping.

**Optional close-gate Opus turn.** Per the guide's Pattern A.4: after pdm-12 ships, you may open **one** fresh Opus 4.7 Extra High chat with the full Wave 1–6 diff and ask it to grade against the cross-cutting acceptance gate. This is the **third Opus turn** budgeted for the entire batch and it is optional — skip if the deterministic gates (`tsc` / `lint` / `test` / `rg` / `curl` / browser smoke) all pass cleanly.

**Per-message escalation safety net.** If Auto stalls on a single message during any of pdm-02, pdm-03, pdm-05, pdm-06, pdm-07, pdm-08, pdm-09, pdm-10, pdm-11 (asks the same clarifying question twice, or ships code that fails type-check on a non-obvious error), escalate that **one message** to Opus 4.7 Extra High via the per-message picker. Don't switch the whole chat — the rest of the work stays in the cheap pool.

---

## Release plan

```
Wave 1 (pdm-01 → pdm-02 → pdm-03)
  │   └─ feature/opd-per-day-mode-foundation
  │      ├─ pdm-01: 100_opd_session_modes.sql + audit + backfill (Opus, separately reviewable migration commit)
  │      ├─ pdm-02: unified /opd/session endpoint
  │      └─ pdm-03: read-path swap (the visible bug fix)
  ▼
Wave 2 (pdm-04 → pdm-05)
  │   └─ feature/opd-per-day-mode-conversion (stacks on Wave 1)
  ▼
Wave 3 (pdm-06)
  │   └─ feature/opd-per-day-mode-notifications (stacks on Wave 2)
  ▼
Wave 4 (pdm-07 → pdm-08)
  │   └─ feature/opd-per-day-mode-policy (stacks on Wave 2; independent of Wave 3)
  ▼
Wave 5 (pdm-09 → pdm-10)
  │   └─ feature/opd-per-day-mode-overrun (stacks on Wave 2; independent of Waves 3+4)
  ▼
Wave 6 (pdm-11 → pdm-12)
  │   └─ feature/opd-per-day-mode-shortcut-polish (stacks on Waves 2+5+optionally 4)
  ▼
PR landing
  │
  ▼
Visual smoke in prod within hours of merge
```

**Why six branches and not one big PR?** Each wave's gate is its own reviewer mindset (schema vs read-path vs conversion vs notifications vs policy vs overrun vs polish). The migration commit in Wave 1 is reviewed separately from the read-path commit in the same wave. Waves 3–5 are independent of each other once Wave 2 ships, so they could in principle ship in any order; the recommended sequence above just matches the task numbering.

**Rollback story:**

- **Bad migration (pdm-01)** — `pg_migrate down 100`. The fact table and audit table drop. Read paths fall back to `doctor_settings.opd_mode` because pdm-03 (read-path swap) hasn't landed yet at this point in the rollback. No data loss; backfill rows are deleted with the table.
- **Bad unified endpoint (pdm-02)** — `git revert` the Wave 1 service / route commit. The frontend slot/queue branches haven't been swapped yet (pdm-03), so they continue calling `/opd/slot-session` / `/opd/queue-session` directly. The fact table sits unused.
- **Bad read-path swap (pdm-03)** — `git revert` the read-path commit. The hub / snapshot / grace-gate read from `doctor_settings.opd_mode` again. The unified endpoint sits unused.
- **Bad conversion service (pdm-04)** — `git revert` the conversion commit. The `POST /opd/session/convert` route returns 404. The OPD-tab pill dropdown (pdm-11) is gated on the endpoint's existence; without it, the pill stays read-only. Settings policy editor (pdm-08) still works (it doesn't depend on conversion).
- **Bad notifications (pdm-06)** — `git revert` the notifications commit. The cron worker stops draining; pending rows accumulate but cause no harm. Patient impact: zero notifications dispatched until reverted.
- **Bad policy resolver (pdm-07)** — `git revert` the resolver commit. Public booking widget falls back to `doctor_settings.opd_mode` (the resolver's tertiary fallback). Patient-facing booking is degraded but functional.
- **Bad overrun (pdm-09 / pdm-10)** — `git revert` the overrun commits. The tray disappears; rows past `session_end + 30 min` stay in `pending|confirmed` until manually actioned. Old (pre-batch) behaviour.

No release-window pause needed. The batch is isolated to OPD mode lifecycle; cross-batch risk is moderate but bounded (slot-hub UI is unchanged behaviourally; queue-hub UI is unchanged behaviourally; booking flow degrades gracefully on resolver revert).

---

## References

- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- [EXECUTION-ORDER-GUIDELINES.md](../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used for the exec-order doc.
- [Product plans/plan-opd-per-day-mode.md](../../../Product%20plans/plan-opd-per-day-mode.md) — source product plan, decision locks DL-1..DL-16, open-question lock PD-Q1..Q8, deferred items PD-D1..D7.
- [Product plans/plan-opd-slot-hub.md](../../../Product%20plans/plan-opd-slot-hub.md) — slot-hub plan; this batch leaves its shipped UI untouched and only reroutes the data layer.
- [Daily-plans/May 2026/15-05-2026/opd-slot-hub/](../../15-05-2026/opd-slot-hub/) — predecessor batch; sl-01..sl-06 shipped the slot-mode operational surface this batch consumes.
- [Daily-plans/March 2026/2026-03-24/OPD modes/opd-systems-plan.md](../../../March%202026/2026-03-24/OPD%20modes/opd-systems-plan.md) — original two-mode product spec.
- [backend/migrations/028_opd_modes.sql](../../../../../backend/migrations/028_opd_modes.sql) — `doctor_settings.opd_mode` + `opd_queue_entries` + `opd_policies` JSONB introduction.
- [backend/migrations/030_opd_session_delay.sql](../../../../../backend/migrations/030_opd_session_delay.sql) — `appointments.opd_session_delay_minutes` (the per-row delay this batch's conversion clears on slot→queue).
- [backend/migrations/031_appointments_opd_edge_cases.sql](../../../../../backend/migrations/031_appointments_opd_edge_cases.sql) — `opd_event_type` enum (used by queue→slot overflow assignment).
- **Backend prior art:**
  - `backend/src/services/opd/opd-mode-service.ts` — current global resolver; this batch extends it with per-date helpers.
  - `backend/src/services/opd/opd-policy-service.ts` — grace-window helper + `assertSlotJoinAllowedForPatient`.
  - `backend/src/services/opd-snapshot-service.ts` — patient-side snapshot.
  - `backend/src/services/opd-doctor-service.ts` — `listDoctorQueueSession` (the queue snapshot service).
  - `backend/src/services/opd-slot-session-service.ts` — `listDoctorSlotSession` (the slot snapshot service, shipped 15-05-2026).
  - `backend/src/services/appointment-service.ts` — appointment + `opd_queue_entries` creation; conversion service touches this.
  - `backend/src/services/slot-selection-service.ts` — public booking slot selection; pdm-07 reroutes through the resolver.
  - `backend/src/routes/api/v1/opd.ts` — OPD route file; gets the unified endpoint + conversion endpoint + overrun bulk-resolve endpoint.
- **Frontend prior art:**
  - `frontend/components/opd/OpdTodayClient.tsx` — doctor-side hub; pdm-03 / pdm-10 / pdm-11 mount on it.
  - `frontend/components/opd/OpdModeBadge.tsx` — the pill that becomes a dropdown in pdm-11.
  - `frontend/components/opd/OpdSlotSessionToolbar.tsx` + `OpdQueueSessionToolbar.tsx` — the per-mode toolbars; receive the new dropdown wiring.
  - `frontend/hooks/useDoctorDayPipeline.ts` — unified adapter; verifies it reads the unified endpoint payload's discriminator correctly.

---

**Status:** `Drafted` 2026-05-17.
**Owner:** TBD.
