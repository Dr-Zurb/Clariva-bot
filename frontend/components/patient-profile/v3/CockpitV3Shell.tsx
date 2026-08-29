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
import { trackCockpitV3DragDrop } from "@/lib/patient-profile/telemetry";
import { CallStageChromeProvider } from "@/components/consultation/CallStageChromeContext";
import {
  consultAlreadyRoomyForChat,
  withConsultChatMinSize,
} from "@/lib/call/consult-chat-layout";
import CockpitCanvas from "./CockpitCanvas";
import CockpitDndContext, {
  type CockpitDropMovePayload,
  type CockpitDropReorderPayload,
  type CockpitDropSwapPayload,
} from "./CockpitDndContext";
import CockpitPalette from "./CockpitPalette";
import CockpitMobileFallback from "./CockpitMobileFallback";

export interface CockpitV3ShellProps {
  panes?: PaneDefinition[];
  storageKey?: string;
  /**
   * Previously locked Consult (`body`) drag while live (v3-DL-6). Kept for
   * call-site compat — Consult is freely rearrangeable during teleconsult now.
   */
  consultActive?: boolean;
  /** Anchored clinical-safety chrome (v3-DL-6 / P0-DL-3). */
  safetyDock?: ReactNode;
  /** Anchored "Send Rx & finish" footer (v3-DL-6 / P0-DL-3). */
  actionDock?: ReactNode;
  /** Doctor auth token — enables saved custom layouts in the palette (cv3l-05). */
  token?: string;
  /**
   * Stable Consult host (`<ConsultSurfaceHost>`). Must render as a React child
   * of `CallStageChromeProvider` so the portaled VideoRoom sees chrome context
   * (in-call chat min-width / Focus widen). DOM still portals into the body slot.
   */
  consultSurfaceHost?: ReactNode;
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
  consultActive: _consultActive = false,
  safetyDock,
  actionDock,
  token,
  consultSurfaceHost = null,
}: CockpitV3ShellProps) {
  void _consultActive;
  const isLg = useMediaQuery("(min-width: 1024px)", true);

  /**
   * In-call chat raises Consult's splitter floor so Subjective cannot
   * drag below video+chat mins. Reported from `<VideoRoom>` via chrome.
   */
  const [consultChatOpen, setConsultChatOpen] = useState(false);
  const canvasPanes = useMemo(
    () => withConsultChatMinSize(panes, consultChatOpen),
    [panes, consultChatOpen],
  );

  const { paneById: paneByIdRecord } = useMemo(
    () => flattenPaneDefinitions(canvasPanes),
    [canvasPanes],
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

  // All panes (including Consult / `body` during live teleconsult) are
  // rearrangeable — the old live-consult drag lock was inconvenient in practice.
  const canDragPane = useCallback((_paneId: string) => true, []);

  const fillTabActive =
    layout.isFocused &&
    layout.ratio === "full" &&
    (layout.focusedLeafId === "body" ||
      Boolean(layout.focusedLeafId?.includes("body")));

  const enterFillTab = useCallback(() => {
    layout.enterSplit("body", "full");
  }, [layout]);

  const exitFillTab = useCallback(() => {
    layout.exitFocus();
  }, [layout]);

  /** True when in-call chat opened Focus so we must Restore on close. */
  const chatFocusOwnedRef = useRef(false);

  const prepareConsultForChat = useCallback(() => {
    if (
      consultAlreadyRoomyForChat({
        isFocused: layout.isFocused,
        focusedLeafId: layout.focusedLeafId,
        ratio: layout.ratio,
      })
    ) {
      // Don't steal ownership — closing chat must not undo user's Full/Wide.
      return;
    }
    const ok = layout.enterSplit("body", "wide");
    if (ok) chatFocusOwnedRef.current = true;
  }, [layout]);

  const releaseConsultAfterChat = useCallback(() => {
    if (!chatFocusOwnedRef.current) return;
    chatFocusOwnedRef.current = false;
    const stillOnBody =
      layout.isFocused &&
      (layout.focusedLeafId === "body" ||
        Boolean(layout.focusedLeafId?.includes("body")));
    if (stillOnBody) {
      layout.exitFocus();
    }
  }, [layout]);

  /** Wide still too tight for video+chat — take Full and own restore. */
  const escalateConsultForChat = useCallback(() => {
    const ok = layout.enterSplit("body", "full");
    if (ok) chatFocusOwnedRef.current = true;
  }, [layout]);

  const handleDrop = useCallback(
    (route: CockpitDropMovePayload) => {
      const res = route.gutter
        ? layout.moveIntoGutter(
            route.sourcePaneId,
            route.gutter.parentId,
            route.gutter.leftChildId,
            route.gutter.rightChildId,
            route.targetGroupId,
            route.zone,
          )
        : layout.movePane(route.sourcePaneId, route.targetGroupId, route.zone);
      toastOnCapRejection(res);
      if (res.ok) {
        trackCockpitV3DragDrop({
          sourcePaneId: route.sourcePaneId,
          targetGroupId: route.targetGroupId,
          zone: route.zone,
        });
      }
    },
    [layout],
  );

  const handleReorder = useCallback(
    (route: CockpitDropReorderPayload) => {
      toastOnCapRejection(
        layout.reorderWithinGroup(
          route.groupId,
          route.sourcePaneId,
          route.overPaneId,
          route.place,
        ),
      );
    },
    [layout],
  );

  const handleSwap = useCallback(
    (route: CockpitDropSwapPayload) => {
      const res = layout.swapLeaves(route.sourceGroupId, route.targetGroupId);
      toastOnCapRejection(res);
      if (res.ok) {
        trackCockpitV3DragDrop({
          sourcePaneId: route.sourcePaneId,
          targetGroupId: route.targetGroupId,
          zone: "center",
        });
      }
    },
    [layout],
  );

  const chrome = (
    <CallStageChromeProvider
      fillTabActive={Boolean(fillTabActive)}
      onEnterFillTab={enterFillTab}
      onExitFillTab={exitFillTab}
      onPrepareConsultForChat={prepareConsultForChat}
      onReleaseConsultAfterChat={releaseConsultAfterChat}
      onEscalateConsultForChat={escalateConsultForChat}
      onConsultChatOpenChange={setConsultChatOpen}
    >
      {isLg ? (
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
            onSwap={handleSwap}
          >
            <div ref={canvasMeasureRef} className="min-h-0 flex-1">
              <CockpitCanvas
                panes={canvasPanes}
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
      ) : (
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
      )}
      {/* Portaled Consult must stay under this provider (context, not DOM). */}
      {consultSurfaceHost}
    </CallStageChromeProvider>
  );

  return chrome;
}
