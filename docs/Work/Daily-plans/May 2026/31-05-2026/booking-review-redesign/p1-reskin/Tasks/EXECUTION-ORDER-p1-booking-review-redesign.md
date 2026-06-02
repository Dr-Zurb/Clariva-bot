# Execution order — Booking review redesign Phase 1 (reskin + SLA)

> Batch: [`plan-p1-booking-review-redesign-batch.md`](../plan-p1-booking-review-redesign-batch.md) · Product plan: [`plan-booking-review-redesign.md`](../../../../../../Product%20plans/plan-booking-review-redesign.md)
>
> **3 waves, 4 tasks.** A reskin of one component onto the shipped design system, plus rendering the SLA urgency the API already returns. Net new code is rendering + two small atoms + one date util. No backend, no migration. Read this file top-to-bottom before starting; it is the contract for *order*, the task files are the contract for *content*.

---

## TL;DR for the executor

1. **brr-01 first, alone.** It reskins the inbox *shell* — header + summary row, `Tabs`, `Alert` banners, `Skeleton` loading, `Card` empty states — and introduces the shared `ConfidenceBadge` atom. Rows still render (carried from today) but their cell internals + dialogs are brr-02.
2. **brr-02 next, same lane.** It rewrites the row cells, action buttons, and the Reassign / Cancel modals onto `Button` + `Dialog` + `Select`, preserving `runAction`, the 409 path, and the teaching-hint payload. It edits the same component brr-01 just reshaped, so it cannot run in parallel.
3. **brr-03 after the rows exist.** Adds the `SlaCountdown` chip + queued-age fallback, the most-urgent-first pending sort, and wires the "Due < 1h" count into brr-01's summary-row slot.
4. **brr-04 last.** Behaviour-parity verification (action-call diff + 409 + teaching payload), the Phase 1 gate, and the targeted tests.
5. **No backend, no `page.tsx`, no match-explain copy edits.** Verify this at the start of brr-01 and again in brr-04.

---

## Wave / lane matrix

| Wave | Task | Title | Depends on | Lane | Size | Model |
|---|---|---|---|---|---|---|
| **1** | **brr-01** | Reskin shell — header, tabs, banners, loading, empty states + `ConfidenceBadge` | — | Lane A | **M–L** | **Auto** |
| **1** | **brr-02** | Reskin rows + Reassign/Cancel dialogs (preserve actions + 409 + teaching) | brr-01 | Lane A (serial) | **M** | **Auto** |
| **2** | **brr-03** | SLA urgency: `SlaCountdown` + queued-age fallback + most-urgent sort + Due<1h count | brr-01, brr-02 | Lane A | **M** | **Auto** |
| **3** | **brr-04** | Integration + behaviour-parity gate + tests | brr-01..03 | Lane A | **S–M** | **Auto** (optional light review) |

> **There is only one honest lane.** All four tasks converge on `ServiceReviewsInbox.tsx` (+ its new atoms), so they serialise — by design ([`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md): don't invent parallel lanes that fight over one file). Waves are review/commit checkpoints, not parallelism.

---

## Critical path

```
   brr-01  ── reskin shell (header, tabs, banners, loading, empty) + ConfidenceBadge
        │
        ▼
   brr-02  ── reskin rows + Reassign/Cancel Dialogs (actions + 409 + teaching preserved)
        │
        ▼
   brr-03  ── SlaCountdown + queued-age fallback + most-urgent sort + Due<1h count
        │
        ▼
   brr-04  ── behaviour-parity verify + Phase 1 GATE + tests
        │
        ▼
   Phase 1 closed → promote Phase 2 (R-QUICKRESOLVE, R-OPTIMISTIC, R-FILTERS)
```

Single chain. The leverage is **brr-01 + brr-02**: a faithful, behaviour-preserving reskin makes brr-03 a clean additive layer. The one thing to guard with care across brr-02/04 is **action-call parity** — a reskin must not change which booking link gets sent to which patient (BR-DL-2 / BR-R1).

---

## Wave detail

### Wave 1 — the reskin (brr-01 → brr-02, sequential)

**Goal:** the inbox looks native to the dashboard and behaves exactly as today.

- **brr-01 — Reskin shell + atoms.** Header → `Button` refresh (lucide icon) + title/subtitle + a compact summary row (Pending count now; Due<1h slot for brr-03). Status tabs → `Tabs`/`TabsList`/`TabsTrigger` with a count `Badge` on Pending. Banners → `Alert` (default/destructive). Loading → `Skeleton` rows. Empty states → `Card` + `Button` link. New `ConfidenceBadge` atom (Badge + 3-segment meter, P1-BRR-1) replacing `confidenceClass()`. `tabular-nums` on numerics. **Gate:** shell renders via primitives; `rg confidenceClass` empty; behaviour unchanged; flag-free (no flag here — it's a straight replacement).
- **brr-02 — Reskin rows + dialogs.** Row cells + action buttons (`Button` variants) + the Reassign/Cancel modals → `Dialog` + `Select`. Preserve `runAction`, the 409 branch, the success/error copy intent, and the teaching-hint payload (`sanitizeReasonForHintSuggestion`, include/exclude appends, Skip-teaching). Keep the inline "Show technical detail" expander (drawer is Phase 3). **Gate:** confirm/reassign/cancel produce identical API calls; 409 refetches; dialogs are `Dialog`-based.

**Why sequential:** both edit `ServiceReviewsInbox.tsx`; brr-02 builds on the shell brr-01 reshaped.

### Wave 2 — urgency (brr-03)

**Goal:** turn "oldest-first, no urgency" into a real triage queue.

- **brr-03 — SLA urgency.** New `SlaCountdown` (reads `sla_deadline_at`, ticks ~30 s, escalates `Badge` variant, shows "Overdue Xm"); queued-age fallback when null (new relative-time util from `created_at`); pending default sort = soonest-deadline-first; wire the **Due < 1h** count into brr-01's summary slot. **Gate:** accurate countdown + escalation + overdue flip; null degrades cleanly; pending sorted urgent-first.

### Wave 3 — close the phase (brr-04)

**Goal:** prove parity and the Phase 1 gate.

- **brr-04 — Integration + gate + tests.** Diff confirm/reassign/cancel network calls vs today (incl. teaching payload); re-verify 409; PHI no-log check; visual parity at 1366/1920; targeted tests (confidence-badge mapping, SLA threshold/overdue boundary, pending sort); `tsc` + `lint`; inbox line. **Gate:** the batch cross-cutting gate is fully green.

---

## Model-selection rationale

Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

- **brr-01 — Auto (M–L).** Mechanical primitive swap across the shell; large in volume, low in risk.
- **brr-02 — Auto (M).** Re-homing rows + two dialogs into primitives. The teaching-hint payload + 409 are delicate but **kept verbatim**, not redesigned — so it's careful wiring, not novel logic.
- **brr-03 — Auto (M).** A small live-tick component + a sort + a count. The only new logic (a relative-time util) is simple and unit-tested.
- **brr-04 — Auto (S–M).** Verification + tests. **Optional light review** of action-call parity (BR-R1) — the one place a reskin bug has patient-facing impact. Not Opus-worthy: no PHI write path, no security, no migration.

**No Opus build tasks. No Composer tasks** (the multi-file work is interdependent rendering on one component, better kept coherent under Auto).

---

## Global anti-goals (apply to every task)

- ❌ Do **not** touch the backend, any migration, or `frontend/app/dashboard/booking-review/page.tsx`.
- ❌ Do **not** change `staff-review-match-explain.ts` copy/semantics — reuse by reference (reason-code wording stays its single source).
- ❌ Do **not** change which API call each action fires, the success/error copy intent, or the 409 "already resolved → refetch" behaviour (BR-DL-2 / BR-DL-7).
- ❌ Do **not** add per-page chip/pill styles — extend a `Badge` variant or compose primitives (BR-DL-1; see `badge.tsx`'s own note).
- ❌ Do **not** add patient/reason text to logs, analytics, or telemetry (BR-DL-5).
- ❌ Do **not** build the drawer, mobile cards, optimistic/undo, filters, quick-resolve, or keyboard nav here — those are Phases 2–3.
- ❌ Do **not** rename `ServiceReviewsInbox` in this phase (P1-BRR-2 / BR-Q5).

## Global definition of done (every task)

- [ ] `cd frontend; npx tsc --noEmit` clean.
- [ ] `cd frontend; npm run lint` clean (warnings ok).
- [ ] Task's own targeted test(s) green.
- [ ] Confirm/Reassign/Cancel still fire identical API calls (spot-check at brr-02 and brr-04).
- [ ] Task file's checklist ticked + a one-line status stamp at the bottom.

---

## Notes for the executor

- **Read the current component first.** [`ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) is the behavioural reference — re-author its markup onto primitives without changing its logic. The `runAction` flow, the okMessages, and the 409 branch are load-bearing; preserve them.
- **The match-explain helper is reused, not rewritten.** `matchExplanationSummary` / `matchReasonChipMeta` / `parseCandidateLabels` / `parseMatchReasonCodes` / `formatCandidateSummary` keep their copy. You render their output through primitives; you don't touch the strings.
- **Dates go through `format-date.ts`.** For the SLA chip's absolute-time tooltip use `formatDateTime`; the countdown delta is your own util (there is no relative-time helper today — add a small tested one).
- **Confidence is a free-form string.** Map it case-insensitively in `ConfidenceBadge`; unknown values get a safe fallback variant (never crash, never blank).
- **Behaviour-parity is the prime directive.** When in doubt, change pixels, not outcomes (BR-DL-2).
