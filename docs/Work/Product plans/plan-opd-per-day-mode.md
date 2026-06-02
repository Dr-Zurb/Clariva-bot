# OPD Per-Day Mode — product plan

> **Source thread:** 2026-05-16 / 2026-05-17 chat on OPD mode lifecycle. Builds on top of [`plan-opd-slot-hub.md`](./plan-opd-slot-hub.md) (concurrent batch) and [`Daily-plans/March 2026/2026-03-24/OPD modes/opd-systems-plan.md`](../Daily-plans/March%202026/2026-03-24/OPD%20modes/opd-systems-plan.md) — the original two-mode spec from which today's global `doctor_settings.opd_mode` came.
>
> **Predecessor (data foundation):** [`backend/migrations/028_opd_modes.sql`](../../backend/migrations/028_opd_modes.sql) shipped `doctor_settings.opd_mode TEXT NOT NULL DEFAULT 'slot'` + `opd_queue_entries` + `opd_policies JSONB`. That single-row `opd_mode` is the variable this plan replaces as the authority for what mode a date operates under.
>
> **Locked-in chat:** 2026-05-17.

---

## North star

The doctor decides on a per-day basis what mode each date operates in, can change their mind any number of times, and the system **honors every existing patient booking** through automatic, deterministic conversion + notification. The doctor's global toggle (`doctor_settings.opd_mode`) stops being the operational authority and becomes a **default policy** for new, not-yet-materialised dates.

After this plan ships:

1. A doctor in slot mode opens a past date that was operating in queue mode → the OPD hub shows the queue list correctly. The mode follows the date, not the doctor's current toggle.
2. A doctor with 20 booked patients on Tuesday flips Tuesday from slot → queue → all 20 patients are auto-assigned tokens (preserving original booking order), each receives one notification, no one is dropped.
3. A doctor's schedule policy can be expressed as "Mon/Wed/Fri slot, Tue/Thu queue" or "first 15 days of month slot, rest queue" or "this specific date is an exception" — and new bookings on each date land in the correct mode automatically.
4. The OPD tab itself has a one-click "switch this day's mode" shortcut next to the date picker (no detour to settings).

---

## Why this is worth doing now

1. **The current model silently rewrites patient contracts.** `OpdTodayClient.tsx`, `opd-snapshot-service.ts`, and `assertSlotJoinAllowedForPatient` (in `backend/src/services/opd/opd-policy-service.ts`) all read the doctor's *current* `opd_mode` — not the mode the appointment was booked under. Flipping the toggle changes how the patient sees their own appointment, whether the slot-join grace window enforces, and whether the doctor's hub even shows the row. This is a real, present-tense bug that gets worse the more doctors flip the toggle.

2. **The display bug is the visible symptom of the deeper issue.** "Past dates don't show when I'm in slot mode" is technically a read-path bug, but it is **caused by** the mode being attached to the doctor instead of to the session-day. Fixing the read path without fixing the model leaves the contract-mutation problem in place.

3. **Doctors want per-day control.** Source-thread asks: 3-days-a-week schedules, date-range schedules ("first half of June"), specific-date overrides, and emergency flips. None of these are expressible in the current single-column model.

4. **`plan-opd-slot-hub.md` ships a complete slot-mode operational surface, but its data layer still goes through the global toggle.** Without this plan landing alongside (or shortly after), slot-hub doctors who switch to queue mode for one day will see the slot-hub surface vanish and the queue-hub surface appear — even on past dates where slot-hub was right. The two batches reinforce each other.

5. **The doctor is the operator, not the policymaker.** Source thread is explicit: no locks, no caps. The tool gives the doctor freedom; we engineer around it.

---

## Decision locks (DL-1 .. DL-16)

These are locked in chat 2026-05-17. Re-opening any of them belongs in a new batch, not mid-execution.

- **DL-1: Mode is a session-day fact, not a doctor-global setting.** New table `doctor_opd_session_modes (doctor_id, session_date, mode, source, changed_at, change_count)`. The doctor hub, the patient snapshot, and the slot-join grace gate all read this — never `doctor_settings.opd_mode`. The legacy column survives as a **default mode** for previously-untouched future dates; it is otherwise read-only.

- **DL-2: No locks.** The doctor can flip a day's mode any number of times, regardless of how many bookings exist, regardless of how recently they last flipped. The tool exists to give the doctor freedom; spam protection lives in the **notification layer**, not in the mode layer (see DL-5).

- **DL-3: Conversions are automatic, deterministic, and bidirectional.** When the doctor changes a day's mode with existing bookings, the system reassigns all non-terminal appointments. No mid-flow ask-the-patient step. Patient inaction = acceptance of the new assignment; explicit reschedule/cancel remains available to the patient via the standard reschedule link in the notification.

- **DL-4: Conversion algorithms.**
  - **Slot → queue (lossless).** Sort non-terminal appointments by `appointment_date ASC`, tiebreaker `created_at ASC`. Mint `opd_queue_entries` rows with `token_number = 1..N` in that order. Keep the original `appointment_date` on the appointment row (don't collapse to session start) so a reverse-flip stays lossless. Clear slot-only state: `opd_session_delay_minutes`, `opd_early_invite_expires_at`, `opd_early_invite_response`.
  - **Queue → slot (may overflow).** Sort non-terminal appointments by `token_number ASC`. Compute the day's slot grid from `slot_interval_minutes` + the doctor's working hours. Assign first `min(N, slot_capacity)` rows to grid positions in token order. Surplus rows get `opd_event_type = 'return_after_completed'` with `appointment_date = session_end + (overflow_index + 1) * slot_interval`. Delete the corresponding `opd_queue_entries` rows.

- **DL-5: Notification debounce window = 5 minutes.** When a conversion completes, the affected-patient notification batch is **scheduled** for `now + 5 min`, not dispatched immediately. A subsequent flip within that 5-min window cancels the pending batch and reschedules for `latest_flip + 5 min`. Net-zero flips (slot→queue→slot inside the window) cancel the batch entirely — patient never hears about it. Single debounce primitive; reused by both directions.

- **DL-6: Three notification copy templates only.**
  1. **Slot → queue (any patient).** *"Dr. {name} has changed {date} to queue mode. Your slot at {time} is now token #{n}. Estimated wait: ~{eta} min from session start. [Reschedule]"*
  2. **Queue → slot (regular-grid patient).** *"Dr. {name} has changed {date} to slot mode. Your token #{n} is now a fixed appointment at {time}. Please plan to arrive by {time-5min}. [Reschedule]"*
  3. **Queue → slot (overflow patient).** *"Dr. {name} has reorganised {date}. Your token #{n} is now an overflow slot at end of session (estimated {time}). You'll be seen after all scheduled patients. [Reschedule]"*
  No fourth template. The reschedule link is **always present**.

- **DL-7: Session-overrun handling — explicit doctor action with auto-fallback.** After `session_end + 30 min` (the "did the session actually end" grace), any `pending|confirmed` appointment on that date is flagged `session_overrun` (new flag, not a status replacement) and surfaces in a "Needs attention" tray in the OPD tab. The doctor's bulk actions are: **Reschedule all to next-available** (default), **Reschedule per-patient**, **Mark as completed (saw briefly)**, **Cancel with refund**, **Mark as no-show**. Per-row override of the bulk action is supported.

- **DL-8: 24h auto-reschedule fallback for session-overrun.** If the doctor doesn't action the overrun tray within 24h, the system auto-reschedules every flagged row to next-available (same doctor, same modality, same service) and notifies the patient. The doctor retains a 7-day editable window to override the auto-reschedule before it hardens into "the patient's new appointment."

- **DL-9: Mode-scheduling policy lives in `doctor_settings.opd_policies.mode_schedule` (existing JSONB; no new migration for the policy itself).**
  ```jsonc
  {
    "default_mode": "slot",
    "weekly_overrides": { "mon": "slot", "tue": "queue", ... },
    "date_range_overrides": [{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "mode": "queue" }],
    "date_overrides":       [{ "date": "YYYY-MM-DD",                     "mode": "slot"  }]
  }
  ```
  **Resolver order (first match wins):** `doctor_opd_session_modes` row (= the fact) → `date_overrides` → `date_range_overrides` → `weekly_overrides[weekday-in-doctor-TZ]` → `default_mode` → fallback `'slot'`.

  **Overlap disambiguation:** within `date_range_overrides` *and* within `date_overrides`, **the entry later in the array wins** when more than one matches. Settings UI exposes drag-to-reorder so "later in array" maps to "rule the doctor moved to the bottom." No per-entry `updated_at` timestamp needed.

  **`to` is required on `date_range_overrides`.** Open-ended periods ("from Aug 1 onwards, queue") are expressed by editing `default_mode`, not by an unbounded range. Keeps the resolver and the settings UI honest about scope.

- **DL-10: Materialisation is lazy.** A `doctor_opd_session_modes` row is written on the **first booking that lands on a date** OR the **first time the doctor manually flips that date's mode**. Policy edits (DL-9) never retroactively overwrite materialised days — the resolver only consults policy when the fact row is absent.

- **DL-11: The OPD tab is date-driven.** `OpdTodayClient.tsx` no longer reads `doctor_settings.opd_mode` to decide which session shape to render. It calls a single unified endpoint `GET /api/v1/opd/session?date=YYYY-MM-DD` that returns `{ mode, entries, counts, snapshotAt, date }` discriminated on `mode`. Past dates render in their materialised mode (read-only — DL-15); today/future dates expose the conversion dropdown (DL-12).

- **DL-12: In-page mode-switch shortcut.** The session toolbar's mode pill becomes a clickable dropdown for today / future dates. Clicking opens the **conversion preview dialog** (sub-bullet below) — same dialog reused from the settings flip path. Settings retains the heavier *policy* editor (DL-9); the OPD-tab toggle is the per-day operational flip.
  - **Conversion preview dialog** shows: count of affected appointments, breakdown by destination (e.g., "12 to slot grid, 5 to overflow"), estimated notification count, and a confirm button. Cancel = no state change, no API call.

- **DL-13: Audit table — `doctor_opd_session_mode_changes`.** One row per flip, immutable. Columns: `doctor_id, session_date, from_mode, to_mode, affected_apt_count, overflow_count, notification_dispatched, triggered_by ('doctor'|'system_policy'|'system_overrun_fallback'), notes, created_at`. Powers support diagnostics ("when did Dr. X flip Tuesday?") and the soft UI nudge (DL-14).

- **DL-14: Soft UI nudge after 2+ flips on the same day.** When the doctor opens the conversion dropdown on a day where `doctor_opd_session_modes.change_count >= 2`, the dropdown shows a one-line advisory: *"You've changed this day's mode {n} times already — patients have been re-notified each time."* It is a soft friction bump, **not a block**. Doctor can still flip; the count keeps incrementing.

- **DL-15: Past dates are mode-pinned.** A date strictly before `today (doctor TZ)` is fact-only — the mode dropdown is rendered disabled with a tooltip *"Past dates can't be reconfigured."*. No conversion path runs against history.

- **DL-16: Public booking widget resolves mode per booking date.** When a patient is selecting a date 3 weeks ahead, the booking flow calls the same DL-9 resolver against the *target* date — not against the doctor's current global toggle — and renders the slot grid vs token-request UI accordingly. This closes the largest current data leak.

---

## Open questions — answered defaults (locked for batch duration)

- **PD-Q1: Overflow patient's primary CTA — "accept overflow slot" or "pick a regular slot another day"?** **Accept overflow slot** as primary; "Reschedule" link as secondary. *Why:* matches "we honour your booking" stance. The reschedule link is one tap away; patients aren't trapped.

- **PD-Q2: Debounce window length — 2 / 5 / 15 minutes?** **5 minutes.** *Why:* short enough that a real flip-back feels responsive; long enough that the typical "flip, regret, flip back" cycle (~30s–2min) is absorbed silently.

- **PD-Q3: Catalog-mode interaction — does a multi-service catalog with long-duration services block a queue flip?** **No — keep it simple.** The doctor can flip regardless; queue→slot overflow handles long-duration services the same way as short ones (they get end-of-session overflow slots). A future plan can add per-service mode constraints if real complaints arrive.

- **PD-Q4: Telemed-in-queue-mode advisory?** **Soft warning at flip time only.** When flipping a day with ≥1 telemed booking into queue mode, the conversion preview shows *"N of the affected bookings are telemed — patients won't know when to join the call until they're paged."* No block.

- **PD-Q5: New booking arriving mid-conversion (race window)?** **Advisory lock per `(doctor, session_date)` during conversion.** Conversion takes ~1–2 seconds; new booking attempts during that window get a *"Doctor is reorganising this session, try again in a moment"* response with a `Retry-After` hint. No schema change; in-memory or Redis-backed lock.

- **PD-Q6: Backfill strategy for existing days (pre-batch).** On migration, for every `(doctor, session_date)` with at least one non-cancelled appointment: if any row has an `opd_queue_entries` sibling → mark as `queue`; else mark as `slot`. `source = 'backfill'`, `changed_at = migration_run_at`, `change_count = 0`. Materialises every historically-touched date in one pass.

- **PD-Q7: Single-session-day UX (toolbar shape).** Today's single-pill toolbar shape is preserved exactly. The DL-12 dropdown is a one-element dropdown for single-mode days — same chrome, no list of sessions. Multi-session UX is deferred (PD-D1).

- **PD-Q8: Past-start policy edits — silent ignore or visible warn?** **Visible warn in the settings UI.** When a doctor adds a `date_range_override` with `from < today` or a `date_override` with `date < today`, the editor renders an inline advisory: *"This rule starts in the past. Past dates are unaffected (their mode is already a fact); the rule applies from {today} forward."* The rule still saves and still applies forward — we only correct the doctor's mental model, not their input.

---

## Deferred — explicitly out of scope for this batch

- **PD-D1: Multi-session-per-day (e.g., morning queue 11–14 + afternoon slot 15–17).** *Deferred per source thread.* Building this requires a `doctor_opd_session_instances` table where a "session" is a (start_time, end_time, mode) tuple, per-session token numbering, per-session overflow scoping, and a redesigned settings UI. This plan ships the **one-mode-per-day** model first, with the data layer designed so the future multi-session migration is **additive** (adds a `session_instance_id` foreign key to `appointments` + a session-instances table) rather than a model rewrite. Captured for a future plan, e.g., `plan-opd-intraday-sessions.md`.

- **PD-D2: Per-session capacity caps for queue mode.** *Deferred.* Today queue mode is uncapped; a hard or soft cap is useful but isn't load-bearing for the freedom-of-mode-switching story. Add when a doctor asks.

- **PD-D3: 60-day calendar preview in settings UI.** *Deferred.* The basic policy editor (default + weekly + range + date overrides) ships in S1.6; the calendar visualisation is a follow-up polish pass once doctors are actually editing schedules.

- **PD-D4: Deprecation of `doctor_settings.opd_mode` column.** *Deferred to a follow-up cleanup batch.* The column survives this batch as a write-once default for newly-onboarded doctors who haven't yet built a `mode_schedule` policy. A later batch can flip it to a virtual / generated column or drop it entirely.

- **PD-D5: Per-service mode constraints (e.g., "this 90-min procedure can only be booked in slot mode").** *Deferred.* Discussed in PD-Q3.

- **PD-D6: Custom doctor templates for the notification copy.** *Deferred.* DL-6's three templates are the only language; per-doctor customisation is a localisation / branding concern best handled by the broader notification system, not by this batch.

- **PD-D7: Advanced recurrence patterns (RRULE-style).** *Deferred.* Patterns like "first Monday of every month", "every other Tuesday", or "2nd & 4th Saturday" are not expressible in DL-9's `default + weekly + range + date-override` hierarchy. The 80% case is weekday-uniform; doctors with non-uniform recurring schedules enumerate the specific dates via `date_overrides` until real complaints arrive. Captured for a future plan, e.g., `plan-opd-mode-recurrence.md`, where the policy schema gains a `recurrence_rules[]` block (RRULE-flavoured) and the resolver order extends to: `date_overrides` → `recurrence_rules` → `date_range_overrides` → `weekly_overrides` → `default_mode`.

---

## High-level scope (S-items)

Maps to ~9 batch tasks across 6 waves. Each S-item is one focused, well-spec'd unit of work.

- **S1.1 — Fact table + unified read endpoint.**
  - DB: `doctor_opd_session_modes` table (PK = `(doctor_id, session_date)`); RLS doctor-owned + service-role bypass; `updated_at` trigger.
  - DB: `doctor_opd_session_mode_changes` audit table (immutable).
  - Backend: `GET /api/v1/opd/session?date=YYYY-MM-DD` — unified endpoint that replaces `/opd/slot-session` + `/opd/queue-session` (old endpoints proxy to it for a release window before removal).
  - Backend: `resolveSessionDayMode(doctor, date)` helper — reads fact, falls back to policy resolver (DL-9).
  - Backfill migration: PD-Q6 strategy.
  - Frontend types: discriminated union `OpdSessionPayload = { mode: 'slot', ... } | { mode: 'queue', ... }`.

- **S1.2 — Read-path conversion (the bug fix half).**
  - Frontend: `OpdTodayClient.tsx` consumes the unified endpoint; renders toolbar/list shape from `response.mode`, not from `doctor_settings.opd_mode`.
  - Backend: `opd-snapshot-service.ts` (patient-side) reads the session-day mode for the appointment's date, not the doctor's current toggle.
  - Backend: `assertSlotJoinAllowedForPatient` reads the session-day mode for the appointment's `appointment_date`, not the doctor's current toggle.
  - **Acceptance:** flipping `doctor_settings.opd_mode` no longer changes the rendering of any existing booking. Past-date visibility bug is gone.

- **S1.3 — Conversion service.**
  - Backend: `convertSessionDayMode(doctorId, date, toMode, correlationId)` — orchestrator. Acquires the PD-Q5 advisory lock, runs the DL-4 algorithm for the chosen direction, writes the session-mode row + audit row, returns a summary `{ affected, overflowed, mode, notification_count }`.
  - Backend: `applyOverflowAssignment(appointments, slotGrid)` — pure helper exposed for unit tests.
  - Tests: per-direction fixture coverage (5 fixture days minimum: empty, all-pending, mixed, queue-larger-than-grid, overflow-only).

- **S1.4 — Conversion preview + confirm UX.**
  - Frontend: `<SessionModeConversionDialog>` — opens from the OPD-tab pill dropdown (DL-12) and from the settings-flip path. Shows preview counts; confirm triggers the S1.3 service; cancel = no-op.
  - Frontend: dialog reused across both surfaces — no duplication.

- **S1.5 — Patient notification dispatch + debounce.**
  - Backend: notification batch table `doctor_opd_pending_mode_notifications (doctor_id, session_date, scheduled_for, payload_json)` — drained by a 60s cron worker.
  - Backend: on conversion completion, upsert a row with `scheduled_for = now() + 5 min`; subsequent flip overwrites `scheduled_for`; net-zero flip deletes the row.
  - Backend: `notifyConversionAffectedPatients(doctorId, date)` — uses the existing patient notification primitive (SMS/IG) with the three DL-6 templates.
  - **Acceptance:** flip-flop within 5 min sends zero notifications; one flip after 5 min sends exactly one notification per affected patient.

- **S1.6 — Mode-scheduling policy + resolver + settings UI (lightweight).**
  - Backend: `resolveModePolicyForDate(doctorId, date) → 'slot' | 'queue'` — implements the DL-9 hierarchy, including array-position overlap disambiguation.
  - Backend: `resolveModePolicyForDateRange(doctorId, from, to) → Record<date, mode>` — bulk variant so the public booking widget's 30-day picker is one call, not 30 (Risk register row 7).
  - Backend: validator for `opd_policies.mode_schedule` JSONB shape (rejects `to`-less ranges per DL-9; allows past-dated rules per PD-Q8).
  - Frontend: `<ModeScheduleEditor>` — default + weekly (7 weekday rows) + range list (drag-to-reorder) + date-override list (drag-to-reorder). Three list-builders, no calendar viz (deferred PD-D3).
  - Frontend: `<TestDateWidget>` inside the editor — a single date input + a live readout *"→ {mode} (from {source})"* that calls `resolveModePolicyForDate` so the doctor can sanity-check rule combinations without leaving the page. Costs one resolver call per keystroke; debounced 300ms.
  - Frontend: PD-Q8 advisory rendered inline on any `date_range_override` or `date_override` whose start is in the past.
  - Backend: public booking widget (booking-controller + slot-selection-service) calls the resolver per target date (DL-16).
  - **Acceptance:** changing `weekly_overrides` doesn't retroactively rewrite a materialised day's mode (DL-10); a new booking on an unmaterialised date lands in the resolver's chosen mode; the test-date widget returns the same mode the actual booking flow lands on.

- **S1.7 — Session-overrun tray + bulk actions.**
  - DB: add `session_overrun_at TIMESTAMPTZ NULL` to `appointments` (or — preferred — recompute on read; decide in the batch task spec).
  - Backend: cron worker / on-demand sweep that flags `pending|confirmed` rows past `session_end + 30 min` as `session_overrun`.
  - Backend: `bulkResolveSessionOverrun(doctorId, date, action, perRowOverrides)` — implements the 5 DL-7 actions.
  - Backend: 24h auto-reschedule fallback worker (DL-8).
  - Frontend: "Needs attention" tray in `OpdTodayClient.tsx` for the chosen date when overrun rows exist. Bulk-action dialog with per-row override grid.
  - **Acceptance:** no `pending|confirmed` row sits past `session_end + 30 min` without being either flagged or resolved.

- **S1.8 — In-page mode-switch shortcut + soft nudge.**
  - Frontend: toolbar mode pill → DL-12 dropdown wiring. Reuses the S1.4 dialog.
  - Frontend: DL-14 advisory line shown when `change_count >= 2`.
  - Telemetry: `opd_session.mode_flipped` event with from/to/affected_count.

- **S1.9 — Polish + cleanup.**
  - Frontend: PD-Q4 telemed warning copy in the conversion dialog.
  - Backend: `/opd/slot-session` + `/opd/queue-session` marked deprecated; `Sunset` header pointing at `/opd/session`.
  - Docs: update `docs/Reference/engineering/architecture/CONTRACTS.md` (patient OPD snapshot) + `docs/Reference/engineering/operations/OPD_SUPPORT_RUNBOOK.md` (overrun handling, conversion semantics).

---

## Acceptance gate (cross-cutting, whole batch)

Before declaring this batch shipped:

- [ ] **Display follows date, not doctor toggle.** Setting `doctor_settings.opd_mode = 'queue'` and viewing a past date that was operating in slot mode shows the slot list (and vice-versa). The "past dates don't show" bug is closed.
- [ ] **Conversion is automatic and lossless (slot→queue) or overflow-honoured (queue→slot).** A test fixture with 25 booked patients on a day with a 20-slot grid, flipped queue → slot, produces 20 regular-grid appointments + 5 overflow appointments with `opd_event_type = 'return_after_completed'`. Zero patient drops.
- [ ] **Notifications debounce.** Programmatic test: flip slot→queue, then queue→slot 90s later → zero notifications sent. Flip slot→queue and wait > 5 min → exactly N notifications sent (one per affected patient).
- [ ] **OPD-tab shortcut.** Doctor on the OPD tab can flip today's mode in ≤ 2 clicks (open pill dropdown → confirm in preview dialog).
- [ ] **Settings policy editor.** Weekly/range/date-override edits persist to `opd_policies.mode_schedule`. New bookings on unmaterialised future dates land in the resolver's mode.
- [ ] **Session-overrun tray.** After `session_end + 30 min`, unseen rows surface in the tray. Doctor's bulk reschedule moves them all to next-available with one notification each. 24h fallback runs if the doctor doesn't act.
- [ ] **Past-date pinning.** Mode dropdown is disabled on past dates with the DL-15 tooltip.
- [ ] **Public booking widget.** Booking flow respects the target-date mode (DL-16). Booking a slot 3 weeks ahead on a weekly-override-queue weekday produces a queue-shape booking, not a slot.
- [ ] **Audit table populated.** Every flip writes one row to `doctor_opd_session_mode_changes`.
- [ ] **Soft nudge after 2+ flips.** The DL-14 advisory line appears in the dropdown on a third flip of the same day.
- [ ] **Type-check + lint.** `pnpm --filter frontend tsc --noEmit` clean. `pnpm --filter backend tsc --noEmit` clean. Lint clean.
- [ ] **Tests.** New unit tests for conversion algorithms (both directions), resolver hierarchy, debounce behaviour, overrun flagging. Existing OPD test suites still pass.
- [ ] **Backwards compatibility.** `plan-opd-slot-hub.md`'s shipped UI (toolbar / filter / list / row actions) survives untouched — only its data source changes (unified endpoint instead of `/slot-session`).
- [ ] **`doctor_settings.opd_mode` column untouched.** Still writable, still read as the default when no `mode_schedule` policy and no fact row exists.

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Conversion runs against a row mid-payment-flow → token minted before payment fails → orphan queue entry | **M** | PD-Q5 advisory lock blocks new bookings during conversion; conversion itself excludes rows in `pending_payment` substates (`status IN ('pending', 'confirmed')` filter remains the gate). Payment webhook retries are idempotent under both modes — confirmed. |
| Notification debounce holds a batch indefinitely if a flip-flop loop is triggered | **L** | Hard ceiling: max 30 min between first flip and notification dispatch, regardless of subsequent flips. After 30 min, the *latest-state* batch dispatches. Implemented as a `created_at + 30 min` floor on the cron query. |
| Backfill mis-classifies a day's historical mode (PD-Q6's "queue if any `opd_queue_entries` row" heuristic) | **L** | The heuristic is correct by construction: `opd_queue_entries` rows are only created in queue mode (`appointment-service.ts` line 421–434), so their presence is a sufficient signal. Spot-check 20 random historical days post-backfill. |
| Mode pill dropdown on a day with 100+ bookings makes the preview dialog slow | **L** | Conversion preview computes counts via the existing snapshot endpoint (already paginated/efficient). The dialog renders aggregates only, never per-row data. Verify with a 200-booking fixture. |
| Queue → slot overflow generates so many overflow rows the doctor can't keep up | **M** | Conversion preview shows the overflow count prominently in red; copy reads *"5 patients will be assigned overflow slots at end of session. They may not be seen if the day runs long."* Doctor sees the cost before committing. DL-7 + DL-8 handle the not-seen case downstream. |
| Multi-session deferral (PD-D1) forces a data-model rewrite later | **L** | The session-day mode table is designed to be a 1:1 special case of a future session-instance table — a future migration adds `session_instance_id` to `appointments` and to `opd_queue_entries`, with the day-level row degrading into a "first session of the day" row. No rewrite, only additions. |
| Public booking widget calls the resolver for every date in a 30-day picker → 30 resolver calls per page load | **L** | Bulk resolver: `resolveModePolicyForDateRange(doctorId, from, to)` returns a map. One backend call per picker render. |
| `doctor_settings.opd_mode` column drifts from `mode_schedule.default_mode` and confuses the resolver | **L** | When a doctor first edits `mode_schedule.default_mode`, the migration mirror also writes `doctor_settings.opd_mode` to match (one-time alignment). After that, `opd_mode` is read-only on the backend; only the resolver consumes it as a tertiary fallback. Lint rule on the controller layer to prevent direct writes. |
| Overrun tray surfaces stale rows from previous sessions that haven't been actioned | **L** | DL-8's 24h fallback closes the tail; the tray scopes to "rows where `session_end + 30 min < now < auto_reschedule_run_at + 7 days`" — drops out of the tray once auto-resolved. |
| Notification copy assumes English + en-IN time format | **L** | The DL-6 templates are stub placeholders for the existing notification primitive, which already handles locale + TZ via the doctor's settings. Wire through the same primitive; no new locale logic. |

---

## Cost estimate (per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../AGENT-EXECUTION-EFFICIENCY-GUIDE.md))

Nine S-items across six waves; **zero Opus tasks** anticipated (no novel security, no PHI columns added, no RLS redesign — every primitive is well-spec'd by precedent). Sonnet 4.6 Medium / Auto is the right tier throughout; Composer 2 is sufficient for the simplest tasks (S1.8 toolbar wiring, S1.9 polish).

**Estimated wall-clock:** ~9–10 dev-days, sequential within each wave (file overlap on `OpdTodayClient.tsx`, `appointment-service.ts`, `opd-policy-service.ts` makes parallel lanes risky for minimal wall-clock win). Multi-session deferral (PD-D1) saves ~3 dev-days vs. the full chat-discussed scope.

**Wave shape (preview — final shape lives in the batch's `EXECUTION-ORDER-*.md`):**

| Wave | S-items | Why grouped |
|---|---|---|
| **1 — Data foundation** | S1.1 + S1.2 | Schema + unified read path + bug fix. Everything downstream depends on this. |
| **2 — Conversion** | S1.3 + S1.4 | Service + UX shipped together; one wins nothing without the other. |
| **3 — Notifications** | S1.5 | Debounce + dispatch + copy. Independent surface. |
| **4 — Policy** | S1.6 | Resolver + lightweight settings UI + booking-widget integration. Independent surface. |
| **5 — Overrun** | S1.7 | Tray + actions + 24h fallback. Builds on S1.3 (reschedule reuses conversion primitives where possible). |
| **6 — Shortcut + polish** | S1.8 + S1.9 | Toolbar pill dropdown + nudge + telemetry + deprecation headers + docs. |

---

## References

- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- [EXECUTION-ORDER-GUIDELINES.md](../EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules for the downstream batch doc.
- [plan-opd-slot-hub.md](./plan-opd-slot-hub.md) — concurrent slot-hub plan. This plan extends its data layer; the UI it ships survives untouched.
- [Daily-plans/March 2026/2026-03-24/OPD modes/opd-systems-plan.md](../Daily-plans/March%202026/2026-03-24/OPD%20modes/opd-systems-plan.md) — the original two-mode product spec.
- [backend/migrations/028_opd_modes.sql](../../backend/migrations/028_opd_modes.sql) — the data foundation this plan reshapes around the session-day fact.
- [backend/src/services/opd/opd-mode-service.ts](../../backend/src/services/opd/opd-mode-service.ts) — current global resolver (will become a fallback inside the new per-date resolver).
- [backend/src/services/opd/opd-policy-service.ts](../../backend/src/services/opd/opd-policy-service.ts) — grace-window helper + `assertSlotJoinAllowedForPatient` (DL-1's third read site).
- [backend/src/services/opd-snapshot-service.ts](../../backend/src/services/opd-snapshot-service.ts) — patient-side snapshot (DL-1's second read site).
- [frontend/components/opd/OpdTodayClient.tsx](../../frontend/components/opd/OpdTodayClient.tsx) — doctor-side hub (DL-1's first read site; DL-11 + DL-12 land here).
- [Reference/engineering/architecture/CONTRACTS.md](../Reference/engineering/architecture/CONTRACTS.md) § Patient OPD session snapshot — to be updated by S1.9 (unified endpoint shape).
- [Reference/engineering/operations/OPD_SUPPORT_RUNBOOK.md](../Reference/engineering/operations/OPD_SUPPORT_RUNBOOK.md) — runbook updates by S1.9 (conversion semantics, overrun handling).

---

**Status:** `Drafted` 2026-05-17.
**Owner:** TBD.
**Promoted to:** _(daily-plans batch TBD — recommended path is a `plan-opd-per-day-mode-batch.md` once this plan is `Committed`)_.
