# Task csf-03: Wire real content into the Telemed-Video factory's leaves

## 19 May 2026 — Batch [Cockpit shell flip — Phase 2 foothold](../plan-cockpit-shell-flip-batch.md) — Wave 2, Lane α step 0 — **M, ~5h**

---

## Task overview

After csf-02, `getTelemedVideoTemplate(ctx)` returns the right tree shape, but every leaf still renders `<PanePlaceholder>`. This task replaces five of the seven placeholder leaves with real components, leaves two as deliberate `<PanePlaceholder>` deferrals (tagged `R-CHART` and `R-MIDDLE`), and creates the two new pane wrapper components needed for the Subjective and Objective leaves.

End state per leaf:

| Leaf id | Render |
|---|---|
| `snapshot` | `<PatientChartPane appointment={ctx.appointment} token={ctx.token} hideHeader />` |
| `history` | `<PanePlaceholder title="History" icon={Clock} futureRItem="R-CHART (Snapshot/History split deferred)" />` |
| `body` | `<ConsultationBodyPane state={ctx.state} appointment={ctx.appointment} token={ctx.token} launcherRef={ctx.launcherRef} onRxSent={ctx.onRxSent} onMarkNoShow={ctx.onMarkNoShow} hideHeader />` |
| `investigations-orders` | `<PanePlaceholder title="Investigations" icon={Beaker} futureRItem="R-MIDDLE (Investigations extraction deferred)" />` |
| `plan` | `<RxPane appointment={ctx.appointment} token={ctx.token} state={ctx.state} onRxSent={ctx.onRxSent} onFinishVisit={ctx.onFinishVisit} onMedicineCountChange={ctx.onMedicineCountChange} finishBusy={ctx.finishBusy} hideHeader />` |
| `subjective` | `<SubjectivePane />` (new wrapper, ~25 LOC, mounts `<SubjectiveSection heading={null} />`) |
| `objective` | `<ObjectivePane />` (new wrapper, ~25 LOC, mounts `<ObjectiveSection heading={null} />`) |

After this task:

- All five "real" leaves render their existing components without modification.
- Two new pane wrapper files exist: `frontend/components/patient-profile/panes/SubjectivePane.tsx` and `ObjectivePane.tsx`. Each is a thin scrollable container around its corresponding section.
- The Subjective and Objective leaves successfully call `useRxForm()` because csf-01 lifted the provider above the shell.
- A dev-only smoke route (or Storybook fixture — task picks based on existing precedent) renders `<PatientProfilePage panes={getTelemedVideoTemplate(fixtureCtx)}>` and confirms the layout.

This task is a **plumbing change with mostly zero visible diff** — the components being mounted exist and render today; this task changes WHERE they mount.

**Estimated time:** ~5h (~3h for the wiring + 2 new wrapper components, ~1h for the smoke + reactor checks, ~1h for tsc/lint cleanup + commit prep).

**Status:** Done.

**Hard deps:** csf-01 (lifted provider — Subjective + Objective panes need it), csf-02 (factory takes `ctx`).

**Source:** [plan-cockpit-shell-flip-batch.md § Wave 2](../plan-cockpit-shell-flip-batch.md#wave-2--wire-real-content-into-leaves-1-task-5h-single-sequential-lane), [plan-cockpit-v2.md § DL-19..DL-22](../../../../Product%20plans/plan-cockpit-v2.md#dl-13--dl-25--new-locks-for-cockpit-v2).

---

## Model & execution guidance

**Recommended model:** **Auto** (Sonnet 4.6 Medium). Wire five existing components into five existing leaves; create two thin wrapper components. Scope is bounded by the source plan's layout sketch.

**Per-message escalation rule:** if Auto stalls on the `<SubjectivePane>` / `<ObjectivePane>` wrapper shape (specifically: how to omit the section's H2 header without breaking the section's internal layout — heading={null} prop, vs a wrapping `<section className="flex h-full flex-col overflow-y-auto">`, vs cv2-06's existing pattern), bump to Opus for one message.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- post-csf-02 — `frontend/lib/patient-profile/templates.tsx` (the factory this task fills).
- post-csf-01 — `frontend/components/patient-profile/PatientProfilePage.tsx` (the provider mount confirmed).
- `frontend/components/patient-profile/panes/PatientChartPane.tsx` (existing leaf renderer).
- `frontend/components/patient-profile/panes/ConsultationBodyPane.tsx` (existing).
- `frontend/components/patient-profile/panes/RxPane.tsx` (existing).
- `frontend/components/cockpit/rx/sections/SubjectiveSection.tsx` (mount target for the new wrapper).
- `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx` (mount target for the new wrapper).
- `frontend/components/patient-profile/PanePlaceholder.tsx` (still used for History + Investigations).
- The cv2-06 task file ([`task-cv2-06-section-component-extractions.md`](../../../17-05-2026/cockpit-v2/Tasks/task-cv2-06-section-component-extractions.md)) for the section component contracts.

**Estimated turns:** 4–6 turns.

---

## Acceptance criteria

### Step 1 — Create `<SubjectivePane>` wrapper

- [ ] New file `frontend/components/patient-profile/panes/SubjectivePane.tsx`. ~25 LOC. Pattern matches the existing `<RxPane>` / `<ConsultationBodyPane>` shape (top-of-file JSDoc, default export, no internal state, accepts `hideHeader?: boolean` for parity even though the section already supports `heading={null}`):

  ```tsx
  /**
   * SubjectivePane — pane wrapper that mounts the cv2-06 SubjectiveSection in its own
   * pane within the Telemed-Video tree. Created by csf-03 (2026-05-19) for Phase 2 foothold.
   *
   * Reads RxFormContext from the lifted provider in PatientProfilePage (csf-01).
   */
  import { SubjectiveSection } from "@/components/cockpit/rx/sections/SubjectiveSection";

  interface SubjectivePaneProps {
    hideHeader?: boolean;
  }

  export default function SubjectivePane({ hideHeader = false }: SubjectivePaneProps) {
    return (
      <div className="flex h-full flex-col overflow-y-auto px-4 py-3">
        <SubjectiveSection heading={hideHeader ? null : undefined} />
      </div>
    );
  }
  ```

  Verify the actual SubjectiveSection accepts a `heading` prop (cv2-06 should have added it; verify on read). If it doesn't, the wrapper either passes a custom render-fn for the heading slot, OR cv2-06's section is updated as part of this task to accept `heading: ReactNode | null`.

- [ ] tsc clean after creating the file.

### Step 2 — Create `<ObjectivePane>` wrapper

- [ ] New file `frontend/components/patient-profile/panes/ObjectivePane.tsx`. Identical shape to `SubjectivePane`, importing `ObjectiveSection` and mounting it inside a scrollable container.
- [ ] tsc clean.

### Step 3 — Wire the snapshot leaf

- [ ] In `frontend/lib/patient-profile/templates.tsx`, replace the `snapshot` leaf's `render` from `<PanePlaceholder ... />` to `() => <PatientChartPane appointment={ctx.appointment} token={ctx.token} hideHeader />`.
- [ ] Remove the now-unused PanePlaceholder import for the snapshot leaf if it's no longer referenced (it still is — History uses it).
- [ ] Add a `void ctx;` removal here if csf-02 added one — once any leaf uses ctx, the unused-arg warning is gone.

### Step 4 — Wire the body leaf

- [ ] Replace the `body` leaf's `render` with `() => <ConsultationBodyPane state={ctx.state} appointment={ctx.appointment} token={ctx.token} launcherRef={ctx.launcherRef} onRxSent={ctx.onRxSent} onMarkNoShow={ctx.onMarkNoShow} hideHeader />`.
- [ ] Verify `<ConsultationBodyPane>` accepts these props per its current contract (see the file); the existing `builtInPanes` array in `PatientProfilePage.tsx` lines 309–333 already passes the same shape.

### Step 5 — Wire the plan leaf

- [ ] Replace the `plan` leaf's `render` with `() => <RxPane appointment={ctx.appointment} token={ctx.token} state={ctx.state} onRxSent={ctx.onRxSent} onFinishVisit={ctx.onFinishVisit} onMedicineCountChange={ctx.onMedicineCountChange} finishBusy={ctx.finishBusy} hideHeader />`.
- [ ] Verify `<RxPane>` accepts these props; existing usage in `PatientProfilePage.tsx` lines 335–356 confirms.

### Step 6 — Wire the subjective + objective leaves

- [ ] Replace the `subjective` leaf's `render` with `() => <SubjectivePane hideHeader />`.
- [ ] Replace the `objective` leaf's `render` with `() => <ObjectivePane hideHeader />`.

### Step 7 — Keep the deferred placeholders

- [ ] `history` leaf stays as `<PanePlaceholder title="History" icon={Clock} futureRItem="R-CHART (Snapshot/History split deferred)" />`. Update the `futureRItem` text if cv2-03 used different wording.
- [ ] `investigations-orders` leaf stays as `<PanePlaceholder title="Investigations" icon={Beaker} futureRItem="R-MIDDLE (Investigations extraction deferred)" />`.
- [ ] Verify `rg "<PanePlaceholder" frontend/lib/patient-profile/templates.tsx` returns exactly 2 matches.

### Step 8 — Smoke render at a dev-only route or Storybook

- [ ] **Choose one:**
  - **Option A (preferred if Storybook is set up for `panes/`):** add a Storybook entry under `frontend/components/patient-profile/panes/SubjectivePane.stories.tsx` and `ObjectivePane.stories.tsx` rendering each in isolation with a fixture `<RxFormProvider>` wrapper. Verify: visible content, no console errors.
  - **Option B (if no Storybook precedent):** create a temporary route at `frontend/app/dashboard/_dev/cockpit-v2-flip-smoke/page.tsx` that renders `<PatientProfilePage panes={getTelemedVideoTemplate(fixtureCtx)}>` with a hardcoded fixture appointment. The route MUST be deleted at the end of csf-04 (the production cutover) — capture-inbox a follow-up if it slips. **csf-06 verifies it's deleted.**
- [ ] Whichever option: open the route / story; visually verify the 8-pane layout renders (Snapshot in top-left, History placeholder below it, Body in middle-top, Investigations + Plan in middle-bottom horizontal split, Subjective + Objective in right column).
- [ ] Verify `useRxForm()` does NOT throw inside the Subjective and Objective panes. (The lifted provider from csf-01 must already wrap the page; this is the integration sanity for csf-01.)
- [ ] Verify React DevTools shows exactly ONE `<RxFormProvider>` in the tree.

### Step 9 — Tsc + lint sweep

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] No unused imports in `templates.tsx` (the `void ctx;` line from csf-02 deletes here).

---

## Out of scope

- **Changing the visible content of any of the five real leaves.** Snapshot, Body, Plan render exactly the same content as the existing `builtInPanes` mount today. Subjective and Objective render the same SOAP fields as the existing mount inside the Plan pane today.
- **Splitting Snapshot and History into two real components.** R-CHART follow-up batch.
- **Building the Investigations zone.** R-MIDDLE follow-up batch.
- **Adding the Assessment sticky strip.** R-MIDDLE follow-up batch.
- **The production cutover.** csf-04 swaps `builtInPanes` for `getTelemedVideoTemplate(ctx)` in `PatientProfilePage`. This task only fills the factory.
- **The kill-switch.** csf-05.

---

## Files expected to touch

**Modified:**

- `frontend/lib/patient-profile/templates.tsx` — fill 5 leaf renders (~30 LOC delta).

**Created:**

- `frontend/components/patient-profile/panes/SubjectivePane.tsx` (~25 LOC).
- `frontend/components/patient-profile/panes/ObjectivePane.tsx` (~25 LOC).
- (conditional) `frontend/app/dashboard/_dev/cockpit-v2-flip-smoke/page.tsx` (smoke route — deleted by csf-04 or csf-06).
- (conditional) `frontend/components/patient-profile/panes/SubjectivePane.stories.tsx` + `ObjectivePane.stories.tsx` if Storybook is wired.

**Read but do not modify:**

- The five existing components being mounted (PatientChartPane, ConsultationBodyPane, RxPane, SubjectiveSection, ObjectiveSection).

---

## Notes / open decisions

1. **Why thin wrappers around the sections?** The sections were extracted in cv2-06 to be mountable anywhere; they have their own header / scrollable container today. Mounting them directly in a leaf works, but the leaf's pane already has its own pane-level chrome (drag handles, collapse button) — wrapping in a thin scrollable container gives the section a clean parent. The wrapper exists mainly to (a) isolate import paths to `panes/`, matching the existing convention, and (b) give a place for future per-pane logic (e.g., focus management, keyboard shortcuts) without modifying the section.

2. **What if `<SubjectiveSection>` doesn't accept `heading={null}`?** Either (a) update the section to accept it (~5 LOC delta in cv2-06's section file), or (b) wrap the section in a CSS rule that hides the H2. (a) is cleaner.

3. **What about the existing `Section` / `<Card>` chrome inside each section?** The sections from cv2-06 already render with appropriate chrome. The wrapper just needs to provide vertical scroll within the pane.

4. **Why not mount `<SubjectiveSection>` directly without a wrapper?** Could work, but every other leaf in the file uses a `panes/`-prefixed component. The wrapper preserves the convention.

5. **Smoke route hygiene** — if Option B is taken (the `_dev/cockpit-v2-flip-smoke/page.tsx` route), it must be deleted by the close of csf-04 (or csf-06 latest). Add a `// eslint-disable-next-line no-restricted-imports` if needed and a "DELETE BY csf-06" comment.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [Product plans/plan-cockpit-v2.md § "The 8-pane default layout"](../../../../Product%20plans/plan-cockpit-v2.md#4-canonical-default-layout-telemed-video-template), DL-19..DL-22.
- **Wave gate:** [`EXECUTION-ORDER-cockpit-shell-flip.md` § Wave 2 gate](./EXECUTION-ORDER-cockpit-shell-flip.md#wave-2-gate-after-csf-03).
- **Predecessors:** [`task-csf-01-rxform-provider-lift.md`](./task-csf-01-rxform-provider-lift.md), [`task-csf-02-templates-factory-refactor.md`](./task-csf-02-templates-factory-refactor.md).
- **Successor:** [`task-csf-04-production-cutover.md`](./task-csf-04-production-cutover.md).

---

**Owner:** TBD  
**Created:** 2026-05-19  
**Status:** Done
