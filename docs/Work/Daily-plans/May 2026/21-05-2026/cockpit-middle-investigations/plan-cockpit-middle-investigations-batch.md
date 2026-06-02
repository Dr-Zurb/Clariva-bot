# Cockpit middle — Investigations leaf — 21 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR rule #1: **plan with Opus, execute with Auto, polish with Composer**. This batch has **zero Opus tasks** — none of the three tasks meet the hard-rules thresholds (no PHI columns added, no RLS redesign, no novel security; the new `InvestigationsPane` is presentational and the field `investigations_orders` already exists on `RxFormContext` via cv2-04). Two tasks are Auto; one is Composer 2 Fast (cmi-03 the verification close-out).
>
> **Source plan:** [`Product plans/plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) §R-MIDDLE (line ~342) — Investigations sub-pane. R-MIDDLE bottom-left is the **fourth-priority** Phase-2 follow-up per the [execution roadmap](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md) §6. R-MIDDLE-rest (Assessment strip + safety + footer + Body refactor + narrow-monitor) ships in the sibling [`cockpit-middle-rebuild`](../cockpit-middle-rebuild/) batch.
>
> **Predecessor batches:**
> - [Daily-plans/May 2026/19-05-2026/cockpit-shell-flip](../../19-05-2026/cockpit-shell-flip/) — csf-04 mounts the 8-pane tree; csf-03 mounted `<PanePlaceholder>` for `investigations-orders`. This batch replaces that placeholder with a real `<InvestigationsPane>`.
> - [Daily-plans/May 2026/17-05-2026/cockpit-v2](../../17-05-2026/cockpit-v2/) — cv2-04's migration 103 renamed `investigations` → `investigations_orders` and `RxFormContext.fields.investigationsOrders` exists. cv2-06 split `PrescriptionForm` into section components but the Investigations input is currently inside the Plan composition root (not its own section). This batch extracts it.
> - [Daily-plans/May 2026/21-05-2026/templates-r-mod](../templates-r-mod/) — sibling batch that adds Voice / Text / Review template factories. **Sequencing dependency:** this batch's cmi-02 modifies `templates.tsx` which tmr-01 also writes. Wave order: tmr-01 ships first (adds factories), then cmi-02 swaps the placeholder leaf in all four factories.
> - [backend/migrations/](../../../../../backend/migrations/) — **no new migrations**. `investigations_orders` column already exists from cv2-04's migration 103.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-cockpit-middle-investigations.md`](./Tasks/EXECUTION-ORDER-cockpit-middle-investigations.md).

---

## Why this batch

After `cockpit-shell-flip` + `cockpit-chart-extraction`, exactly one `<PanePlaceholder>` remains in production: the Investigations leaf in the middle column's bottom row, tagged `R-MIDDLE (Investigations extraction deferred)`. The placeholder is functional — doctors can still scroll the Plan pane and enter investigations via the chip-row inside the Rx composition root — but the layout's value prop ("investigations live next to medicines, not below them") is unrealized.

The clinical justification is concrete: today the order of fields in the Plan pane forces doctors to scroll between "what tests do I want" (investigations chip row) and "what drugs am I prescribing" (medicine list). The 8-pane layout's bottom row was designed to put investigations LEFT of medicines — one glance instead of one scroll. That payoff only lands when the placeholder gets real content.

R-MIDDLE bottom-left ships a dedicated `<InvestigationsPane>` (new component, no header — uses the shell's PaneHeader from above) that:

1. Hosts the existing investigation chip-row + autocomplete (extracted from the current Plan composition root).
2. Subscribes to `RxFormContext` for `fields.investigationsOrders` via the existing `useRxForm()` hook.
3. Renders a `[+ add investigation]` chip with autocomplete (matches the existing pattern from t2.x).
4. Auto-saves on edit via the existing autosave timer — no new save logic.

The architectural unlock: **the investigations chip-row is already a sub-component of the Plan composition root** (`PrescriptionFormCompositionRoot.tsx`). Extracting it is mostly a move + a fresh subscription via `useRxForm()` — the heavy lifting was done in cv2-06.

This batch closes R-MIDDLE bottom-left with **3 tasks across 3 waves**, **~7-9h wall-clock single-engineer (~1 dev-day)**, **zero new migrations**, **zero Opus tasks**. The visible artifact at the close-gate is `/dashboard/appointments/[id]` rendering a real `<InvestigationsPane>` left of the Plan pane in the middle column's bottom row, with the investigations chip-row autosaving like every other RxForm field.

This batch ALSO **clears the last `<PanePlaceholder>` in production**, which means the Phase-2 §"both deferred placeholders replaced with real content" gate from the source plan §6 is reachable after this ships.

---

## Decision lock (frozen for batch duration)

These match the planning conversation locked 2026-05-21. Re-opening any belongs in a new batch.

**DL-1: `<InvestigationsPane>` is a presentational wrapper, mirroring `<SubjectivePane>` / `<ObjectivePane>` / `<HistoryPane>`.** Same shape: hideHeader prop, reads from `RxFormContext` via the existing hook, no own data fetches. Per cv2-06 + csf-03 precedent.

**DL-2: Investigations field uses the existing `fields.investigationsOrders` string slot.** No structured array migration in this batch. The current free-text + chip-row pattern continues. If a future plan wants structured ordered tests (one row per test with status / lab / cost) that's a separate plan with its own DL block.

**DL-3: Investigations chip-row + autocomplete extract from `PrescriptionFormCompositionRoot`.** The component already exists; this batch moves it into a new file. No new chip-row logic, no new autocomplete component. Existing test patterns continue to apply (autocomplete renders, chip add/remove, autosave fires).

**DL-4: Investigations leaf wires into all FOUR templates (Video / Voice / Text / Review).** cmi-02 sweeps `templates.tsx` and swaps every `id: 'investigations-orders'` leaf from `<PanePlaceholder>` to `<InvestigationsPane>`. Per DL-2 of templates-r-mod, the Investigations leaf is identical across modalities — only Body / Plan heights differ.

**DL-5: Read-only mode in Review template.** When `state === 'ended'` or `state === 'terminal'`, the chip-row's `[+ add]` affordance is hidden and existing chips render as static badges. Uses the existing `canEditPrescriptionDraft(state)` gate from `state.ts`. No new prop drilling — InvestigationsPane reads state via its parent's existing prop.

**DL-6: Narrow-monitor auto-merge is OUT of scope.** The container-query auto-merge (Investigations chip-row collapses into the top of Plan when bottom-row width < 720px) is **R-MIDDLE-rest's** concern, not this batch. cockpit-middle-rebuild adds the container query and the auto-merge wrapper; this batch ships the un-merged baseline only.

**DL-7: No backend changes.** `investigations_orders` column already exists from cv2-04's migration 103. RLS already covers the column via the `prescription_drafts` row-level policy. Endpoints already serialize the column. Zero touch to `backend/**`.

**DL-8: Telemetry event `cockpit_v2.r_middle_inv_landed` fires once per session on first mount.** Matches the cce-05 / crb-04 / tmr-05 pattern.

**DL-9: Walk-in fallback unchanged.** Walk-in (`patient_id == null`) keeps the legacy 2-pane layout from csf-05; this batch doesn't run for walk-ins because the new pane is only mounted in the 8-pane tree.

**DL-10: Single autosave timer preserved.** InvestigationsPane subscribes to `useRxForm()` like every other section; the existing single-debounce autosave fires once per edit regardless of which pane the edit came from. Verified by the cross-pane edit smoke test (Subjective + Investigations + Plan edits in one debounce window → one save).

---

## Phases

### Wave 1 — InvestigationsPane component (1 task, ~3-4h, single sequential lane)

The dependency cliff per [EXECUTION-ORDER-GUIDELINES § 0.5 Cut 1](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves). cmi-01 ships the component; cmi-02 wires it into the four template factories.

- [`task-cmi-01-investigations-pane.md`](./Tasks/task-cmi-01-investigations-pane.md) — **M, Auto** — New `frontend/components/patient-profile/panes/InvestigationsPane.tsx`. Mirrors the SubjectivePane / ObjectivePane shape. Renders the investigations chip-row + autocomplete extracted from `PrescriptionFormCompositionRoot.tsx`. Subscribes to `RxFormContext` for `fields.investigationsOrders`. Read-only mode when `state` denotes ended / terminal (DL-5). Smoke at a dev-only fixture (NOT committed).

### Wave 2 — Wire into templates.tsx + production cutover (1 task, ~2-3h, single sequential lane)

**⚠️ Cross-batch dependency:** Wave 2 is gated on [`templates-r-mod`](../templates-r-mod/)'s tmr-01 merge (it ships the four factories cmi-02 sweeps). Practical scheduling: rebase on `templates-r-mod` after tmr-01 lands; this batch's cmi-02 then swaps placeholders in all four factories at once. If `templates-r-mod` isn't merged yet, cmi-02 can swap only in `getTelemedVideoTemplate` and capture-inbox the multi-factory sweep for follow-up; verifying with the executor.

- [`task-cmi-02-wire-into-templates.md`](./Tasks/task-cmi-02-wire-into-templates.md) — **XS, Composer 2 Fast** — In `frontend/lib/patient-profile/templates.tsx`, replace every `<PanePlaceholder title="Investigations" futureRItem="R-MIDDLE (Investigations extraction deferred)" />` with `<InvestigationsPane ctx={ctx} />` (or whatever ctx surface cmi-01 settled on). Updates the per-pane comment header (line ~19 of templates.tsx) to mark `investigations-orders` as DONE. ~15 LOC delta.

### Wave 3 — Verification + close-out (1 task, ~1.5h, single sequential lane)

- [`task-cmi-03-verification-and-close-out.md`](./Tasks/task-cmi-03-verification-and-close-out.md) — **XS, Composer 2 Fast** — Run smoke matrix per cross-cutting gate. tsc + lint + build + test sweep. Wire telemetry event `cockpit_v2.r_middle_inv_landed` (one-shot per session, same pattern as crb-04 / tmr-05). Update `docs/Reference/product/cockpit/COCKPIT.md` to note the Investigations pane is live (no longer a placeholder). Update [`plan-cockpit-v2-execution-roadmap.md`](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md): mark "R-MIDDLE bottom-left" as DONE in §2; batch ledger entry; recommended-ordering pointer to next batch (`cockpit-middle-rebuild`); §10 changelog. Capture-inbox follow-ups: narrow-monitor auto-merge (DL-6); structured ordered-tests migration (DL-2 — future plan); investigations grouping by lab vendor (V2-D4 / V2-D5 adjacencies).

---

## Cross-cutting acceptance gate (whole batch)

These items must all be green before the batch is considered closed.

### Structural

- [ ] **`<InvestigationsPane>` exports from new file.** Mirrors SubjectivePane / ObjectivePane shape.
- [ ] **Last `<PanePlaceholder>` cleared from production.** No occurrence of `PanePlaceholder` with `futureRItem="R-MIDDLE (Investigations extraction deferred)"` left in `templates.tsx`.
- [ ] **Renders in all four templates.** Verified by opening one video appointment + one voice + one text + one completed (review) appointment; Investigations pane renders in all four with the same content.
- [ ] **Read-only in Review template.** Ended / terminal state → `[+ add]` chip hidden; existing chips render but can't be removed.
- [ ] **Walk-in unchanged.** No Investigations pane in the legacy 2-pane fallback.
- [ ] **Kill-switch `?v1=1` unchanged.** Legacy 3-pane layout doesn't mount the Investigations pane (its inputs stay inside Rx).

### Behavior

- [ ] **Chip add/remove works.** Type "ECG" in the autocomplete → chip appears. Click X → chip removed.
- [ ] **Autocomplete shows existing suggestions.** Matches the existing autocomplete behavior from before extraction.
- [ ] **Free-text override field still works** (if exists today in the current chip-row component). Existing behavior preserved.
- [ ] **Edits autosave within the same debounce window.** Add an investigation chip + type Dx + type CC; after 1.5s debounce, single save fires (verify via Network tab — one PATCH `/prescriptions/draft`).
- [ ] **`fields.investigationsOrders` persists.** Add a chip; reload; chip still there.

### Form parity

- [ ] **Single `<RxFormProvider>` in the tree** — verify in React DevTools.
- [ ] **Investigations data round-trips with the Plan-pane data.** Modify Investigations in InvestigationsPane and a medicine in PlanPane; reload; both modifications persist.
- [ ] **No autosave timer interference** — adding 3 investigations rapidly fires one save (not three).

### Quality

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend build` clean.
- [ ] `pnpm --filter frontend test` clean. (Existing investigations-related tests still pass.)
- [ ] No new Sentry errors in a 5-min smoke session.
- [ ] Telemetry — `cockpit_v2.r_middle_inv_landed` fires exactly once per session on first mount.

### Documentation

- [ ] `docs/Reference/product/cockpit/COCKPIT.md` updated — Investigations pane no longer a placeholder; brief one-line note + (optional) tiny inline diagram showing chip-row pattern.
- [ ] `plan-cockpit-v2-execution-roadmap.md` updated — R-MIDDLE bottom-left DONE; batch ledger entry; recommended next batch pointer to `cockpit-middle-rebuild`; §10 changelog.
- [ ] `docs/Work/capture/inbox.md` has 2-3 new lines (narrow-monitor auto-merge; structured ordered-tests; investigations grouping).

---

## Out-of-scope (rolled forward to follow-up batches)

| Out-of-scope item | Where it lands |
|---|---|
| **Narrow-monitor auto-merge** of Investigations into top-of-Plan chip row when bottom-row < 720px | `cockpit-middle-rebuild` batch (sibling, dated today) |
| **Structured ordered tests** (one row per test with status / lab / cost / expected turnaround) | Future plan; current free-text + chips works for v1 |
| **Investigations grouping by lab vendor** (Thyrocare, Dr Lal, etc.) | Future telemed-billing plan |
| **Lab-results browser side-sheet** (V2-D4 from source plan) | Phase 3 or later; uses cv2-09 side-sheet contract when ready |
| **AI-suggested investigations** (e.g., "ECG given chest pain CC") | DL-2 of source plan defers AI; future plan |
| **Investigations pane Body variant** (different content per modality) | Out of scope — same content across all four templates |

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cmi-01 | 1/1 | 0/1 | 0/1 | ~3-4h |
| Wave 2 | cmi-02 | 0/1 | 1/1 | 0/1 | ~2-3h |
| Wave 3 | cmi-03 | 0/1 | 1/1 | 0/1 | ~1.5h |
| **Total** | **3** | **1** | **2** | **0** | **~7-9h (~1 dev-day, single-lane sequential)** |

Token estimate (rough): ~100k input / ~60k output across the batch. Total batch spend (excluding optional close-gate review): ~$5-8.

**One optional Opus close-gate turn after cmi-03** budgeted on top. Skip if every cross-cutting gate above passes cleanly.

---

## Sequencing notes (the why behind the waves)

The 3-wave shape:

- **Wave 1 → Wave 2 is a Cut 1 (dependency cliff).** Without cmi-01's component, cmi-02 has nothing to wire.
- **Wave 2 → Wave 3 is a Cut 3 (kind-of-work change).** Wave 2 = Build (production wire-up). Wave 3 = QA + Docs (smoke, telemetry, capture-inbox, roadmap update).

**Single-lane sequential everywhere.** None of the three tasks are independent enough to justify Shape B parallelism.

**Cross-batch dependencies:**
- Wave 1 (cmi-01) is conflict-free with every other in-flight batch — it creates a new file only.
- Wave 2 (cmi-02) depends on `templates-r-mod`'s tmr-01 if four factories exist. If tmr-01 hasn't landed, cmi-02 swaps placeholders in `getTelemedVideoTemplate` only and capture-inboxes the multi-factory sweep.
- Wave 3 (cmi-03) depends on Wave 2.

Practical scheduling: start Wave 1 on a fresh branch from `main`; rebase onto `templates-r-mod-batch` after tmr-01 merges; run Wave 2 + Wave 3.

**Why no Opus tasks?** Per AGENT-EXECUTION-EFFICIENCY-GUIDE hard-rules list, none of these tasks reach the thresholds. The component extraction is a straightforward move + subscription rewire; the template wire-up is mechanical. Per-message escalation to Opus on cmi-01 only if Auto stalls on the read-only mode plumbing.

---

## References

- [Product plans/plan-cockpit-v2.md §R-MIDDLE (Investigations sub-pane)](../../../Product%20plans/plan-cockpit-v2.md) — source product spec; the Investigations sub-pane bullet is in §R-MIDDLE What block.
- [Product plans/plan-cockpit-v2-execution-roadmap.md](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md) — master tracker; "R-MIDDLE bottom-left only" is the §6 entry this batch addresses.
- [Daily-plans/May 2026/19-05-2026/cockpit-shell-flip/](../../19-05-2026/cockpit-shell-flip/) — predecessor batch; csf-03 mounted the `<PanePlaceholder>` this batch replaces.
- [Daily-plans/May 2026/21-05-2026/templates-r-mod/](../templates-r-mod/) — sibling Phase-2 batch; ships the four-factory landscape this batch sweeps.
- [Daily-plans/May 2026/21-05-2026/cockpit-middle-rebuild/](../cockpit-middle-rebuild/) — next batch in the middle-column chain; depends on this Investigations leaf being real.
- [frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx](../../../../../frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx) — where the Investigations chip-row lives today; cmi-01 extracts from here.
- [frontend/components/cockpit/rx/RxFormContext.tsx](../../../../../frontend/components/cockpit/rx/RxFormContext.tsx) — exposes `fields.investigationsOrders`; cmi-01 subscribes via `useRxForm()`.
- [docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- Sibling: [`Tasks/EXECUTION-ORDER-cockpit-middle-investigations.md`](./Tasks/EXECUTION-ORDER-cockpit-middle-investigations.md) — wave / lane matrix.
