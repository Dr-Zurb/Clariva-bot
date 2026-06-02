"use client";

import { useMemo, type ReactNode } from "react";
import {
  flattenPaneDefinitions,
  type PaneDefinition,
} from "@/lib/patient-profile/v3/foundation";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import { cn } from "@/lib/utils";
import CockpitEmptyState from "./CockpitEmptyState";

export interface CockpitMobileFallbackProps {
  panes: PaneDefinition[];
  layout: CockpitV3Layout;
  /** Pinned clinical-safety chrome (P3-DL-6 / R-MOBILE3). */
  safetyDock?: ReactNode;
  /** Pinned finish/send footer (P3-DL-6 / R-MOBILE3). */
  actionDock?: ReactNode;
}

/**
 * v3-DL-8 — flat stacked visible panes for &lt;lg viewports.
 * No splits, palette columns, or DnD. Safety + action docks pin around the
 * scroll region so mobile consults remain reachable (P3-DL-6).
 */
export default function CockpitMobileFallback({
  panes,
  layout,
  safetyDock,
  actionDock,
}: CockpitMobileFallbackProps) {
  const { paneById } = useMemo(
    () => flattenPaneDefinitions(panes),
    [panes],
  );

  const visiblePaneIds = useMemo(
    () =>
      layout.paneOrder.filter((id) => !(layout.paneState[id]?.hidden ?? true)),
    [layout.paneOrder, layout.paneState],
  );

  const mainContent = !layout.hydrated ? (
    <div
      data-testid="cockpit-v3-mobile-skeleton"
      className="flex min-h-[44px] flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      Loading layout…
    </div>
  ) : visiblePaneIds.length === 0 ? (
    <CockpitEmptyState />
  ) : (
    <div className="flex flex-col gap-3">
      {visiblePaneIds.map((paneId) => {
        const pane = paneById[paneId];
        if (!pane) return null;
        return (
          <section
            key={paneId}
            data-pane-id={paneId}
            data-cockpit-mobile-pane={paneId}
            aria-label={pane.title}
            className="flex shrink-0 flex-col overflow-hidden rounded-md border border-border bg-background"
          >
            <div
              className={cn(
                "flex min-h-[44px] items-center border-b border-border/60 bg-muted/30 px-3 py-2",
                "text-sm font-medium",
              )}
            >
              {pane.title}
            </div>
            <div className="min-h-0 p-3">{pane.render()}</div>
          </section>
        );
      })}
    </div>
  );

  return (
    <div
      data-testid="cockpit-v3-mobile-fallback"
      className="flex h-full min-h-0 flex-col"
    >
      {safetyDock ? (
        <div
          data-testid="cockpit-v3-mobile-safety-dock"
          className="shrink-0 pt-[env(safe-area-inset-top)]"
        >
          {safetyDock}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{mainContent}</div>
      {actionDock ? (
        <div
          data-testid="cockpit-v3-mobile-action-dock"
          className="shrink-0 pb-[env(safe-area-inset-bottom)]"
        >
          {actionDock}
        </div>
      ) : null}
    </div>
  );
}
