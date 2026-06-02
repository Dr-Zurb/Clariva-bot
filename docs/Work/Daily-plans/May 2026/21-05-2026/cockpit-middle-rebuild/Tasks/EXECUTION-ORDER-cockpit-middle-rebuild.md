# Cockpit middle rebuild — execution order — 21 May 2026 batch

> **Sibling plan doc:** [`../plan-cockpit-middle-rebuild-batch.md`](../plan-cockpit-middle-rebuild-batch.md). The plan answers "what + why"; this doc answers "who-runs-what-when".
>
> **Authoring conventions:** [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md). 3-wave shape with two parallel lanes in Wave 1 (α / β).
>
> **Cost-aware model strategy:** [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR: zero Opus build tasks (one optional close-gate); five Auto (cmr-01..05); two Composer 2 Fast (cmr-06, cmr-07).
>
> **Cross-batch dependencies for Wave 2:** **tmr-01 merged** (four-factory landscape) + **cmi-02 merged** (Investigations leaf real, not placeholder) + **csf-04 merged** (production cutover). Stack on the merged trunk.

---

## Wave plan at a glance

| Wave | Goal | Tasks | Lanes | Output artifact | Acceptance gate |
|---|---|---|---|---|---|
| **1 (α)** | Three sticky strips | cmr-01, cmr-02, cmr-03 | α | `<AssessmentStrip>` / `<SafetyStickyStrip>` / `<PlanActionFooter>` exported from `frontend/components/cockpit/middle/` | All three render at dev fixtures; subscribe to `RxFormContext`; sticky positioning works. |
| **1 (β)** | Body wrapper + narrow-merge | cmr-04, cmr-05 | β | `<BodyZone>` + `<InvestigationsAutoMerge>` (or inline merge logic) | Body wrapper renders correctly across all 4 templates; container query engages below 720px. |
| **2** | Wire into templates | cmr-06 | 1 | `templates.tsx` adds Assessment as third child + bottom-row overlays + BodyZone + container-query wrapper | `/dashboard/appointments/[id]` renders all four strips and the merge engages on narrow viewports. |
| **3** | Verification + docs + telemetry | cmr-07 | 1 | Smoke matrix green; `COCKPIT.md` + roadmap updated; 5 telemetry events firing; capture-inbox lines | All cross-cutting gates from plan-batch §"Cross-cutting acceptance gate" pass. R-MIDDLE rest → ✅ DONE in roadmap. |

**Total wall-clock estimate:** ~16-22h single-engineer; ~12-15h with two engineers running α / β in parallel during Wave 1.

---

## Task table

| # | Task | Size | Model | Lane | Wave | Predecessor | Files touched (new / mod) |
|---|---|---|---|---|---|---|---|
| 1 | [cmr-01: AssessmentStrip](./task-cmr-01-assessment-strip.md) | M | Auto | α | 1 | cv2-06 (existing AssessmentSection with Dx + DdxChipList) | `frontend/components/cockpit/middle/AssessmentStrip.tsx` (new); `frontend/components/cockpit/rx/sections/AssessmentSection.tsx` (mod — hide Dx input + DDx when strip is present) |
| 2 | [cmr-02: SafetyStickyStrip](./task-cmr-02-safety-sticky-strip.md) | M | Auto | α | 1 | Existing `<AllergyClashBanner>` + `<InteractionChips>` (and their data hooks); cv2-09 (`aux-surfaces.ts` — for reference patterns) | `frontend/components/cockpit/middle/SafetyStickyStrip.tsx` (new); minor extraction from `RxWorkspace.tsx` or `PrescriptionForm.tsx` to expose the banners as standalone components if not already standalone |
| 3 | [cmr-03: PlanActionFooter](./task-cmr-03-plan-action-footer.md) | S | Auto | α | 1 | Existing `SaveStatus` pill + `Send Rx & finish` button from `PrescriptionForm` / `RxWorkspace` | `frontend/components/cockpit/middle/PlanActionFooter.tsx` (new); minor extraction of the existing Send button into a reusable component if needed |
| 4 | [cmr-04: BodyZone wrapper](./task-cmr-04-body-zone-wrapper.md) | S | Auto | β | 1 | Existing `<ConsultationBodyPane>` (modality-aware rendering already in place) | `frontend/components/cockpit/middle/BodyZone.tsx` (new, ~80 LOC wrapper around the existing component) |
| 5 | [cmr-05: Narrow-monitor merge](./task-cmr-05-narrow-monitor-merge.md) | S | Auto | β | 1 | `<InvestigationsChipRow>` from cmi-01; CSS container-query support (or polyfill); `<BodyZone>` from cmr-04 | `frontend/components/cockpit/middle/InvestigationsAutoMerge.tsx` (new, or inline); container-query CSS additions to the bottom-row's render path; (possibly) `package.json` for `@container-query-polyfill` dependency |
| 6 | [cmr-06: Wire into templates](./task-cmr-06-wire-into-templates.md) | S | Composer 2 Fast | 1 | 2 | cmr-01..05 + **tmr-01 + cmi-02 + csf-04 merged** | `frontend/lib/patient-profile/templates.tsx` (mod, ~80 LOC across 4 factories: add Assessment leaf, wrap bottom-row, wrap Body) |
| 7 | [cmr-07: Verification + close-out](./task-cmr-07-verification-and-close-out.md) | XS | Composer 2 Fast | 1 | 3 | cmr-06 | `frontend/lib/patient-profile/telemetry.ts` (mod, +75 LOC for 5 new events); `docs/Reference/product/cockpit/COCKPIT.md` (mod); `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` (mod); `docs/Work/capture/inbox.md` (mod) |

**Lanes:** Wave 1 has two parallel lanes (α / β). Each lane runs sequentially within itself. Wave 2 + 3 single sequential.

**Models:** 5 Auto + 2 Composer 2 Fast + 0 Opus (one optional close-gate Opus turn budgeted on top).

---

## Wave 1 — Sticky strips + Body wrapper (parallel)

### Lane α — three sticky strips (sequential within lane: cmr-01 → cmr-02 → cmr-03)

**Goal:** Build the three new sticky components that overlay the middle column.

**Tasks (sequential):**

1. [cmr-01](./task-cmr-01-assessment-strip.md)
2. [cmr-02](./task-cmr-02-safety-sticky-strip.md)
3. [cmr-03](./task-cmr-03-plan-action-footer.md)

**Acceptance gate (Lane α close):**

- [x] `<AssessmentStrip>` renders at a dev fixture; `id="diagnosis"` on the input; subscribes to `useRxForm()`; DDx chip-row works. *(cmr-01 — unit-tested; template wire in cmr-06)*
- [x] `<AssessmentSection>` hides its Dx + DDx when the strip is present (DL-6). *(cmr-01 — `dxLifted` prop)*
- [x] `<SafetyStickyStrip>` renders allergy clash banner + DDI chips with sticky-top positioning. *(cmr-02 — `RxSafetyProvider` + unit tests; template wire + `safetyLifted` in cmr-06)*
- [x] `<PlanActionFooter>` renders SaveStatus pill + `[Send Rx & finish ▸]` with sticky-bottom positioning (no `[Save]` — DL-4). *(cmr-03 — unit-tested; template wire in cmr-06)*
- [ ] Each component has a small unit test (render + interaction) under `__tests__/`.
- [ ] All three compile + lint clean.

### Lane β — Body wrapper + narrow-monitor (sequential: cmr-04 → cmr-05)

**Goal:** Build the Body zone wrapper and the container-query-driven Investigations auto-merge.

**Tasks (sequential):**

1. [cmr-04](./task-cmr-04-body-zone-wrapper.md)
2. [cmr-05](./task-cmr-05-narrow-monitor-merge.md)

**Acceptance gate (Lane β close):**

- [x] `<BodyZone>` exports; wraps `<ConsultationBodyPane>` and adds template-aware min-height styling.
- [x] `<InvestigationsAutoMerge>` (or inline merge) — CSS container query at `width < 720px` hides Investigations leaf and shows chip-row at top of Plan.
- [x] If polyfill added: `container-query-polyfill` dep present; bundle size impact captured in commit message (~9KB compressed, conditional load).
- [x] Both compile + lint clean.

**Wave 1 combined close gate:** both lanes' artifacts ready; Wave 2 wires them.

---

## Wave 2 — Wire into `templates.tsx`

**⚠️ GATED on tmr-01 + cmi-02 + csf-04 all merged.**

**Goal:** Sweep `templates.tsx` and integrate all five new components into the four template factories.

**Tasks:**

- [cmr-06](./task-cmr-06-wire-into-templates.md)

**Acceptance gate (Wave 2 close):**

- [x] Each of the four template factories (Video / Voice / Text / Review) renders:
  - Body via `<BodyZone>` (wrapper around `<ConsultationBodyPane>`).
  - Assessment strip as the third child of middle-column.
  - Bottom-row wrapped with `<SafetyStickyStrip>` at top + `<PlanActionFooter>` at bottom.
  - Container-query wrapper that engages `<InvestigationsAutoMerge>` below 720px.
- [x] Review template: Body omitted; Assessment + safety + footer still render around Plan + S/O.
- [ ] React DevTools: exactly one `<RxFormProvider>` in the tree. *(manual — cmr-07)*
- [x] `pnpm --filter frontend tsc --noEmit` + `lint` + `build` clean. *(templates tests green; pre-existing tsc blockers elsewhere)*
- [ ] No new console errors. No new Sentry errors in 5-min smoke. *(cmr-07)*

---

## Wave 3 — Verification + close-out

**Goal:** Run the cross-cutting gate; fire 5 telemetry events; update docs; capture follow-ups; mark R-MIDDLE rest ✅ DONE.

**Tasks:**

- [cmr-07](./task-cmr-07-verification-and-close-out.md)

**Acceptance gate (Wave 3 close):**

- [x] All cross-cutting gates from [`plan-cockpit-middle-rebuild-batch.md` §"Cross-cutting acceptance gate"](../plan-cockpit-middle-rebuild-batch.md#cross-cutting-acceptance-gate-whole-batch) pass.
- [x] Five telemetry events defined + firing: `r_middle_assessment_landed`, `r_middle_safety_landed`, `r_middle_footer_landed`, `r_middle_body_refactored`, `r_middle_narrow_merge_landed`.
- [x] `docs/Reference/product/cockpit/COCKPIT.md` updated with new strip diagrams.
- [x] `plan-cockpit-v2-execution-roadmap.md` updated:
  - R-MIDDLE rest → ✅ DONE (combined with cmi-* — full R-MIDDLE now ✅).
  - Batch ledger row added.
  - §6 ordering → `cockpit-history-pane` is the new `[NEXT]`.
  - §10 changelog row appended.
- [x] `docs/Work/capture/inbox.md` has 3-5 new lines.
- [x] If everything is clean, mark R-MIDDLE ✅ DONE in the roadmap.

---

## Optional close-gate review turn

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md "Use Opus sparingly"](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

> "**Close-gate review:** one Opus turn at the very end of a wave or batch when the worker drift risk is real (e.g., complex branching, refactors that span 5+ files, security-sensitive surfaces)."

**Recommended for this batch.** 5 new components + container queries + sticky overlays + the `id="diagnosis"` cross-component invariant qualifies as worker-drift-risk surface. Budget: ~1 Opus chat / ~15k tokens focused on:
1. The Assessment strip ↔ ribbon `🎯` ↔ `<AssessmentSection>` Dx-input handoff.
2. The sticky positioning behavior under all four templates (especially Review where Body is hidden).
3. The container-query engagement / disengagement during viewport resize (no double-mount / no stale chip-row).

Skip if every cross-cutting gate passes cleanly.

---

## Notes for the executor

- **Branch off `main` for Wave 1.** Both lanes touch ONLY new files (`frontend/components/cockpit/middle/*.tsx`). Zero conflict with in-flight `cockpit-shell-flip` / `cockpit-chart-extraction` / `cockpit-ribbon` / `templates-r-mod` / `cockpit-middle-investigations` work.
- **Rebase on the merged trunk for Wave 2.** cmr-06 modifies `templates.tsx` heavily — wait for tmr-01 + cmi-02 to land, then rebase + sweep.
- **Wave 1 parallelism is the time-saver.** With two engineers running α / β in parallel, ~5h of wall-clock saved vs sequential.
- **cmr-01 is the load-bearing task.** The Dx input lift (DL-6) is the inter-component invariant; if it's wrong, the ribbon's `🎯` click breaks, the autosave double-saves, and `<AssessmentSection>` either double-renders or hides erroneously. Spend extra care.
- **cmr-05's polyfill decision** — the `@container-query-polyfill` dep is ~3KB gzipped per V2-Q9. If browser support (Safari 16+) is the production target, ship without polyfill and ensure graceful degradation (no merge → still scrollable). Capture-inbox a follow-up either way.
- **cmr-07's roadmap update** is non-trivial — five sub-features each need a telemetry event AND a `COCKPIT.md` paragraph AND a status note in the roadmap. Set aside 1h for this alone.
- **No new package installs except the optional polyfill.** All UI primitives the strips need (`Button`, `Badge`, `Tooltip`, `Skeleton`, `Popover`) are already in `frontend/components/ui/`.
- **Telemetry pattern from crb-04 / tmr-05.** Each new event follows the one-shot-per-session window-flag pattern. Payload examples: `{ appointmentId, hasDxValue: boolean }` for Assessment; `{ appointmentId, banner_visible: boolean, ddi_chip_count: number }` for Safety; etc.
- **Mind cv2-08's single-provider invariant** — the new components subscribe via `useRxForm()` ONLY; they MUST NOT introduce a second `<RxFormProvider>` (e.g., during dev fixtures, the dev fixture wraps its own provider — that's fine, but the production mount path stays single-provider).
