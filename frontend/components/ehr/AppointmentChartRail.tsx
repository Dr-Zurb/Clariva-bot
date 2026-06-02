"use client";

/**
 * AppointmentChartRail (EHR Sub-batch A / T1.4)
 *
 * Client wrapper around <PatientChartPanel> for the appointment-detail
 * page. Owns:
 *   - breakpoint detection (lg+ → desktop layout, < lg → mobile accordion)
 *   - desktop collapse state (controlled by the parent when `collapsed` /
 *     `onToggle` are provided; otherwise managed internally and persisted to
 *     localStorage under `ehr_chart_collapsed_v1`).
 *   - the collapse chevron in an in-flow rail header (cs-05)
 *
 * cs-05: Toggle moved from `absolute right-1 top-3` into an in-flow
 *   <header> at the top of the rail. Parity with the legacy
 *   RxRailToggle (now deleted by cs-08; replaced by <RailCollapsedStub>
 *   alongside the cockpit's <ResizablePanelGroup>).
 *
 * cs-07: The rail no longer wraps itself in a `sticky h-[calc(100vh-…)]`
 *   container. The cockpit's lg+ shell is now a fixed-height flex
 *   container where each column is its own `overflow-y-auto` scroll
 *   context — the chart rail simply fills its parent column with
 *   `h-full` and lets the column do the scrolling. The optional
 *   `collapsed` / `onToggle` props let `<ConsultationCockpit>` lift the
 *   collapse state up so the column wrapper can resize itself
 *   (`w-[26%]` ↔ `w-[60px]`) without poking at our internal state. When
 *   the props are omitted the rail keeps its legacy self-managed
 *   behaviour (mobile branch, standalone usage, existing unit tests).
 */

import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import PatientChartPanel from "./PatientChartPanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import PaneHeader from "@/components/patient-profile/PaneHeader";

const COLLAPSE_KEY = "ehr_chart_collapsed_v1";

interface AppointmentChartRailProps {
  patientId: string;
  doctorId?: string;
  token: string;
  /** Optional appointment id — threaded into the panel for VitalsSection. */
  appointmentId?: string | null;
  /**
   * cs-07: Controlled collapsed state. When provided alongside
   * {@link onToggle}, the rail becomes a presentational component and
   * the parent owns the boolean + its persistence. Required for use
   * inside the cockpit's lg+ shell so the column wrapper can size
   * itself. Omit both props to fall back to the legacy
   * self-managed/localStorage behaviour.
   */
  collapsed?: boolean;
  onToggle?: () => void;
  /**
   * cc-05: When true the side-collapse chevron in the column header is
   * hidden. Pass `true` whenever the chart sits in the middle slot —
   * the side-collapse direction is meaningless there; the cockpit
   * supplies the middle-collapse chevrons via {@link headerLeadingExtra}
   * and {@link headerTrailingExtra} instead.
   */
  hideCollapse?: boolean;
  /**
   * cc-07: Drag-handle element to render in the left slot of the column
   * header. Passed in from `<ConsultationCockpit>` so the drag affordance
   * is wired to the cockpit's DndContext without re-shaping this component.
   */
  dragHandle?: React.ReactNode;
  /**
   * cc-middle-collapse: optional ReactNode rendered at the very start
   * of the header (before the drag handle), used by the middle slot
   * to expose its "collapse to the LEFT" corner chevron.
   */
  headerLeadingExtra?: React.ReactNode;
  /**
   * cc-middle-collapse: optional ReactNode rendered after the existing
   * collapse chevron (or in its place when `hideCollapse` is true),
   * used by the middle slot for the "collapse to the RIGHT" corner
   * chevron.
   */
  headerTrailingExtra?: React.ReactNode;
  /**
   * ppr-06: When true, the rail does NOT render its own
   * `<CockpitColumnHeader>` — the parent (e.g. `<PatientProfileShell>`'s
   * `<PaneHeader>`) is responsible for the column chrome. Used by the v2
   * shell so the "Patient chart" title isn't duplicated. v1 callers omit
   * this prop and the rail keeps its self-rendered header.
   */
  hideHeader?: boolean;
}

function readPersistedCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function writePersistedCollapsed(collapsed: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  } catch {
    // Quota / private mode — ignore; the in-memory state still works.
  }
}

export default function AppointmentChartRail({
  patientId,
  doctorId,
  token,
  appointmentId,
  collapsed: collapsedProp,
  onToggle: onToggleProp,
  hideCollapse = false,
  dragHandle,
  headerLeadingExtra,
  headerTrailingExtra,
  hideHeader = false,
}: AppointmentChartRailProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Internal fallback state for legacy/standalone usage. Ignored once a
  // controlled `collapsed` prop is supplied.
  const isControlled = collapsedProp !== undefined;
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(false);
  useEffect(() => {
    if (isControlled) return;
    setInternalCollapsed(readPersistedCollapsed());
  }, [isControlled]);

  const collapsed = isControlled ? collapsedProp : internalCollapsed;

  const toggle = () => {
    if (onToggleProp) {
      onToggleProp();
      return;
    }
    setInternalCollapsed((prev) => {
      const next = !prev;
      writePersistedCollapsed(next);
      return next;
    });
  };

  // Mobile (< lg): always render expanded, no collapse chevron.
  if (!isDesktop) {
    return (
      <PatientChartPanel
        patientId={patientId}
        doctorId={doctorId}
        token={token}
        appointmentId={appointmentId ?? undefined}
        layout="mobile"
      />
    );
  }

  // Desktop (lg+): collapsed → icon-only rail (fills the parent column);
  // expanded → full chart panel. The parent column owns the scroll
  // container (overflow-y-auto + fixed height) — we simply fill it.
  if (collapsed) {
    return (
      <aside
        aria-label="Patient chart (collapsed)"
        className="flex h-full w-full flex-col items-center bg-card py-3"
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={false}
          aria-controls="chart-body"
          aria-label="Expand patient chart"
          aria-keyshortcuts="["
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
          Patient chart
        </p>
      </aside>
    );
  }

  // Expanded: in-flow header row + chart body. The parent column owns
  // the scroll context, so the rail just fills its height.
  // cs-05: The old `absolute right-1 top-3` button is replaced by a header
  //   at the top of the rail's own scroll context. cs-08 will convert
  //   this into a <ResizablePanel> header with a collapse handle.
  // cc-middle-collapse: the side-collapse chevron and the middle-
  // collapse trailing chevron are mutually exclusive at any given
  // moment — `hideCollapse` is the side-collapse gate; the cockpit
  // only supplies `headerTrailingExtra` when the chart sits in the
  // middle slot (and `hideCollapse=true` is set in that case).
  const headerLeading =
    headerLeadingExtra || dragHandle ? (
      <>
        {headerLeadingExtra}
        {dragHandle}
      </>
    ) : undefined;
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {hideHeader ? null : (
        <PaneHeader
          title="Patient chart"
          titleId="chart-title"
          dragHandle={headerLeading}
          actions={
            <>
              {hideCollapse ? null : (
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={true}
                  aria-controls="chart-body"
                  aria-label="Collapse patient chart"
                  aria-keyshortcuts="["
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
              )}
              {headerTrailingExtra}
            </>
          }
        />
      )}
      <div id="chart-body" className="min-h-0 flex-1 overflow-hidden">
        <PatientChartPanel
          patientId={patientId}
          doctorId={doctorId}
          token={token}
          appointmentId={appointmentId ?? undefined}
          layout="desktop"
          className="h-full"
        />
      </div>
    </div>
  );
}
