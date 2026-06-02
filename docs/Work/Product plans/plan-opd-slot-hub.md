# OPD Slot Hub — product plan

> **Source product spec:** [`Daily-plans/March 2026/2026-03-24/OPD modes/opd-systems-plan.md`](../Daily-plans/March%202026/2026-03-24/OPD%20modes/opd-systems-plan.md) §5.1a, §5.1b, §6.2, §6.4. This plan is the **slot-mode operational hub** materialisation of the doctor-side surfaces called out in §6.4 ("Doctor dashboard / staff UI") and the §8.4 engineering scope.
>
> **Predecessor (queue-mode parity):** [`Daily-plans/May 2026/08-05-2026/`](../Daily-plans/May%202026/08-05-2026/) (oq-04..oq-13) shipped the queue-mode operational hub at `/dashboard/opd-today` — the slot-mode branch of the same page is currently a stub. This plan brings slot to parity.
>
> **Locked-in chat:** 2026-05-15 (in-thread).

---

## North star

`/dashboard/opd-today` is the doctor's **session command centre**. In queue mode it already delivers a session toolbar, status-chip filters, search, dense table / mobile cards, polling, and hotkeys. In slot mode it is **a date-picker + a one-card explainer pointing the doctor at `/dashboard/appointments`**. There is no operational data on the page.

After this plan ships, slot mode has the same depth of surface as queue mode, with **slot semantics** (fixed time slots, grace window, paper-time policy, overflow handling) instead of token semantics.

---

## Why this is worth doing now

1. **Doctor-side parity.** A doctor on slot mode opens the OPD hub and sees nothing useful. Today they bounce to `/dashboard/appointments` to see the day's bookings — but that page is a calendar list, not an operations console. They lose the live "who is where in the day" context.
2. **Existing primitives are already there.** Per the source spec (§5.1a/b, §6.2), every slot-mode operation we need already has a backend API, a column on `appointments`, or a settings policy. The shipped per-appointment `<DoctorOpdSlotActions>` covers the same ground but per-row only — there's no session-level surface.
3. **Queue-mode shipped a complete pattern (oq-11/12/13).** Toolbar, filter chips, dense rows, hotkeys, polling, telemetry. Re-using those patterns for slot mode is mostly mounting + status-derivation work, not new architecture.
4. **The slot stub blocks the sidebar-restructure narrative.** [Daily-plans/May 2026/14-05-2026/](../Daily-plans/May%202026/14-05-2026/) renamed the sidebar entry from `OPD queue` → `OPD` because the page already serves both modes. Today, when a slot-mode doctor clicks `OPD`, they get a placeholder. The rename's premise fails until the slot branch has parity.

---

## Decision locks (DL-1 .. DL-12)

These are the product locks for the batch. Re-opening any of them belongs in a new batch, not in mid-execution.

- **DL-1: One hub, two modes.** `/dashboard/opd-today` keeps its current `defaultMode(opd_mode)` branch. Queue mode is unchanged. Slot mode replaces the placeholder card with a full operational surface. **No new route.**
- **DL-2: Slot snapshot endpoint.** New `GET /api/v1/opd/slot-session?date=YYYY-MM-DD`, doctor-only, returns the day's appointments enriched with derived status, position-in-day, delay/early-invite state, and per-status counts. Mirrors the queue-mode `GET /api/v1/opd/queue-session` shape. **No new DB column** — every input field already exists (migrations 029, 030, 031, 036). Status derivation is server-side so chip counts match what the patient sees.
- **DL-3: Slot status vocabulary (8 buckets).** Server-derived from `appointments.status` + `appointments.appointment_date` + `consultation_sessions.status` + grace policy:
  - `upcoming` — `appointment_date` in the future, status `pending|confirmed`.
  - `grace` — within `slot_join_grace_minutes` of `appointment_date`, status `pending|confirmed`, no live consult yet.
  - `running_late` — past `appointment_date + grace_minutes`, status `pending|confirmed`, no live consult yet.
  - `in_consultation` — `consultation_sessions.status = 'live'` for this appointment.
  - `completed` — `appointments.status = 'completed'`.
  - `missed` — `appointments.status = 'no_show'` OR (past `appointment_date + grace_minutes` AND patient never joined AND doctor explicitly marked).
  - `cancelled` — `appointments.status = 'cancelled'`.
  - `overflow` — `appointments.opd_event_type = 'return_after_completed'` OR appointment created after the last originally-booked slot of the session.
- **DL-4: Filter chip vocabulary (6 chips).** `All / Upcoming / Late / In consult / Done / Missed`. `grace` rolls up under `Upcoming` (it's still upcoming, just close); `overflow` rolls up under `Upcoming` if the appt time is in the future, else under whichever derived status applies. `cancelled` is hidden by default (URL-accessible only — same precedent as queue's `skipped`). Keep counts visible on every chip.
- **DL-5: Session toolbar = queue-mode toolbar's slot variant.** Same chrome (date picker + Slot pill + popover buttons + freshness + refresh). Two popovers:
  - **Broadcast delay** — targets the **in-consultation appointment if any, else the next upcoming**. Per-appointment delay write (existing `POST /opd/appointments/:id/session-delay`); UI clarifies "Delay (next/current): Xm" so the doctor knows which slot the delay attaches to. Quick picks 5/10/15/30, custom, clear. Amber treatment when active. Mirrors `BroadcastDelayPopover` from queue toolbar.
  - **Offer early join** — targets the **next pending/confirmed appointment whose preceding slot is `completed`** (per source spec §5.1b: only after A's visit is marked completed). When no eligible target exists, button is disabled with a tooltip explaining why. Mirrors `OfferEarlyJoinPopover` from queue toolbar.
- **DL-6: Slot list = time-ordered dense rows.** First implementation is a single chronological list with a "now" divider, NOT a calendar timeline / hour-rail. Reuses queue mode's `OpdQueueDenseRow` pattern (CSS grid, sticky header, mobile card list under `lg`). The hour-rail visualisation is captured as a follow-up; build the operational parity first.
- **DL-7: Per-row actions = inline overflow menu.** Each row has the existing whole-row click (opens `/dashboard/appointments/[id]`) plus a `⋯` overflow menu with status-aware items:
  - Upcoming/Grace → "Offer early join" (only if it's the next eligible row), "Reschedule" (link to appointment detail).
  - Running late → "Mark no-show", "Send rebook link" (deferred — opens appointment detail for now), "Approve overflow" (deferred — opens add-slot dialog from sl-06).
  - In consult → "Set delay" (opens the same delay popover as the toolbar, pre-targeted at this row).
  - Completed → "Open summary" (just navigates), "Post-consult return" (deferred — opens add-slot dialog with `opd_event_type='return_after_completed'`).
  - Missed → "Reschedule" (link to appointment detail), "Convert to overflow" (deferred to sl-06).
  Mirrors `OpdQueueRowActions` shape. Telemetry follows the same `opd_queue.action` pattern (rename event prefix to `opd_slot.action`).
- **DL-8: Inline expand mirrors queue's `OpdQueueRowExpanded`.** Click chevron on a row → reveals patient brief (allergies, last visit, booking note). High leverage in slot mode because doctors prep before each booked slot. Same lazy-fetch pattern as queue.
- **DL-9: Polling + hotkeys identical to queue.** 30s `setInterval` with `visibilitychange` pause. Hotkeys via the same `useOpdQueueHotkeys` hook (rename to `useOpdHotkeys` later if it survives a refactor — for now reuse in place). J/K row focus, Enter open, S overflow, `/` focus search.
- **DL-10: Grace window default.** 15 minutes (matches the existing `DEFAULT_SLOT_JOIN_GRACE_MINUTES = 15` in `backend/src/services/opd/opd-policy-service.ts`). Per-doctor override already wired via `doctor_settings.opd_policies.slot_join_grace_minutes` (existing `getSlotJoinGraceMinutes()` helper). **No settings UI in this batch** — the override is JSONB-editable for the doctors who care; a settings UI is a follow-up.
- **DL-11: No DB migration.** Every field this batch needs already exists on `appointments` (migrations 029, 030, 031, 036) and `doctor_settings` (migration 028). The slot snapshot is pure projection.
- **DL-12: Calendar view stays parked.** `/dashboard/appointments` keeps its current calendar / list role. The OPD hub stays operations-focused. Calendar-on-the-hub is captured as a follow-up.

---

## Open questions — answered defaults (locked for batch duration)

- **SL-Q1: Default delay scope (per-appointment vs session-wide).** **Per-appointment** — keeps the existing API surface (`POST /opd/appointments/:id/session-delay`) intact. UI surfaces "Delay (next/current): Xm" so the doctor sees which slot it attached to. Session-wide delay (a banner across the whole day) is a follow-up if doctors ask. *Why:* the per-appointment column already exists, the queue mode's toolbar uses the same pattern, and a "session-wide delay" semantic actually requires a different DB column to make sense (delay-on-session, not delay-on-row). Don't refactor data shape mid-batch.
- **SL-Q2: Early-join policy.** **Strict** — only after current slot's appointment is `completed`. Per source spec §5.1b, this avoids the "paper time vs visit end" dispute. A "soft" policy (allow early-invite while current slot still has clock time on paper) is captured as a follow-up.
- **SL-Q3: Grace window default.** **15 min** (matches existing default constant). Per-doctor override already wired in JSONB.
- **SL-Q4: Overflow as first-class chip.** **No** — overflow is a sub-state, not a top-level filter. Render with an `Overflow` badge on the row + sort to the bottom of the list (mirrors queue mode's `Done` / `Missed` sectioning). A dedicated chip is a follow-up if doctors actually filter to it often.
- **SL-Q5: Calendar view inside the hub.** **No** — `/dashboard/appointments` stays the calendar destination. The hub stays operations-focused. A "Calendar tab" inside the hub is a follow-up if/when a doctor asks.
- **SL-Q6: Rename `useOpdQueueHotkeys` → `useOpdHotkeys`?** **Defer.** Rename when more than one mode actually needs the hook in production for ≥ 1 release window. Until then, slot mode imports it under its current name. Captured as a follow-up.
- **SL-Q7: Telemetry event prefix.** **`opd_slot.*`** for slot-specific events (`opd_slot.viewed`, `opd_slot.action`, `opd_slot.filter_changed`). Mirrors queue's `opd_queue.*` so the analytics layer can split mode-by-mode without parsing event payloads.

Decisions explicitly **not** in scope for this batch (deferred):

- **Settings UI for `slot_join_grace_minutes`** — JSONB-editable for now; UI lands when someone asks.
- **Hour-rail / calendar visualisation of the slot day** — operational parity first; visualisation is its own batch.
- **Send-rebook-link inline action** — opens appointment detail in this batch; standalone action is a follow-up.
- **Session-wide delay banner** (vs per-appointment) — requires schema change, defer.
- **`useOpdHotkeys` rename** — captured as SL-Q6 above.
- **Approve-overflow inline action / Convert-to-overflow** — surface lives behind sl-06's add-slot dialog as the catch-all entry point.

---

## High-level scope (S-items, mapped to batch tasks)

The batch tasks (`sl-01..sl-06`) implement these S-items 1:1.

- **S1.1 — Slot session snapshot endpoint.** New `GET /api/v1/opd/slot-session?date=YYYY-MM-DD`. Server-derived status, counts, position-in-day. → `sl-01`.
- **S1.2 — Slot session toolbar.** Mounts on `/dashboard/opd-today` slot branch. Date + Slot pill + Broadcast delay + Offer early join + freshness + refresh. → `sl-02`.
- **S1.3 — Slot status filter chip + search box.** URL-backed filter state (mirrors `useOpdQueueFilters`). 6 chips (DL-4). Free-text search by name/phone/MRN. → `sl-03`.
- **S1.4 — Slot session list + row actions + inline expand.** Time-ordered dense rows with "now" divider. Mobile card list under `lg`. Status-aware overflow menu per row. → `sl-04`.
- **S1.5 — Polling, hotkeys, empty/error/stale states, telemetry.** 30s `setInterval` with visibility-pause. Reuse `useOpdQueueHotkeys`. Empty/error/stale-while-revalidate states matching queue precedent. `opd_slot.*` telemetry events. → `sl-05`.
- **S1.6 — Add-slot / overflow dialog.** Doctor-only dialog that appends an end-of-session overflow appointment with `opd_event_type='return_after_completed'` (or a regular extra slot at HH:MM). Surfaced from the toolbar and from per-row "Approve overflow" / "Convert to overflow" actions. → `sl-06`.

---

## Acceptance gate (cross-cutting, whole batch)

Before declaring this batch shipped:

- [ ] `/dashboard/opd-today` for a doctor with `opd_mode = 'slot'` renders **the operational surface** (toolbar + filter strip + list), not the placeholder card.
- [ ] `GET /api/v1/opd/slot-session?date=YYYY-MM-DD` returns the day's appointments with derived `slotStatus` ∈ {`upcoming`, `grace`, `running_late`, `in_consultation`, `completed`, `missed`, `cancelled`, `overflow`} and per-status counts. Doctor-only auth gate. PHI passes through (doctor-scoped, same precedent as queue snapshot).
- [ ] **Toolbar.** Date picker + Slot pill + Broadcast delay popover + Offer early join popover + freshness + refresh. Delay popover targets in-consultation slot if any, else next upcoming. Early-join popover targets next pending/confirmed appointment whose preceding slot is `completed`; disabled with tooltip when no target.
- [ ] **Filter strip.** 6 chips (`All / Upcoming / Late / In consult / Done / Missed`) with live counts. URL-backed (`?status=…&q=…`). Search box matches name/phone/MRN/reason.
- [ ] **List.** Time-ordered chronological rows with a "now" divider. Each row shows time, patient name, age/sex, MRN, phone, status pill, reason, modality icon. Status-specific row treatments (amber for late, green for completed, red for missed, primary for in-consult). `Overflow` badge on overflow rows. Inline expand (chevron) reveals allergies + last visit + booking note. Mobile card list under `lg`.
- [ ] **Row actions.** `⋯` overflow menu with status-aware items per DL-7. Whole-row click opens `/dashboard/appointments/[id]`.
- [ ] **Polling + hotkeys.** 30s poll with visibility-pause. `J`/`K` row focus, `Enter` open, `S` overflow, `/` focus search. Stale-while-revalidate error banner when refresh fails.
- [ ] **Empty / error states.** "No slots booked today" with link to add appointment / open availability. Day-complete summary when every row is `completed`. Stale-while-revalidate banner.
- [ ] **Telemetry.** `opd_slot.viewed` fires once per session load with PHI-free counts. `opd_slot.action` fires on every overflow-menu invocation. `opd_slot.filter_changed` fires on chip / search change.
- [ ] **Backwards compatibility.** Queue-mode behaviour at `/dashboard/opd-today` is **byte-identical** to before this batch. Per-appointment `<DoctorOpdSlotActions>` on `/dashboard/appointments/[id]` is unchanged.
- [ ] **Type-check + lint.** `pnpm --filter frontend tsc --noEmit` clean. `pnpm --filter backend tsc --noEmit` clean. Lint clean.
- [ ] **Tests.** New unit tests for the snapshot service status-derivation logic. New tests for the slot filter chip + search hook. Existing queue-mode tests still pass.
- [ ] **No DB migration in the batch** — DL-11 holds.

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Slot status derivation diverges between client and server, leading to chip-count drift | **M** | Single source of truth: server derives `slotStatus` and counts; client renders. No client-side re-derivation. Unit-test the derivation function with fixture appointments per status. |
| `opd_session_delay_minutes` lives on `appointments` (per-row), not on the session — toolbar's "session delay" is a per-appointment write under the hood | **M** | UI copy makes the per-appointment scope explicit ("Delay (next/current): Xm"). Locked as SL-Q1 above. Session-wide delay column is a follow-up; this batch ships the per-appointment shape. |
| Early-join's "preceding slot completed" rule misfires when slots are non-contiguous (e.g., 09:00 then 09:30 with a gap) | **L** | Definition: "preceding slot" = the most recent slot whose `appointment_date < target.appointment_date`. Empty preceding slot (no appointment) ⇒ early-join eligible. Tested with fixture days. |
| Adding overflow rows mid-session reorders the rendered list and disorients the doctor | **L** | Overflow rows always sort to the bottom under their own visual group (matches queue's `Done` / `Missed` sectioning). The list scroll position is preserved across re-renders (use `entryId` as React keys). |
| Mounting `OpdSlotSessionToolbar` next to the existing `OpdQueueSessionToolbar` causes drift over time as the queue toolbar evolves | **L** | sl-02 extracts the popovers (`BroadcastDelayPopover`, `OfferEarlyJoinPopover`) into shared modules under `frontend/components/opd/shared/` and both toolbars consume them. Spec lists the extraction. |
| Reusing `useOpdQueueHotkeys` across modes blurs naming | **L** | Captured as SL-Q6 (defer rename). The hook's behaviour is identical for slot mode; only the entries' shape differs (use a generic `OpdRow` interface or pass-through `unknown[]`). |
| Polling 30s on top of the queue mode's existing 30s poll doubles dashboard request rate when both are on the same page | **N/A** | The two modes are mutually exclusive at runtime — `OpdTodayClient` switches between branches, never mounts both. No additive request load. |
| `consultation_sessions.status === 'live'` joins add a per-row query | **L** | Single batched `.in()` query mirroring how `opd-doctor-service.ts` already joins `appointments`. O(3) total queries per snapshot, not O(N). |
| Status-derivation needs the doctor's clock to compute "now" — server clock vs client clock skew | **L** | Server derives `slotStatus` against UTC `Date.now()`; payload includes the snapshot timestamp; client can re-derive locally for the "now" divider only (visual cue, not status). |

---

## Cost estimate (per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../AGENT-EXECUTION-EFFICIENCY-GUIDE.md))

Six tasks across three waves; **no Opus tasks**. Each task is well-spec'd with file pre-loads, prior-art references (the queue-mode predecessors), and deterministic verifications (`tsc` / `rg` / `curl` / unit tests). Sonnet 4.6 Medium is the right tier throughout. Composer 2 is sufficient for the optional sl-06 polish if you want the cheapest possible execution on a low-judgement task.

**Estimated wall-clock:** ~14h (~2 dev-days), single sequential lane per wave, no parallelism credit assumed (multiple lanes are not justified per [EXECUTION-ORDER-GUIDELINES § 7](../EXECUTION-ORDER-GUIDELINES.md) — file overlap on `OpdTodayClient.tsx` between sl-02..sl-05 makes parallelism risky for negligible wall-clock win).

---

## References

- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- [EXECUTION-ORDER-GUIDELINES.md](../EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used by the batch's exec-order doc.
- [Daily-plans/March 2026/2026-03-24/OPD modes/opd-systems-plan.md](../Daily-plans/March%202026/2026-03-24/OPD%20modes/opd-systems-plan.md) — source product spec, §5.1a / §5.1b / §6.2 / §6.4 / §8.4 ground every decision lock above.
- [Daily-plans/March 2026/2026-03-24/OPD modes/e-task-opd-06-frontend-doctor-dashboard-opd-controls.md](../Daily-plans/March%202026/2026-03-24/OPD%20modes/e-task-opd-06-frontend-doctor-dashboard-opd-controls.md) — original per-appointment slot controls (`<DoctorOpdSlotActions>`); preserved.
- [Daily-plans/May 2026/08-05-2026/](../Daily-plans/May%202026/08-05-2026/) — queue-mode operational hub batch (oq-04..oq-13). All UI patterns reused by this plan come from there.
- [Daily-plans/May 2026/14-05-2026/sidebar-restructure/](../Daily-plans/May%202026/14-05-2026/sidebar-restructure/) — recent batch that renamed `OPD queue` → `OPD`, motivating slot-mode parity.
- [Reference/engineering/architecture/CONTRACTS.md](../Reference/engineering/architecture/CONTRACTS.md) § Patient OPD session snapshot — the patient-facing snapshot precedent that this plan mirrors for the doctor side.
- [Reference/engineering/operations/OPD_SUPPORT_RUNBOOK.md](../Reference/engineering/operations/OPD_SUPPORT_RUNBOOK.md) — grace / overflow / no-show policy reference.

---

**Status:** `Drafted` 2026-05-15.
**Owner:** TBD.
