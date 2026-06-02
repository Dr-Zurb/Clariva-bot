"use client";

import { useMemo } from "react";
import {
  flattenPaneDefinitions,
  type PaneDefinition,
} from "@/lib/patient-profile/v3/foundation";
import { hasVisibleLeaves } from "@/lib/patient-profile/v3/blankLayout";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import CockpitGroupView from "./CockpitGroupView";
import CockpitEmptyState from "./CockpitEmptyState";

function CockpitCanvasSkeleton() {
  return (
    <div
      data-testid="cockpit-v3-canvas-skeleton"
      className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground"
    >
      Loading layout…
    </div>
  );
}

export interface CockpitCanvasProps {
  panes: PaneDefinition[];
  layout: CockpitV3Layout;
  canDragPane?: (paneId: string) => boolean;
}

export default function CockpitCanvas({
  panes,
  layout,
  canDragPane = () => true,
}: CockpitCanvasProps) {
  const { paneById: paneByIdRecord } = useMemo(
    () => flattenPaneDefinitions(panes),
    [panes],
  );
  const paneById = useMemo(
    () => new Map(Object.entries(paneByIdRecord)),
    [paneByIdRecord],
  );

  const showEmpty = layout.hydrated && !hasVisibleLeaves(layout.paneTree);

  if (!layout.hydrated) {
    return <CockpitCanvasSkeleton />;
  }

  if (showEmpty) {
    return <CockpitEmptyState />;
  }

  return (
    <div data-testid="cockpit-v3-canvas" className="h-full min-h-0">
      <CockpitGroupView
        node={layout.paneTree}
        paneById={paneById}
        layout={layout}
        canDragPane={canDragPane}
      />
    </div>
  );
}
