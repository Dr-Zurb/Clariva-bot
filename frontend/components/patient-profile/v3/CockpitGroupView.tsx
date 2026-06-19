"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef } from "react";
import type { GroupImperativeHandle } from "react-resizable-panels";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { PaneDefinition, PaneTreeNode } from "@/lib/patient-profile/v3/foundation";
import { MIN_COMFORTABLE_ROW_PX } from "@/lib/patient-profile/v3/column-cap";
import { cn } from "@/lib/utils";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
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
  const visibleChildren = useMemo(
    () => (node.children ?? []).filter((child) => !child.hidden),
    [node.children],
  );
  const visibleKey = visibleChildren.map((child) => child.id).join(",");

  const normalizedSizes = useMemo(
    () => normalizeChildSizes(visibleChildren),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleKey, layout.layoutVersion],
  );

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
  }, [normalizedSizes, visibleChildren.length, visibleKey, layout.layoutVersion]);

  const handleLayoutChanged = useCallback(
    (sizes: Record<string, number>) => {
      if (isRebalancingRef.current) return;
      const mapped: Record<string, number> = {};
      for (const child of visibleChildren) {
        const pct = sizes[child.id];
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
      className={orientation === "horizontal" ? "h-full" : "w-full"}
      data-cockpit-group={node.id}
      data-cockpit-orientation={orientation}
      onLayoutChanged={handleLayoutChanged}
    >
      {visibleChildren.map((child, index) => {
        const sizePct =
          normalizedSizes[child.id] ??
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
          <Fragment key={child.id}>
            {/* Orientation-aware handle: full-line grab on BOTH axes. The grip
                (withHandle) is the discoverable affordance; the orientation prop
                fixes horizontal separators that previously collapsed to a 1px
                corner sliver (react-resizable-panels v4 dropped the data attr
                the old styling relied on). */}
            {index > 0 ? (
              <ResizableHandle
                withHandle
                orientation={orientation}
                className="bg-transparent hover:bg-border/60 data-[separator=drag]:bg-primary/60 data-[separator=active]:bg-primary/60"
              />
            ) : null}
            <ResizablePanel
              id={child.id}
              defaultSize={`${sizePct}%`}
              minSize={minSize}
              // Cross-axis fill per orientation (h-full for columns, w-full for
              // rows) + min-h-0/min-w-0 so a panel can shrink below its
              // content's intrinsic size on the main axis (matches the legacy
              // shell's `flex h-full min-h-0 min-w-0` panel wrapper).
              // Gutter only on leaf panels — nested split wrappers skip p-1 so
              // horizontal column gaps do not double-stack with inner row gaps.
              className={cn(
                orientation === "horizontal"
                  ? "h-full min-h-0 min-w-0 overflow-hidden"
                  : "w-full min-h-0 min-w-0 overflow-hidden",
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
