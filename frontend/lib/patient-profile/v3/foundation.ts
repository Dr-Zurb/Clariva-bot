/**
 * foundation.ts — the kept-foundation import boundary for Cockpit v3 (cv3s-02).
 *
 * v3-DL-1 / P0-DL-4: ALL v3 code imports the kept layout model, the pure
 * mutation engine, the PaneDefinition contract, and pane icons through THIS
 * file — never directly from the underlying modules, and NEVER from Shell.tsx,
 * customize-mode-context, CustomizeBar, or the old PaneDropOverlay.
 *
 * This file must contain re-exports ONLY. No logic, no React. If something here
 * needs to import the old shell, that is a design smell — stop and reconsider.
 */

// ── Kept model + serialisation (layout-tree.ts) ──────────────────────────────
export {
  serialiseTree,
  deserialiseTree,
  isValidTreeNode,
  upgradeV4LeavesToV5,
  paneTreeToFlat,
  flatToPaneTree,
  listTabsContainers,
  describeLayoutShape,
  isLayoutCramped,
  CRAMPED_ROOT_SIBLINGS,
  resolveMoveSourcePaneId,
} from "@/lib/patient-profile/layout-tree";
export type {
  PaneTreeNode,
  TabsContainerInfo,
  LayoutShape,
} from "@/lib/patient-profile/layout-tree";

// ── Kept pure mutation engine (layout-tree-mutations.ts) ──────────────────────
export {
  dropPaneIntoZone,
  addToTabsNode,
  hidePaneToRoot,
  extractFromTabsNode,
  moveLeafBetweenTabs,
  setActiveTab,
  restoreLeaf,
  hideLeaf,
  mergeWithSibling,
  splitLeaf,
  toggleCollapsed,
  countLeaves,
  findLeaf,
  hasSibling,
  MAX_LEAVES,
  MAX_PANES_PER_TABS,
} from "@/lib/patient-profile/layout-tree-mutations";
export type {
  DropZone,
  TabsAddPosition,
} from "@/lib/patient-profile/layout-tree-mutations";

// ── Kept pane contract (types.ts) ────────────────────────────────────────────
export {
  flattenPaneDefinitions,
  collectPaneLeafIds,
  allPaneLeavesHidden,
} from "@/lib/patient-profile/types";
export type {
  PaneDefinition,
  PaneTabDefinition,
  PaneRuntimeState,
  PatientProfileLayout,
  LayoutNode,
  SlotRenderer,
} from "@/lib/patient-profile/types";

// ── Kept pane icons ────────────────────────────────────────────────────────────
export * from "@/lib/patient-profile/pane-icons";

// ── Layout version constant (useShellLayout) ───────────────────────────────────
export { LAYOUT_VERSION } from "@/lib/patient-profile/useShellLayout";
