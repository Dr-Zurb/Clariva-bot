# Task cc-13: `<CollapsedChartRail>` — section-icon stack with click-to-jump

## 10 May 2026 — Batch [Cockpit customization](../plan-cockpit-customization-batch.md) — Phase E, Lane α step 1 — **M, ~2h**

---

## Task overview

cc-12 made `<RailCollapsedStub>` renderer-prop-friendly. cc-13 ships the **chart's** custom renderer: a vertical stack of section-icon buttons. One icon per `<PatientChartPanel>` section:

| Section | Icon | id anchor |
|---|---|---|
| Allergies | `AlertTriangle` | `chart-section-allergies` |
| Chronic conditions | `Activity` | `chart-section-conditions` |
| Problem list | `ListChecks` | `chart-section-problems` |
| Vitals | `HeartPulse` | `chart-section-vitals` |
| Previous prescriptions | `FileText` | `chart-section-previous-rx` |

Click any icon → expand the rail AND scroll to that section. The "scroll-to" requires that each section in `<PatientChartPanel>` have a stable `id` attribute on its `<section>` wrapper (or `<SectionWrapper>` outer node). cc-13 adds those `id`s in the same task because they're tightly coupled to the renderer's behavior.

A small label tooltip appears on hover (the icon alone isn't always enough). Tooltips reuse shadcn `<Tooltip>`.

**Estimated time:** ~2h.

**Status:** Pending.

**Hard deps:** cc-12 (the renderer prop must exist).

**Source:** [plan-cockpit-customization-batch.md § CC-D4](../plan-cockpit-customization-batch.md#decision-lock-locked-2026-05-10-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **No** — stitch onto cc-12 in the same chat (both touch the rail-stub area). If you do start fresh, pre-load:
- This task file.
- The cc-12 output (renderer-prop signature on `<RailCollapsedStub>`).
- `frontend/components/ehr/PatientChartPanel.tsx` (where the sections live; you'll add `id` anchors to each `<SectionWrapper>` wrapper).
- `frontend/components/ehr/SectionWrapper.tsx` (the wrapper component — confirm it accepts an `id` prop or wraps something that does).
- `frontend/components/ui/tooltip.tsx` (shadcn `<Tooltip>`).
- `frontend/components/consultation/ConsultationCockpit.tsx` (where you'll wire `renderer={...}` on the chart's `<RailCollapsedStub>`).

**Estimated turns:** 2 turns.

---

## Acceptance criteria

### Add stable `id` anchors to chart sections

- [ ] In `frontend/components/ehr/PatientChartPanel.tsx`, each `<SectionWrapper>` for the desktop chart must render with a stable id on its outer node:

  - Easiest path: pass an `id` prop to each `<SectionWrapper>`. If `<SectionWrapper>` doesn't accept one, add `id` as an optional pass-through prop on the wrapper (~3 LOC delta in `SectionWrapper.tsx`).

  - Suggested ids (from the table above):

    ```tsx
    <SectionWrapper id="chart-section-allergies" title="Allergies" ...>
    <SectionWrapper id="chart-section-conditions" title="Chronic conditions" ...>
    <SectionWrapper id="chart-section-problems" title="Problem list" ...>
    <SectionWrapper id="chart-section-vitals" title="Vitals" ...>
    <SectionWrapper id="chart-section-previous-rx" title="Previous prescriptions" ...>
    ```

- [ ] Verify by `document.getElementById('chart-section-allergies')` from the browser console — must return the section's wrapping element.

### Create `<CollapsedChartRail>` renderer

- [ ] Create `frontend/components/consultation/cockpit/CollapsedChartRail.tsx`:

  ```tsx
  'use client';

  /**
   * CC-13: Custom renderer for the collapsed chart rail. Replaces the
   * default chevron + vertical-label content with a vertical stack of
   * section-icon buttons. Each icon, when clicked, expands the rail
   * (parent's `onExpand`) AND scrolls the just-expanded chart to the
   * corresponding section.
   *
   * Designed to be passed as `<RailCollapsedStub renderer={CollapsedChartRail}>`.
   * The wrapper `<aside>` (with `aria-label`) and the wrapper className
   * are owned by `<RailCollapsedStub>`; this component renders only the
   * inner content.
   */

  import { useCallback } from 'react';
  import { AlertTriangle, Activity, ChevronRight, ChevronLeft, FileText, HeartPulse, ListChecks } from 'lucide-react';
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
  import type { RailCollapsedStubRendererProps } from './RailCollapsedStub';

  interface ChartSectionDescriptor {
    id: string;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }

  const CHART_SECTIONS: readonly ChartSectionDescriptor[] = [
    { id: 'chart-section-allergies', label: 'Allergies', Icon: AlertTriangle },
    { id: 'chart-section-conditions', label: 'Conditions', Icon: Activity },
    { id: 'chart-section-problems', label: 'Problems', Icon: ListChecks },
    { id: 'chart-section-vitals', label: 'Vitals', Icon: HeartPulse },
    { id: 'chart-section-previous-rx', label: 'Previous Rx', Icon: FileText },
  ];

  export default function CollapsedChartRail({ side, label, onExpand, ariaKeyShortcuts }: RailCollapsedStubRendererProps & { ariaKeyShortcuts?: string }) {
    const ExpandIcon = side === 'left' ? ChevronRight : ChevronLeft;

    const jumpToSection = useCallback(
      (sectionId: string) => {
        // Expand the rail first; the section element only becomes visible once expanded.
        onExpand();
        // Scroll on the next tick so the panel has remounted at full width.
        requestAnimationFrame(() => {
          const el = document.getElementById(sectionId);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      },
      [onExpand],
    );

    return (
      <TooltipProvider delayDuration={150}>
        {/* Top: expand affordance — keeps the existing collapse-and-expand mental model */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onExpand}
              aria-expanded={false}
              aria-label={`Expand ${label.toLowerCase()}`}
              aria-keyshortcuts={ariaKeyShortcuts}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <ExpandIcon className="h-4 w-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side={side === 'left' ? 'right' : 'left'}>Expand chart</TooltipContent>
        </Tooltip>

        <div className="my-2 h-px w-6 bg-border" aria-hidden />

        {/* Section icons */}
        {CHART_SECTIONS.map(({ id, label: sectionLabel, Icon }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => jumpToSection(id)}
                aria-label={`Jump to ${sectionLabel}`}
                className="my-0.5 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <Icon className="h-4 w-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side={side === 'left' ? 'right' : 'left'}>{sectionLabel}</TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>
    );
  }
  ```

  - **Why `requestAnimationFrame` for the scroll?** When the rail expands, the panel content remounts at full width — the section element doesn't exist (or has zero height) until React commits. RAF defers the scroll to the next paint, by which time `getElementById` returns a layouted element.
  - **Why no AT shortcut on the section icons?** The expand button advertises `[`; section icons are click-only. Adding individual `aria-keyshortcuts` to each section icon would invent shortcuts that don't exist.

### Wire the renderer in `<ConsultationCockpit>`

- [ ] In `<ConsultationCockpit>`, when rendering the chart's collapsed branch:

  ```tsx
  {chartCollapsed ? (
    <RailCollapsedStub
      side="left"
      label="Patient chart"
      onExpand={handleChartExpand}
      ariaKeyShortcuts="["
      renderer={CollapsedChartRail}  // ← NEW
    />
  ) : (
    <AppointmentChartRail … />
  )}
  ```

  - Note: after cc-04's reorder support, "left" is whatever side the chart column currently occupies. cc-04's render dispatch already passes the right `side` prop; this just plugs in the new renderer.

### Tests

- [ ] In `frontend/components/consultation/cockpit/__tests__/CollapsedChartRail.test.tsx`:
  - "renders one button per chart section + the expand button".
  - "clicking a section button calls onExpand AND scrolls (mock `scrollIntoView`)".
  - "tooltip text matches the section label".
- [ ] In `frontend/components/ehr/__tests__/PatientChartPanel.test.tsx`:
  - "renders each section with a stable `id` attribute" (regression guard so cc-13's deep links keep working if sections are renamed).
- [ ] `pnpm --filter frontend tsc --noEmit` clean.

### Manual verification

- [ ] Open the cockpit. Collapse the chart rail. The collapsed rail shows: expand chevron, divider, then 5 small icons stacked vertically (allergy ↗, conditions ⚡, problems ☑, vitals ❤, prev Rx 📄).
- [ ] Hover each icon → tooltip "Allergies" / "Conditions" / etc. on the side opposite the rail.
- [ ] Click "Allergies" icon → rail expands AND scrolls so the Allergies section is at the top of the rail's visible area.
- [ ] Click the expand chevron → rail expands without scrolling.
- [ ] Resize down to a narrow viewport (~1280px wide). Confirm the icon stack still fits in the 7% collapsed width.

---

## Out of scope

- **Per-section badge counts in the collapsed view** (e.g. "3 allergies"). Adds visual noise; section icons are presence-only. Counts can land in a polish task.
- **Drag-handle on the collapsed rail's expand button** (for cc-07 reorder). Reorder via the collapsed rail isn't a target UX — doctors expand first, then drag.
- **Customizable section order in the icon stack**. The order matches `<PatientChartPanel>`'s render order; if that ever becomes user-customizable, cc-13's `CHART_SECTIONS` constant becomes the source of order to mirror.
- **Animation between collapsed-icon-tap → expanded-section-scroll**. Smooth scroll is what the browser provides; richer animation is polish-tier.

---

## Files expected to touch

**Modified:**
- `frontend/components/ehr/PatientChartPanel.tsx` (~5 LOC delta — `id` props on 5 `<SectionWrapper>` elements).
- `frontend/components/ehr/SectionWrapper.tsx` (~3 LOC delta IF id-pass-through isn't already supported).
- `frontend/components/consultation/ConsultationCockpit.tsx` (~3 LOC delta — `renderer={CollapsedChartRail}` on the chart's stub).

**New:**
- `frontend/components/consultation/cockpit/CollapsedChartRail.tsx` (~120 LOC).
- `frontend/components/consultation/cockpit/__tests__/CollapsedChartRail.test.tsx` (~120 LOC).

---

## Notes / open decisions

1. **Why icons + tooltips and not always-on labels?** Width budget. 7% (~90–135px) holds icon + small text but only barely; full labels would require more width or truncation. Tooltips are the standard idiom for icon-only buttons.
2. **What if a doctor uses the cockpit without the chart panel (walk-in / no-patient)?** The chart column isn't rendered at all on walk-ins (cc-04 filters `chart` from `slots`). So `<CollapsedChartRail>` never instantiates in that case — no edge case to handle.
3. **Section reorder safety.** If a future task reorders the sections in `<PatientChartPanel>`, the `CHART_SECTIONS` constant in `CollapsedChartRail.tsx` should be updated in lockstep. Add a code comment in both files cross-referencing each other.
4. **Is `requestAnimationFrame` enough, or do we need `setTimeout(..., 50)`?** RAF is enough for React commit. If the user reports "scroll doesn't land on the right section", switch to a longer deferral (200ms covers panel-resize animation in `react-resizable-panels`).

---

## References

- **Affected files:**
  - new `frontend/components/consultation/cockpit/CollapsedChartRail.tsx`
  - `frontend/components/ehr/PatientChartPanel.tsx`
  - `frontend/components/ehr/SectionWrapper.tsx`
  - `frontend/components/consultation/ConsultationCockpit.tsx`
- **Predecessor:** [`task-cc-12-rail-collapsed-stub-renderer-refactor.md`](./task-cc-12-rail-collapsed-stub-renderer-refactor.md).
- **Sibling renderer:** [`task-cc-14-collapsed-rx-peek-strip.md`](./task-cc-14-collapsed-rx-peek-strip.md).

---

**Owner:** TBD
**Created:** 2026-05-10
**Status:** Pending
