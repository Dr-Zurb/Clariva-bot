"use client";

/**
 * CC-13 / polish-round-3: Custom BODY renderer for the collapsed
 * chart rail. Renders a vertical stack of section-icon buttons —
 * each icon, when clicked, expands the rail (parent's `onExpand`)
 * AND scrolls the just-expanded chart to the corresponding section.
 *
 * After the polish-round-3 refactor the expand chevron is owned by
 * `<RailCollapsedStub>` itself (it lives in the column-header-aligned
 * `h-10 border-b` top band). This renderer focuses only on the
 * body content — the section-icon stack — so all collapsed rails
 * share the SAME chevron/header chrome regardless of renderer.
 *
 * Designed to be passed as `<RailCollapsedStub renderer={CollapsedChartRail}>`.
 * The wrapper `<aside>` (with `aria-label`), the top chevron band,
 * and the body-area padding are owned by `<RailCollapsedStub>`;
 * this component renders only the section-icon stack.
 *
 * Section order mirrors `<PatientChartPanel>`'s render order.
 * If that order ever changes, update `CHART_SECTIONS` below in lockstep.
 * See also: `frontend/components/ehr/PatientChartPanel.tsx` (the id anchor source).
 */

import { useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  FileText,
  HeartPulse,
  ListChecks,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RailCollapsedStubRendererProps } from "./RailCollapsedStub";

interface ChartSectionDescriptor {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

/**
 * Sections in the same order as `<PatientChartPanel>`.
 * Cross-reference: `frontend/components/ehr/PatientChartPanel.tsx`.
 */
const CHART_SECTIONS: readonly ChartSectionDescriptor[] = [
  { id: "chart-section-allergies", label: "Allergies", Icon: AlertTriangle },
  { id: "chart-section-conditions", label: "Conditions", Icon: Activity },
  { id: "chart-section-problems", label: "Problems", Icon: ListChecks },
  { id: "chart-section-vitals", label: "Vitals", Icon: HeartPulse },
  { id: "chart-section-previous-rx", label: "Previous Rx", Icon: FileText },
];

export default function CollapsedChartRail({
  side,
  onExpand,
}: RailCollapsedStubRendererProps) {
  const tooltipSide = side === "left" ? "right" : "left";

  const jumpToSection = useCallback(
    (sectionId: string) => {
      // Expand the rail first — the section element only becomes visible once expanded.
      onExpand();
      // Defer the scroll to the next animation frame so the panel has had a
      // chance to remount at full width before `getElementById` is called.
      // If the rail uses a resize animation (react-resizable-panels), a
      // `setTimeout(..., 200)` may be needed instead if scroll lands off-target.
      requestAnimationFrame(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [onExpand],
  );

  return (
    <TooltipProvider delayDuration={150}>
      {/*
        Section icon stack — one button per chart section. The expand
        chevron is owned by `<RailCollapsedStub>` (top header band)
        after polish-round-3.
      */}
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
          <TooltipContent side={tooltipSide}>{sectionLabel}</TooltipContent>
        </Tooltip>
      ))}
    </TooltipProvider>
  );
}
