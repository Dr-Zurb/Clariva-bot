"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  flattenPaneDefinitions,
  type PaneDefinition,
} from "@/lib/patient-profile/v3/foundation";
import { paneTreeToFlat } from "@/lib/patient-profile/v3/foundation";
import { resolveSeedLayout } from "@/lib/patient-profile/v3/default-layouts";
import {
  maxComfortableColumns,
  maxRowsPerColumn,
} from "@/lib/patient-profile/v3/column-cap";
import { useCockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import { isFullEightPaneRegistry } from "@/lib/patient-profile/v3/default-layouts";
import { useCockpitLayoutSwitcher } from "@/lib/patient-profile/v3/useCockpitLayoutSwitcher";
import { useCockpitLayoutPresets } from "@/lib/patient-profile/v3/useCockpitLayoutPresets";
import { useCockpitLayoutHotkeys } from "@/lib/patient-profile/v3/useCockpitLayoutHotkeys";
import { toastOnCapRejection } from "@/lib/patient-profile/v3/cockpit-cap-toast";
import { layoutUxToast } from "@/lib/patient-profile/layout-ux-toast";
import { trackCockpitV3DragDrop } from "@/lib/patient-profile/telemetry";
import CockpitCanvas from "./CockpitCanvas";
import CockpitDndContext, {
  type CockpitDropMovePayload,
  type CockpitDropReorderPayload,
} from "./CockpitDndContext";
import CockpitPalette from "./CockpitPalette";
import CockpitMobileFallback from "./CockpitMobileFallback";

export interface CockpitV3ShellProps {
  panes?: PaneDefinition[];
  storageKey?: string;
  /** When true, the body tab is not draggable (v3-DL-6). */
  consultActive?: boolean;
  /** Anchored clinical-safety chrome (v3-DL-6 / P0-DL-3). */
  safetyDock?: ReactNode;
  /** Anchored "Send Rx & finish" footer (v3-DL-6 / P0-DL-3). */
  actionDock?: ReactNode;
  /** Doctor auth token — enables saved custom layouts in the palette (cv3l-05). */
  token?: string;
  /** Other PatientProfileShell props are accepted but ignored in Phase 1. */
  [key: string]: unknown;
}

/**
 * Cockpit v3 — Phase 1 shell (cv3c-04).
 *
 * Desktop: anchored docks + palette + recursive editor-group canvas.
 * Mobile: flat stacked visible panes (v3-DL-8). Shared layout persistence
 * via `useCockpitV3Layout` / `useShellLayout`.
 *
 * Must NOT import Shell.tsx / customize-mode-context (P0-DL-4).
 */
export default function CockpitV3Shell({
  panes = [],
  storageKey = "cockpit-v3-default",
  consultActive = false,
  safetyDock,
  actionDock,
  token,
}: CockpitV3ShellProps) {
  const isLg = useMediaQuery("(min-width: 1024px)", true);

  const { paneById: paneByIdRecord } = useMemo(
    () => flattenPaneDefinitions(panes),
    [panes],
  );
  const { paneOrder } = useMemo(
    () => flattenPaneDefinitions(panes),
    [panes],
  );
  const seedLayout = useMemo(() => resolveSeedLayout(panes), [panes]);
  const defaultFlat = useMemo(
    () => paneTreeToFlat(seedLayout.paneTree),
    [seedLayout],
  );

  const canvasMeasureRef = useRef<HTMLDivElement>(null);
  const [comfortableColumnCap, setComfortableColumnCap] = useState(4);
  const [comfortableRowCap, setComfortableRowCap] = useState(4);

  useEffect(() => {
    const el = canvasMeasureRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      // A 0 measurement means "not laid out yet / hidden" (jsdom, or a
      // display:none ancestor) — NOT a tiny viewport. Keep the last good cap
      // instead of collapsing to 1, which would over-eagerly tab new panes
      // instead of laying them out as columns/rows.
      const widthPx = el.clientWidth;
      const heightPx = el.clientHeight;
      if (widthPx > 0) setComfortableColumnCap(maxComfortableColumns(widthPx));
      if (heightPx > 0) setComfortableRowCap(maxRowsPerColumn(heightPx));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useCockpitV3Layout({
    storageKey,
    defaultPaneOrder: defaultFlat.paneOrder,
    defaultPaneState: defaultFlat.paneState,
    knownLeafIds: paneOrder,
    blankDefaultTree: seedLayout.paneTree,
    maxComfortableColumns: comfortableColumnCap,
    maxRowsPerColumn: comfortableRowCap,
  });

  const showFullLayoutRegistry = isFullEightPaneRegistry(panes);
  const layoutPresets = useCockpitLayoutPresets(token, showFullLayoutRegistry);
  const layoutSwitcher = useCockpitLayoutSwitcher(
    layout,
    layoutPresets.presets,
  );
  useCockpitLayoutHotkeys(
    showFullLayoutRegistry,
    layoutSwitcher.applyDefaultLayout,
  );

  const canDragPane = useCallback(
    (paneId: string) => !(paneId === "body" && consultActive),
    [consultActive],
  );

  const handleDrop = useCallback(
    (route: CockpitDropMovePayload) => {
      if (!canDragPane(route.sourcePaneId)) {
        layoutUxToast.error("Pause the consult before rearranging.");
        return;
      }
      const res = layout.movePane(
        route.sourcePaneId,
        route.targetGroupId,
        route.zone,
      );
      toastOnCapRejection(res);
      if (res.ok) {
        trackCockpitV3DragDrop({
          sourcePaneId: route.sourcePaneId,
          targetGroupId: route.targetGroupId,
          zone: route.zone,
        });
      }
    },
    [canDragPane, layout],
  );

  const handleReorder = useCallback(
    (route: CockpitDropReorderPayload) => {
      if (!canDragPane(route.sourcePaneId)) {
        layoutUxToast.error("Pause the consult before rearranging.");
        return;
      }
      toastOnCapRejection(
        layout.reorderWithinGroup(
          route.groupId,
          route.sourcePaneId,
          route.beforePaneId,
        ),
      );
    },
    [canDragPane, layout],
  );

  if (!isLg) {
    return (
      <div
        data-testid="p1-cockpit-v3-shell-mobile"
        className="flex h-full min-h-0 w-full flex-col"
      >
        <CockpitMobileFallback
          panes={panes}
          layout={layout}
          safetyDock={safetyDock}
          actionDock={actionDock}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="p1-cockpit-v3-shell-desktop"
      className="flex h-full min-h-0 w-full flex-col"
    >
      {safetyDock ? (
        <div data-testid="cockpit-v3-safety-dock" className="shrink-0">
          {safetyDock}
        </div>
      ) : null}
      <CockpitPalette
        panes={panes}
        layout={layout}
        layoutSwitcher={layoutSwitcher}
        token={token}
        className="shrink-0"
      />
      <CockpitDndContext
        paneById={paneByIdRecord}
        onDrop={handleDrop}
        onReorder={handleReorder}
      >
        <div ref={canvasMeasureRef} className="min-h-0 flex-1">
          <CockpitCanvas
            panes={panes}
            layout={layout}
            canDragPane={canDragPane}
          />
        </div>
      </CockpitDndContext>
      {actionDock ? (
        <div data-testid="cockpit-v3-action-dock" className="shrink-0">
          {actionDock}
        </div>
      ) : null}
    </div>
  );
}
