"use client";

/**
 * `<PatientProfileShell>` — content-agnostic recursive layout shell.
 *
 * Built for the patient-profile rebuild (May 2026, ppr-03) and extended in
 * cv2-01 (May 2026) to walk a recursive `PaneDefinition` tree. Each node
 * with `children?.length > 0` mounts a nested `<ResizablePanelGroup>` with
 * the alternated orientation (parent horizontal → children vertical →
 * grandchildren horizontal); leaves render their `<PaneHeader>` + `pane.render()`
 * chain as before.
 *
 *   1. The recursive renderer (`renderPaneSubtree` → `<PaneSubtreeGroup>`)
 *      mounts one `<ResizablePanelGroup>` per group, each with its OWN
 *      `groupRef`, `containerRef`, `sizeSnapshot`, rebalance gate, and
 *      cascade handles. Sibling groups are independent — a drag on the
 *      outer-horizontal columns does NOT bleed into an inner-vertical
 *      sub-group, and vice versa.
 *
 *   2. A single top-level `<DndContext>` wraps the whole tree. Header
 *      drag-grips reorder *within their own group* (the consumer-supplied
 *      `reorderPane` is leaf-aware via the flat `paneTreeToFlat` adapter
 *      below). Cross-group reorder is out of scope for cv2-01.
 *
 *   3. Below `lg` (≤1023px) the entire panel-group / DndContext chain is
 *      skipped — the tree is flattened to leaves and stacked vertically
 *      with no resize/reorder affordances. We do NOT recurse on mobile.
 *
 * Persistence is owned by `useShellLayout` (ppr-02), which is still keyed
 * on the FLAT shape `{paneOrder: leaf-ids, paneState: per-leaf}`. The
 * recursive renderer descends into `panes` directly; the flat shape is
 * derived once via `paneTreeToFlat()` (cv2-01) so the hook keeps working
 * unchanged. cv2-02 retires the adapter.
 *
 * DL-2 enforcement: the ESLint zone in `frontend/.eslintrc.json` blocks
 * imports from `@/components/consultation/**`, `@/components/ehr/**`,
 * `@/lib/consultation/**`, and `@/types/appointment` from this file. cv2-01
 * adds a second rule: `<ResizablePanelGroup>` is forbidden outside this
 * file so downstream surfaces can't bypass the shell to add ad-hoc nested
 * splits — defeating the whole point of having a content-agnostic primitive.
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ArrowUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  GroupImperativeHandle,
  Layout as PanelGroupLayout,
  PanelSize,
} from "react-resizable-panels";
import {
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { CascadeHandle } from "@/components/patient-profile/CascadeHandle";
import SharedPaneHeader from "@/components/patient-profile/PaneHeader";
import PaneContextMenu, {
  type PaneContextMenuMoveOption,
} from "@/components/patient-profile/PaneContextMenu";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { layoutUxToast } from "@/lib/patient-profile/layout-ux-toast";
import {
  layoutNodeToPaneTree,
  paneTreeToLayoutNode,
} from "@/lib/patient-profile/layout-node-bridge";
import {
  hideLeaf,
  mergeWithSibling,
  restoreLeaf,
  splitLeaf,
  toggleCollapsed,
  type DropZone,
} from "@/lib/patient-profile/layout-tree-mutations";
import PaneDropOverlay from "@/components/patient-profile/PaneDropOverlay";
import {
  CustomizeModeContext,
  useCustomizeMode,
} from "@/components/patient-profile/customize-mode-context";
import PaneTabStrip from "@/components/patient-profile/PaneTabStrip";
import { findPaneTreeLeafMetadata } from "@/lib/patient-profile/find-pane-tree-leaf-metadata";
import {
  paneTreeHasSibling,
  paneTreeToFlat,
  type PaneTreeNode,
} from "@/lib/patient-profile/layout-tree";
import { trackCockpitV2RLayoutUxTreeMutation } from "@/lib/patient-profile/telemetry";
import { defaultLayout, useShellLayout } from "@/lib/patient-profile/useShellLayout";
import {
  flattenPaneDefinitions,
  allPaneLeavesHidden,
  type LayoutNode,
  type PaneDefinition,
  type PaneRuntimeState,
  type PatientProfileLayout,
} from "@/lib/patient-profile/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface PatientProfileShellProps {
  /** Pane tree in the user's preferred order. Leaves render via `pane.render()`; non-leaves nest via `pane.children`. */
  panes: PaneDefinition[];
  /** localStorage key for persisting this shell's layout. */
  storageKey: string;
  /** Prior storage keys to read when the primary namespace is empty (csf-04). */
  legacyStorageKeys?: string[];
  /** Optional className for the outer wrapper. */
  className?: string;
  /**
   * Optional callback fired whenever the shell's flat (leaf) pane order or
   * visibility state changes. Used by ppr-10 (`useShellHotkeys`) in
   * `<PatientProfilePage>` to keep a reactive copy of layout state for
   * slot-positional hotkey dispatch. Intentionally NOT fired on size-only
   * changes (resize drags) — the hook only needs order + hidden.
   */
  onLayoutChange?: (
    paneOrder: string[],
    paneState: Record<string, PaneRuntimeState>,
  ) => void;
  /** Fired when the structural layout tree changes (presets, splits, hide, …). */
  onLayoutTreeChange?: (tree: LayoutNode) => void;
  /** cpf-05 — context-menu "Move pane to…" targets and handler (live-consult guard in page). */
  paneMoveUx?: {
    getMoveTargets: (contextPaneId: string) => PaneContextMenuMoveOption[];
    onMovePane: (
      contextPaneId: string,
      target: PaneContextMenuMoveOption,
    ) => void;
    getMoveDisabled: (
      contextPaneId: string,
    ) => { reason: string } | undefined;
    /** cpfd-03 — commit a 5-zone drag-drop. */
    onDropPaneOnZone: (
      sourcePaneId: string,
      targetGroupId: string,
      zone: DropZone,
    ) => void;
    /** cpfd-03 — false → disable ALL zones on `targetGroupId` for the active source. */
    canDropSource?: (
      sourcePaneId: string | null,
      targetGroupId: string,
    ) => boolean;
    /** cpfd-03 — false → hide the center zone (tab-into would be a no-op). */
    canTabInto?: (
      sourcePaneId: string | null,
      targetGroupId: string,
    ) => boolean;
  };
  /** cpfc-01 — when false, Phase 2 drag affordances (grip, tabs, overlay) are disabled. */
  customizeMode?: boolean;
  /** cpfg-01: shell-level top dock (drug-safety strip). Desktop only. */
  safetyDock?: React.ReactNode;
  /** cpfg-01: shell-level bottom dock (Rx finish footer). Desktop only. */
  actionDock?: React.ReactNode;
}

/**
 * Imperative handle exposed to `<PatientProfilePage>` via a forwarded ref.
 * Used by the one-time legacy seed effect (ppr-08) to apply a translated
 * layout into the shell's in-memory hook state after mount.
 *
 * ppr-10 extends the handle to expose the live layout state so
 * `useShellHotkeys` can read fresh `paneOrder` and `paneState` at
 * key-press time (via `shellRef.current`) without needing PatientProfilePage
 * to track a separate copy via state.
 */
export interface PatientProfileShellHandle {
  applyLayout: (layout: PatientProfileLayout) => void;
  /** Apply an R-LAYOUT-UX layout tree (clpm-05). */
  applyLayoutTree: (tree: LayoutNode) => void;
  /** Read the live layout tree for preset save / hidden-pane diff. */
  getLayoutTree: () => LayoutNode;
  /** Read the persisted v5 pane tree (tab containers, paneIds). */
  getPaneTree: () => PaneTreeNode;
  /** Live flat (leaf) pane order — reflects the latest drag-to-reorder. */
  paneOrder: string[];
  /** Live per-pane runtime state — reflects the latest visibility toggle. */
  paneState: Record<string, PaneRuntimeState>;
  /** Forwarded from useShellLayout — stable across renders. */
  setPaneHidden: (id: string, hidden: boolean) => void;
  /** Forwarded from useShellLayout — stable across renders. */
  reorderPane: (fromId: string, toId: string) => void;
  /** Reset pane visibility + sizes to template defaults. */
  resetLayout: () => void;
  /** Batch-toggle hidden on multiple leaves (column toggle). */
  setLeafIdsHidden: (leafIds: string[], hidden: boolean) => void;
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

/** cpfd-03 — extract zone-drop payload from a dnd-kit drag-end event. */
export function routePaneDropFromDragEnd(
  event: DragEndEvent,
): { sourcePaneId: string; groupId: string; zone: DropZone } | null {
  const sourcePaneId = event.active.data.current?.paneId as string | undefined;
  const over = event.over?.data.current as
    | { groupId: string; zone: DropZone }
    | undefined;
  if (!sourcePaneId || !over?.groupId || !over.zone) return null;
  return { sourcePaneId, groupId: over.groupId, zone: over.zone };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default `minSizePct` when a pane omits its own. Mirrors the cockpit's
 * `MIN_SIZE_BY_TYPE.body / 2` rule of thumb — 12% on a 1024px viewport
 * is ~123px, enough to host any reasonable column header without clipping.
 */
const DEFAULT_MIN_SIZE_PCT = 12;

/** Default `naturalSizePct` for panes that omit their own (= 33%). */
const DEFAULT_NATURAL_SIZE_PCT = 33;

/**
 * Default pixel floor used when a pane omits `minSizePx`. Sized for a Cursor-
 * like minimum that keeps headers and primary content readable. The shell
 * combines this with `minSizePct` at render time by taking `max(minSizePct,
 * minSizePxAsPercent)` so the panel-group library always honours both floors.
 */
const DEFAULT_MIN_SIZE_PX = 240;

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Filter a node order down to nodes the toggle bar has marked visible.
 * Hidden nodes are removed from the layout entirely (no strip, no slot).
 * Non-leaf nodes are never present in the flat `paneState`, so they fall
 * through as `undefined` → falsy → visible by default.
 */
export function getVisiblePaneOrder(
  paneOrder: string[],
  paneState: Record<string, PaneRuntimeState>,
): string[] {
  return paneOrder.filter((id) => !paneState[id]?.hidden);
}

/**
 * Walk a pane tree and collect every leaf (left-to-right, depth-first).
 * Used by the mobile branch which renders leaves stacked vertically and
 * does NOT recurse into nested groups.
 */
function flattenLeaves(nodes: PaneDefinition[]): PaneDefinition[] {
  const out: PaneDefinition[] = [];
  for (const n of nodes) {
    if (n.children && n.children.length > 0) {
      out.push(...flattenLeaves(n.children));
    } else {
      out.push(n);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inline column header — content-agnostic, no medical concepts. The
// header rendered inside each `<ResizablePanel>` (leaves and depth-0
// non-leaves only — see `PaneSubtreeGroup` below for the suppression rule).
// ---------------------------------------------------------------------------

interface ShellPaneHeaderProps {
  paneId: string;
  title: string;
  dragDisabled?: boolean;
}

function ShellPaneHeader({
  paneId,
  title,
  dragDisabled = false,
}: ShellPaneHeaderProps) {
  const customizeMode = useCustomizeMode();
  const draggableId = `pane-drag-${paneId}`;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } =
    useDraggable({
      id: draggableId,
      data: { paneId },
      disabled: !customizeMode || dragDisabled,
    });
  const showGrip = customizeMode && !dragDisabled;
  return (
    <SharedPaneHeader
      paneId={paneId}
      title={title}
      className={cn(isDragging && "opacity-40")}
      dragHandle={
        showGrip ? (
          <button
            ref={setDragRef}
            type="button"
            aria-label={`Drag to reorder ${title}`}
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground",
              "cursor-grab active:cursor-grabbing hover:bg-muted hover:text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            )}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Mobile branch — DL-11. Stacks panes vertically with no resize /
// reorder affordances. Skips the entire `<ResizablePanelGroup>` and
// `<DndContext>` runtime so we don't ship ~3KB of dead code on small
// viewports. cv2-01: flattens the tree to leaves first; mobile does
// NOT recurse into nested groups.
// ---------------------------------------------------------------------------

function MobileShell({
  panes,
  className,
}: {
  panes: PaneDefinition[];
  className?: string;
}) {
  const leaves = useMemo(() => flattenLeaves(panes), [panes]);
  return (
    <div
      data-testid="patient-profile-shell-mobile"
      className={cn("flex h-full w-full flex-col", className)}
    >
      {leaves.map((pane) => (
        <section
          key={pane.id}
          data-pane-id={pane.id}
          data-cockpit-pane-id={pane.id}
          aria-label={pane.title}
          className="flex shrink-0 flex-col"
        >
          {pane.render()}
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default forwardRef<PatientProfileShellHandle, PatientProfileShellProps>(
function PatientProfileShell({
  panes,
  storageKey,
  legacyStorageKeys,
  className,
  onLayoutChange,
  onLayoutTreeChange,
  paneMoveUx,
  customizeMode,
  safetyDock,
  actionDock,
}: PatientProfileShellProps, ref): JSX.Element {
  // ── PaneDefinition index (cv2-01) ───────────────────────────────────────────
  // `useShellLayout` persists a v4 `paneTree`; the renderer still descends
  // the authored `panes` tree. `flattenPaneDefinitions` supplies leaf order
  // for the default seed and a global id → node map for recursion.
  const { paneOrder: flatPaneOrder, paneById } = useMemo(
    () => flattenPaneDefinitions(panes),
    [panes],
  );
  // Leaf-only PaneDefinition[] for the default-layout seed. The hook
  // initialises one paneState entry per leaf with each leaf's
  // naturalSizePct (or 33).
  const leafPanes = useMemo(
    () => flatPaneOrder.map((id) => paneById[id]).filter(Boolean),
    [flatPaneOrder, paneById],
  );
  // Memoised on shape (not reference identity) so a fresh `panes` array
  // from the parent doesn't reseed the hook on every render.
  const panesShapeKey = leafPanes
    .map((p) => `${p.id}:${p.naturalSizePct ?? DEFAULT_NATURAL_SIZE_PCT}`)
    .join("|");
  const defaultFlat = useMemo(() => {
    const seed = defaultLayout(leafPanes, storageKey);
    return paneTreeToFlat(seed.paneTree);
  }, [leafPanes, storageKey, panesShapeKey]);

  const {
    paneOrder,
    paneState,
    paneTree,
    reorderPane,
    setPaneHidden,
    setLeafSize,
    applyLayout,
    resetLayout,
    setLeafIdsHidden,
    layoutVersion,
    hydrated,
    setActiveTab,
  } = useShellLayout({
    storageKey,
    legacyStorageKeys,
    defaultPaneOrder: defaultFlat.paneOrder,
    defaultPaneState: defaultFlat.paneState,
    // csl-03 (2026-05-26): pass the current template's leaf ids so the
    // hydration step can discard persisted layouts whose ids no longer
    // exist (e.g. legacy v1 cockpit users whose Chrome localStorage still
    // holds `chart` / `body` / `rx`).
    knownLeafIds: defaultFlat.paneOrder,
  });

  const applyLayoutTree = useCallback(
    (tree: LayoutNode) => {
      applyLayout({
        version: 5,
        paneTree: layoutNodeToPaneTree(tree),
      });
    },
    [applyLayout],
  );

  const getLayoutTree = useCallback(
    () => paneTreeToLayoutNode(paneTree),
    [paneTree],
  );

  useImperativeHandle(
    ref,
    () => ({
      applyLayout,
      applyLayoutTree,
      getLayoutTree,
      getPaneTree: () => paneTree,
      paneOrder,
      paneState,
      setPaneHidden,
      reorderPane,
      resetLayout,
      setLeafIdsHidden,
    }),
    [
      applyLayout,
      applyLayoutTree,
      getLayoutTree,
      paneTree,
      paneOrder,
      paneState,
      setPaneHidden,
      reorderPane,
      resetLayout,
      setLeafIdsHidden,
    ],
  );

  // Notify the parent when pane order or visibility state changes (not on
  // size-only resize-drag updates).
  const hiddenKey = paneOrder
    .map((id) => `${id}:${paneState[id]?.hidden ?? false}`)
    .join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    onLayoutChange?.(paneOrder, paneState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenKey, onLayoutChange]);

  useEffect(() => {
    onLayoutTreeChange?.(paneTreeToLayoutNode(paneTree));
  }, [paneTree, layoutVersion, onLayoutTreeChange]);

  // The lg breakpoint matches Tailwind's `lg:` utility (1024px). Default to
  // TRUE so the SSR markup matches the desktop branch — matching historical
  // behaviour of the cockpit shell.
  const isLg = useMediaQuery("(min-width: 1024px)", true);

  let shellBody: JSX.Element;
  if (!isLg) {
    shellBody = <MobileShell panes={panes} className={className} />;
  } else if (!hydrated) {
    // Gate the panel-group render on `hydrated` so the server markup
    // (defaults) and the first client render (defaults) match. After the
    // hydration effect in `useShellLayout` reads localStorage, this flips
    // to true and the actual shell with persisted sizes mounts. A neutral
    // placeholder fills the box to avoid a layout-shift flash.
    shellBody = (
      <div
        data-testid="patient-profile-shell-hydrating"
        className={cn("h-full w-full bg-background", className)}
        aria-hidden
      />
    );
  } else {
    shellBody = (
      <DesktopShell
        panes={panes}
        paneById={paneById}
        paneOrder={paneOrder}
        paneState={paneState}
        setLeafSize={setLeafSize}
        paneTree={paneTree}
        storageKey={storageKey}
        className={className}
        layoutVersion={layoutVersion}
        applyLayoutTree={applyLayoutTree}
        resetLayout={resetLayout}
        paneMoveUx={paneMoveUx}
        setActiveTab={setActiveTab}
        customizeMode={customizeMode ?? false}
        safetyDock={safetyDock}
        actionDock={actionDock}
      />
    );
  }

  return shellBody;
});

// ---------------------------------------------------------------------------
// Desktop shell — DndContext wrapper around the recursive root
// `<PaneSubtreeGroup>`. The DnD context lives at the OUTERMOST level so a
// drag started in any group's header is captured by the same context;
// reorder behaviour is bounded by the consumer's `reorderPane` (which
// walks the flat pane order) — cross-group reorders fall through as
// no-ops in cv2-01 (Phase 3 UX feature per the plan's out-of-scope list).
// ---------------------------------------------------------------------------

interface PaneLayoutActions {
  onSplitHorizontal: (paneId: string) => void;
  onSplitVertical: (paneId: string) => void;
  onMerge: (paneId: string) => void;
  onToggleCollapsed: (paneId: string) => void;
  onHide: (paneId: string) => void;
  /**
   * Switch the active tab in the tabs container identified by `groupId`
   * (cpf-04). Pure metadata update — does NOT bump `layoutVersion`.
   */
  onActivateTab: (groupId: string, paneId: string) => void;
}

interface DesktopShellProps {
  panes: PaneDefinition[];
  paneById: Record<string, PaneDefinition>;
  paneOrder: string[];
  paneState: Record<string, PaneRuntimeState>;
  paneTree: PaneTreeNode;
  setLeafSize: (id: string, sizePct: number) => void;
  storageKey: string;
  className?: string;
  layoutVersion: number;
  applyLayoutTree: (tree: LayoutNode) => void;
  resetLayout: () => void;
  paneMoveUx?: PatientProfileShellProps["paneMoveUx"];
  setActiveTab: (groupId: string, paneId: string) => void;
  customizeMode: boolean;
  safetyDock?: React.ReactNode;
  actionDock?: React.ReactNode;
}

function DesktopShell({
  panes,
  paneById,
  paneOrder,
  paneState,
  setLeafSize,
  paneTree,
  storageKey,
  className,
  layoutVersion,
  applyLayoutTree,
  resetLayout,
  paneMoveUx,
  setActiveTab,
  customizeMode,
  safetyDock,
  actionDock,
}: DesktopShellProps) {
  const [activeDragPaneId, setActiveDragPaneId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const paneId = event.active.data.current?.paneId as string | undefined;
    setActiveDragPaneId(paneId ?? null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragPaneId(null);
      const routed = routePaneDropFromDragEnd(event);
      if (!routed) return;
      paneMoveUx?.onDropPaneOnZone?.(
        routed.sourcePaneId,
        routed.groupId,
        routed.zone,
      );
    },
    [paneMoveUx],
  );

  const layoutActions = useMemo<PaneLayoutActions>(() => {
    const mutate = (
      op: string,
      paneId: string,
      run: (tree: LayoutNode) => { ok: true; tree: LayoutNode } | { ok: false; reason: string },
    ) => {
      const current = paneTreeToLayoutNode(paneTree);
      const result = run(current);
      if (!result.ok) {
        if (result.reason === "cap-reached") {
          layoutUxToast.error(
            "Layout limit reached (10 sub-panes max). Merge or hide a pane to add more.",
          );
        }
        return;
      }
      applyLayoutTree(result.tree);
      trackCockpitV2RLayoutUxTreeMutation({ op, paneId });
    };

    return {
      onSplitHorizontal: (paneId) => {
        mutate("split-horizontal", paneId, (tree) =>
          splitLeaf(tree, paneId, "horizontal", `custom-${crypto.randomUUID()}`),
        );
      },
      onSplitVertical: (paneId) => {
        mutate("split-vertical", paneId, (tree) =>
          splitLeaf(tree, paneId, "vertical", `custom-${crypto.randomUUID()}`),
        );
      },
      onMerge: (paneId) => {
        mutate("merge", paneId, (tree) => mergeWithSibling(tree, paneId));
      },
      onToggleCollapsed: (paneId) => {
        const current = paneTreeToLayoutNode(paneTree);
        applyLayoutTree(toggleCollapsed(current, paneId));
        trackCockpitV2RLayoutUxTreeMutation({ op: "toggle-collapsed", paneId });
      },
      onHide: (paneId) => {
        mutate("hide", paneId, (tree) => hideLeaf(tree, paneId));
      },
      onActivateTab: (groupId, paneId) => {
        setActiveTab(groupId, paneId);
      },
    };
  }, [paneTree, applyLayoutTree, setActiveTab]);

  // Empty-state — the toggle-bar removed every visible LEAF from the tree.
  // We reach this when no leaf in the entire tree is visible (rare; happens
  // in walk-in mode if every available leaf is toggled off).
  const visibleLeafCount = useMemo(() => {
    let count = 0;
    function walk(nodes: PaneDefinition[]) {
      for (const n of nodes) {
        if (n.children && n.children.length > 0) walk(n.children);
        else if (paneOrder.includes(n.id) && !paneState[n.id]?.hidden) {
          count += 1;
        }
      }
    }
    walk(panes);
    return count;
  }, [panes, paneState, paneOrder]);

  if (visibleLeafCount === 0) {
    return (
      <div
        data-testid="patient-profile-shell-empty"
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-4 bg-muted/20 px-8 text-center",
          className,
        )}
      >
        <ArrowUp
          className="h-10 w-10 animate-bounce text-primary/70"
          aria-hidden
        />
        <div>
          <p className="text-base font-medium text-foreground">
            Nothing to show
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a panel from the layout bar above to start working.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={resetLayout}>
          Restore default layout
        </Button>
      </div>
    );
  }

  return (
    <CustomizeModeContext.Provider value={customizeMode}>
      <div
        data-testid="patient-profile-shell-desktop"
        className={cn("flex h-full w-full flex-col", className)}
      >
        {safetyDock ? <div className="shrink-0">{safetyDock}</div> : null}
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="min-h-0 flex-1">
            {renderPaneSubtree({
              nodes: panes,
              paneById,
              paneOrder,
              paneState,
              setLeafSize,
              orientation: "horizontal",
              groupId: storageKey,
              layoutVersion,
              depth: 0,
              paneTree,
              layoutActions,
              paneMoveUx,
              activeDragPaneId,
            })}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDragPaneId && paneById[activeDragPaneId] ? (
              <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium shadow-md">
                {paneById[activeDragPaneId].icon
                  ? React.createElement(paneById[activeDragPaneId].icon!, {
                      className: "h-3.5 w-3.5",
                      "aria-hidden": true,
                    })
                  : null}
                <span>{paneById[activeDragPaneId].title}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        {actionDock ? <div className="shrink-0">{actionDock}</div> : null}
      </div>
    </CustomizeModeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Recursive renderer (cv2-01)
// ---------------------------------------------------------------------------

interface RenderPaneSubtreeArgs {
  /** Children of THIS group. */
  nodes: PaneDefinition[];
  /** Global id → node map (covers leaves AND non-leaves). */
  paneById: Record<string, PaneDefinition>;
  /** Flat per-leaf runtime state. Non-leaves fall through as undefined → visible. */
  paneState: Record<string, PaneRuntimeState>;
  /** Leaf ids currently in the persisted layout tree (for column collapse). */
  paneOrder: string[];
  /** Persists a leaf's absolute sizePct via the v4 layout tree. */
  setLeafSize: (id: string, sizePct: number) => void;
  /** This group's orientation. */
  orientation: "horizontal" | "vertical";
  /** Unique per group, e.g. `${storageKey}` or `${storageKey}.${parentId}`. */
  groupId: string;
  /** Bumped on STRUCTURAL changes — used to refresh size snapshots and the rebalance gate. */
  layoutVersion: number;
  /** 0 = root, 1 = nested, 2 = grandchild, … */
  depth: number;
  /** Full persisted tree — used for merge eligibility (clpm-03). */
  paneTree: PaneTreeNode;
  /** Stub layout mutations until clpm-04 wires the tree engine. */
  layoutActions: PaneLayoutActions;
  paneMoveUx?: PatientProfileShellProps["paneMoveUx"];
  /** cpfd-03 — pane id currently being dragged (null at rest). */
  activeDragPaneId: string | null;
}

/**
 * The single recursive primitive — mounts one `<ResizablePanelGroup>` and
 * one `<PaneSubtreeGroup>` instance per group. Implemented as a thin
 * wrapper around `<PaneSubtreeGroup>` so the per-group hooks (refs,
 * effects, memos) are rules-of-hooks compliant — each group instance
 * gets its own hook slots without juggling a global `Map<groupId, ref>`
 * inside a `useMemo`.
 */
function renderPaneSubtree(args: RenderPaneSubtreeArgs): React.ReactNode {
  return <PaneSubtreeGroup key={args.groupId} {...args} />;
}

// ---------------------------------------------------------------------------
// `<PaneSubtreeGroup>` — one instance per group in the recursive tree
// ---------------------------------------------------------------------------

function PaneSubtreeGroup({
  nodes,
  paneById,
  paneOrder,
  paneState,
  setLeafSize,
  orientation,
  groupId,
  layoutVersion,
  depth,
  paneTree,
  layoutActions,
  paneMoveUx,
  activeDragPaneId,
}: RenderPaneSubtreeArgs) {
  const customizeMode = useCustomizeMode();

  // ── Per-group refs ────────────────────────────────────────────────────────
  // Each group has its OWN imperative handle, container, rebalance gate,
  // and absolute-sum capture. Generalising these from the previous
  // singular-ref design (ppr-03) is the structural change that makes
  // nested resizable groups safe — a rebalance on the inner group cannot
  // poison the outer group's persisted sizes, and an outer drag's
  // onResize cluster cannot be misattributed to an inner group's gate.
  const groupRef = useRef<GroupImperativeHandle | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isRebalancingRef = useRef(false);
  // Captured at the moment of the last system push: sum of absolute sizePcts
  // across the *visible* nodes IN THIS GROUP. Used by `handleResize` to
  // translate the library's viewport-relative percentage back to an absolute
  // one before persisting. Conserved during pure user drags (the user can
  // only redistribute share among visible siblings; their absolute total
  // stays fixed), so it's safe to capture once per layout-version and
  // reuse for every onResize until the next structural change.
  const visibleAbsoluteSumRef = useRef(100);

  // Container size in px (width for horizontal groups, height for vertical
  // groups), measured via ResizeObserver. Drives the pixel → percentage
  // conversion for `pane.minSizePx` and the cascade-handle drag delta.
  const [containerSizePx, setContainerSizePx] = useState(1024);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const dim = orientation === "horizontal" ? rect.width : rect.height;
      if (Number.isFinite(dim) && dim > 0) setContainerSizePx(dim);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [orientation]);

  // ── Visible siblings IN THIS GROUP ────────────────────────────────────────
  // Filter out hidden leaves; non-leaves are never "hidden" in cv2-01 (their
  // ids don't appear in the flat paneState). The result is local to this
  // group — sibling groups have their own visible orders.
  const visibleNodes = useMemo(
    () =>
      nodes.filter(
        (n) => !allPaneLeavesHidden(n, paneState, paneOrder),
      ),
    [nodes, paneState, paneOrder],
  );
  const visibleOrder = useMemo(
    () => visibleNodes.map((n) => n.id),
    [visibleNodes],
  );
  const visibleKey = visibleOrder.join(",");

  // ── Combined per-pane minimums (viewport %) — local to this group ────────
  // Both the library's `<ResizablePanel minSize>` prop AND the cascade
  // handle read this map, so their constraint boundaries always agree.
  // For nested vertical groups, `containerSizePx` is the GROUP's height
  // (not the shell's width), so `minSizePx` floors are relative to the
  // group's available space — which is exactly what users expect.
  const minByPaneId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const node of visibleNodes) {
      const minPctFloor = node.minSizePct ?? DEFAULT_MIN_SIZE_PCT;
      const minPxFloor = node.minSizePx ?? DEFAULT_MIN_SIZE_PX;
      const minPxAsPct =
        containerSizePx > 0
          ? (minPxFloor / containerSizePx) * 100
          : minPctFloor;
      map[node.id] = Math.max(4, Math.max(minPctFloor, minPxAsPct));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, containerSizePx]);

  // ── Structural size snapshot — local to this group ───────────────────────
  // Refreshed only on structural changes (`layoutVersion` bump). Drives
  // every `<ResizablePanel defaultSize>` prop in this group, so the
  // library's per-Panel `useLayoutEffect` deps don't change during a
  // user drag — the Panel doesn't re-register, the Group keeps its
  // identity in the library's `mountedGroups` Map, and pointermoves
  // stay valid until pointerup. See the long comment in the previous
  // generation of this file (ppr-11 follow-up) for the full mechanism.
  const sizeSnapshot = useMemo(() => {
    const snap: Record<string, number> = {};
    for (const node of nodes) {
      snap[node.id] =
        paneState[node.id]?.sizePct ??
        node.naturalSizePct ??
        DEFAULT_NATURAL_SIZE_PCT;
    }
    return snap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutVersion, nodes]);

  // ── Per-group rebalance effect ────────────────────────────────────────────
  // When a STRUCTURAL change occurs in THIS group (visibility flip,
  // reorder of leaves whose ids are siblings here, or applyLayout
  // bump), push a fresh layout to *this group's* panel-group:
  //   1. Read each visible sibling's absolute sizePct (paneState or natural).
  //   2. Normalise across visible siblings so they sum to 100% of THIS
  //      group's viewport (the library's only currency).
  //   3. Capture the absolute sum so this group's `handleResize` can
  //      translate back.
  //   4. Engage `isRebalancingRef` across the settle window so the
  //      library's onResize cluster (synchronous + microtask-deferred)
  //      never pollutes persisted sizes.
  //
  // The two-rAF release window must be preserved per-group. cv2-01
  // verified the deferred-callback semantics still hold in v4 of
  // `react-resizable-panels`; collapsing to a single rAF for "simplicity"
  // re-introduces the "first drag moves a millimetre and stops" bug.
  useEffect(() => {
    if (visibleOrder.length === 0) return;
    const targets: PanelGroupLayout = {};
    let sum = 0;
    for (const id of visibleOrder) {
      const sizePct =
        paneState[id]?.sizePct ??
        paneById[id]?.naturalSizePct ??
        DEFAULT_NATURAL_SIZE_PCT;
      targets[id] = sizePct;
      sum += sizePct;
    }
    visibleAbsoluteSumRef.current = sum > 0 ? sum : 100;
    if (sum > 0) {
      for (const id of visibleOrder) targets[id] = (targets[id] / sum) * 100;
    }

    // Engage the gate up-front so any onResize callbacks that fire BEFORE
    // our deferred `setLayout` lands (e.g. from the library's own
    // auto-normalisation after a panel unmount) are also discarded.
    isRebalancingRef.current = true;

    let cancelled = false;
    let rafRelease1: number | null = null;
    let rafRelease2: number | null = null;

    const rafSetLayout = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        groupRef.current?.setLayout(targets);
      } catch (err) {
        // Library can throw if its registry briefly disagrees with our
        // view of `visibleOrder` (e.g. a fast double-toggle). Logging
        // for diagnostics; the next structural change will re-converge.
        if (typeof console !== "undefined") {
          console.warn(
            `[PatientProfileShell] setLayout failed for group "${groupId}"; will retry on next structural change.`,
            err,
          );
        }
      }
      // Release the gate two frames after `setLayout` so deferred onResize
      // callbacks from the library are still skipped.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, layoutVersion, groupId]);

  // ── Per-group leaf resize persistence ─────────────────────────────────────
  // Library reports each panel's viewport-relative pct (sums to 100 within
  // this group). We translate back to an absolute pct using THIS group's
  // captured visible-absolute-sum, then persist via `setLeafSize`.
  const handleResize = useCallback(
    (paneId: string, isLeaf: boolean, size: PanelSize) => {
      if (isRebalancingRef.current) return;
      if (!isLeaf) return;
      const viewportPct = size.asPercentage;
      if (!Number.isFinite(viewportPct)) return;
      const absolutePct = (viewportPct / 100) * visibleAbsoluteSumRef.current;
      setLeafSize(paneId, absolutePct);
    },
    [setLeafSize],
  );

  // Default for child groups is the alternated orientation; nodes can
  // override per-instance via `pane.direction`.
  const childDefaultOrientation =
    orientation === "horizontal" ? "vertical" : "horizontal";

  // Hidden-only or empty group → render nothing. The parent panel is
  // still mounted (ResizablePanel wrapper above) so the parent group's
  // rebalance keeps the absolute sums coherent.
  if (visibleOrder.length === 0) return null;

  return (
    <div
      ref={containerRef}
      data-shell-group-id={groupId}
      data-shell-group-depth={depth}
      data-shell-group-orientation={orientation}
      className={cn(
        "flex h-full w-full min-h-0 min-w-0",
        orientation === "horizontal" ? "flex-row" : "flex-col",
      )}
    >
      <ResizablePanelGroup
        id={groupId}
        groupRef={groupRef}
        orientation={orientation}
        className={orientation === "horizontal" ? "h-full" : "w-full"}
      >
        {visibleNodes.flatMap((node, i) => {
          const isLeaf = !node.children || node.children.length === 0;
          // `defaultSize` is read from the STRUCTURAL snapshot — NOT from
          // `paneState[id].sizePct` directly. The snapshot is referentially
          // stable across a drag (refreshes only on `layoutVersion`), so
          // the Panel never re-registers mid-drag. See the long comment
          // near `sizeSnapshot` for the full mechanism.
          //
          // Format pitfall: numeric `defaultSize` is interpreted as PIXELS
          // by `react-resizable-panels` v4 (`bt(...)` in the library
          // source). Pass as a `%`-suffixed string so the library treats
          // it as a percentage, matching our state's semantics. Same for
          // `minSize` (numeric is pixels).
          const sizePct =
            sizeSnapshot[node.id] ??
            node.naturalSizePct ??
            DEFAULT_NATURAL_SIZE_PCT;
          const defaultSizeProp = `${sizePct}%`;
          const minSize = minByPaneId[node.id] ?? DEFAULT_MIN_SIZE_PCT;
          const minSizeProp = `${minSize}%`;
          // Header rule (cv2-01):
          //   • Leaves always get a header (drag-grip + title).
          //   • Non-leaves at depth 0 get a header so top-level columns
          //     remain drag-reorderable (the leaves below carry their own
          //     headers; the top-level wrap is the only handle a user can
          //     grab to reorder a whole column).
          //   • Non-leaves at depth > 0 are header-less (the inner leaves
          //     carry their own headers; an extra wrap-header would be
          //     visually redundant).
          // cpf-04: when the persisted leaf carries multiple paneIds we render
          // a tab strip instead of the standard per-pane header — one tab per
          // paneId; only the active tab's body mounts.
          const tabsMeta = isLeaf
            ? findPaneTreeLeafMetadata(paneTree, node.id)
            : null;
          const isMultiPaneLeaf =
            !!tabsMeta && tabsMeta.paneIds.length > 1;
          const showHeader =
            (isLeaf || depth === 0) &&
            !node.hideShellHeader &&
            !isMultiPaneLeaf;
          const items: React.ReactNode[] = [];
          if (i > 0) {
            // Keying handles by the pair of pane ids they separate keeps
            // their identity stable across reorders — preventing the
            // library from briefly losing pointer capture on the next
            // separator after a swap. We also include `groupId` so two
            // different groups containing identically-named adjacent
            // panes (rare, but possible in deeply nested trees) don't
            // collide on their cascade-handle keys.
            const prevId = visibleOrder[i - 1];
            const prevTitle = paneById[prevId]?.title ?? prevId;
            items.push(
              <CascadeHandle
                key={`shell-handle-${groupId}-${prevId}-${node.id}`}
                groupRef={groupRef}
                containerRef={containerRef}
                visiblePaneOrder={visibleOrder}
                minByPaneId={minByPaneId}
                handleIndex={i - 1}
                prevPaneTitle={prevTitle}
                nextPaneTitle={node.title}
                orientation={orientation}
                withHandle
              />,
            );
          }
          items.push(
            <ResizablePanel
              key={`shell-pane-${node.id}`}
              id={node.id}
              defaultSize={defaultSizeProp}
              minSize={minSizeProp}
              onResize={(size) => handleResize(node.id, isLeaf, size)}
              className={cn(
                "overflow-hidden bg-background",
                orientation === "horizontal" ? "h-full" : "w-full",
              )}
              data-pane-id={node.id}
            >
              <div className="flex h-full min-h-0 min-w-0 flex-col">
                {showHeader ? (
                  <PaneContextMenu
                    paneId={node.id}
                    isCollapsed={false}
                    canMerge={paneTreeHasSibling(paneTree, node.id)}
                    onSplitHorizontal={() =>
                      layoutActions.onSplitHorizontal(node.id)
                    }
                    onSplitVertical={() =>
                      layoutActions.onSplitVertical(node.id)
                    }
                    onMerge={() => layoutActions.onMerge(node.id)}
                    onToggleCollapsed={() =>
                      layoutActions.onToggleCollapsed(node.id)
                    }
                    onHide={() => layoutActions.onHide(node.id)}
                    moveTargets={paneMoveUx?.getMoveTargets(node.id)}
                    onMove={
                      paneMoveUx
                        ? (target) => paneMoveUx.onMovePane(node.id, target)
                        : undefined
                    }
                    moveDisabled={paneMoveUx?.getMoveDisabled(node.id)}
                  >
                    <ShellPaneHeader
                      paneId={node.id}
                      title={node.title}
                      dragDisabled={
                        paneMoveUx?.canDropSource
                          ? !paneMoveUx.canDropSource(node.id, node.id)
                          : false
                      }
                    />
                  </PaneContextMenu>
                ) : null}
                {isLeaf ? (
                  isMultiPaneLeaf && tabsMeta ? (
                    (() => {
                      const activeId = tabsMeta.activeTabId;
                      const activePane = paneById[activeId];
                      if (!activePane) {
                        if (typeof console !== "undefined") {
                          console.warn(
                            `[PatientProfileShell] tabs leaf "${node.id}" has activeTabId "${activeId}" with no matching PaneDefinition; rendering nothing.`,
                          );
                        }
                        return null;
                      }
                      return (
                        <>
                          <PaneTabStrip
                            groupId={node.id}
                            paneIds={tabsMeta.paneIds}
                            activeTabId={activeId}
                            paneById={paneById}
                            onActivateTab={(paneId) =>
                              layoutActions.onActivateTab(node.id, paneId)
                            }
                            isTabDraggable={(paneId) =>
                              paneMoveUx?.canDropSource?.(paneId, node.id) ??
                              true
                            }
                            wrapTab={(paneId, tabElement) => (
                              <PaneContextMenu
                                paneId={paneId}
                                isCollapsed={false}
                                canMerge={paneTreeHasSibling(paneTree, paneId)}
                                onSplitHorizontal={() =>
                                  layoutActions.onSplitHorizontal(paneId)
                                }
                                onSplitVertical={() =>
                                  layoutActions.onSplitVertical(paneId)
                                }
                                onMerge={() => layoutActions.onMerge(paneId)}
                                onToggleCollapsed={() =>
                                  layoutActions.onToggleCollapsed(paneId)
                                }
                                onHide={() => layoutActions.onHide(paneId)}
                                moveTargets={paneMoveUx?.getMoveTargets(paneId)}
                                onMove={
                                  paneMoveUx
                                    ? (target) =>
                                        paneMoveUx.onMovePane(paneId, target)
                                    : undefined
                                }
                                moveDisabled={paneMoveUx?.getMoveDisabled(paneId)}
                              >
                                {tabElement}
                              </PaneContextMenu>
                            )}
                          />
                          <div className="relative min-h-0 flex-1">
                            <div
                              key={`pane-${activeId}`}
                              id={`pane-body-${activeId}`}
                              className="min-h-0 flex-1 overflow-auto"
                              data-cockpit-pane-id={activeId}
                              data-cockpit-tabs-group-id={node.id}
                            >
                              {activePane.render()}
                            </div>
                            {customizeMode ? (
                              <PaneDropOverlay
                                groupId={node.id}
                                enabled={
                                  paneMoveUx?.canDropSource?.(
                                    activeDragPaneId,
                                    node.id,
                                  ) ?? true
                                }
                                allowCenter={
                                  paneMoveUx?.canTabInto?.(
                                    activeDragPaneId,
                                    node.id,
                                  ) ?? true
                                }
                              />
                            ) : null}
                          </div>
                        </>
                      );
                    })()
                  ) : (
                    <div className="relative min-h-0 flex-1">
                      <div
                        key={`pane-${node.id}`}
                        className="min-h-0 flex-1 overflow-auto"
                        data-cockpit-pane-id={node.id}
                      >
                        {node.render()}
                      </div>
                      {customizeMode ? (
                        <PaneDropOverlay
                          groupId={node.id}
                          enabled={
                            paneMoveUx?.canDropSource?.(
                              activeDragPaneId,
                              node.id,
                            ) ?? true
                          }
                          allowCenter={
                            paneMoveUx?.canTabInto?.(
                              activeDragPaneId,
                              node.id,
                            ) ?? true
                          }
                        />
                      ) : null}
                    </div>
                  )
                ) : (
                  (() => {
                    const subtree = (
                      <div className="flex min-h-0 min-w-0 flex-1">
                        <PaneSubtreeGroup
                          nodes={node.children ?? []}
                          paneById={paneById}
                          paneOrder={paneOrder}
                          paneState={paneState}
                          setLeafSize={setLeafSize}
                          orientation={node.direction ?? childDefaultOrientation}
                          groupId={`${groupId}.${node.id}`}
                          layoutVersion={layoutVersion}
                          depth={depth + 1}
                          paneTree={paneTree}
                          layoutActions={layoutActions}
                          paneMoveUx={paneMoveUx}
                          activeDragPaneId={activeDragPaneId}
                        />
                      </div>
                    );
                    return node.groupWrapper
                      ? node.groupWrapper(subtree)
                      : subtree;
                  })()
                )}
              </div>
            </ResizablePanel>,
          );
          return items;
        })}
      </ResizablePanelGroup>
    </div>
  );
}
