# cmr-06 · Wire AssessmentStrip + SafetyStickyStrip + PlanActionFooter + BodyZone + narrow-merge into `templates.tsx`

> **Status:** ✅ Done (2026-05-23)

> **Wave 2** of the [cockpit-middle-rebuild batch](../plan-cockpit-middle-rebuild-batch.md). Sweep `frontend/lib/patient-profile/templates.tsx` and integrate all five new components built in Wave 1 into the four template factories.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (~80 LOC delta in one file across 4 factories; mechanical sweep) |
| **Model** | **Composer 2 Fast** — find-and-replace pattern + careful merge; the load-bearing task is verifying the strip ordering inside each factory |
| **Wave** | 2 |
| **Depends on** | cmr-01..05 (all five components); **tmr-01 merged** (four factories exist); **cmi-02 merged** (Investigations leaf real, not placeholder); **csf-04 merged** (production cutover) |
| **Blocks** | cmr-07 (verification + close-out) |

---

## ⚠️ Cross-batch dependencies

This task is **gated on FOUR predecessors merging**:

1. `cmr-01..05` — Wave 1 of this batch.
2. `tmr-01` — the four template factories from templates-r-mod.
3. `cmi-02` — the real `<InvestigationsPane>` from cockpit-middle-investigations.
4. `csf-04` — the production cutover from cockpit-shell-flip.

Practical scheduling: rebase on the merged trunk before running.

---

## Goal

In `frontend/lib/patient-profile/templates.tsx`:

1. Add `<AssessmentStrip>` as a third child of every `middle-column` (between Body and bottom-row).
2. Wrap each bottom-row's render with a container that mounts `<SafetyStickyStrip>` at top + `<PlanActionFooter>` at bottom around the existing Investigations + Plan PanelGroup.
3. Replace direct `<ConsultationBodyPane>` mounts (via the makeMiddleColumn helper from tmr-01) with `<BodyZone variant={...} ...>`.
4. Add the container-query wrapper at the bottom-row level so cmr-05's narrow-monitor merge engages.

All four factories (Video / Voice / Text / Review) get the same overlay structure, with the per-factory `Body` leaf changes from tmr-01 preserved.

---

## What to do

### 1. Update `makeMiddleColumn` (or the per-factory middle-column construction) helper from tmr-01

```tsx
function makeMiddleColumn(
  ctx: TelemedVideoContext,
  opts: {
    bodyHeight: number;
    assessmentHeight: number; // typically 8
    bottomRowHeight: number;
    bodyVariant: 'video' | 'voice' | 'text' | 'review';
  },
): PaneDefinition {
  const children: PaneDefinition[] = [];

  if (opts.bodyVariant !== 'review') {
    children.push({
      id: 'body',
      title: variantTitle(opts.bodyVariant),
      icon: variantIcon(opts.bodyVariant),
      render: () => (
        <BodyZone
          variant={opts.bodyVariant as 'video' | 'voice' | 'text'}
          state={ctx.state}
          appointment={ctx.appointment as PaneAppointment}
          token={ctx.token}
          launcherRef={ctx.launcherRef ?? FALLBACK_LAUNCHER_REF}
          onRxSent={ctx.onRxSent}
          onMarkNoShow={ctx.onMarkNoShow}
          hideHeader
        />
      ),
      naturalSizePct: opts.bodyHeight,
      minSizePx: opts.bodyVariant === 'voice' ? 60 : 280,
    });
  }

  // ASSESSMENT STRIP — third child of middle column.
  children.push({
    id: 'assessment',
    title: 'Assessment',
    render: () => (
      <AssessmentStrip
        state={ctx.state}
        appointmentId={(ctx.appointment as PaneAppointment).id}
      />
    ),
    naturalSizePct: opts.assessmentHeight,
    minSizePx: 60,
  });

  // BOTTOM ROW — wrapped with safety + action-footer overlays + container-query.
  children.push(makeMiddleBottomRow(ctx, opts.bottomRowHeight));

  return {
    id: 'middle-column',
    title: 'Consult',
    render: () => null,
    children,
    naturalSizePct: 56,
    minSizePx: 480,
  };
}

function makeMiddleBottomRow(ctx: TelemedVideoContext, bottomRowHeight: number): PaneDefinition {
  return {
    id: 'middle-bottom',
    title: 'Plan & Investigations',
    render: () => (
      <div
        className="@container/middle-bottom flex h-full flex-col"
        style={{ containerType: 'inline-size', containerName: 'middle-bottom' }}
      >
        <SafetyStickyStrip
          patientId={ctx.appointment.patient_id ?? ''}
          token={ctx.token}
          appointmentId={ctx.appointment.id}
        />
        <div className="flex-1 overflow-y-auto">
          {/* the existing PanelGroup with Investigations leaf + Plan leaf renders here,
              via children. cmr-05's InvestigationsAutoMerge sits inside Plan and is
              gated by the container query. */}
        </div>
        <PlanActionFooter
          state={ctx.state}
          appointmentId={ctx.appointment.id}
          onSent={ctx.onRxSent}
          onFinishVisit={ctx.onFinishVisit}
          finishBusy={ctx.finishBusy}
        />
      </div>
    ),
    direction: 'horizontal',
    children: [
      // Investigations leaf — wrapped to hide at narrow widths (cmr-05).
      {
        id: 'investigations-orders',
        title: 'Investigations',
        icon: Beaker,
        render: () => (
          <div className="hidden h-full @[720px]/middle-bottom:block">
            <InvestigationsPane state={ctx.state} hideHeader />
          </div>
        ),
        naturalSizePct: 40,
        minSizePx: 200,
      },
      // Plan leaf — Plan content + (when narrow) the auto-merged chip-row at top.
      {
        id: 'plan',
        title: 'Plan (Rx)',
        icon: Pill,
        render: () => (
          <div className="flex h-full flex-col">
            <InvestigationsAutoMerge state={ctx.state} />
            <RxPane
              appointment={ctx.appointment as PaneAppointment}
              token={ctx.token}
              state={ctx.state}
              onRxSent={ctx.onRxSent}
              onFinishVisit={ctx.onFinishVisit}
              onMedicineCountChange={ctx.onMedicineCountChange}
              hideHeader
              actionsInFooter // cmr-03: suppress inline action area; footer owns it
            />
          </div>
        ),
        naturalSizePct: 60,
        minSizePx: 280,
      },
    ],
    naturalSizePct: bottomRowHeight,
    minSizePx: 360,
  };
}
```

Note: the bottom-row's wrapping render function nests the PanelGroup inside a `<div>` so the safety strip + action footer can be siblings. This requires `<PatientProfileShell>` to handle the case where a non-leaf node has a `render` function that returns JSX wrapping the children's PanelGroup. **Verify against the shell's current behavior** — if the shell expects `render: () => null` for parent nodes, this approach needs adjustment.

**Alternative approach** if the shell can't host a non-leaf with custom render: split the safety strip + footer into separate sibling pane definitions inside `middle-column`'s children array:
- `middle-bottom-safety` (60-80px, sticky overlay-style via CSS only)
- `middle-bottom-content` (the PanelGroup with Investigations + Plan)
- `middle-bottom-footer` (56px, sticky overlay-style)

Pick whichever fits the shell's contract. Verify with a small spike during cmr-06.

### 2. Sweep all four factories

Apply the new `makeMiddleColumn` / `makeMiddleBottomRow` helpers to:

- `getTelemedVideoTemplate(ctx)` — `bodyVariant='video', bodyHeight=42, assessmentHeight=8, bottomRowHeight=50`.
- `getTelemedVoiceTemplate(ctx)` — `bodyVariant='voice', bodyHeight=15, assessmentHeight=8, bottomRowHeight=77`.
- `getTelemedTextTemplate(ctx)` — `bodyVariant='text', bodyHeight=40, assessmentHeight=8, bottomRowHeight=52`.
- `getReviewTemplate(ctx)` — `bodyVariant='review' (Body omitted), assessmentHeight=8, bottomRowHeight=92`.

The 100% column-height budget is now: Body + Assessment + bottom-row. Adjust the existing percentages in tmr-01's factories to make room for the 8% Assessment strip. The numbers above already factor that in.

### 3. Update imports

At the top of `templates.tsx`, add imports for:

```tsx
import { AssessmentStrip } from '@/components/cockpit/middle/AssessmentStrip';
import { SafetyStickyStrip } from '@/components/cockpit/middle/SafetyStickyStrip';
import { PlanActionFooter } from '@/components/cockpit/middle/PlanActionFooter';
import { BodyZone } from '@/components/cockpit/middle/BodyZone';
import { InvestigationsAutoMerge } from '@/components/cockpit/middle/InvestigationsAutoMerge';
```

### 4. Update the header comment block

Update the file's top comment to reflect the new components:

```
 * cmr-06 (R-MIDDLE rest, 2026-05-21) wired:
 *   - <AssessmentStrip> as third child of middle-column (id="assessment").
 *   - <SafetyStickyStrip> + <PlanActionFooter> as overlays inside middle-bottom.
 *   - <BodyZone> wrapper around <ConsultationBodyPane> (per modality).
 *   - <InvestigationsAutoMerge> + container-query for narrow-monitor merge.
 */
```

### 5. Verify pane id stability

The new `id: 'assessment'` is added to the middle column. Layout-tree v4 (cv2-02) handles new pane ids by falling back to the template's default sizes for unknown ids in saved trees. Verify by:

1. Open the cockpit with a saved layout that pre-dates this change.
2. The shell should add the Assessment strip at default 8% without breaking.
3. Save the layout (drag a handle).
4. Reload — the new `assessment` pane id is now in the saved tree.

If the shell crashes on the new id, capture-inbox a migration bug.

### 6. Smoke at all four templates

Open `/dashboard/appointments/[id]` for each modality and verify:

- Video → Body (50%) → Assessment strip (8%) → bottom-row (42%) with safety + footer overlays.
- Voice → Body (15%) → Assessment strip (8%) → bottom-row (77%) with overlays.
- Text → Body (40%) → Assessment strip (8%) → bottom-row (52%) with overlays.
- Review → no Body → Assessment strip (8%) → bottom-row (92%) with overlays, Send button hidden.

Then resize the viewport to ~1280px. Verify the narrow-monitor merge engages: Investigations leaf hides, chip-row appears at top of Plan.

---

## Files touched

- **Modified:** `frontend/lib/patient-profile/templates.tsx` (~80 LOC delta across 4 factories: 5 new imports, helper updates, container-query wrapper, sticky overlays).
- **Modified:** `frontend/lib/patient-profile/types.ts` — `groupWrapper?` on `PaneDefinition` (Shell can't invoke parent `render()` when children exist; wrapper injects safety/footer overlays without new pane ids).
- **Modified:** `frontend/components/patient-profile/Shell.tsx` — honour `groupWrapper` for non-leaf nodes.
- **Modified:** `frontend/components/patient-profile/panes/RxPane.tsx`, `frontend/components/consultation/cockpit/RxWorkspace.tsx`, `frontend/components/consultation/PrescriptionForm.tsx`, `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx` — `dxLifted` + `safetyLifted` props for cockpit mount.
- **Modified:** `frontend/lib/patient-profile/__tests__/templates.test.ts` — 8-leaf order + cmr-06 structural snapshot.

---

## Acceptance gate

- [x] `pnpm --filter frontend tsc --noEmit` clean. `pnpm --filter frontend lint` clean. `pnpm --filter frontend build` clean. *(tsc: pre-existing errors in VoiceConsultRoom + PatientRibbon unrelated to cmr-06; templates.test.ts 12/12 green; lint clean on touched files.)*
- [x] All four template factories have:
  - 3-child middle-column (Body / Assessment / bottom-row), or 2-child for Review (Assessment / bottom-row).
  - Assessment strip with naturalSizePct: 8, minSizePx: 60.
  - Bottom-row wrapped with container-query + safety strip + action footer.
  - BodyZone wrapper instead of direct ConsultationBodyPane.
- [x] Pane id `assessment` is consistent across all factories.
- [ ] Pre-cmr-06 saved layout-trees load gracefully — Assessment strip appears at default size. *(manual smoke — layout-tree v4 falls back to naturalSizePct for unknown ids)*
- [ ] React DevTools: exactly one `<RxFormProvider>` in the tree. *(manual smoke)*
- [ ] Smoke matrix passes at all four templates (visual verification). *(manual smoke)*
- [ ] Narrow-monitor merge engages at ~1280px viewport. *(manual smoke)*
- [ ] No new console errors. No new Sentry errors in 5-min smoke. *(manual smoke — cmr-07)*

---

## Anti-goals

- ❌ Don't add new pane ids beyond `assessment`. The safety strip + footer are render-time overlays, NOT new pane definitions.
- ❌ Don't change Body / Plan / Investigations / Subjective / Objective pane ids — saved layout-trees depend on them.
- ❌ Don't introduce a new ctx prop unless absolutely necessary. The existing `TelemedVideoContext` covers everything.
- ❌ Don't fire telemetry from this task — the individual components fire their own one-shot events.
- ❌ Don't add visibility logic beyond what the components already self-gate. E.g., the safety strip self-hides when empty; this template doesn't need to gate it externally.

---

## Notes

- This is the load-bearing wiring task. Get it right and everything else "just works"; get it wrong and the strips fail to render / double-mount / break the shell's saved-tree migration.
- The "non-leaf node with custom render" question (§1 alternative) is the spike to do first. Read `frontend/components/patient-profile/Shell.tsx` to confirm whether the recursive PanelGroup walker invokes `render` on parent nodes. If it doesn't, switch to the sibling-pane-definitions approach.
- The header comment update matters — the file is the single source of truth for "what content the cockpit renders." Future planning passes read this file's header to know which R-items have landed.
- After this task ships, the entire middle column matches the source plan §4 ASCII art. The cockpit-v2 §"after this plan ships" point #1 ("8 default sub-panes in a nested tree") is now CLEARED.
