# OPD Slot Hub — execution order

> Sibling document of [`plan-opd-slot-hub-batch.md`](../plan-opd-slot-hub-batch.md). The plan covers *what* and *why*; this doc covers *who-runs-what-when* and *which model*.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
**Execution playbook:** [EXECUTION-ORDER-GUIDELINES.md §13.5 — Operating playbook](../../../../../EXECUTION-ORDER-GUIDELINES.md#135-operating-playbook-how-to-execute-a-batch-from-these-docs)
**Planning rules used:** [EXECUTION-ORDER-GUIDELINES.md §0 (lane rule) + §0.5 (wave cuts)](../../../../../EXECUTION-ORDER-GUIDELINES.md)

---

## Wave plan (3 waves, all single-lane sequential)

> **Why all single-lane?** Per the lane rule (§0), a lane is a strictly sequential chain; multiple lanes exist only when their tasks are fully independent for the entire wave AND each lane's wall-clock is ≥ 1 hour (§7). This batch fails the independence test in two places: (a) sl-02 / sl-03 / sl-04 / sl-05 all modify the same slot-mode branch of `OpdTodayClient.tsx` (lines 437–486 today), making file overlap unavoidable; (b) every UI task consumes sl-01's snapshot output, so they form a single dependency chain. Single-lane sequential everywhere.
>
> **Why 3 waves?** Cut 1 (Dependency cliff, §0.5): sl-01 lands the snapshot endpoint that everything downstream needs. Cut 2 (Artifact change): after sl-05, `/dashboard/opd-today` for slot-mode doctors renders the operational surface — qualitatively different from the pre-batch placeholder. Cut 3 (Kind-of-work change): sl-06 is incremental polish on an already-shipped surface; reviewer mindset shifts from "build the core" to "extend with overflow handling".

```
Wave 1 (Backend foundation — ~4h, single lane sequential):
  Lane α  ──── sl-01 (M, Auto)

Wave 2 (Hub UI — ~9h, single lane sequential):
  Lane α  ──── sl-02 (M, Auto) ──> sl-03 (S, Auto) ──> sl-04 (M, Auto) ──> sl-05 (S, Auto)

Wave 3 (Add-slot / overflow dialog — ~1.5h, single lane sequential, optional):
  Lane α  ──── sl-06 (S, Composer 2 or Auto)
```

**Total wall-clock:** ~14.5h (~2 dev-days).
**Total agent-time (sequential equivalent):** ~14.5h. No parallelism credit (lanes are intentionally sequential per §7).

The bottleneck is **Wave 2 / sl-04** — the largest UI piece (dense list + mobile cards + row actions + inline expand). Single chat, ~3.5h including verification. The reason it's not split further is that all four sub-pieces (list, mobile, row actions, expand) share the same dense-row CSS-grid template (`OpdQueueGrid.ts`) and any split would force file-overlap convergence in the same wave.

---

## Lane-by-lane details

### Wave 1 — Backend foundation (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [sl-01](./task-sl-01-slot-session-snapshot-backend.md) | M | **Auto** (Sonnet 4.6 Medium as A/B fallback) | `backend/src/services/opd-doctor-service.ts` (the queue-mode predecessor — copy the query-budget shape: O(3) batched queries, single `.in()` per join), `backend/src/services/opd/opd-policy-service.ts` (`getSlotJoinGraceMinutes` helper used for grace-window derivation), `backend/src/services/opd-snapshot-service.ts` (the patient-side snapshot precedent — relevant for `slotStatus` semantics), `backend/src/routes/api/v1/opd.ts` (the route file we add to), `backend/src/controllers/opd-doctor-controller.ts` (controller pattern), `backend/src/types/database.ts` lines 120–210 (the `Appointment` row shape with all `opd_*` columns). Also pre-load the source product plan §DL-2, §DL-3, §DL-10. | New service `listDoctorSlotSession()` + `deriveSlotStatus()` pure helper (unit-tested), new route `GET /opd/slot-session?date=YYYY-MM-DD`, new controller, new `frontend/lib/api.ts` helper, new types in both `backend/src/types/opd-slot.ts` and `frontend/types/opd-doctor.ts`. **No DB migration** (DL-11). |

**Branch suggestion:** `feature/opd-slot-hub-backend`. Single PR.

**Pre-merge gate after sl-01:**

- [ ] `pnpm --filter backend tsc --noEmit` clean.
- [ ] `pnpm --filter backend lint` clean.
- [ ] `pnpm --filter backend test -- slot-session-service` — all green. Tests cover one fixture appointment per `slotStatus` bucket (8 buckets).
- [ ] With dev backend up: `curl -H "Authorization: Bearer <doctor-token>" "http://localhost:3001/api/v1/opd/slot-session?date=$(date -I)"` returns `200` with `{ data: { entries: [...], counts: {...}, snapshotAt: "..." } }`. Unauthenticated → `401`.
- [ ] Cross-doctor probe (Bearer token A querying doctor B's session): returns `200` with `entries: []` (RLS / ownership filter scopes to the authenticated doctor). No data leak.
- [ ] `pnpm --filter frontend tsc --noEmit` clean — the new types in `frontend/types/opd-doctor.ts` and the new `getDoctorOpdSlotSession()` helper compile.

---

### Wave 2 — Hub UI (single lane sequential)

All four tasks modify the slot-mode branch of `frontend/components/opd/OpdTodayClient.tsx`. Each task picks up where the previous left off, so they share a single chat-context-friendly editing rhythm but should still be **separate fresh chats** for context-cost reasons (each task's pre-load is targeted to its own files).

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [sl-02](./task-sl-02-slot-session-toolbar.md) | M | **Auto** | `frontend/components/opd/OpdQueueSessionToolbar.tsx` (the entire ~625 LOC — the precedent for the slot toolbar AND the source of `BroadcastDelayPopover` + `OfferEarlyJoinPopover` extractions), `frontend/components/opd/OpdTodayClient.tsx` (the slot branch at lines 437–486 is the mount point), `frontend/lib/api.ts` lines 460–540 (the queue session + delay + early-join helpers — shape sl-02's slot variant after these), `frontend/types/opd-doctor.ts` (post-sl-01 — adds `SlotSessionRow` shape this task consumes), source plan §DL-5. | New `OpdSlotSessionToolbar.tsx` mirroring queue toolbar's chrome. **Extracts** `BroadcastDelayPopover` + `OfferEarlyJoinPopover` to `frontend/components/opd/shared/{BroadcastDelayPopover,OfferEarlyJoinPopover}.tsx` so both toolbars consume them (zero behavior change in queue). Slot-specific resolvers for delay target + early-join target. Mounts under `OpdTodayClient.tsx` slot branch, replacing the placeholder card's date band. |
| 1 | [sl-03](./task-sl-03-slot-status-filter-and-search.md) | S | **Auto** | `frontend/components/opd/OpdQueueStatusFilter.tsx` (~180 LOC — the chip pattern), `frontend/hooks/useOpdQueueFilters.ts` (the URL-backed filter hook — extend its status union; do **not** fork it), `frontend/components/opd/OpdQueueSearchBox.tsx` (used as-is in slot mode), `frontend/components/opd/OpdTodayClient.tsx` (post-sl-02), source plan §DL-4. | New `OpdSlotStatusFilter.tsx` (6 chips per DL-4: `All / Upcoming / Late / In consult / Done / Missed`). Extends `useOpdQueueFilters`'s status union to include `running_late` and `cancelled` (no breaking changes to queue mode). Computes counts from the snapshot's `counts` object. Mounts under `OpdTodayClient.tsx` slot branch in the sticky filter strip slot. **Reuses `OpdQueueSearchBox.tsx` as-is.** |
| 2 | [sl-04](./task-sl-04-slot-session-list-and-row-actions.md) | M | **Auto** (Sonnet 4.6 Medium as A/B fallback if Auto stalls on the dense-row reuse) | `frontend/components/opd/OpdQueueTable.tsx` (~610 LOC — the table pattern with grouping), `frontend/components/opd/OpdQueueDenseRow.tsx` (the row primitive), `frontend/components/opd/OpdQueueGrid.ts` (the 13-column CSS grid template — sl-04 reuses this), `frontend/components/opd/OpdQueueRowActions.tsx` (the overflow-menu pattern), `frontend/components/opd/OpdQueueRowExpanded.tsx` (the inline-expand pattern), `frontend/components/opd/OpdQueueMobileList.tsx`, `frontend/components/opd/OpdQueueMobileCard.tsx` (mobile card list pattern), `frontend/components/opd/opdQueueMatcher.ts` (search matcher — reusable), `frontend/components/opd/OpdTodayClient.tsx` (post-sl-03), source plan §DL-6, §DL-7, §DL-8. | New `OpdSlotList.tsx` + `OpdSlotMobileList.tsx` + `OpdSlotMobileCard.tsx` + `OpdSlotRowActions.tsx` + `OpdSlotRowExpanded.tsx`. Time-ordered chronological list with "now" divider derived from `snapshot.snapshotAt`. Sectioning: Active (upcoming/grace/running_late/in_consultation) / Done / Missed / Overflow. Status-aware row treatments. Mounts under `OpdTodayClient.tsx` slot branch, replacing the placeholder card's body. **Sharable matcher: extract `opdQueueMatcher.ts` → `frontend/components/opd/shared/opdSearchMatcher.ts`** since both modes use it on the same fields. |
| 3 | [sl-05](./task-sl-05-polling-hotkeys-empty-states.md) | S | **Auto** | `frontend/components/opd/OpdTodayClient.tsx` (the queue branch's polling block at lines 152–182 is the precedent), `frontend/hooks/useOpdQueueHotkeys.ts` (reused as-is per SL-Q6), `frontend/components/opd/opdQueueEmptyState.ts` (the empty-state derivation precedent), `frontend/components/opd/opdQueueTelemetry.ts` (event types — extend with `opd_slot.*` events). | Wires polling (30s `setInterval` + `visibilitychange` pause) for the slot branch, mirroring the queue block. Reuses `useOpdQueueHotkeys` for J/K/Enter/S/`/`. Adds `frontend/components/opd/opdSlotEmptyState.ts` mirroring the queue helper. Extends `opdQueueTelemetry.ts` with `opd_slot.*` events (`opd_slot.viewed`, `opd_slot.action`, `opd_slot.filter_changed`, `opd_slot.row_clicked`). Closes the cross-cutting acceptance gate. |

**Branch suggestion:** `feature/opd-slot-hub-frontend`. Single PR for all four (or stack on `feature/opd-slot-hub-backend` if Wave 1 hasn't merged yet).

**Pre-merge gate after sl-05:**

- [ ] All Wave 1 gates still green.
- [ ] `/dashboard/opd-today` for an `opd_mode = 'slot'` doctor renders the operational surface — toolbar + filter strip + list. The placeholder card is gone.
- [ ] **Toolbar**: date picker + Slot pill + Broadcast delay popover + Offer early join popover + freshness ("Last updated Xs ago") + manual refresh. Delay popover targets in-consult slot if any, else next upcoming, else disabled with tooltip. Early-join popover targets next pending/confirmed whose preceding slot is `completed`; disabled with tooltip otherwise.
- [ ] **Shared popovers verified**: `rg "BroadcastDelayPopover|OfferEarlyJoinPopover" frontend/components/opd/OpdQueueSessionToolbar.tsx` returns import statements only (no inline definitions). `frontend/components/opd/shared/BroadcastDelayPopover.tsx` and `OfferEarlyJoinPopover.tsx` exist.
- [ ] **Filter strip**: 6 chips with counts, URL-backed (`?status=&q=`).
- [ ] **List**: time-ordered rows, "now" divider visible, sectioning works, status-aware row treatments visible (amber/green/red/primary). Inline expand reveals patient brief.
- [ ] **Row actions**: `⋯` overflow menu opens with status-aware items per DL-7. Whole-row click opens appointment detail.
- [ ] **Polling**: snapshot refreshes every 30s; pauses when tab hidden; resumes on visibility return.
- [ ] **Hotkeys**: J/K move focus, Enter opens, S opens overflow for focused row, `/` focuses search.
- [ ] **Stale-while-revalidate**: kill backend, refresh — last-good entries stay visible with a banner.
- [ ] **Telemetry**: `opd_slot.viewed` fires once on first successful load (PHI-free counts only); `opd_slot.row_clicked` fires on row click; `opd_slot.action` fires on every overflow-menu invocation.
- [ ] **Backwards compatibility**: queue-mode `/dashboard/opd-today` is byte-identical to before. `/dashboard/appointments/[id]` per-appointment slot actions are unchanged.
- [ ] `pnpm --filter frontend tsc --noEmit` + `pnpm --filter backend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` + `pnpm --filter backend lint` clean.
- [ ] `pnpm --filter frontend test` + `pnpm --filter backend test` — all previously-green suites still green; new sl-01 + sl-03 tests added and green.
- [ ] `rg "<DoctorOpdSlotActions>" frontend/` returns one match (the existing per-appointment usage in `frontend/app/dashboard/appointments/[id]/page.tsx`).

---

### Wave 3 — Add-slot / overflow dialog (single lane sequential, optional)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [sl-06](./task-sl-06-add-slot-overflow-dialog.md) | S | **Composer 2 Fast** (or Auto) | `frontend/components/opd/OpdSlotSessionToolbar.tsx` (post-sl-02 — the trigger lives here), `frontend/components/opd/OpdSlotRowActions.tsx` (post-sl-04 — per-row triggers live here), `frontend/lib/api.ts` (the existing `createAppointment` / `postAppointmentManualBooking` helper — sl-06 wraps it; **no new endpoint**), `frontend/components/ui/dialog.tsx` (the dialog primitive used elsewhere), `backend/src/types/database.ts` (the `Appointment.opd_event_type` column shape), source plan §DL-7 ("Approve overflow" / "Convert to overflow"). | New `AddSlotDialog.tsx`. Two modes: (a) end-of-session overflow with `opd_event_type='return_after_completed'`, (b) regular extra slot at HH:MM. POSTs to existing `/api/v1/appointments`. Toolbar shows "Add slot" button. Per-row "Approve overflow" (Late) and "Convert to overflow" (Missed) actions open the dialog pre-filled. On success: snapshot refetches; new row appears under the `Overflow` section. |

**Branch suggestion:** `feature/opd-slot-hub-overflow-dialog`. Single PR.

**Pre-merge gate after sl-06:**

- [ ] All Wave 1 + Wave 2 gates still green.
- [ ] Toolbar shows "Add slot" button. Click → dialog opens with two modes (Overflow / Extra slot).
- [ ] Per-row "Approve overflow" (visible on Late rows) → dialog opens pre-filled in Overflow mode with the Late appointment as `related_appointment_id`.
- [ ] Per-row "Convert to overflow" (visible on Missed rows) → dialog opens pre-filled in Overflow mode with the Missed appointment as `related_appointment_id`.
- [ ] On submit: appointment is created via `POST /api/v1/appointments`; on success the dialog closes, snapshot refetches, new row appears under the `Overflow` section with `Overflow` badge.
- [ ] Cancel: dialog closes, no API call, no state change.
- [ ] Validation: HH:MM input is required for "Extra slot" mode; "Overflow" mode auto-derives time as session-end + 5 min; both modes require patient name (free-text — kept lightweight per the existing booking flow).
- [ ] `pnpm --filter frontend tsc --noEmit` + lint clean.
- [ ] `rg "AddSlotDialog" frontend/` returns the new component file + the toolbar mount + the row-actions mounts (3+ matches expected).

---

## Per-task model picks

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — TL;DR rule #1: **plan with Opus, execute with Auto, polish with Composer**. Auto is the default for execution work because it draws from the cheaper Auto+Composer pool ($1.25 / $6.00 per M tokens) and matches Sonnet 4.5/4.6 quality on bounded, well-spec'd tasks. None of the 6 tasks below hit the hard-rules list (no `auth.uid()` / RLS / HMAC / PHI columns / new migration / sub-batch close-gate review), so all default to **Auto**.

| Task | Size | Recommended model | Why |
|---|---|---|---|
| sl-01 | M | **Auto** | New backend service + route + controller + types + tests. ~300 LOC across 4 files. Tight spec from DL-2/3 + the queue-mode predecessor `listDoctorQueueSession`. **No** security-sensitive primitives (auth + ownership patterns are reused from queue, not invented). **No** new migration. **No** PHI columns added or moved. Off the hard-rules list → Auto's sweet spot. (Auto's pool rates are roughly half of manual Sonnet API rates for the same per-turn quality on bounded backend work.) |
| sl-02 | M | **Auto** | New frontend toolbar + popover extractions. ~250 LOC delta across 4 files. The hardest decision is "extract the popovers without breaking queue tests" — a mechanical refactor with a clear extraction boundary. Auto handles this cleanly with the queue toolbar pre-loaded; no thinking-tier judgment needed. |
| sl-03 | S | **Auto** | New filter chip component + extension of `useOpdQueueFilters`'s status union. ~120 LOC delta. The chip component is a near-copy of `OpdQueueStatusFilter`; the hook extension is a 5-line additive change. Trivially well-spec'd → Auto. |
| sl-04 | M | **Auto** | New list + mobile + row-actions + row-expand components. ~400 LOC delta across 5 files. The largest task; reuses `OpdQueueGrid.ts` template + `OpdQueueDenseRow.tsx` row primitive heavily. The status-derivation logic (sectioning, "now" divider, status-aware row treatments) is the only new design — small enough for Auto given the predecessor as reference. **Per-message escalation rule (guide § "Quality safety net"):** if Auto stalls on the dense-row reuse or the sectioning logic, escalate that single message to Opus 4.7 Extra High; don't switch the whole chat. |
| sl-05 | S | **Auto** | Polling block + hotkey wiring + empty-state helper + telemetry events. ~150 LOC delta across 3 files. The polling block is a near-copy of the queue block. The hotkey hook is reused as-is. Empty state mirrors queue. Auto handles the wiring + the cross-cutting gate verification cleanly. |
| sl-06 | S | **Composer 2 Fast** (or Auto) | New dialog component + toolbar mount + row-actions mounts + API call to existing `/api/v1/appointments`. ~150 LOC delta. Dialog primitives are already in `frontend/components/ui/dialog.tsx`; the form validation is straightforward; the optimistic-refetch dance follows existing patterns. Per the guide § Tier 4: Composer 2 is right for "trivial refactors / one-line bug fixes / form-and-API plumbing when you already know the fix" — and at $0.50 / $2.50 per M tokens it's the cheapest pool option. Auto is also fine if you don't want to switch the picker. |

**Cap check:** **zero Opus tasks** (cap is ≤ 1 per wave, ≤ 2 per batch). Per the source plan and the predecessors, no surface in this batch needs Opus-tier judgment — no security primitives, no PHI handling beyond reusing the doctor-scoped pattern from queue, no migrations, no novel architecture. The hardest decisions are "which import path to use" and "where to extract the popover boundary" — both well within Auto's range with proper pre-loads.

**Why not manual Sonnet 4.6 Medium?** Per the guide § Tier 2: drop into manual Sonnet only when you need to know which model ran (A/B test, bug repro). For straight execution, Auto is functionally equivalent at lower cost (cheap Auto+Composer pool vs API pool drain). If Auto stalls per-message, escalate that one message to Opus 4.7 Extra High — don't burn the API pool by pinning Sonnet for the whole chat.

---

## Acceptance gates per wave

### Wave 1 gate (after sl-01)

- [ ] `pnpm --filter backend tsc --noEmit` + `pnpm --filter backend lint` clean.
- [ ] `pnpm --filter frontend tsc --noEmit` clean (new frontend types compile).
- [ ] New unit tests for `deriveSlotStatus()` cover all 8 status buckets (`upcoming`, `grace`, `running_late`, `in_consultation`, `completed`, `missed`, `cancelled`, `overflow`). `pnpm --filter backend test -- slot-session` all green.
- [ ] `curl` smoke against the new endpoint returns the expected shape; auth + cross-doctor probe behave correctly.
- [ ] Existing OPD endpoint tests still pass (`pnpm --filter backend test -- opd`).
- [ ] No DB migration files added under `backend/migrations/` for this batch.

### Wave 2 gate (after sl-05)

- [ ] All Wave 1 gates still green.
- [ ] Cross-cutting acceptance gate from [`plan-opd-slot-hub-batch.md` § Cross-cutting acceptance gate](../plan-opd-slot-hub-batch.md#cross-cutting-acceptance-gate-whole-batch) — every box ticked.
- [ ] Specifically:
  - [ ] Slot-mode `/dashboard/opd-today` renders toolbar + filter + list; placeholder card is gone.
  - [ ] Shared popovers under `frontend/components/opd/shared/`; queue toolbar imports from there.
  - [ ] 6 filter chips with counts; URL-backed.
  - [ ] Time-ordered list with "now" divider; status-aware row treatments; mobile card list under `lg`; inline expand.
  - [ ] Polling 30s + visibility-pause; J/K/Enter/S/`/` hotkeys; stale-while-revalidate banner.
  - [ ] Telemetry `opd_slot.*` events fire as expected.
  - [ ] Queue-mode hub byte-identical; per-appointment `<DoctorOpdSlotActions>` unchanged.
  - [ ] `tsc` + `lint` + `test` all clean across backend + frontend.

### Wave 3 gate (after sl-06)

- [ ] All Wave 1 + Wave 2 gates still green.
- [ ] Toolbar "Add slot" button opens the dialog; dialog has two modes (Overflow / Extra slot) with proper validation and time defaulting.
- [ ] Per-row "Approve overflow" (Late) and "Convert to overflow" (Missed) open the dialog pre-filled with the source row as `related_appointment_id`.
- [ ] Submit creates the appointment via `POST /api/v1/appointments`; snapshot refetches; new row appears under `Overflow` section with badge.
- [ ] No regression on existing `appointments` create-tests.
- [ ] `tsc` + `lint` clean.

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Pool drawn from | Wall-clock |
|---|---|---|---|---|---|---|
| Wave 1 | sl-01 | 1 | 0 | 0 | Auto+Composer pool | ~4h |
| Wave 2 | sl-02, sl-03, sl-04, sl-05 | 4 | 0 | 0 | Auto+Composer pool | ~9h (sequential) |
| Wave 3 | sl-06 | 0 (or 1) | 1 (or 0) | 0 | Auto+Composer pool | ~1.5h |
| **Total** | **6** | **5–6** | **0–1** | **0** | **Auto+Composer pool only** | **~14.5h** |

**Pool note:** every task in this batch draws from the Auto+Composer pool (cheaper, separate from the $20/mo API pool). Zero API-pool drain. Per-message escalation to Opus 4.7 Extra High remains available as a safety net if Auto stalls — those single messages are the only path to the API pool in this batch.

Comparable cost profile to a single mid-sized sub-batch in the EHR plan, **but cheaper** than equivalent manual-Sonnet routing because the entire batch stays in the Auto+Composer pool. An order of magnitude cheaper than `patient-profile-shell-rebuild` (~6 dev-days, 1 Opus, 18+ Sonnet); roughly comparable to or slightly more than `sidebar-restructure` (3 Sonnet + 1 Composer) because the slot hub is genuinely larger but routes through the cheaper pool.

### Efficiency notes

- **Auto-first routing.** Per the updated guide (TL;DR rule #1), Auto is the execution default. Tasks are well-spec'd by their `task-sl-*.md` files (the exact pattern the guide cites: "When the task is well-spec'd, route it through Auto"). Auto draws from the cheaper pool; manual Sonnet would drain the API pool for equivalent quality. Reach for manual Sonnet 4.6 Medium only on the off-chance you want to A/B test or repro a specific bug against a pinned model.
- **Per-message escalation, not per-chat escalation.** If Auto stalls on a single message (asks the same clarifying question twice, or ships code that fails type-check on a non-obvious error), escalate that **one message** to Opus 4.7 Extra High — don't switch the whole chat. Cursor's per-message picker makes this cheap.
- **Single PR per wave.** Wave 1 ships `feature/opd-slot-hub-backend`. Wave 2 ships `feature/opd-slot-hub-frontend` (stacks on Wave 1 if not yet merged). Wave 3 ships `feature/opd-slot-hub-overflow-dialog` (stacks on Wave 2 if not yet merged).
- **Each task is a fresh chat.** Smaller context window. Don't carry sl-01's chat into sl-02 — they touch disjoint files (backend vs frontend) and the spec is in the task file. (Guide TL;DR rule #2: one topic per chat.)
- **Pre-load list on every task is exhaustive and queue-mode-grounded.** The queue-mode predecessors are the spec; no grepping needed at runtime — the agent gets every relevant file path up front. (Guide § Token-efficiency tactics #6: prefer concrete file references over searches.)
- **Zero Opus tasks.** The hardest design decision (status-derivation rule for `slotStatus`) is locked in DL-3; everything else is "follow the queue precedent for slot semantics". The hard-rules list (RLS, PHI, auth, migrations, sub-batch close-gate) is empty for this batch.
- **No new dependencies.** Every UI primitive (`Popover`, `DropdownMenu`, `Tooltip`, `Dialog`, `Button`, `Skeleton`) is already in `frontend/components/ui/`. Every backend primitive (`getSupabaseAdminClient`, `handleSupabaseError`, `validateOwnership`) is already in `backend/src/utils/`.
- **No backend migration.** DL-11 holds. `git status backend/migrations/` should show zero new files belonging to this batch.
- **Acceptance is grep-able + curl-able + test-able.** Every cross-cutting gate item is verifiable mechanically (`rg`, `curl`, `tsc`, `lint`, `test`); only the visual-smoke items in Wave 2 need a browser check.
- **Opus 4.7 Extra High is reserved for the optional batch close-gate review** (guide § Tier 1). After sl-05 ships, you may open one fresh Opus chat with the full Wave 1 + Wave 2 diff and ask it to grade against the cross-cutting acceptance gate. **One** careful Opus review beats four mediocre ones; this is the only Opus turn budgeted for the batch.

---

## References

- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules and chat heuristics.
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape definitions used in this doc.
- [Product plans/plan-opd-slot-hub.md](../../../../Product%20plans/plan-opd-slot-hub.md) — source product plan, decision locks DL-1..DL-12.
- [Daily-plans/March 2026/2026-03-24/OPD modes/opd-systems-plan.md](../../../../March%202026/2026-03-24/OPD%20modes/opd-systems-plan.md) — upstream OPD modes spec.
- Style precedent: [`sidebar-restructure/Tasks/EXECUTION-ORDER-sidebar-restructure.md`](../../../14-05-2026/sidebar-restructure/Tasks/EXECUTION-ORDER-sidebar-restructure.md) — same shape, same convention, same model strategy. (Concurrent batch — no file overlap with this one beyond `OpdTodayClient.tsx`'s slot branch.)
- Cross-day:
  - [Daily-plans/May 2026/08-05-2026/](../../../08-05-2026/) — queue-mode hub batch (oq-04..oq-13). Every UI pattern reused by this batch comes from there.
  - [Daily-plans/March 2026/2026-03-24/OPD modes/e-task-opd-06-frontend-doctor-dashboard-opd-controls.md](../../../../March%202026/2026-03-24/OPD%20modes/e-task-opd-06-frontend-doctor-dashboard-opd-controls.md) — per-appointment slot controls, preserved.
