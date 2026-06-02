import type React from "react";
import type { LucideIcon } from "lucide-react";
import type { PaneTreeNode } from "./layout-tree";

/**
 * One tab in a tabbed sub-pane (PaneDefinition.tabs).
 */
export interface PaneTabDefinition {
  /** Stable id, unique within this pane's tab set. */
  id: string;
  /** Label shown in the tab strip. */
  label: string;
  /** Render function for the tab body — replaces pane.render() when active. */
  render: () => React.ReactNode;
  /** Optional icon shown to the left of the label. */
  icon?: LucideIcon;
  /** Optional badge shown to the right of the label (e.g. unread count). */
  badge?: () => React.ReactNode;
}

/**
 * A render slot — used for `aiSummarySlot` and `aiAssistButtonSlot` and
 * any future aux-surface slot pattern. The receiving renderer decides
 * the layout context the slot is mounted into.
 */
export type SlotRenderer = () => React.ReactNode;

/**
 * The single contract the patient-profile shell knows about.
 *
 * Adding a 4th pane (e.g. AI chat) is a one-diff append to the panes array
 * in `<PatientProfilePage>`. The shell has no knowledge of which pane is
 * "chart" vs "body" vs "rx" — it iterates `paneOrder` and looks up each
 * `PaneDefinition` by id.
 *
 * Future-proof fields (DL-5): `children?` will enable vertical split inside
 * a column when authored as a recursive PaneDefinition; v1 ignores this
 * field and renders `render()` instead.
 */
export interface PaneDefinition {
  /** Stable id; used as the layout key. Examples: "chart", "body", "rx", "ai-chat". */
  id: string;
  /** Header title shown in the column header when expanded. */
  title: string;
  /** Render function for the expanded pane body. */
  render: () => React.ReactNode;
  /**
   * Render function for the 40px collapsed strip. Falls back to a generic
   * chevron-only stub if omitted.
   */
  collapsedRender?: () => React.ReactNode;
  /** Minimum width as a % of the group. Defaults to 12. */
  minSizePct?: number;
  /**
   * Minimum width in pixels. Combined with {@link minSizePct} at render
   * time — the shell takes `max(minSizePct, pxToPct(minSizePx))` so the
   * library honours both floors regardless of viewport size. Cursor-style
   * pixel floors prevent the "narrow strip" failure mode reported in
   * ppr-11 follow-up QA. Defaults to 240px when omitted.
   */
  minSizePx?: number;
  /**
   * Natural width as a % of the group. Used as the initial size and as
   * the restore target on uncollapse. Defaults to 33.
   */
  naturalSizePct?: number;
  /** Whether this pane is allowed to collapse. Defaults to true. */
  canCollapse?: boolean;
  /**
   * Optional hotkey to focus/expand this pane (e.g. "mod+1" for chart).
   * Hotkeys live on the pane definition so adding a 4th pane brings its
   * own binding — keeps `useShellHotkeys` (ppr-10) generic.
   */
  hotkey?: string;
  /**
   * Rendered by `<PaneToggleBar>` (ppr-15b). Required in practice; typed
   * optional only so existing test fixtures don't break compilation. Pages
   * that mount the toggle bar must supply an icon for every pane.
   */
  icon?: LucideIcon;
  /**
   * Activated in cv2-01 (May 2026). When present, the shell renders these
   * as a nested resizable group with the alternated orientation (horizontal
   * parent → vertical children → horizontal grandchildren). When `children`
   * is non-empty, `render()` is treated as a no-op for that node and the
   * group's leaves are responsible for rendering their own bodies. See
   * `direction?` below for explicit orientation control.
   */
  children?: PaneDefinition[];
  /**
   * RESERVED FOR PHASE 2 — R-CHART / R-HISTORY. When present, the leaf
   * renders a tab strip above its body; each tab's `render()` replaces
   * the pane body when the tab is active. v1 (this task) types the
   * field; the renderer ships in the first Phase 2 task that needs it.
   *
   * Ignored by `<PatientProfileShell>` in Phase 1.
   */
  tabs?: PaneTabDefinition[];
  /**
   * RESERVED FOR PHASE 3 — R-RX-POLISH. When present, the pane body
   * renders this slot above the main render output (typical use: a
   * compact AI-generated summary card). v1 types the field; renderer
   * ships in Phase 3.
   *
   * Ignored by `<PatientProfileShell>` in Phase 1.
   */
  aiSummarySlot?: SlotRenderer;
  /**
   * RESERVED FOR PHASE 3 — R-RX-POLISH. When present, the pane header
   * renders this slot next to the title (typical use: an AI-assist
   * button that opens a side-sheet). v1 types the field; renderer
   * ships in Phase 3.
   *
   * Ignored by `<PatientProfileShell>` in Phase 1.
   */
  aiAssistButtonSlot?: SlotRenderer;
  /**
   * Explicit orientation for the nested group when `children?` is present.
   * Defaults to alternating from the parent's orientation: a horizontal
   * parent renders children vertically; a vertical parent renders children
   * horizontally. Set this only when you want to override the alternation
   * (rare — the bottom region of the Telemed-Video template overrides it
   * to keep `Investigations-orders | Plan` as a horizontal split inside
   * what would otherwise default to vertical).
   *
   * Ignored when `children` is empty / undefined.
   */
  direction?: "horizontal" | "vertical";
  /**
   * When `children` is non-empty, optionally wraps the nested PanelGroup
   * subtree. Used by cmr-06 `middle-bottom` for safety/footer overlays
   * and the container-query root without adding extra pane ids.
   *
   * Ignored when `children` is empty / undefined.
   */
  groupWrapper?: (children: React.ReactNode) => React.ReactNode;
  /**
   * When true, the shell skips its drag-grip column header for this leaf;
   * the pane body renders {@link PaneHeader} (title + disclosure chevron) itself.
   * Used by chart-rail Snapshot / History (ccd-03).
   */
  hideShellHeader?: boolean;
}

/**
 * Walks a {@link PaneDefinition} tree and returns the leaves in left-to-right
 * depth-first order, plus a flat id → node map covering every visited node
 * (leaves and non-leaves). Used by `<PatientProfileShell>` for renderer lookups
 * and default-layout seeding; persisted layout state lives in {@link PaneTreeNode}
 * via `useShellLayout` (cv2-02).
 */
export function flattenPaneDefinitions(nodes: PaneDefinition[]): {
  paneOrder: string[];
  paneById: Record<string, PaneDefinition>;
} {
  const order: string[] = [];
  const byId: Record<string, PaneDefinition> = {};
  function walk(n: PaneDefinition) {
    byId[n.id] = n;
    if (n.children && n.children.length > 0) {
      for (const child of n.children) walk(child);
    } else {
      order.push(n.id);
    }
  }
  for (const root of nodes) walk(root);
  return { paneOrder: order, paneById: byId };
}

/** Collect leaf ids under a pane node (depth-first, left-to-right). */
export function collectPaneLeafIds(node: PaneDefinition): string[] {
  if (!node.children?.length) return [node.id];
  return node.children.flatMap(collectPaneLeafIds);
}

/** True when every leaf under `node` is marked hidden in flat paneState. */
export function allPaneLeavesHidden(
  node: PaneDefinition,
  paneState: Record<string, PaneRuntimeState>,
  activeLeafIds?: readonly string[],
): boolean {
  if (!node.children?.length) {
    if (activeLeafIds && !activeLeafIds.includes(node.id)) {
      return true;
    }
    return !!paneState[node.id]?.hidden;
  }
  return node.children.every((child) =>
    allPaneLeavesHidden(child, paneState, activeLeafIds),
  );
}

/**
 * Per-pane runtime state — sizing + visibility flag.
 *
 * @deprecated cv2-02 — use {@link PaneTreeNode} for persistence. The shell and
 * imperative handle still expose this flat derived shape for hotkeys and
 * legacy consumers until Phase 2 reads `paneTree` directly.
 */
export interface PaneRuntimeState {
  /** Current width as a % of the group. 0 ≤ sizePct ≤ 100. */
  sizePct: number;
  /** Excluded from the visible layout (toggled off via the toggle bar). */
  hidden: boolean;
}

/**
 * The single layout-state shape persisted to localStorage.
 *
 * cpf-01 bumps to version 5: leaf nodes carry `paneIds` + `activeTabId` so every
 * leaf is a tab container. v4 is migrated on read via upgradeV4LeavesToV5.
 * v3 is migrated to v4 tree then to v5. v1 and v2 are still chained via ppr-08.
 */
export interface PatientProfileLayout {
  version: 5;
  paneTree: PaneTreeNode;
}

export type { PaneTreeNode };

/**
 * R-LAYOUT-UX (clpm-02 / 112): recursive split tree persisted in
 * `doctor_settings.cockpit_layout_presets[].layout_tree`.
 */
export type LayoutNode =
  | { kind: "pane"; paneId: string; collapsed?: boolean }
  | {
      kind: "split";
      direction: "horizontal" | "vertical";
      children: LayoutNode[];
      sizes: number[];
    };

/** CC-08 / 099 legacy flat three-column snapshot (cockpit v1). */
export type LegacyFlatLayout = {
  slots: ["chart" | "body" | "rx", "chart" | "body" | "rx", "chart" | "body" | "rx"];
  widths: [number, number, number];
  collapsed: { chart: boolean; rx: boolean; body?: boolean };
};
