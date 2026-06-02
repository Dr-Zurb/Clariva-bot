# Booking review redesign — Phase 2: workflow (quick-resolve · optimistic + undo + auto-refresh · filters) — 31 May 2026 batch plan

> **Phase 2 of the Booking-review redesign program — making the inbox *fast*.** Phase 1 made it look native and surfaced SLA urgency; Phase 2 makes clearing the queue feel instant and stay fresh on its own: one-tap resolve from the AI's own assist hints, optimistic actions with a real (deferred-commit) Undo, visibility-aware auto-refresh with a non-disruptive "N new" pill, and a filter / search / sort / density toolbar. Still **no backend changes** — every action uses the existing `confirm` / `reassign` / `cancel` endpoints.
>
> **Source plan:** [`Product plans/plan-booking-review-redesign.md`](../../../../../Product%20plans/plan-booking-review-redesign.md) — R-QUICKRESOLVE + R-OPTIMISTIC + R-FILTERS in §R-item details / §Sequencing Phase 2.
>
> **Builds on Phase 1 ([p1-booking-review-redesign](../p1-reskin/), shipped 2026-05-31).** The component is now design-system-native ([`ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx)) with `ConfidenceBadge`, `SlaCountdown` / `QueuedAgeLabel` / `useTickInterval`, `sortPendingByUrgency`, `countDueWithin1h`, the `displayReviews` pipeline, and the `runAction` flow (incl. the 409 → refetch branch). Phase 2 layers workflow on top of these — it does not re-skin.
>
> **Prefix note:** tasks continue the `brr-*` numbering (Phase 1 was brr-01..04; Phase 2 is brr-05..09) for cross-phase traceability.
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Zero Opus build tasks; five Auto (brr-05..09). The riskiest item (the optimistic/undo state machine) is frontend-only and reconciles against the same endpoints — one optional **light** review at the close-gate covers action-call safety.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-p2-booking-review-workflow.md`](./Tasks/EXECUTION-ORDER-p2-booking-review-workflow.md).

---

## What Phase 2 does (one sentence)

> **Turn the reskinned inbox into a fast triage surface — clear a confident item in one tap from the AI's assist hint, with every action feeling instant (optimistic removal + a deferred-commit Undo that genuinely cancels the call before it fires), a queue that refreshes itself without yanking the list under the cursor, and a toolbar to filter / search / sort / set density — all on the existing API.**

After Phase 2, a doctor can: click "Resolve as Ortho" on an assist-backed row and it's gone instantly (with a 5-second Undo before the Instagram DM actually sends); leave the tab open and see a "3 new" pill appear rather than a list that reshuffles; and filter to "Low confidence only" sorted by urgency. What Phase 2 does *not* add is the conversation drawer, mobile cards, or keyboard triage — those are Phase 3.

---

## What's already in place (so the scope stays bounded)

- **The action flow + 409 handling exist** — `runAction(reviewId, fn, okMessage)` ([`ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) ~208) wraps confirm/reassign/cancel, sets the banner, refetches, and handles the **409 "already resolved → refetch"** branch. Phase 2 restructures *how* it commits (optimistic + deferred), not *what* it calls (BR-DL-2 / BR-DL-7).
- **The display pipeline exists** — `displayReviews` (`useMemo`, ~175) already feeds the table; `sortPendingByUrgency` + `countDueWithin1h` + `useTickInterval` are in place. Filters/sort (brr-08) extend this pipeline; they don't replace it.
- **The assist hint is already rendered** — `r.assist_hint.top_resolutions` shows as prose (~455). Quick-resolve (brr-07) makes the top resolution(s) actionable; the copy/structure is reused.
- **The visibility-aware polling pattern is proven** — [`useDashboardCounts`](../../../../../../frontend/hooks/useDashboardCounts.ts) polls every 30 s, pauses while hidden, refetches on focus, stale-while-revalidate. brr-06 reuses this exact pattern for the inbox.
- **The API surface is fixed** — `getServiceStaffReviews`, `postConfirm…`, `postReassign…`, `postCancel…` ([`lib/api.ts`](../../../../../../frontend/lib/api.ts) ~4593–4724). **There is no inverse/reopen endpoint** — which is *why* Undo is deferred-commit, not a server inverse (see P2-BRR-2).

Net new surface: **a small reusable action-toast host, an optimistic/deferred-commit dispatcher around `runAction`, a polling hook + "N new" pill, quick-resolve buttons, and a filter/sort/density toolbar** — all under `frontend/components/service-reviews/` + `frontend/lib/`.

---

## Decision lock

The product plan's **BR-DL-1 .. BR-DL-9** and Phase 1's **P1-BRR-1 .. P1-BRR-4** carry forward. Especially binding: **BR-DL-2 (no backend; consume the existing contract)**, **BR-DL-5 (PHI in-session, no new logging)**, **BR-DL-7 (optimistic actions reconcile; undo never just "puts the row back" locally)**.

These five are **Phase-2-specific**, frozen for this batch:

**P2-BRR-1 — Quick-resolve is a shortcut over the existing actions, never a new one (resolves part of R-QUICKRESOLVE).** "Resolve as {label}" maps to: **confirm** when the chosen resolution equals `proposed_catalog_service_key`; **reassign** (to that service, no teaching append) when it differs. It fires the same endpoint with the same payload shape as the manual path. It never auto-resolves, never hides Confirm/Reassign/Cancel, and is only shown when `assist_hint.top_resolutions` is non-empty.

**P2-BRR-2 — Undo is deferred-commit, not a server inverse (resolves BR-Q2).** There is no reopen/un-confirm endpoint, and Confirm sends a real Instagram DM. So Undo is implemented as a **delayed commit**: on action, the row is optimistically removed and the real API call is **scheduled** after a window (default 5 s); Undo **cancels the scheduled call before it fires** and restores the row. This honours BR-DL-7 — the action either fires for real (then reconciles, incl. 409) or never fires at all; we never fabricate a local "undo" of a committed server change. Applies to **Confirm and Cancel**. **Reassign commits immediately on dialog submit** (it's a deliberate multi-field action that may write teaching hints) — it gets optimistic removal + reconcile but **no Undo window**.

**P2-BRR-3 — Add one small reusable action-toast; don't refactor the app's toasts (resolves the BR-Q2 toast dependency).** The repo has no shared toast (only ad-hoc `layoutUxToast` / `NewOutputToast`). Phase 2 adds a minimal, self-contained action-toast host (portal, queue, auto-dismiss, an Undo action button, `role="status"`) used by the inbox. It is built to be promotable app-wide later, but Phase 2 does **not** migrate existing toasts or mount a global provider beyond what the inbox needs.

**P2-BRR-4 — Auto-refresh never reorders under the cursor (resolves BR-Q4).** Poll `getServiceStaffReviews(activeTab)` every 30 s, visibility-aware (reuse the `useDashboardCounts` pattern), stale-while-revalidate. New **pending** rows are **not** spliced in live; a non-disruptive "N new" pill appears and merges on click. Polling **pauses** while a dialog is open or a deferred-commit window is in flight, so a refetch can't clobber an in-progress action. Resolved tabs may refresh in place (no destructive reorder there).

**P2-BRR-5 — Filters/sort/density are client-side over `displayReviews`; the urgency sort stays the pending default.** No new fetch. The toolbar composes with the active tab and Phase 1's `sortPendingByUrgency` (which remains the default "Most urgent" option). Density is a `localStorage`-persisted view pref, not server state.

---

## Why this batch (Phase 2 specifically)

1. **The inbox looks right but still works slowly.** Phase 1 fixed the look; the workflow is still manual-refresh, full-refetch-per-action, oldest-first-with-no-shortcuts. Phase 2 is where it becomes a tool you can clear quickly.
2. **The assist hint is computed and wasted.** The bot already aggregates "similar cases resolved as X (5×)"; turning that into a one-tap action (brr-07) is the highest-leverage speed win and needs no new data.
3. **Optimistic + deferred Undo is safer *and* faster here.** Because Confirm sends a patient-facing DM, a 5-second deferred-commit window is both a speed win (instant UI) and a safety net (misclick recovery) — a rare case where the better UX is also the safer one (P2-BRR-2).
4. **It unblocks Phase 3.** Keyboard triage (R-KEYBOARD) wants instant actions + a stable, filterable list; the drawer (R-DRAWER) opens off rows that the filter/sort produce. Building the workflow spine first makes Phase 3 additive.

This batch closes Phase 2 with **5 tasks across 4 waves**, **~4–7 dev-days**, **zero migrations, zero backend changes, zero Opus build tasks**. The close-gate artifact: click "Resolve as X" → row vanishes, toast "Resolved · Undo" counts down, Undo restores it (and no DM was sent); wait it out → the DM sends and the list reconciles; leave the tab → a "2 new" pill appears without reshuffling; filter to "Low only / Most urgent" → the list narrows; and Confirm/Reassign/Cancel still send exactly what they sent in Phase 1.

---

## Cross-cutting acceptance gate (whole batch)

All must be green before the batch is closed.

### Optimistic + Undo + toast (brr-05)

- [x] A reusable action-toast host renders queued toasts (portal, `role="status"`, auto-dismiss, optional Undo action) (P2-BRR-3).
- [x] Confirm / Cancel optimistically remove the row and **schedule** the real API call after the Undo window (default 5 s); Undo cancels the scheduled call **before it fires** and restores the row (P2-BRR-2 / BR-DL-7).
- [x] If the window elapses, the real call fires and reconciles: success → row stays gone (+ success toast); **409 → refetch + "already resolved" message**; other error → row restored + error toast.
- [x] Tab switch / unmount **flushes** in-flight deferred commits (fires the real call) rather than dropping them; the Undo window is only available while mounted on that tab.
- [x] Reassign commits immediately on submit (optimistic removal + reconcile, **no** Undo window) and preserves the teaching payload exactly.

### Auto-refresh + "N new" pill (brr-06)

- [x] The inbox polls `getServiceStaffReviews(activeTab)` every 30 s, pauses while hidden, refetches on focus (reuse the `useDashboardCounts` pattern), stale-while-revalidate (P2-BRR-4).
- [x] New pending rows surface as a "N new" pill, not a live splice; clicking merges + re-sorts. Resolved tabs may refresh in place.
- [x] Polling pauses while a dialog is open or a deferred-commit window is active; resumes after.

### Quick-resolve (brr-07)

- [x] The top 1–2 `assist_hint.top_resolutions` render as "Resolve as {label} · {count}×" actions on pending rows (hidden when no assist).
- [x] Quick-resolve fires **confirm** (resolution == proposal) or **reassign** (differs, no teaching append) via the brr-05 optimistic/undo flow; same payloads as the manual path (P2-BRR-1).
- [x] Confirm/Reassign/Cancel remain visible and unchanged.

### Filters / sort / density (brr-08)

- [x] Text filter (patient name / service label / service key), confidence filter (incl. "Low only"), and a sort control (Most urgent [default] / Newest / Oldest / Confidence) compose with the active tab over `displayReviews` (P2-BRR-5).
- [x] Density toggle (comfortable / compact) persists in `localStorage`.
- [x] A distinct "no matches" empty state (vs the empty-queue state) when filters exclude all rows.

### Integration + parity (brr-09)

- [x] Confirm / Reassign / Cancel (manual **and** quick-resolve) fire identical API calls to Phase 1 (diff incl. the reassign teaching payload); 409 still reconciles.
- [x] No PHI added to logs / analytics / telemetry, including the toast text and poll paths (BR-DL-5).
- [x] No row is lost or double-sent across: Undo, window-elapse, tab switch mid-window, and a poll landing during a commit.

### Quality

- [x] `cd frontend; npx tsc --noEmit` clean; `npm run lint` clean (warnings ok).
- [x] Phase 2 test suites green (deferred-commit fire/cancel/flush, 409 reconcile, quick-resolve routing, filter/sort composition). Run targeted suites.
- [x] No edit to `frontend/app/dashboard/booking-review/page.tsx`, the backend, or `staff-review-match-explain.ts` copy.

### Documentation

- [x] `docs/Work/capture/inbox.md` gains a line: Phase 2 (quick-resolve + optimistic/undo + auto-refresh + filters) shipped; undo is deferred-commit (no inverse endpoint); deferred items = drawer / mobile / keyboard (Phase 3) + a future reopen endpoint if true post-commit undo is ever wanted.

---

## Phase plan position

This is **Phase 2 of 3 (Workflow)**.

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Foundation: reskin + SLA (R-RESKIN, R-SLA) | ✅ Shipped (brr-01..04) |
| **Phase 2** | **Workflow: quick-resolve, optimistic + undo + auto-refresh, filters (R-QUICKRESOLVE, R-OPTIMISTIC, R-FILTERS)** | ▶ This batch (brr-05..09) |
| Phase 3 | Depth + platform: detail drawer + conversation, mobile cards, keyboard triage (R-DRAWER, R-MOBILE, R-KEYBOARD) | Pending |

---

## Out-of-scope (rolled forward)

| Out-of-scope item | Where it lands |
|---|---|
| Detail `Sheet` + read-only IG conversation + resolved audit | Phase 3 (R-DRAWER, BR-Q3) |
| Mobile card layout | Phase 3 (R-MOBILE) — Phase 2 keeps the current table |
| Keyboard triage + bulk select | Phase 3 (R-KEYBOARD) — Phase 2's toolbar `/`-focus is the only shortcut |
| True post-commit undo (reopen a resolved review) | Needs a backend reopen endpoint — out of scope (P2-BRR-2) |
| Saved views / per-doctor default filter | Fast-follow after R-FILTERS (B4.4) |
| App-wide toast provider / migrating existing toasts | Out of scope (P2-BRR-3) — the action-toast is inbox-scoped but promotable |
| Multi-tab count badges (extra fetches) | Still deferred (P1-BRR-4) |
| Throughput analytics | Future `Insights` page (B4.1) |

---

## Cost estimate

| Wave | Tasks | Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | brr-05 | 1/1 | 0/1 | ~4–6h (the state machine — the heavy item) |
| Wave 2 | brr-06, brr-07 | 2/2 | 0/2 | ~5–7h (serial — same component) |
| Wave 3 | brr-08 | 1/1 | 0/1 | ~3–4h |
| Wave 4 | brr-09 | 1/1 | 0/1 | ~2–3h |
| **Total** | **5** | **5** | **0** | **~14–20h (~4–7 dev-days incl. review/QA)** |

**No Opus build tasks** per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md): no PHI write path, no RLS, no migration, no novel security. Optional **light** review after brr-09 of the deferred-commit edge cases (the one place a bug could drop or double-send a patient-facing action).

---

## Sequencing notes (the why behind the waves)

- **brr-05 first, alone.** The optimistic/deferred-commit dispatcher + the action-toast is the spine every other item leans on (quick-resolve fires through it; auto-refresh must respect its in-flight window). Get the state machine right before layering UI.
- **Wave 2 (brr-06 → brr-07) is serial.** Both edit the inbox and depend on brr-05's dispatcher: auto-refresh must pause around the deferred window; quick-resolve dispatches through it.
- **brr-08 after the action spine + refresh** so filters/sort compose with the (possibly merged) list and the existing urgency sort.
- **brr-09 last** — the parity + safety gate, with special attention to the optimistic edge cases (Undo, elapse, tab-switch-mid-window, poll-during-commit).
- **Reorder vs the plan's list:** the product plan lists R-QUICKRESOLVE before R-OPTIMISTIC, but quick-resolve should *inherit* the instant feel and dispatch through the optimistic flow — so the optimistic spine (brr-05) is built first. Quick-resolve (brr-07) then hooks into it cleanly instead of being rewritten when optimism lands.

---

## References

- **Source:** [`Product plans/plan-booking-review-redesign.md`](../../../../../Product%20plans/plan-booking-review-redesign.md) — R-QUICKRESOLVE, R-OPTIMISTIC, R-FILTERS, BR-DL-7, BR-Q2/Q4.
- Phase 1 batch: [`p1-reskin/plan-p1-booking-review-redesign-batch.md`](../p1-reskin/plan-p1-booking-review-redesign-batch.md).
- [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — the reskinned component Phase 2 extends (`runAction` ~208; `displayReviews` ~175; assist hint ~455).
- [`frontend/hooks/useDashboardCounts.ts`](../../../../../../frontend/hooks/useDashboardCounts.ts) — the visibility-aware polling pattern brr-06 reuses.
- [`frontend/lib/api.ts`](../../../../../../frontend/lib/api.ts) — `getServiceStaffReviews` / `postConfirm…` / `postReassign…` / `postCancel…` (~4593–4724); **no inverse endpoint** (P2-BRR-2).
- [`frontend/components/consultation/NewOutputToast.tsx`](../../../../../../frontend/components/consultation/NewOutputToast.tsx) · [`frontend/lib/patient-profile/layout-ux-toast.ts`](../../../../../../frontend/lib/patient-profile/layout-ux-toast.ts) — existing ad-hoc toast patterns (why P2-BRR-3 adds a small reusable one).
- [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md)
- Sibling: [`Tasks/EXECUTION-ORDER-p2-booking-review-workflow.md`](./Tasks/EXECUTION-ORDER-p2-booking-review-workflow.md).

---

**Created:** 2026-05-31.  
**Status:** `Committed` (Phase 2 of the p1-booking-review-redesign program).  
**Closes:** when all five brr tasks' gates + the cross-cutting gate above pass.  
**Next phase:** Phase 3 — Depth + platform (R-DRAWER, R-MOBILE, R-KEYBOARD), promoted to its own batch after this lands.
