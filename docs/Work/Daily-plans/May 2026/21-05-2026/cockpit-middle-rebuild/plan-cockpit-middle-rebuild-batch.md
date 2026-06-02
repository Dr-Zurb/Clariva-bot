# Cockpit middle rebuild — Assessment / safety / footer / Body / narrow-monitor — 21 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR rule #1: **plan with Opus, execute with Auto, polish with Composer**. This batch has **one optional Opus close-gate** but **zero Opus build tasks** — every build task sits below the hard-rules thresholds (no PHI columns added, no RLS redesign, no novel security). Five tasks are Auto; two are Composer 2 Fast (cmr-06 the wire-up, cmr-07 the verification close-out).
>
> **Source plan:** [`Product plans/plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) §R-MIDDLE (line ~342). R-MIDDLE rest is the **fifth-priority** Phase-2 follow-up per the [execution roadmap](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md) §6. The "bottom-left only" piece (Investigations leaf) ships in the sibling [`cockpit-middle-investigations`](../cockpit-middle-investigations/) batch; this batch ships everything else.
>
> **Predecessor batches:**
> - [Daily-plans/May 2026/19-05-2026/cockpit-shell-flip](../../19-05-2026/cockpit-shell-flip/) — csf-03 wired Subjective / Objective / Body / Plan leaves. csf-04 mounts the 8-pane tree in production. This batch adds an Assessment sticky strip BETWEEN Body and bottom-row, plus safety + action-footer overlays in the bottom-row.
> - [Daily-plans/May 2026/17-05-2026/cockpit-v2](../../17-05-2026/cockpit-v2/) — cv2-04's migration 103 added the DL-24 fields (vitals*, examinationFindings, differentialDiagnosis, etc.); cv2-05 ships `RxFormContext`; cv2-06 ships AssessmentSection with `id="diagnosis"`. cv2-09 ships the `aux-surfaces.ts` tab + side-sheet + Cmd+K contracts this batch leans on.
> - [Daily-plans/May 2026/21-05-2026/templates-r-mod](../templates-r-mod/) — sibling batch; the 4 template factories this batch's cmr-06 sweeps. **Sequencing dependency:** tmr-01 ships first; cmr-06 must rebase on it.
> - [Daily-plans/May 2026/21-05-2026/cockpit-middle-investigations](../cockpit-middle-investigations/) — sibling batch; the Investigations leaf real-content swap. **Sequencing dependency:** cmi-02 ships first; cmr-06 inherits the un-placeholdered factories.
> - [backend/migrations/](../../../../../backend/migrations/) — **no new migrations**. All DL-24 fields already shipped via cv2-04 / migration 103.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-cockpit-middle-rebuild.md`](./Tasks/EXECUTION-ORDER-cockpit-middle-rebuild.md).

---

## Why this batch

After `cockpit-shell-flip` + the three sibling 21-05-2026 batches (`cockpit-ribbon`, `templates-r-mod`, `cockpit-middle-investigations`), the middle column has Body / Investigations / Plan as separate leaves but is still missing four load-bearing pieces from the source plan §R-MIDDLE:

1. **Assessment sticky strip** between Body and bottom-row — Working Dx + DDx chip row, ~60px tall, sticky so it survives bottom-row scrolling. Source plan §4 + DL-19: the Dx is the single source of truth that the ribbon's `🎯 Treating` mirror reflects.
2. **Safety sticky strip** at the top of the bottom-row — allergy clash banner + DDI chips, pinned above the Investigations / Plan content. Source plan DL-9 + the long-standing TODO β-1 in `RxWorkspace.tsx`.
3. **Plan action footer** at the bottom of the bottom-row — `Saved · {time}  |  [Save]  [Send Rx & finish ▸]`, sticky across both Investigations + Plan sub-columns. Source plan DL-1 (stickiness) + the "Send button always reachable" success criterion (§7 of source plan).
4. **Body refactor** — make the Body leaf template-aware so Voice / Text / Review get the right content. Per source plan §4: video tile / voice controls / chat thread / hidden. cmr-04 cleans up `ConsultationBodyPane` so the existing modality inference is the load-bearing path, not template-specific render branches.
5. **Narrow-monitor auto-merge** — when bottom-row width < 720px (~1366px container), Investigations auto-merges into a chip row at top of Plan. Source plan §"Narrow monitor (≤ 1366px container)" + DL-20. Uses container queries (V2-Q9 — polyfill if needed).

The clinical justification is concrete: today the Dx field is buried inside the Plan section's body scroll, the allergy clash banner can scroll out of view, the Send button can scroll out of view, and on narrow monitors Investigations cramps Plan. All four are friction points the source plan addressed; this batch makes them real.

The architectural unlock: **all four sticky strips share the shell's `min-h-0` + `flex` discipline**. The Assessment strip is part of the middle-column children array (a third child between Body and bottom-row); the safety strip + action footer are siblings of the bottom-row's `<PanelGroup>` (inside the `middle-bottom` parent's render but outside the recursive PanelGroup). No new shell primitives needed.

This batch closes R-MIDDLE rest with **7 tasks across 4 waves**, **~16-22h wall-clock single-engineer (~3 dev-days, 2 dev-days with two engineers parallelising in Wave 2)**, **zero new migrations**, **zero Opus build tasks**. The visible artifact at the close-gate is `/dashboard/appointments/[id]` rendering the four new strips in the middle column, with the Assessment strip's Dx field live-mirroring to the ribbon (crb-02), the safety strip pinned during scroll, and the action footer always reachable.

---

## Decision lock (frozen for batch duration)

These match the planning conversation locked 2026-05-21. Re-opening any belongs in a new batch.

**DL-1: Assessment strip is a SHELL leaf, not a pane overlay.** It's rendered as a third child of the middle column between Body and bottom-row (so it gets `naturalSizePct: ~8` of column height and the shell's resize handles work on either side). Per source plan §4. Not an overlay because overlays don't participate in the column height calculation and would render above content unpredictably during resize.

**DL-2: Safety sticky strip is an OVERLAY inside the bottom-row.** It sits ABOVE Investigations + Plan content via `position: sticky; top: 0`. Per source plan DL-9. The strip's content (`<AllergyClashBanner>` + `<InteractionChips>`) already exists; this batch lifts them out of `PrescriptionForm`'s inline render into a dedicated `<SafetyStickyStrip>` component that subscribes to `RxFormContext` (or to the existing allergy / DDI hook chain).

**DL-3: Plan action footer is an OVERLAY inside the bottom-row.** `position: sticky; bottom: 0`. Spans both Investigations + Plan sub-columns. Per source plan DL-1 + DL-20. Hosts the `Saved · {time}` SaveStatus pill (existing component), `[Save]`, and `[Send Rx & finish ▸]` button. Send button visibility uses the existing `canSendPrescription(state)` gate from cv2's state.ts.

**DL-4: Body refactor doesn't touch `ConsultationBodyPane`'s modality inference.** The existing component already routes based on `appointment.consultation_type`. cmr-04 wraps it in a `<BodyZone>` wrapper that handles template-specific sizing concerns (e.g., min-height when Body is shrunk to 15% for voice). The wrapper is the template-aware piece; the underlying component stays.

**DL-5: Narrow-monitor auto-merge uses CSS container queries.** Per source plan §"Narrow monitor" + V2-Q9. When the `middle-bottom` container width is below 720px, a `@container` rule collapses Investigations into a chip-row layout inside Plan. The chip-row layout uses the SAME `<InvestigationsChipRow>` extracted in cmi-01; no new component. Polyfill via `@container-query-polyfill` if browser support is insufficient (V2-Q9 lean: ship the polyfill).

**DL-6: Dx field stays at `id="diagnosis"`.** Source plan DL-19 + crb-02 DL-4: the ribbon's `🎯` click targets this id. When the Assessment strip lifts the Dx input out of `<AssessmentSection>`, the id MOVES with it. `<AssessmentSection>` (the in-Plan-pane section) hides its Dx input when the strip is present and renders a passive label "Working Dx: [Asthma] (see strip above)" with a click that focuses the strip's input. Avoids double-rendering the input.

**DL-7: Assessment strip shows DDx as chip array.** Per source plan §4 + DL-24 (`differential_diagnosis: chip array`). Uses the existing `<DdxChipList>` from `RxFormContext`'s field set. Max 5 chips per V2-Q5 (lean); overflow into a `+ DDx more` popover.

**DL-8: Backend untouched.** All DL-24 fields exist from cv2-04. RLS untouched. Endpoints untouched. Zero backend lines in this batch.

**DL-9: Sticky strips do NOT participate in the shell's saved layout.** Layout-tree v4 stores pane sizes; the safety + action-footer strips are render-time overlays inside the bottom-row's render function, not new pane definitions. The Assessment strip is a pane definition (DL-1) and DOES participate in layout-tree. New tree shape: middle-column has THREE children (Body / Assessment / Bottom-row) instead of two (Body / Bottom-row). cv2-02 migration handles new-shape detection by re-seeding the default sizes when the loaded tree has a different child count than the current template.

**DL-10: Auto-resize handles between Body / Assessment / Bottom-row.** Shell already supports vertical resize handles between siblings; the Assessment strip's `naturalSizePct` is 8 with `minSizePx: 60` (per V2-Q8 — per-sub-pane min sizes, Assessment min 60px). User can drag to grow / shrink; saved in layout-tree.

**DL-11: Send button click handler is the EXISTING `onFinishVisit` from `PatientProfilePage`.** No new send path. The action footer's `[Send Rx & finish ▸]` button binds to the same handler that `<RxWorkspace>` binds today. cmr-03 wires the prop chain.

**DL-12: Cmd+Enter shortcut works from anywhere in the cockpit.** Per source plan §R-RX-POLISH/3.x (Phase 3) — but the action footer's button is the visible target. cmr-03 ALSO surfaces the existing `onFinishVisit` keybinding via `useShellHotkeys` (already shipped by ppr-10). No new hotkey logic.

**DL-13: Telemetry suite — five new events**, one per sub-feature: `r_middle_assessment_landed`, `r_middle_safety_landed`, `r_middle_footer_landed`, `r_middle_body_refactored`, `r_middle_narrow_merge_landed`. Each one-shot per session matching the existing pattern.

---

## Phases

### Wave 1 — Strips + Body wrapper (4 tasks, ~10-13h, two parallel lanes)

Wave 1 has two parallel lanes: lane α builds the three sticky strips (Assessment / Safety / Footer); lane β builds the Body wrapper + the narrow-monitor auto-merge styling. Per [EXECUTION-ORDER-GUIDELINES § 0.5 Cut 2](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves), the lanes touch disjoint files until Wave 2 wires them together.

**Lane α (sticky strips, sequential within lane):**

- [`task-cmr-01-assessment-strip.md`](./Tasks/task-cmr-01-assessment-strip.md) — **M, Auto** — New `frontend/components/cockpit/middle/AssessmentStrip.tsx`. ~60px sticky strip with `id="diagnosis"` Dx input (moved from `<AssessmentSection>`) + `<DdxChipList>`. Subscribes to `RxFormContext` via `useRxForm()`. Hides `<AssessmentSection>`'s Dx input when the strip is mounted (DL-6).
- [`task-cmr-02-safety-sticky-strip.md`](./Tasks/task-cmr-02-safety-sticky-strip.md) — **M, Auto** — New `frontend/components/cockpit/middle/SafetyStickyStrip.tsx`. Wraps existing `<AllergyClashBanner>` + `<InteractionChips>` with `position: sticky; top: 0`. Lifts data subscriptions from inside `PrescriptionForm` so the strip renders standalone above bottom-row content.
- [`task-cmr-03-plan-action-footer.md`](./Tasks/task-cmr-03-plan-action-footer.md) — **S, Auto** — New `frontend/components/cockpit/middle/PlanActionFooter.tsx`. `position: sticky; bottom: 0`. Hosts SaveStatus pill + `[Save]` + `[Send Rx & finish ▸]`. Binds to existing handlers via props (no new state).

**Lane β (Body wrapper + narrow-monitor, sequential within lane):**

- [`task-cmr-04-body-zone-wrapper.md`](./Tasks/task-cmr-04-body-zone-wrapper.md) — **S, Auto** — New `frontend/components/cockpit/middle/BodyZone.tsx`. Wraps `<ConsultationBodyPane>` with template-aware min-height / min-width handling (e.g., when voice template shrinks Body to 15%, ensure the call-control strip stays usable; when text template, ensure the chat thread has scroll affordance).
- [`task-cmr-05-narrow-monitor-merge.md`](./Tasks/task-cmr-05-narrow-monitor-merge.md) — **S, Auto** — Add a container query to the bottom-row's render path. When `width < 720px`, hide the Investigations leaf and render an `<InvestigationsChipRow>` inline at the top of Plan. New file `frontend/components/cockpit/middle/InvestigationsAutoMerge.tsx` (or inline in BodyZone — pick whichever is cleaner). Polyfill `@container-query-polyfill` if necessary.

### Wave 2 — Wire into `templates.tsx` (1 task, ~2-3h, single sequential lane)

**⚠️ Cross-batch dependency:** Wave 2 is gated on:
1. `templates-r-mod`'s tmr-01 merge (four factories exist).
2. `cockpit-middle-investigations`'s cmi-02 merge (Investigations leaf is real, not a placeholder).

Stack on top of those branches before running.

- [`task-cmr-06-wire-into-templates.md`](./Tasks/task-cmr-06-wire-into-templates.md) — **S, Composer 2 Fast** — In `frontend/lib/patient-profile/templates.tsx`:
  - Add `<AssessmentStrip>` as a third child of every `middle-column` (between Body and bottom-row).
  - Replace the bottom-row's raw render with a `<BottomRowWithOverlays>` that mounts `<SafetyStickyStrip>` at top + `<PlanActionFooter>` at bottom around the existing Investigations + Plan PanelGroup.
  - Replace direct `<ConsultationBodyPane>` mounts with `<BodyZone>`.
  - Add the container-query wrapper at the bottom-row level so the narrow-monitor merge engages.
  - Sweep all four factories (Video / Voice / Text / Review). Review's Body is hidden so the Assessment strip + safety strip + footer are the visible content in its middle column.

### Wave 3 — Verification + close-out (1 task, ~2h, single sequential lane)

- [`task-cmr-07-verification-and-close-out.md`](./Tasks/task-cmr-07-verification-and-close-out.md) — **XS, Composer 2 Fast** — Run smoke matrix per cross-cutting gate. tsc + lint + build + test sweep. Wire 5 telemetry events. Update `docs/Reference/product/cockpit/COCKPIT.md` with the new strips' diagrams. Update [`plan-cockpit-v2-execution-roadmap.md`](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md): R-MIDDLE rest → ✅ DONE; batch ledger entry; recommended-ordering pointer to next batch (`cockpit-history-pane`); §10 changelog. Capture-inbox follow-ups: per-doctor sticky-strip visibility toggle (V2 polish); container-query polyfill removal once browser support catches up (DL-5 follow-up); Assessment strip's Dx autocomplete from past Dx (V2-Q4 — Phase 3); DDx max chip count beyond 5 (V2-Q5 — future).

---

## Cross-cutting acceptance gate (whole batch)

These items must all be green before the batch is considered closed.

### Structural

- [ ] **Assessment strip renders** between Body and bottom-row in all four templates. ~60px tall.
- [ ] **Safety strip renders** at the top of the bottom-row in all four templates, pinned during bottom-row scroll.
- [ ] **Action footer renders** at the bottom of the bottom-row in all four templates, pinned during scroll.
- [ ] **Body wrapper renders** correctly across all four templates (video tile / voice strip / chat thread / hidden).
- [ ] **Narrow-monitor merge** engages when `middle-bottom` container width < 720px. Investigations leaf hides; chip-row appears at top of Plan.
- [ ] **Layout-tree v4 handles new shape** — middle-column has 3 children now; the migration / seeding logic doesn't crash on either pre- or post-rebuild trees.
- [ ] **Walk-in unchanged** — no strips render in walk-in's legacy 2-pane fallback.
- [ ] **Kill-switch `?v1=1`** — no strips in the legacy 3-pane layout.

### Behavior

- [ ] **Assessment strip's Dx input has `id="diagnosis"`** — verified via DOM inspector.
- [ ] **Ribbon's `🎯 Treating` live-mirrors** edits in the strip's Dx input (same RxFormContext subscription path).
- [ ] **Click ribbon `🎯`** → focuses the strip's Dx input (same scrollIntoView behavior, but the input is now in a sticky strip so scrollIntoView is a no-op — verify no errors).
- [ ] **DDx chip add/remove** works via the strip; chips persist via RxFormContext.
- [ ] **Allergy clash banner** appears in the safety strip when a medicine in Plan clashes with a patient allergy (verify with a fixture patient).
- [ ] **DDI chips** appear in the safety strip when adding interacting medicines.
- [ ] **Send button always reachable** — fill a long medicine list; scroll the Plan pane; the footer stays visible.
- [ ] **`[Save]` + `[Send Rx & finish ▸]`** binding to the existing handlers — verify `onFinishVisit` fires the wrap-up flow.
- [ ] **`Cmd+Enter`** still triggers the send flow (existing `useShellHotkeys` keybinding works regardless of which middle pane has focus).
- [ ] **Narrow-monitor merge** — open at 1280px viewport (DevTools); Investigations leaf hides, chip-row appears in Plan. Resize back to 1920px; leaf reappears.

### Form parity

- [ ] **Single `<RxFormProvider>`** in the tree — verify in React DevTools.
- [ ] **Autosave fires once per debounce** regardless of whether edit was in Assessment strip, Investigations, Plan medicine, or any other RxForm-subscribed surface.
- [ ] **`<AssessmentSection>`'s Dx input is hidden** when the strip is present (no double-render).
- [ ] **DL-24 fields persist** — vitals + examinationFindings + DDx + advice + followUp* + referral + testResults — all round-trip via existing migration 103.

### Performance

- [ ] **No layout thrash on bottom-row scroll** — sticky strips don't cause repaint of the entire pane on every scroll frame. Verified via DevTools Performance tab.
- [ ] **Container-query latency** — narrow-monitor merge engages within one frame on viewport resize (no flicker, no double-mount).
- [ ] **Body shrink to 15%** in voice template doesn't break the call-control strip's affordances — mute / end / timer all clickable.

### Quality

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend build` clean.
- [ ] `pnpm --filter frontend test` clean. (Existing AssessmentSection / RxWorkspace tests still pass.)
- [ ] No new Sentry errors in a 10-min smoke session cycling all four templates + scrolling each + opening the safety/footer strips' tooltips.
- [ ] Five new telemetry events fire correctly (one each per sub-feature, once per session).

### Documentation

- [ ] `docs/Reference/product/cockpit/COCKPIT.md` updated with diagrams for the Assessment strip + safety strip + action footer + narrow-monitor merge.
- [ ] `plan-cockpit-v2-execution-roadmap.md` updated — R-MIDDLE rest → ✅ DONE; batch ledger entry; recommended-ordering pointer to `cockpit-history-pane`; §10 changelog.
- [ ] `docs/Work/capture/inbox.md` has 3-5 new lines (sticky-strip visibility toggle; container-query polyfill removal; Assessment Dx autocomplete; DDx max chip count; any executor-noted quirks).

---

## Out-of-scope (rolled forward to follow-up batches)

| Out-of-scope item | Where it lands |
|---|---|
| **Per-doctor sticky-strip visibility toggle** (some doctors may want to hide the strips entirely) | Phase 3 (R-LAYOUT-UX-adjacent) |
| **Assessment strip Dx autocomplete from past Dx** — V2-Q4 lean | Phase 3 |
| **DDx max chip count expansion beyond 5** — V2-Q5 lean | Future plan if specialist feedback requests it |
| **Sticky safety strip dismissal** (doctor wants to dismiss a low-severity DDI chip per draft) | Phase 3; needs UX research |
| **Action footer's `[Save draft]` button** — source plan DL-4 says no manual save (autosave only) | OUT — preserves DL-4 forever |
| **Plan section internal redesign** (medicine row densification, drug autocomplete frequency, row-favorites) — Phase 3 R-RX-POLISH | `rx-polish-densification` + `rx-polish-favorites` batches |
| **Container-query polyfill removal** once Safari catches up | Future cleanup batch (capture-inbox tracked) |

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 — lane α | cmr-01, cmr-02, cmr-03 | 3/3 | 0/3 | 0/3 | ~7-9h (sequential within lane) |
| Wave 1 — lane β | cmr-04, cmr-05 | 2/2 | 0/2 | 0/2 | ~4-5h (sequential within lane) |
| Wave 2 | cmr-06 | 0/1 | 1/1 | 0/1 | ~2-3h |
| Wave 3 | cmr-07 | 0/1 | 1/1 | 0/1 | ~2h |
| **Total** | **7** | **5** | **2** | **0** | **~16-22h (~3 dev-days single-engineer; ~2 dev-days with two engineers parallelising α / β in Wave 1)** |

Token estimate (rough): ~280k input / ~180k output across the batch. Total batch spend (excluding optional close-gate review): ~$15-22.

**One optional Opus close-gate turn after cmr-07** budgeted on top. Recommended for this batch (5 new components + container queries + sticky overlays is a worker-drift-risk surface). Skip if every cross-cutting gate above passes cleanly.

---

## Sequencing notes (the why behind the waves)

The 3-wave shape:

- **Wave 1's two lanes are disjoint.** Lane α touches `frontend/components/cockpit/middle/AssessmentStrip.tsx` / `SafetyStickyStrip.tsx` / `PlanActionFooter.tsx`; lane β touches `BodyZone.tsx` / `InvestigationsAutoMerge.tsx`. Two engineers can run them in parallel.
- **Wave 1 → Wave 2 is a Cut 1 (dependency cliff).** Without all 5 new components, cmr-06 has nothing to wire.
- **Wave 2 → Wave 3 is a Cut 3 (kind-of-work change).** Wave 2 = Build (production wire-up). Wave 3 = QA + Docs + Telemetry.

**Within lane α, the order is cmr-01 → cmr-02 → cmr-03.** The Assessment strip is the load-bearing piece (DL-6 — moving the Dx input changes how other components reference it); the safety strip + action footer can ship in either order after. Pick the sequential lane.

**Within lane β, cmr-04 → cmr-05.** BodyZone defines the wrapper component the narrow-monitor merge interacts with (the merge hides the Investigations leaf, which lives inside `middle-bottom` next to BodyZone — coordinate via shared container styling).

**Cross-batch dependencies for Wave 2:**
- tmr-01 merged (four factories exist).
- cmi-02 merged (Investigations leaf is real).
- Practical scheduling: Wave 1 can start on a fresh branch from `main` immediately. Rebase onto the tmr-01 + cmi-02 merged commit before Wave 2.

**Why no Opus build tasks?** Per AGENT-EXECUTION-EFFICIENCY-GUIDE hard-rules list, none of these tasks reach the L-size structural-refactor / PHI / RLS / novel security thresholds. The sticky positioning + container queries are advanced CSS but standard patterns; the component extraction is mechanical. Per-message escalation to Opus on cmr-05 only if Auto stalls on the container-query polyfill integration.

**Optional close-gate Opus turn** — recommended for this batch. The five components have inter-component invariants (Assessment strip's id="diagnosis" → ribbon's `🎯` click → cv2-06's existing `<AssessmentSection>` Dx label fallback) that benefit from a single reviewer pass. Budget: ~1 Opus chat / ~15k tokens.

---

## References

- [Product plans/plan-cockpit-v2.md §R-MIDDLE](../../../Product%20plans/plan-cockpit-v2.md) — source product spec; this batch ships the "rest" of R-MIDDLE (everything except the Investigations leaf, which cockpit-middle-investigations ships).
- [Product plans/plan-cockpit-v2-execution-roadmap.md](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md) — master tracker; "R-MIDDLE rebuild" / "R-MIDDLE rest" is the §6 entry this batch addresses.
- [Daily-plans/May 2026/19-05-2026/cockpit-shell-flip/](../../19-05-2026/cockpit-shell-flip/) — predecessor batch; the production cutover this batch's strips sit inside.
- [Daily-plans/May 2026/21-05-2026/templates-r-mod/](../templates-r-mod/) — sibling Phase-2 batch; the four-factory landscape this batch sweeps.
- [Daily-plans/May 2026/21-05-2026/cockpit-middle-investigations/](../cockpit-middle-investigations/) — sibling Phase-2 batch; the Investigations leaf this batch's narrow-monitor merge interacts with.
- [Daily-plans/May 2026/21-05-2026/cockpit-history-pane/](../cockpit-history-pane/) — next batch in the chain; depends on the middle column being final so the right column UX can balance.
- [frontend/components/cockpit/rx/sections/AssessmentSection.tsx](../../../../../frontend/components/cockpit/rx/sections/AssessmentSection.tsx) — current Dx input owner; cmr-01 lifts the input into the new strip.
- [frontend/components/consultation/cockpit/RxWorkspace.tsx](../../../../../frontend/components/consultation/cockpit/RxWorkspace.tsx) — current Safety banner host (with the long-standing TODO β-1); cmr-02 lifts the banners into the new strip.
- [frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx](../../../../../frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx) — current footer / Send button host; cmr-03 lifts the footer into the new component.
- [docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- Sibling: [`Tasks/EXECUTION-ORDER-cockpit-middle-rebuild.md`](./Tasks/EXECUTION-ORDER-cockpit-middle-rebuild.md) — wave / lane matrix.
