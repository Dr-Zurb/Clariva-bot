# Booking review redesign — Phase 1: design-system reskin + SLA urgency — 31 May 2026 batch plan

> **Phase 1 of the Booking-review redesign program — the "looks basic" fix.** This batch rewrites the one inbox component ([`ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx)) onto the shipped shadcn/ui design system and surfaces the **SLA urgency** signal that is already in the data but invisible today. No backend changes. No new visual language. Behaviour-preserving on every action.
>
> **Source plan:** [`Product plans/plan-booking-review-redesign.md`](../../../../../Product%20plans/plan-booking-review-redesign.md) — R-RESKIN + R-SLA in §R-item details / §Sequencing Phase 1.
>
> **Prefix note:** tasks are `brr-*` (`brr` = booking-review redesign). Later phases (workflow, depth/platform) take their own waves under the same prefix.
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Zero Opus build tasks; four Auto (brr-01..04). The work is rendering + wiring against an existing API contract — no PHI write path, no RLS, no migration, no novel security.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-p1-booking-review-redesign.md`](./Tasks/EXECUTION-ORDER-p1-booking-review-redesign.md).

---

## What Phase 1 does (one sentence)

> **Replace every hand-rolled chip / pill / banner / modal / button / spinner in the Booking-review inbox with the shipped design-system primitives (`Card`, `Badge`, `Button`, `Tabs`, `Dialog`, `Skeleton`, `Alert` + `lucide-react`), and render the `sla_deadline_at` urgency the backend already computes — a live countdown that escalates under threshold, with pending sorted most-urgent-first — without changing a single confirm / reassign / cancel outcome.**

After Phase 1, a doctor opening Booking review sees a surface that looks like the rest of the dashboard (not a generic V0 table), and can tell at a glance **which reviews are about to auto-cancel**. What Phase 1 does *not* yet add is one-tap assist-resolve, optimistic actions/auto-refresh, filters, the conversation drawer, mobile cards, or keyboard triage — those are Phases 2–3.

---

## What's already in place (so the scope stays bounded)

The reskin is smaller than "rewrite the inbox" implies because the data layer and helpers are kept:

- **The API contract is stable and already fetched.** `GET /api/v1/service-staff-reviews` returns `ServiceStaffReviewListItem` ([`frontend/types/service-staff-review.ts`](../../../../../../frontend/types/service-staff-review.ts)) with **every field Phase 1 needs already on the wire** — including `sla_deadline_at`, which is fetched today and never rendered. No backend work (BR-DL-2).
- **The match-explanation copy lives in a helper** — [`frontend/lib/staff-review-match-explain.ts`](../../../../../../frontend/lib/staff-review-match-explain.ts) (`matchExplanationSummary`, `matchReasonChipMeta`, `parseMatchReasonCodes`, `parseCandidateLabels`, `formatCandidateSummary`). Reused by reference; copy is unchanged.
- **The design system is shipped** — [`frontend/components/ui/`](../../../../../../frontend/components/ui/) has `Card`, `Badge` (with `success`/`warning`/`info`/`destructive` variants), `Button`, `Tabs`, `Dialog`, `Select`, `Skeleton`, `Alert`, `Tooltip`, `HoverCard`. `lucide-react` is a dependency. Inter + `tabular-nums` are wired. Phase 1 **consumes** these; it does not invent a new visual language (BR-DL-1).
- **The action + 409 logic is correct** — `runAction` (confirm / reassign / cancel → refetch, with the 409 "already resolved → refetch" branch) and the reassign "teaching moment" payload (`sanitizeReasonForHintSuggestion`, include-when / exclude-when appends) work today. Phase 1 **re-homes them into primitives unchanged** (BR-DL-2 / BR-DL-7).
- **The mount + server fetch are kept** — [`frontend/app/dashboard/booking-review/page.tsx`](../../../../../../frontend/app/dashboard/booking-review/page.tsx) (auth, parallel fetch, cold-start error) is untouched.

Net new surface: **the rewritten inbox internals + two small atoms (`ConfidenceBadge`, `SlaCountdown`) + one relative-time util** — all under `frontend/components/service-reviews/` + `frontend/lib/`.

---

## Decision lock

The product plan's **BR-DL-1 .. BR-DL-9** carry forward unchanged. Especially binding here: **BR-DL-1 (reskin onto primitives, no new chip styles)**, **BR-DL-2 (frontend-only, behaviour-preserving)**, **BR-DL-3 (surface SLA urgency)**, **BR-DL-5 (PHI in-session, no new logging)**, **BR-DL-7 (preserve the 409 path)**.

These resolve the two open questions the plan flagged for Phase 1, frozen for this batch:

**P1-BRR-1 — Confidence renders as `Badge` + a 3-segment meter (resolves BR-Q1).** A new `ConfidenceBadge` atom maps the confidence string → a `Badge` variant (`high` → `success`, `medium` → `warning`, `low`/unknown → `destructive`/`info`) plus a 3-segment meter for fast scanning + a11y (colour is never the only signal). It replaces the hand-rolled `confidenceClass()`.

**P1-BRR-2 — Keep the `ServiceReviewsInbox` file/component name in Phase 1 (resolves BR-Q5).** The internal rename to `BookingReviewInbox` (BR-DL-9) is **deferred** — it adds import churn for zero doctor-visible value and would bloat an already-large reskin diff. Revisit when/if a later phase touches the folder anyway. The route/label are already "Booking review" (sidebar plan); only the internal class name lags, which ships to nobody.

**P1-BRR-3 — Phase 1 keeps the desktop table + the inline "technical detail" expander.** Mobile cards (BR-DL-8 / R-MOBILE) and the detail `Sheet` (R-DRAWER) are Phase 3. Phase 1 reskins the existing table and keeps the existing expand-row so the diff stays a *reskin*, not a re-architecture. The current `overflow-x-auto` mobile behaviour is preserved as-is until R-MOBILE.

**P1-BRR-4 — Per-tab count badges are scoped to what's already loaded.** Phase 1 shows a count `Badge` on the **Pending** tab (from the loaded pending rows) and a compact summary header with a **Pending** and a **Due < 1h** number. Full multi-tab counts (which need extra fetches) are a later additive read; not in this batch.

---

## Why this batch (Phase 1 specifically)

1. **It closes the last "generic V0" surface.** Every other dashboard page adopted the design system in `plan-ui-system-redesign.md`; this inbox didn't. The reskin (brr-01/02) fixes ~80% of the "too basic" complaint in one pass and is low-risk because behaviour is frozen (BR-DL-2).
2. **SLA urgency is the single highest-value missing signal and it's free.** These reviews auto-cancel on a timeout; `sla_deadline_at` is already fetched and thrown away. Rendering it (brr-03) turns the queue from "oldest first, no urgency" into a real triage list — with no backend change.
3. **It unblocks every later phase.** Quick-resolve (Phase 2), the drawer (Phase 3), and keyboard triage (Phase 3) all hang off the reskinned row + the SLA sort. Doing the foundation first makes the rest additive.

This batch closes Phase 1 with **4 tasks across 3 waves**, **~3–5 dev-days**, **zero migrations, zero backend changes, zero Opus build tasks**. The visible artifact at the close-gate: the inbox looks native to the dashboard, every pending row shows an accurate "Due in …" chip that escalates and sorts urgent-first, and Confirm / Reassign / Cancel behave byte-identically to today (same API calls, same 409 handling, same teaching-hint payload).

---

## Cross-cutting acceptance gate (whole batch)

All must be green before the batch is closed.

### Reskin — shell + states + atoms (brr-01)

- [x] Header uses `Button` (refresh, with a `lucide-react` icon) + title/subtitle; a compact summary row shows **Pending** (and a **Due < 1h** slot brr-03 fills).
- [x] Status tabs use `Tabs` / `TabsList` / `TabsTrigger`; the **Pending** trigger carries a count `Badge`.
- [x] OK / error banners use `Alert` (default / destructive) with an icon; loading uses `Skeleton` rows (no bare spinner); empty states use `Card` + `Button` link.
- [x] New `ConfidenceBadge` atom (P1-BRR-1) replaces `confidenceClass()`; `rg "confidenceClass"` finds nothing.
- [x] All timestamps/counts carry `tabular-nums`; no raw `gray-*`/`blue-*` literals remain in the shell (token classes only).

### Reskin — rows + dialogs (brr-02)

- [x] Row cells (patient, reason preview, AI proposal + assist hint, match signals, queued/resolved time, actions) render via primitives; actions use `Button` variants (Confirm = default, Reassign = outline, Cancel = destructive/ghost).
- [x] Reassign + Cancel modals use `Dialog` / `DialogContent` / `DialogHeader` / `DialogFooter`; the reassign catalog/modality pickers use `Select`.
- [x] The reassign "teaching moment" logic (`sanitizeReasonForHintSuggestion`, include-when / exclude-when appends, Skip-teaching) is preserved verbatim in behaviour.
- [x] `runAction` + the **409 "already resolved → refetch"** branch + all success/error copy intent are unchanged (BR-DL-2 / BR-DL-7).
- [x] The inline "Show technical detail" expander is preserved (drawer is Phase 3).

### SLA urgency (brr-03)

- [x] `SlaCountdown` renders `sla_deadline_at` as a live chip ("Due in 38m" / "Overdue 5m"), ticking ~30 s, escalating `Badge` variant (e.g. `warning` < 1h, `destructive` overdue) (BR-DL-3).
- [x] Null `sla_deadline_at` degrades to a queued-age cue ("queued 3h ago", from `created_at`) with no layout break.
- [x] Pending list defaults to soonest-deadline-first; null-deadline rows fall back to queued-age ordering.
- [x] The summary header's **Due < 1h** count is wired from the pending rows.

### Integration + parity (brr-04)

- [x] Confirm / Reassign / Cancel fire **identical API calls** to today (diff the network calls incl. the teaching-hint payload); 409 still refetches.
- [x] PHI stays in-session; no patient/reason text added to logs, analytics, or telemetry (BR-DL-5).
- [x] Visual parity reviewed at 1366 / 1920 px; existing `overflow-x-auto` mobile behaviour unchanged (P1-BRR-3).

### Quality

- [x] `cd frontend; npx tsc --noEmit` clean.
- [x] `cd frontend; npm run lint` clean (warnings only).
- [x] Phase 1 test suites green (confidence-badge mapping, SLA threshold/overdue boundary, pending sort). Run targeted suites.
- [x] No edit to `frontend/app/dashboard/booking-review/page.tsx`, the backend, or `staff-review-match-explain.ts` copy.

### Documentation

- [x] `docs/Work/capture/inbox.md` gains a line noting Phase 1 (reskin + SLA) shipped + any rough edges found while dogfooding, and that the `BookingReviewInbox` rename (BR-Q5) + multi-tab counts remain deferred.

---

## Phase plan position

This is **Phase 1 of 3 (Foundation)**. The ladder (from [`plan-booking-review-redesign.md` §Sequencing](../../../../../Product%20plans/plan-booking-review-redesign.md#sequencing)):

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | **Foundation: design-system reskin + SLA urgency (R-RESKIN, R-SLA)** | ▶ This batch (brr-01..04) |
| Phase 2 | Workflow: one-tap assist resolve, optimistic + auto-refresh + undo, filters (R-QUICKRESOLVE, R-OPTIMISTIC, R-FILTERS) | Pending |
| Phase 3 | Depth + platform: detail drawer + conversation, mobile cards, keyboard triage (R-DRAWER, R-MOBILE, R-KEYBOARD) | Pending |

---

## Out-of-scope (rolled forward)

| Out-of-scope item | Where it lands |
|---|---|
| One-tap "Resolve as X" from `assist_hint` | Phase 2 (R-QUICKRESOLVE) |
| Optimistic actions + auto-refresh + undo (toast) | Phase 2 (R-OPTIMISTIC, BR-Q2) |
| Filter / search / sort toolbar + density | Phase 2 (R-FILTERS) |
| Detail `Sheet` + read-only IG conversation + resolved audit | Phase 3 (R-DRAWER, BR-Q3) |
| Mobile card layout (replaces `overflow-x-auto` table) | Phase 3 (R-MOBILE) — Phase 1 keeps current behaviour |
| Keyboard triage + bulk select | Phase 3 (R-KEYBOARD) |
| Full multi-tab count badges (extra fetches) | Later additive read (P1-BRR-4) |
| `ServiceReviewsInbox` → `BookingReviewInbox` rename | Deferred (P1-BRR-2 / BR-Q5) |
| Throughput analytics (resolved/day, avg time, reassign rate) | Future `Insights` page (B4.1) |

---

## Cost estimate

| Wave | Tasks | Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | brr-01, brr-02 | 2/2 | 0/2 | ~6–9h (sequential — same component) |
| Wave 2 | brr-03 | 1/1 | 0/1 | ~3–4h |
| Wave 3 | brr-04 | 1/1 | 0/1 | ~2–3h |
| **Total** | **4** | **4** | **0** | **~11–16h (~3–5 dev-days incl. review/QA)** |

**No Opus build tasks** per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md): no PHI write path, no RLS, no migration, no novel security, no persisted-state mutation logic. The work is rendering + wiring against a stable read API. Optional **light** review after brr-04 to confirm action-call parity (the one place a reskin bug could send the wrong booking link).

---

## Sequencing notes (the why behind the waves)

- **Wave 1 is a single sequential lane (brr-01 → brr-02).** Both rewrite `ServiceReviewsInbox.tsx`: brr-01 lays the shell (header, tabs, banners, loading, empty states) + shared atoms; brr-02 rewrites the rows + the two dialogs. They share the file, so they serialise ([`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md): don't invent parallel lanes that fight over one file).
- **Wave 2 (brr-03) depends on the reskinned rows + the summary-header slot** from Wave 1 — the `SlaCountdown` chip mounts in the row, and the "Due < 1h" count fills the header placeholder brr-01 created.
- **Wave 2 → Wave 3 is a kind-of-work cut.** Waves 1–2 = build; Wave 3 (brr-04) = integration, behaviour-parity verification, the Phase 1 gate, and tests.

---

## References

- **Source:** [`Product plans/plan-booking-review-redesign.md`](../../../../../Product%20plans/plan-booking-review-redesign.md) — R-RESKIN, R-SLA, BR-DL-1..9, BR-Q1/Q5.
- [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — the component this batch rewrites.
- [`frontend/types/service-staff-review.ts`](../../../../../../frontend/types/service-staff-review.ts) — the stable contract (note the unused `sla_deadline_at`).
- [`frontend/lib/staff-review-match-explain.ts`](../../../../../../frontend/lib/staff-review-match-explain.ts) — match-explanation copy, reused by reference.
- [`frontend/components/ui/`](../../../../../../frontend/components/ui/) — the primitives (`card`, `badge`, `button`, `tabs`, `dialog`, `select`, `skeleton`, `alert`, `tooltip`, `hover-card`).
- [`frontend/lib/format-date.ts`](../../../../../../frontend/lib/format-date.ts) — the single source for date/time rendering (use for SLA absolute tooltips).
- [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md)
- Sibling: [`Tasks/EXECUTION-ORDER-p1-booking-review-redesign.md`](./Tasks/EXECUTION-ORDER-p1-booking-review-redesign.md).

---

**Created:** 2026-05-31.  
**Status:** `Committed` (Phase 1 of the p1-booking-review-redesign program).  
**Closes:** when all four brr tasks' gates + the cross-cutting gate above pass.  
**Next phase:** Phase 2 — Workflow (R-QUICKRESOLVE, R-OPTIMISTIC, R-FILTERS), promoted to its own batch after this lands.
