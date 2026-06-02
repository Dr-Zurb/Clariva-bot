"use client";

/**
 * SectionWrapper (EHR Sub-batch A / T1.3)
 *
 * Collapse/expand affordance + title row + optional add button.
 * Used by every section inside <PatientChartPanel> (allergies,
 * conditions, vitals, previous Rx).
 *
 * Behaviour:
 *   - `startCollapsed` controls the INITIAL state only. The user toggle
 *     persists for the lifetime of the mount (we do NOT touch localStorage
 *     here — that's the host's job, e.g. `<PatientChartPanel layout='desktop'>`
 *     uses localStorage at the panel level, not per-section).
 *   - Collapsed: header row; when `collapsedSummary` is set, a one-line
 *     summary replaces the body (ccd-03 chart-rail disclosure).
 *   - Expanded: header row + body.
 *   - Optional `count` shows a small badge next to the title (e.g. "3").
 */

import { useState, type ReactNode } from "react";
import { PaneCollapseChevron } from "@/components/patient-profile/panes/PaneCollapseChevron";

interface SectionWrapperProps {
  title: string;
  startCollapsed?: boolean;
  /** Optional row count to display next to the title (e.g. number of allergies). */
  count?: number | null;
  /** If supplied, renders a "+ Add" affordance in the header that calls this. */
  onAdd?: () => void;
  /** Hide the add button (e.g. mode='readonly'). */
  hideAdd?: boolean;
  /** Override the "+ Add" button label (default: "Add"). */
  addLabel?: string;
  /** One-line summary shown when collapsed (chart-rail disclosure). */
  collapsedSummary?: ReactNode;
  children: ReactNode;
  /** Extra className applied to the section root. */
  className?: string;
  /**
   * cc-13: stable anchor id on the outer <section> element so collapsed-rail
   * icon buttons can scroll to this section via `document.getElementById`.
   * See `CollapsedChartRail.tsx` for the cross-reference.
   */
  id?: string;
}

function sectionBodyId(title: string): string {
  return `section-body-${title.replace(/\s+/g, "-").toLowerCase()}`;
}

export default function SectionWrapper({
  title,
  startCollapsed = false,
  count,
  onAdd,
  hideAdd,
  addLabel = "Add",
  collapsedSummary,
  children,
  className,
  id,
}: SectionWrapperProps) {
  const [collapsed, setCollapsed] = useState<boolean>(Boolean(startCollapsed));
  const bodyId = sectionBodyId(title);

  return (
    <section id={id} className={`border-b border-gray-100 last:border-b-0 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{title}</span>
          {typeof count === "number" && count > 0 && (
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
              {count}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onAdd && !hideAdd && (
            <button
              type="button"
              onClick={() => {
                if (collapsed) setCollapsed(false);
                onAdd();
              }}
              className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700"
            >
              + {addLabel}
            </button>
          )}
          <PaneCollapseChevron
            paneTitle={title}
            collapsed={collapsed}
            onToggle={() => setCollapsed((c) => !c)}
          />
        </div>
      </div>
      {collapsed ? (
        collapsedSummary != null ? (
          <div className="pb-3 text-xs text-muted-foreground">{collapsedSummary}</div>
        ) : null
      ) : (
        <div id={bodyId} className="pb-3" aria-labelledby={id}>
          {children}
        </div>
      )}
    </section>
  );
}
