"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef } from "react";
import type { GroupImperativeHandle } from "react-resizable-panels";
import {
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  cockpitPanelDomId,
  type PaneDefinition,
  type PaneTreeNode,
} from "@/lib/patient-profile/v3/foundation";
import { MIN_COMFORTABLE_ROW_PX } from "@/lib/patient-profile/v3/column-cap";
import { cn } from "@/lib/utils";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import CockpitGutterHandle from "./CockpitGutterHandle";
import CockpitLeafView from "./CockpitLeafView";

/** Fallback column min-width (px) for a pane that doesn't declare `minSizePx`. */
const DEFAULT_MIN_PANE_PX = 160;

function isLeafNode(node: PaneTreeNode): boolean {
  return !node.children?.length;
}

/** Widest declared `minSizePx` among a leaf's tab(s). */
function leafMinWidthPx(
  node: PaneTreeNode,
  paneById: Map<string, PaneDefinition>,
): number {
  const ids = node.paneIds?.length ? node.paneIds : [node.id];
  let widest = 0;
  for (const id of ids) {
    const px = paneById.get(id)?.minSizePx;
    if (typeof px === "number" && px > widest) widest = px;
  }
  return widest;
}

/**
 * Min *width* (px) for a column: the widest pane min in its subtree. A stacked
 * column must be at least as wide as its widest member; the engine still
 * enforces any tighter inner constraint recursively, so a max() floor is safe.
 */
function subtreeMinWidthPx(
  node: PaneTreeNode,
  paneById: Map<string, PaneDefinition>,
): number {
  if (!node.children?.length) {
    return leafMinWidthPx(node, paneById) || DEFAULT_MIN_PANE_PX;
  }
  let widest = 0;
  for (const child of node.children) {
    const px = subtreeMinWidthPx(child, paneById);
    if (px > widest) widest = px;
  }
  return widest || DEFAULT_MIN_PANE_PX;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeChildSizes(children: PaneTreeNode[]): Record<string, number> {
  const visible = children.filter((child) => !child.hidden);
  if (visible.length === 0) return {};
  let sum = visible.reduce((acc, child) => acc + child.sizePct, 0);
  if (sum <= 0) sum = visible.length;
  const out: Record<string, number> = {};
  for (const child of visible) {
    out[child.id] = roundPct((child.sizePct / sum) * 100);
  }
  return out;
}

export interface CockpitGroupViewProps {
  node: PaneTreeNode;
  paneById: Map<string, PaneDefinition>;
  layout: CockpitV3Layout;
  canDragPane?: (paneId: string) => boolean;
}

export default function CockpitGroupView({
  node,
  paneById,
  layout,
  canDragPane = () => true,
}: CockpitGroupViewProps) {
  if (isLeafNode(node)) {
    return (
      <CockpitLeafView
        node={node}
        paneById={paneById}
        layout={layout}
        canDragPane={canDragPane}
      />
    );
  }
  return (
    <CockpitSplitGroup
      node={node}
      paneById={paneById}
      layout={layout}
      canDragPane={canDragPane}
    />
  );
}

interface CockpitSplitGroupProps {
  node: PaneTreeNode;
  paneById: Map<string, PaneDefinition>;
  layout: CockpitV3Layout;
  canDragPane: (paneId: string) => boolean;
}

function CockpitSplitGroup({
  node,
  paneById,
  layout,
  canDragPane,
}: CockpitSplitGroupProps) {
  const groupRef = useRef<GroupImperativeHandle | null>(null);
  const isRebalancingRef = useRef(false);
  const orientation = node.direction ?? "horizontal";
  const visibleChildren = useMemo(() => {
    // Last-resort guard: react-resizable-panels hard-throws if two panels in a
    // group share an id. A corrupted tree (duplicate ids) must degrade to a
    // dropped panel, never crash the whole cockpit. `sanitizePaneTree` should
    // heal this upstream; this keeps render defensive regardless.
    const seen = new Set<string>();
    const out: PaneTreeNode[] = [];
    for (const child of node.children ?? []) {
      // Deduplicate by ResizablePanel DOM id (`panelKey ?? id`), not node id —
      // a leftover swap `panelKey` can match a sibling's `id` ("plan") and
      // crash with "Panel ids must be unique" even when node ids differ.
      const panelDomId = cockpitPanelDomId(child);
      if (child.hidden || seen.has(panelDomId)) continue;
      seen.add(panelDomId);
      out.push(child);
    }
    return out;
  }, [node.children]);
  const visibleKey = visibleChildren.map((child) => child.id).join(",");
  // Slot-stable panel DOM ids — unchanged across Show-here content swaps.
  const panelKeyFingerprint = visibleChildren
    .map((child) => cockpitPanelDomId(child))
    .join(",");
  // When a pane's `minSizePx` rises (e.g. in-call chat floor on Consult),
  // re-apply layout so react-resizable-panels reclamps against the new mins
  // instead of keeping a Subjective-heavy drag that crushed the chat column.
  const minSizeKey = useMemo(
    () =>
      visibleChildren
        .map(
          (child) =>
            `${cockpitPanelDomId(child)}:${subtreeMinWidthPx(child, paneById)}`,
        )
        .join("|"),
    [visibleChildren, paneById],
  );

  /** Sizes keyed by slot-stable panel DOM id (for react-resizable-panels). */
  const normalizedSizes = useMemo(() => {
    const byNodeId = normalizeChildSizes(visibleChildren);
    const byPanelId: Record<string, number> = {};
    for (const child of visibleChildren) {
      const pct = byNodeId[child.id];
      if (pct === undefined) continue;
      byPanelId[cockpitPanelDomId(child)] = pct;
    }
    return byPanelId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, panelKeyFingerprint, layout.layoutVersion, minSizeKey]);

  useEffect(() => {
    if (visibleChildren.length === 0) return;
    isRebalancingRef.current = true;

    let cancelled = false;
    let rafRelease1: number | null = null;
    let rafRelease2: number | null = null;

    const rafSetLayout = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        groupRef.current?.setLayout(normalizedSizes);
      } catch {
        // Library can briefly disagree with our visible set; next structural change reconverges.
      }
      rafRelease1 = requestAnimationFrame(() => {
        rafRelease2 = requestAnimationFrame(() => {
          if (!cancelled) isRebalancingRef.current = false;
        });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafSetLayout);
      if (rafRelease1 !== null) cancelAnimationFrame(rafRelease1);
      if (rafRelease2 !== null) cancelAnimationFrame(rafRelease2);
      isRebalancingRef.current = false;
    };
  }, [
    normalizedSizes,
    visibleChildren.length,
    visibleKey,
    panelKeyFingerprint,
    layout.layoutVersion,
    minSizeKey,
  ]);

  const handleLayoutChanged = useCallback(
    (sizes: Record<string, number>) => {
      if (isRebalancingRef.current) return;
      const mapped: Record<string, number> = {};
      for (const child of visibleChildren) {
        const pct = sizes[cockpitPanelDomId(child)];
        if (pct === undefined || !Number.isFinite(pct)) continue;
        mapped[child.id] = roundPct(pct);
      }
      if (Object.keys(mapped).length > 0) {
        layout.setGroupSizes(node.id, mapped);
      }
    },
    [layout, node.id, visibleChildren],
  );

  if (visibleChildren.length === 0) return null;

  return (
    <ResizablePanelGroup
      id={node.id}
      groupRef={groupRef}
      orientation={orientation}
      className="h-full w-full min-h-0"
      data-cockpit-group={node.id}
      data-cockpit-orientation={orientation}
      onLayoutChanged={handleLayoutChanged}
    >
      {visibleChildren.map((child, index) => {
        const panelDomId = cockpitPanelDomId(child);
        const sizePct =
          normalizedSizes[panelDomId] ??
          roundPct(100 / Math.max(visibleChildren.length, 1));
        // Honor real minimums (v4 `minSize` accepts px): per-pane `minSizePx`
        // gates a column's width; a uniform comfortable floor gates a stacked
        // row's height. Replaces the old flat 12% that crushed wide panes and
        // let rows shrink to unusable slivers.
        const minSize =
          orientation === "horizontal"
            ? `${subtreeMinWidthPx(child, paneById)}px`
            : `${MIN_COMFORTABLE_ROW_PX}px`;
        return (
          <Fragment key={panelDomId}>
            {/* Orientation-aware handle: full-line grab on BOTH axes. The grip
                (withHandle) is the discoverable affordance; the orientation prop
                fixes horizontal separators that previously collapsed to a 1px
                corner sliver (react-resizable-panels v4 dropped the data attr
                the old styling relied on). Doubles as a gutter drop target:
                dropping a tab on the seam inserts it as a new panel between the
                two children it divides. */}
            {index > 0 ? (
              <CockpitGutterHandle
                parentId={node.id}
                leftChildId={visibleChildren[index - 1]!.id}
                rightChildId={child.id}
                orientation={orientation}
              />
            ) : null}
            <ResizablePanel
              id={panelDomId}
              defaultSize={`${sizePct}%`}
              minSize={minSize}
              // Cross-axis fill + min-h-0/min-w-0 so a panel can shrink below
              // content intrinsic size. Avoid overflow-hidden here — the
              // library's inner wrapper already uses overflow:auto; hiding
              // overflow on stacked rows clipped leaf bodies with no scroll.
              // Gutter padding only on leaf panels — nested split wrappers skip
              // p-1 so column gaps do not double-stack with inner row gaps.
              className={cn(
                "h-full w-full min-h-0 min-w-0",
                isLeafNode(child) && "p-1",
              )}
            >
              <CockpitGroupView
                node={child}
                paneById={paneById}
                layout={layout}
                canDragPane={canDragPane}
              />
            </ResizablePanel>
          </Fragment>
        );
      })}
    </ResizablePanelGroup>
  );
}
