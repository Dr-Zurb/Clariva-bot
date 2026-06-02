# Execution order — Booking review redesign Phase 2 (workflow)

> Batch: [`plan-p2-booking-review-workflow-batch.md`](../plan-p2-booking-review-workflow-batch.md) · Product plan: [`plan-booking-review-redesign.md`](../../../../../../Product%20plans/plan-booking-review-redesign.md)
>
> **4 waves, 5 tasks.** Layer workflow onto the Phase-1 reskinned inbox: one-tap quick-resolve, optimistic actions with a deferred-commit Undo, visibility-aware auto-refresh, and a filter/sort/density toolbar — all on the existing API. Read top-to-bottom before starting; this file is the contract for *order*, the task files for *content*.

---

## TL;DR for the executor

1. **brr-05 first, alone.** Build the action-toast host + the optimistic/deferred-commit dispatcher around `runAction`. This is the state machine everything else leans on. Get Undo / window-elapse / flush-on-tab-switch right here.
2. **brr-06 next.** Visibility-aware polling (reuse `useDashboardCounts`) + the "N new" pill. It must **pause** while a dialog is open or a deferred commit is in flight (brr-05's window).
3. **brr-07 next, same lane.** Quick-resolve buttons from `assist_hint`, dispatching **through** brr-05's flow (confirm if == proposal, reassign if different).
4. **brr-08 after the spine.** Filter / search / sort / density over `displayReviews`, composing with the Phase-1 urgency sort and brr-06's merged list.
5. **brr-09 last.** Parity + safety gate (action-call diff, 409, and the optimistic edge cases) + tests.
6. **No backend, no `page.tsx`, no match-explain copy edits.** Verify at brr-05 start and brr-09.

---

## Wave / lane matrix

| Wave | Task | Title | Depends on | Lane | Size | Model |
|---|---|---|---|---|---|---|
| **1** | **brr-05** | Optimistic actions + deferred-commit Undo + reusable action-toast | Phase 1 | Lane A | **M–L** | **Auto** |
| **2** | **brr-06** | Visibility-aware auto-refresh + "N new" pill | brr-05 | Lane A (serial) | **M** | **Auto** |
| **2** | **brr-07** | One-tap quick-resolve from assist hints | brr-05 | Lane A (serial) | **M** | **Auto** |
| **3** | **brr-08** | Filter / search / sort / density toolbar | brr-05 (display pipeline) | Lane A | **M** | **Auto** |
| **4** | **brr-09** | Integration + parity + optimistic-edge gate + tests | brr-05..08 | Lane A | **S–M** | **Auto** (optional light review) |

> **One honest lane.** All five tasks converge on `ServiceReviewsInbox.tsx` (+ new helpers), so they serialise ([`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md)). Waves are review checkpoints, not parallelism.

---

## Critical path

```
   brr-05  ── action-toast + optimistic/deferred-commit dispatcher (the spine)
        │
        ▼
   brr-06  ── auto-refresh poll + "N new" pill (pauses around the commit window)
        │
        ▼
   brr-07  ── quick-resolve buttons → dispatch through brr-05
        │
        ▼
   brr-08  ── filter / search / sort / density over displayReviews
        │
        ▼
   brr-09  ── parity + optimistic-edge GATE + tests
        │
        ▼
   Phase 2 closed → promote Phase 3 (R-DRAWER, R-MOBILE, R-KEYBOARD)
```

Single chain. The leverage is **brr-05**: a correct deferred-commit machine (fire / cancel / elapse / flush, all reconciling against the same endpoints incl. 409) makes brr-06/07 additive. A shaky one risks dropping or double-sending a patient-facing DM — spend the care there.

---

## Wave detail

### Wave 1 — the action spine (brr-05)

**Goal:** instant-feeling, safe actions with a real Undo, on the existing endpoints.

- **brr-05 — Optimistic + deferred-commit Undo + action-toast.** Add a small portal toast host (queue, auto-dismiss, Undo action button, `role="status"`). Restructure the commit path: Confirm/Cancel optimistically remove the row and **schedule** the real call after the window (default 5 s); Undo cancels before fire + restores; elapse → fire + reconcile (success / 409-refetch / error-restore). Tab switch / unmount **flushes** pending commits. Reassign commits immediately on submit (no window) with the teaching payload intact. **Gate:** fire / cancel / elapse / flush all correct; 409 reconciles; no row lost or double-sent.

### Wave 2 — freshness + speed (brr-06 → brr-07, serial)

**Goal:** the queue stays current on its own and confident items clear in one tap.

- **brr-06 — Auto-refresh + "N new" pill.** Reuse the `useDashboardCounts` visibility pattern to poll `getServiceStaffReviews(activeTab)` every 30 s; new pending rows surface as a "N new" pill (merge on click), never a live splice; resolved tabs may refresh in place. **Pause polling while a dialog is open or a deferred commit is in flight.** **Gate:** pill appears on new pending; no reorder under cursor; polling pauses/resumes correctly.
- **brr-07 — Quick-resolve.** Render the top 1–2 `assist_hint.top_resolutions` as "Resolve as {label} · {count}×"; dispatch through brr-05 (confirm if == `proposed_catalog_service_key`, reassign with no teaching append otherwise). Keep Confirm/Reassign/Cancel. **Gate:** correct endpoint + payload per case; hidden when no assist; inherits the Undo window.

**Why serial:** both edit the inbox and build on brr-05's dispatcher.

### Wave 3 — slice the queue (brr-08)

**Goal:** find the right items fast.

- **brr-08 — Filter / search / sort / density.** Text filter (patient / service label / key), confidence filter ("Low only" etc.), sort control (Most urgent [default] / Newest / Oldest / Confidence), density toggle persisted to `localStorage`. All client-side over `displayReviews`, composing with the active tab + Phase-1 urgency sort. Distinct "no matches" empty state. **Gate:** filters compose with tab + merge; density persists; empty-vs-no-match states distinct.

### Wave 4 — close the phase (brr-09)

**Goal:** prove parity + the optimistic edges.

- **brr-09 — Integration + gate + tests.** Action-call diff (manual + quick-resolve) vs Phase 1; 409 reconcile; PHI no-log (incl. toast + poll); the four edge cases (Undo / elapse / tab-switch-mid-window / poll-during-commit); targeted tests; `tsc` + `lint`; inbox line. **Gate:** the batch cross-cutting gate is fully green.

---

## Model-selection rationale

Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

- **brr-05 — Auto (M–L).** A timer/queue state machine + a toast host. Involved but not novel-risk: frontend-only, same endpoints. The care is in edge cases, not new domains.
- **brr-06 — Auto (M).** Reuse of a proven polling pattern + a pill; the only subtlety is pausing around the commit window.
- **brr-07 — Auto (M).** Two buttons routing to existing endpoints through brr-05.
- **brr-08 — Auto (M).** Client-side filter/sort over an existing memo + a persisted pref.
- **brr-09 — Auto (S–M).** Verification + tests. **Optional light review** of the deferred-commit edges (drop/double-send is the only patient-facing risk). No Opus: no PHI write path, no security, no migration.

**No Opus build tasks. No Composer tasks** (interdependent state on one component → keep coherent under Auto).

---

## Global anti-goals (apply to every task)

- ❌ Do **not** touch the backend, any migration, or `frontend/app/dashboard/booking-review/page.tsx`.
- ❌ Do **not** change `staff-review-match-explain.ts` copy/semantics.
- ❌ Do **not** change which endpoint each action hits or its payload shape; preserve the **409 → refetch** reconcile (BR-DL-2 / BR-DL-7).
- ❌ Do **not** fabricate a local "undo" of a committed server change — Undo must cancel *before* the call fires (P2-BRR-2).
- ❌ Do **not** splice new pending rows into the list under the cursor — use the "N new" pill (P2-BRR-4).
- ❌ Do **not** add patient/reason text to logs, analytics, telemetry, or toast payloads sent anywhere off-screen (BR-DL-5).
- ❌ Do **not** build the drawer, mobile cards, or keyboard/bulk triage here (Phase 3).
- ❌ Do **not** add a global toast provider or migrate existing toasts (P2-BRR-3).

## Global definition of done (every task)

- [ ] `cd frontend; npx tsc --noEmit` clean.
- [ ] `cd frontend; npm run lint` clean (warnings ok).
- [ ] Task's own targeted test(s) green.
- [ ] Action-call parity preserved (spot-check at brr-05, brr-07, brr-09).
- [ ] Task file's checklist ticked + a one-line status stamp at the bottom.

---

## Notes for the executor

- **brr-05 is the keystone — design the commit model explicitly.** Recommended shape: a `pendingCommits` map keyed by reviewId `{ timeoutId, fire(): Promise<void> }`; optimistic remove on action; `Undo` → `clearTimeout` + restore + dismiss toast; elapse → `fire()` → reconcile; `flush()` on tab-switch/unmount fires all pending. A poll (brr-06) must skip/merge rows that are mid-commit.
- **Reassign stays immediate.** It's a deliberate dialog action that can write matcher hints; an Undo window over a taught hint is messy. Optimistic removal + reconcile only.
- **Reuse `useDashboardCounts` literally as the pattern** for brr-06 (interval, `visibilitychange`, stale-while-revalidate) — don't reinvent polling.
- **Quick-resolve maps to existing endpoints** (P2-BRR-1): `confirm` when the resolution equals `proposed_catalog_service_key`, else `reassign` with the chosen `catalogServiceKey`/`catalogServiceId` and **no** teaching append. Same payloads as today.
- **Filters are presentational** (P2-BRR-5): extend the `displayReviews` memo; never refetch to filter; keep `sortPendingByUrgency` as the default.
- **Parity is still the prime directive** — change *when/how* an action commits, never *what* it sends (BR-DL-2).
