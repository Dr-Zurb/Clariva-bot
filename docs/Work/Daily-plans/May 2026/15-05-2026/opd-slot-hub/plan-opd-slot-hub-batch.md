# OPD Slot Hub — 15 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) TL;DR rule #1: **plan with Opus, execute with Auto, polish with Composer**. Fresh chat per task, deterministic verifications. **Auto** is the default for sl-01..sl-05 (well-spec'd execution work; draws from the cheaper Auto+Composer pool); **Composer 2 Fast** for sl-06 (form-and-API plumbing). **Zero Opus tasks** — none of the 6 tasks hit the hard-rules list (no `auth.uid()` change, RLS, PHI columns, migration, or audit-log path). The optional batch close-gate review (one fresh Opus chat after sl-05 ships) is the only Opus turn budgeted.
>
> **Source plan:** [`Product plans/plan-opd-slot-hub.md`](../../../Product%20plans/plan-opd-slot-hub.md). Decision locks `DL-1..DL-12` and items `S1.1..S1.6` originate there.
>
> **Upstream OPD modes spec:** [`Daily-plans/March 2026/2026-03-24/OPD modes/opd-systems-plan.md`](../../../March%202026/2026-03-24/OPD%20modes/opd-systems-plan.md) §5.1a, §5.1b, §6.2, §6.4, §8.4.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-opd-slot-hub.md`](./Tasks/EXECUTION-ORDER-opd-slot-hub.md).

---

## Why this batch

After yesterday's [sidebar-restructure](../../14-05-2026/sidebar-restructure/) renamed `OPD queue` → `OPD`, the slot-mode branch of `/dashboard/opd-today` ([`OpdTodayClient.tsx`](../../../../../frontend/components/opd/OpdTodayClient.tsx) lines 437–486) is a one-card placeholder pointing the doctor at `/dashboard/appointments`. Three concrete gaps:

1. **No operational data on the page in slot mode.** Today the doctor sees a date picker + "Slot" pill + a tip card. The queue branch has a session toolbar, status chips, dense table, polling, hotkeys, mobile cards.
2. **All slot primitives already exist** — `appointments.opd_session_delay_minutes` (mig 030), `opd_early_invite_*` (mig 029), `opd_event_type` (mig 031), `slot_join_grace_minutes` policy (mig 028), and per-appointment APIs. The work is **mounting + status-derivation**, not new architecture.
3. **The per-appointment `<DoctorOpdSlotActions>` component on `/dashboard/appointments/[id]` (`frontend/components/opd/DoctorOpdSlotActions.tsx`) covers the same actions per-row.** Doctors have to navigate appointment-by-appointment to use them; there's no session-level surface.

This batch closes the gap with **6 tasks across 3 waves**, ~14h wall-clock, single-lane sequential per wave, **zero DB migrations**, **zero Opus tasks**.

- **Backend:** new `GET /api/v1/opd/slot-session?date=YYYY-MM-DD` endpoint that returns the day's appointments enriched with derived `slotStatus` ∈ {`upcoming`, `grace`, `running_late`, `in_consultation`, `completed`, `missed`, `cancelled`, `overflow`} + per-status counts.
- **Frontend hub UI:** mounts under the existing slot-mode branch in `OpdTodayClient.tsx`. Toolbar (broadcast delay + offer early join + freshness + add-slot), status filter chips + search, chronological dense-row list with a "now" divider + status-aware overflow actions + inline expand, polling + hotkeys + telemetry.
- **Polish:** end-of-session overflow / extra-slot dialog wired into the toolbar and into per-row "Approve overflow" / "Convert to overflow" actions (sl-06, optional).

---

## Decision lock (copied from source plan, frozen for batch duration)

These match `DL-1..DL-12` in [`plan-opd-slot-hub.md`](../../../Product%20plans/plan-opd-slot-hub.md). Re-opening any of them belongs in a new batch.

- **DL-1: One hub, two modes.** No new route.
- **DL-2: Slot snapshot endpoint.** New `GET /api/v1/opd/slot-session?date=YYYY-MM-DD`. Mirrors queue-mode `/opd/queue-session`. **No DB migration.**
- **DL-3: Slot status vocabulary (8 buckets).** Server-derived from `appointments.status` + `appointment_date` + `consultation_sessions.status` + grace policy. See product plan §DL-3 for the exact derivation rules.
- **DL-4: Filter chip vocabulary (6 chips).** `All / Upcoming / Late / In consult / Done / Missed`. `grace` rolls into `Upcoming`; `cancelled` URL-only (mirrors queue's `skipped`).
- **DL-5: Toolbar = queue-mode toolbar's slot variant.** Same chrome. Two popovers: broadcast delay (next/current target), offer early join (next eligible whose preceding slot is `completed` per source spec §5.1b).
- **DL-6: List = time-ordered dense rows.** First implementation is a chronological list with a "now" divider, NOT a calendar timeline. Reuses queue mode's `OpdQueueDenseRow` pattern. Mobile card list under `lg`.
- **DL-7: Row actions = inline overflow menu.** Status-aware items per row. Whole-row click opens appointment detail. Mirrors `OpdQueueRowActions`.
- **DL-8: Inline expand mirrors `OpdQueueRowExpanded`.** Patient brief (allergies, last visit, booking note). Lazy-fetch.
- **DL-9: Polling + hotkeys identical to queue.** 30s poll with `visibilitychange` pause. Reuse `useOpdQueueHotkeys`.
- **DL-10: Grace window default = 15 min.** Per-doctor override via existing `doctor_settings.opd_policies.slot_join_grace_minutes` JSONB. **No settings UI in this batch.**
- **DL-11: No DB migration.** Every field exists.
- **DL-12: Calendar view stays parked.** `/dashboard/appointments` keeps the calendar role.

Open-question defaults locked in chat 2026-05-15:

- **SL-Q1: Per-appointment delay scope (not session-wide).** Locked.
- **SL-Q2: Strict early-join policy.** Only after current slot's appointment is `completed`. Locked.
- **SL-Q3: Grace window default 15 min.** Locked.
- **SL-Q4: Overflow as a sub-state badge, not a chip.** Locked.
- **SL-Q5: Calendar view out of scope.** Locked.
- **SL-Q6: `useOpdQueueHotkeys` rename deferred.** Reuse in place.
- **SL-Q7: `opd_slot.*` telemetry event prefix.** Locked.

Decisions explicitly **not** in scope for this batch (deferred):

- **Settings UI for `slot_join_grace_minutes`** — JSONB-editable for now.
- **Hour-rail / calendar visualisation of the slot day** — operational parity first.
- **Send-rebook-link inline action** — opens appointment detail in this batch; standalone action is a follow-up.
- **Session-wide delay banner** (vs per-appointment) — requires schema change, defer.
- **`useOpdHotkeys` rename** — defer until ≥ 1 release window of confirmed cross-mode use.

---

## Phases

### Wave 1 — Backend foundation (1 task, ~4h, single sequential lane)

The dependency cliff per [EXECUTION-ORDER-GUIDELINES § 0.5 Cut 1](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves). Until the snapshot endpoint exists, the frontend hub UI has nothing to render.

- [`task-sl-01-slot-session-snapshot-backend.md`](./Tasks/task-sl-01-slot-session-snapshot-backend.md) — M — New service function `listDoctorSlotSession()` in `backend/src/services/opd-doctor-service.ts` (or a new `opd-slot-session-service.ts`). New route `GET /opd/slot-session` in `backend/src/routes/api/v1/opd.ts`. New controller handler. Server-derives `slotStatus` per DL-3 (8 buckets) using `appointments` + `consultation_sessions` + `getSlotJoinGraceMinutes()` policy. Returns counts. **3 batched queries** (mirrors `listDoctorQueueSession`'s O(1) shape). Unit tests for the derivation function. New API helper `getDoctorOpdSlotSession` in `frontend/lib/api.ts` and types in `frontend/types/opd-doctor.ts`.

### Wave 2 — Hub UI (4 tasks, ~9h, single sequential lane)

The artifact change per Cut 2: after this wave, `/dashboard/opd-today` for a slot-mode doctor renders an operational surface, not a placeholder card. **All four tasks modify the same `OpdTodayClient.tsx` slot-mode branch sequentially**, so they're a single sequential lane (file overlap forbids parallelism per the lane rule).

- [`task-sl-02-slot-session-toolbar.md`](./Tasks/task-sl-02-slot-session-toolbar.md) — M — New `frontend/components/opd/OpdSlotSessionToolbar.tsx` mirroring `OpdQueueSessionToolbar.tsx`. **Extracts** `BroadcastDelayPopover` and `OfferEarlyJoinPopover` from the queue toolbar into shared modules under `frontend/components/opd/shared/` so both toolbars consume them (prevents drift). Slot-specific resolvers: delay targets in-consultation appointment if any, else next upcoming; early-join targets next pending/confirmed whose preceding slot is `completed`. Mounts under the slot branch of `OpdTodayClient.tsx`, replacing the placeholder card's date-picker band.
- [`task-sl-03-slot-status-filter-and-search.md`](./Tasks/task-sl-03-slot-status-filter-and-search.md) — S — New `OpdSlotStatusFilter` chip component (6 chips per DL-4, count-bearing, URL-backed via the same `useOpdQueueFilters` hook — extend its status union with `running_late`, `cancelled`). Reuses `OpdQueueSearchBox` as-is. Mounts under the slot branch of `OpdTodayClient.tsx` in the sticky filter strip slot.
- [`task-sl-04-slot-session-list-and-row-actions.md`](./Tasks/task-sl-04-slot-session-list-and-row-actions.md) — M — New `OpdSlotList.tsx` (dense rows, "now" divider, status-aware row treatments, sectioning: Active / Done / Missed / Overflow), new `OpdSlotMobileList.tsx` (card list under `lg`), new `OpdSlotRowActions.tsx` (status-aware overflow menu per DL-7), new `OpdSlotRowExpanded.tsx` (inline expand mirroring `OpdQueueRowExpanded`). Reuses `OpdQueueGrid.ts` constants (slot list shares the same 13-column template; column meanings adjust slightly — `Time` column shows `HH:mm` from `appointment_date` instead of token number). Mounts under the slot branch of `OpdTodayClient.tsx`, replacing the placeholder card's body.
- [`task-sl-05-polling-hotkeys-empty-states.md`](./Tasks/task-sl-05-polling-hotkeys-empty-states.md) — S — Wires the slot branch's polling (30s `setInterval` + visibility-pause, mirroring queue's pattern), reuses `useOpdQueueHotkeys` (J/K/Enter/S/`/`), adds slot-specific empty / error / stale-while-revalidate states (`getOpdSlotEmptyState` mirroring queue's `getOpdQueueEmptyState`), wires `opd_slot.*` telemetry events (`opd_slot.viewed`, `opd_slot.action`, `opd_slot.filter_changed`, `opd_slot.row_clicked`). Adds the cross-cutting acceptance gate verification at the end of the wave.

### Wave 3 — Add-slot / overflow dialog (1 task, ~1.5h, single sequential lane, optional)

Cut 3 — kind-of-work change. This wave is incremental polish that extends an already-shipped surface; it can land same-day-as-Wave-2 or a few days later without blocking the rest.

- [`task-sl-06-add-slot-overflow-dialog.md`](./Tasks/task-sl-06-add-slot-overflow-dialog.md) — S — New `AddSlotDialog.tsx` triggered from the toolbar's "Add slot" button and from per-row "Approve overflow" (Late status) and "Convert to overflow" (Missed status) actions. Two modes: append end-of-session overflow appointment with `opd_event_type='return_after_completed'`, OR add a regular extra slot at HH:MM. POSTs to existing `/api/v1/appointments` (no new endpoint). On success: snapshot refetches, the new row appears under the `Overflow` section.

---

## Cross-cutting acceptance gate (whole batch)

Before declaring this batch shipped, all of the following must be true:

- [ ] **`/dashboard/opd-today` for a doctor with `opd_mode = 'slot'` renders the operational surface** — toolbar + filter strip + list. The placeholder card (`<h2>Slot mode</h2>` + "go to appointments") is **gone**.
- [ ] **Backend snapshot.** `GET /api/v1/opd/slot-session?date=YYYY-MM-DD` returns `{ entries: SlotSessionRow[], counts: {...}, snapshotAt: ISO }` with derived `slotStatus` per DL-3. Doctor-only auth gate. Unauthenticated → 401. Cross-doctor probe → 200 with empty entries (RLS / ownership filter).
- [ ] **Toolbar.** Date picker + Slot pill + Broadcast delay popover + Offer early join popover + freshness ("Last updated Xs ago") + manual refresh + Add-slot button (when sl-06 lands). Delay popover targets in-consultation slot if any, else next upcoming, else disabled with tooltip. Early-join popover targets the next pending/confirmed appointment whose preceding slot is `completed`; disabled with tooltip when no eligible target.
- [ ] **Shared popovers.** `BroadcastDelayPopover` and `OfferEarlyJoinPopover` live under `frontend/components/opd/shared/` and are imported by **both** `OpdQueueSessionToolbar` and `OpdSlotSessionToolbar`. `rg "BroadcastDelayPopover\|OfferEarlyJoinPopover" frontend/components/opd/OpdQueueSessionToolbar.tsx` returns import statements only — no inline definitions.
- [ ] **Filter strip.** 6 chips (`All / Upcoming / Late / In consult / Done / Missed`) with live counts. URL-backed (`?status=…&q=…`). Search box matches name / phone / MRN / reason.
- [ ] **List.** Time-ordered chronological rows with a "now" divider at the doctor's local clock-now position. Each row shows `HH:mm` (start time), patient name, age/sex, MRN, phone, status pill, reason, modality icon. Status-specific row treatments: amber for `running_late`, green for `completed`, red for `missed`, primary for `in_consultation`, neutral for `upcoming`/`grace`. `Overflow` badge on overflow rows; overflow rows always sort to the bottom under the `Overflow` section. Inline expand (chevron) reveals allergies + last visit + booking note. Mobile card list under `lg`.
- [ ] **Row actions.** `⋯` overflow menu with status-aware items per DL-7. Whole-row click opens `/dashboard/appointments/[id]`. Telemetry `opd_slot.row_clicked` fires on row click; `opd_slot.action` fires on every overflow-menu invocation.
- [ ] **Polling + hotkeys.** 30s `setInterval` with `visibilitychange` pause. `J`/`K` row focus, `Enter` open, `S` opens overflow for focused row, `/` focuses search. Stale-while-revalidate error banner when refresh fails (last-good entries stay visible).
- [ ] **Empty / error states.** "No slots booked today" with link to add appointment / open availability. Day-complete summary when every row is `completed`. Stale-while-revalidate banner when refresh fails. Mode-loading skeleton matches the queue branch's pattern.
- [ ] **Telemetry.** `opd_slot.viewed` fires once per session load with PHI-free counts (mirrors `opd_queue.viewed`). `opd_slot.action`, `opd_slot.filter_changed`, `opd_slot.row_clicked` fire as appropriate.
- [ ] **Backwards compatibility.** Queue-mode behaviour at `/dashboard/opd-today` is **byte-identical** to before this batch. Per-appointment `<DoctorOpdSlotActions>` on `/dashboard/appointments/[id]` is unchanged.
- [ ] **Type-check + lint.** `pnpm --filter frontend tsc --noEmit` clean. `pnpm --filter backend tsc --noEmit` clean. `pnpm --filter frontend lint` clean. `pnpm --filter backend lint` clean.
- [ ] **Tests.** New unit tests for `slot-session-service.ts` `deriveSlotStatus()` (one fixture per status bucket). New tests for `OpdSlotStatusFilter` count rendering + URL sync. Existing queue-mode tests still pass.
- [ ] **No DB migration.** `git status backend/migrations/` has no new files belonging to this batch. (DL-11.)
- [ ] **`rg "<DoctorOpdSlotActions>" frontend/` returns one match** — the existing per-appointment usage in `frontend/app/dashboard/appointments/[id]/page.tsx`. The component is **not** mounted on the OPD hub.
- [ ] **No regression in any existing test suite.** All `*.test.tsx` and `e2e/` specs that touch `OpdTodayClient`, `OpdQueueSessionToolbar`, `OpdQueueTable`, `OpdQueueDenseRow`, or `appointments` routes still pass. The queue branch's behaviour is preserved.

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Slot status derivation diverges between client and server, leading to chip-count drift | **M** | Single source of truth: server derives `slotStatus` and counts; client renders. No client-side re-derivation. sl-01 ships unit tests covering one fixture per status bucket. sl-03's chip count reads `counts` from the snapshot payload, not from the client-side filter pass. |
| `opd_session_delay_minutes` is per-row but the toolbar UX implies session-wide | **M** | UI copy is explicit: "Delay (next/current): Xm" and the popover surface lists the target appointment by name + token. SL-Q1 locked. Future session-wide column is a separate batch. |
| Early-join's "preceding slot completed" rule misfires when slots are non-contiguous (gaps in the day) | **L** | sl-01 spec defines "preceding slot" = the most recent slot whose `appointment_date < target.appointment_date`. Empty preceding slot ⇒ early-join eligible. Tested with fixture days with gaps. |
| Adding overflow rows mid-session reorders the rendered list and disorients the doctor | **L** | sl-04 sorts overflow rows under the `Overflow` section at the bottom; React keys are `entryId`-stable. Scroll position is preserved across re-renders by avoiding remounts of the list. |
| Mounting `OpdSlotSessionToolbar` next to the existing `OpdQueueSessionToolbar` causes drift over time as the queue toolbar evolves | **M** | sl-02 extracts the popovers (`BroadcastDelayPopover`, `OfferEarlyJoinPopover`) into shared modules under `frontend/components/opd/shared/`. Both toolbars import from there. The acceptance gate explicitly checks for the import (no inline copies). |
| Reusing `useOpdQueueHotkeys` across modes blurs naming | **L** | SL-Q6 — defer the rename. Both modes import the hook under its current name; the hook's behaviour is identical for slot mode. |
| Polling 30s on top of the queue mode's existing 30s poll doubles dashboard request rate when both are on the same page | **N/A** | The two modes are mutually exclusive at runtime — `OpdTodayClient` switches between branches, never mounts both. |
| `consultation_sessions.status === 'live'` joins add a per-row query | **L** | Single batched `.in()` query mirroring how `opd-doctor-service.ts` already joins `appointments`. O(3) total queries per snapshot, not O(N). sl-01 spec details the exact query. |
| Status-derivation needs the doctor's clock to compute "now" — server clock vs client clock skew | **L** | Server derives `slotStatus` against UTC `Date.now()`; the snapshot payload includes `snapshotAt`. Client uses `snapshotAt` for the "now" divider visual cue (re-deriving `slotStatus` would risk drift). |
| The slot-mode branch's "mode pill" already says "Slot" — adding the toolbar might double-render the pill | **L** | sl-02 spec replaces the existing 50-line slot-mode placeholder branch wholesale (lines 437–486 of `OpdTodayClient.tsx`). The pill is owned by the new toolbar, not the parent branch. |
| Existing queue tests assert specific `OpdQueueSessionToolbar` internals that move to `shared/` | **L** | sl-02 spec requires the queue-mode toolbar to keep its public props + behaviour identical (only the popover internals move to `shared/`). Snapshot test regen is expected; visually diff to confirm only the import-path change. |

---

## Cost estimate

Expected model-mix per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Pool drawn from | Tokens (rough) |
|---|---|---|---|---|---|---|
| Wave 1 | sl-01 | 1/1 | 0/1 | 0/1 | Auto+Composer pool | ~50k in / ~40k out |
| Wave 2 | sl-02 → sl-03 → sl-04 → sl-05 | 4/4 | 0/4 | 0/4 | Auto+Composer pool | ~200k in / ~140k out |
| Wave 3 | sl-06 | 0/1 (or 1/1) | 1/1 (or 0/1) | 0/1 | Auto+Composer pool | ~30k in / ~25k out |
| **Total** | **6** | **5–6** | **0–1** | **0** | **Auto+Composer pool only** | **~280k in / ~205k out** |

**Pool note:** every task draws from the **Auto+Composer pool** (cheaper than the $20/mo API pool used by manual Sonnet / Premium / MAX). Per the guide § "Auto vs Premium vs picking a model": Auto's flat rates ($1.25 input / $6.00 output per M tokens, $0.25 cache read) and Composer 2's even cheaper rates ($0.50 / $2.50 per M) keep the entire batch off the API pool.

**Zero Opus tasks.** The visible diff is medium-sized (~1100 LOC across 8–10 new/modified files), but the spec is tight (queue-mode predecessors are the prior art for almost every UI piece), and every task has deterministic verification (`tsc` / `lint` / `rg` / `curl` / unit tests). Per the Opus cap (≤ 1 per wave, ≤ 2 per batch), this batch deliberately runs at the bottom of the cost band — Opus would be wasted on tasks whose hardest decision is "which import path to use".

**Optional close-gate Opus turn.** Per the guide's Pattern A.4: after sl-05 ships, you may open **one** fresh Opus 4.7 Extra High chat with the full Wave 1 + Wave 2 diff and ask it to grade against the cross-cutting acceptance gate. This is the **only** Opus turn budgeted for the entire batch, and it's optional — skip if the deterministic gates (`tsc` / `lint` / `test` / `rg` / `curl` / browser smoke) all pass cleanly.

**Per-message escalation safety net.** If Auto stalls on a single message during any of sl-01..sl-05 (asks the same clarifying question twice, or ships code that fails type-check on a non-obvious error), escalate that **one message** to Opus 4.7 Extra High via the per-message picker. Don't switch the whole chat — the rest of the work stays in the cheap pool.

This is parity work. The cost should match.

---

## Release plan

```
Wave 1 (sl-01)
  │   └─ feature/opd-slot-hub-backend
  ▼
Wave 2 (sl-02 → sl-03 → sl-04 → sl-05)
  │   └─ feature/opd-slot-hub-frontend (stacks on Wave 1 if not yet merged)
  ▼
Wave 3 (sl-06) — optional, can ship same-day or N+1
  │   └─ feature/opd-slot-hub-overflow-dialog (stacks on Wave 2 if not yet merged)
  ▼
PR landing
  │
  ▼
Visual smoke in prod within hours of merge
```

**Why three branches and not one big PR?** Wave 1 is purely additive backend — no frontend consumer yet, so it's safe to ship alone. Wave 2 lights up the UI; it's the visible diff and warrants its own reviewer attention. Wave 3 is incremental polish; if the dialog UX needs another iteration, the rest of the batch is already in prod.

**Rollback story:**

- **Bad backend snapshot derivation** — `git revert` the Wave 1 commit. The frontend slot branch falls back to "no data → empty state" (sl-05's stale-while-revalidate banner kicks in on the first failed request). The queue branch is untouched.
- **Bad frontend hub** — `git revert` the Wave 2 commit. The slot branch reverts to the placeholder card (current behaviour). Doctors lose nothing they had this morning.
- **Bad overflow dialog** — `git revert` the Wave 3 commit. The "Add slot" button disappears from the toolbar; per-row "Approve overflow" / "Convert to overflow" actions disappear. Everything else still works.

No release-window pause needed. The batch is isolated to slot-mode UX; cross-batch risk is near zero (queue mode untouched, per-appointment slot actions untouched).

---

## References

- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- [EXECUTION-ORDER-GUIDELINES.md](../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used for the exec-order doc.
- [Product plans/plan-opd-slot-hub.md](../../../Product%20plans/plan-opd-slot-hub.md) — source product plan, decision locks DL-1..DL-12, open-question lock SL-Q1..Q7.
- [Daily-plans/March 2026/2026-03-24/OPD modes/opd-systems-plan.md](../../../March%202026/2026-03-24/OPD%20modes/opd-systems-plan.md) — upstream OPD modes spec, §5.1a / §5.1b / §6.2 / §6.4 / §8.4 ground every decision lock above.
- [Daily-plans/March 2026/2026-03-24/OPD modes/e-task-opd-06-frontend-doctor-dashboard-opd-controls.md](../../../March%202026/2026-03-24/OPD%20modes/e-task-opd-06-frontend-doctor-dashboard-opd-controls.md) — original per-appointment slot controls (`<DoctorOpdSlotActions>`); preserved unchanged by this batch.
- Style precedent: [Daily-plans/May 2026/14-05-2026/sidebar-restructure/plan-sidebar-restructure-batch.md](../../14-05-2026/sidebar-restructure/plan-sidebar-restructure-batch.md) — same shape, same convention.
- Queue-mode prior art (the patterns we re-use):
  - `frontend/components/opd/OpdTodayClient.tsx` — the page-level shell (slot branch is what this batch fills out).
  - `frontend/components/opd/OpdQueueSessionToolbar.tsx` — toolbar precedent.
  - `frontend/components/opd/OpdQueueStatusFilter.tsx` — filter chip precedent.
  - `frontend/components/opd/OpdQueueTable.tsx`, `OpdQueueDenseRow.tsx`, `OpdQueueGrid.ts` — table precedent.
  - `frontend/components/opd/OpdQueueRowActions.tsx`, `OpdQueueRowExpanded.tsx` — row actions + expand precedent.
  - `frontend/components/opd/OpdQueueMobileList.tsx`, `OpdQueueMobileCard.tsx` — mobile list precedent.
  - `frontend/components/opd/opdQueueEmptyState.ts`, `opdQueueMatcher.ts`, `opdQueueTelemetry.ts` — empty-state, search-match, telemetry helpers.
  - `frontend/hooks/useOpdQueueFilters.ts`, `useOpdQueueGrouping.ts`, `useOpdQueueHotkeys.ts` — URL filter, grouping, and hotkey hooks.
  - `backend/src/services/opd-doctor-service.ts` — the queue-mode session service (`listDoctorQueueSession`); sl-01 mirrors its query budget shape.
  - `backend/src/routes/api/v1/opd.ts` — the OPD route file (sl-01 adds one route).
  - `backend/src/services/opd/opd-policy-service.ts` — `getSlotJoinGraceMinutes()` helper used by sl-01.

---

**Status:** `Drafted` 2026-05-15.
**Owner:** TBD.
