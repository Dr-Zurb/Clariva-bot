"use client";

/**
 * RailCollapsedStub (Cockpit shell redesign · cs-08; cc-12 renderer
 * refactor; polish-round-3 chevron-band refactor)
 *
 * Shared "collapsed rail" surface used on both sides of the cockpit's
 * `<ResizablePanelGroup>`. Renders a narrow (panel `collapsedSize` =
 * `COLLAPSED_SIZE_PX`, currently 40px) vertical band containing:
 *
 *   1. A top "header band" — h-10 with a `border-b`, replicating the
 *      `<CockpitColumnHeader>` chrome on the expanded columns. Hosts
 *      the expand chevron, so the chevron's container has the SAME
 *      bottom-border y-position as the neighbouring column headers
 *      (polish-round-3 ask: "the expand arrow lower border should be
 *      similar to coloum header").
 *
 *   2. A body area below the header band — fills the remaining height
 *      with either the default treatment (a vertical-text label) or
 *      the renderer's output. cc-13 / cc-14 ship richer renderers
 *      (`<CollapsedChartRail>` for the section-icon stack and
 *      `<CollapsedRxRail>` for the medicine-count peek strip).
 *
 * Before the polish-round-3 refactor the expand chevron was owned by
 * the renderer itself. The default renderer rendered chevron +
 * vertical text; `<CollapsedChartRail>` rendered chevron + divider +
 * icons; `<CollapsedRxRail>` rendered chevron + Pill peek inside a
 * single big button. That split made it impossible to consistently
 * align the chevron with the column-header baseline across all three
 * renderers, and forced every new renderer to remember to render its
 * own chevron. Centralising the chevron in this component:
 *   - guarantees a continuous border-b line across all columns
 *     (collapsed + expanded) at y=40px;
 *   - lets renderers focus on the body content only (one less prop to
 *     remember);
 *   - keeps the chevron's `[`/`]` hotkey advertising consistent (this
 *     component reads `ariaKeyShortcuts` once and applies it to the
 *     single chevron, instead of every renderer needing to wire it).
 *
 * The wrapper `<aside>` (with its `aria-label`) is always owned by
 * this component so AT users always get a labelled collapsed region
 * regardless of which renderer is active.
 *
 * Designed to be parent-controlled: the cockpit owns the
 * `chartCollapsed` / `rxCollapsed` booleans (synced with the panel
 * API via `onResize`) and renders this stub when the panel is
 * collapsed.
 */

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type RailCollapsedSide = "left" | "right";

// ---------------------------------------------------------------------------
// cc-12 / polish-round-3: Renderer prop types
// ---------------------------------------------------------------------------

export interface RailCollapsedStubRendererProps {
  /** Same as the parent prop — passed down for renderer convenience. */
  side: RailCollapsedSide;
  /** Same as the parent prop. */
  label: string;
  /**
   * Same as the parent prop — call to expand the rail. Renderers
   * that wrap their body in an extra "click anywhere to expand"
   * button (e.g. `<CollapsedRxRail>`) wire this onto their `onClick`.
   * After polish-round-3 the chevron at the TOP is owned by
   * `<RailCollapsedStub>` itself, so renderers no longer need to
   * render their own chevron — they're for body content only.
   */
  onExpand: () => void;
  /**
   * Same as the parent prop — passed so renderers can advertise the
   * `[` / `]` hotkeys on any expand affordance they render IN THE
   * BODY (e.g. `<CollapsedRxRail>`'s big-button). The top chevron's
   * `aria-keyshortcuts` is already handled by this component.
   */
  ariaKeyShortcuts?: string;
}

/**
 * cc-12 / polish-round-3: Optional BODY content renderer. When
 * provided, replaces the default vertical-text label in the body
 * area. The top chevron header band is rendered regardless of
 * renderer — renderers focus on the inner content of the body.
 */
export type RailCollapsedRenderer = (
  props: RailCollapsedStubRendererProps,
) => React.ReactNode;

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

interface RailCollapsedStubProps {
  /**
   * Which rail is collapsed. Drives the chevron direction so it always
   * points toward the body column ("expand inward").
   */
  side: RailCollapsedSide;
  /** Vertical text label for the rail (e.g. "Patient chart" / "Prescription"). */
  label: string;
  /** Click handler — parent calls `panelRef.current?.expand()`. */
  onExpand: () => void;
  /**
   * Optional `aria-keyshortcuts` advertised on the expand button so AT
   * users discover the `[` / `]` hotkeys. The hook itself owns the actual
   * key event; this attribute is for discoverability only.
   */
  ariaKeyShortcuts?: string;
  /** Extra class hook for the outer wrapper. */
  className?: string;
  /**
   * cc-12 / polish-round-3: Optional BODY content renderer. When
   * provided, replaces the default vertical-text label in the body
   * area. See `RailCollapsedRenderer`.
   */
  renderer?: RailCollapsedRenderer;
}

// ---------------------------------------------------------------------------
// Default body renderer — vertical-text label only (no chevron, that's
// owned by the parent now).
// ---------------------------------------------------------------------------

const defaultBodyRenderer: RailCollapsedRenderer = ({ label }) => (
  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
    {label}
  </p>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RailCollapsedStub({
  side,
  label,
  onExpand,
  ariaKeyShortcuts,
  className,
  renderer,
}: RailCollapsedStubProps) {
  const Icon = side === "left" ? ChevronRight : ChevronLeft;
  return (
    <aside
      aria-label={`${label} (collapsed)`}
      className={cn(
        "flex h-full w-full flex-col items-stretch bg-card",
        className,
      )}
    >
      {/*
        Top header band — h-10 + border-b mirror the
        `<CockpitColumnHeader>` chrome on the expanded columns, so
        all column tops share the same bottom-border y-position. The
        chevron sits centred in the band.
      */}
      <div className="flex h-10 shrink-0 items-center justify-center border-b bg-background">
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={false}
          aria-label={`Expand ${label.toLowerCase()}`}
          aria-keyshortcuts={ariaKeyShortcuts}
          className={cn(
            "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Body — fills the remaining height. */}
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto py-3">
        {(renderer ?? defaultBodyRenderer)({
          side,
          label,
          onExpand,
          ariaKeyShortcuts,
        })}
      </div>
    </aside>
  );
}
