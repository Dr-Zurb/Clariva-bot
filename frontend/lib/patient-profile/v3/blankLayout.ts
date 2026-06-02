import {
  flatToPaneTree,
  LAYOUT_VERSION,
  paneTreeToFlat,
  type PaneDefinition,
  type PaneTreeNode,
  type PatientProfileLayout,
} from "@/lib/patient-profile/v3/foundation";

/**
 * Column wrappers from the legacy nested template — must never reach the v3
 * palette/blank-seed (cv3t-02). The original canvas defect listed these at the
 * top level with `render: () => null`.
 */
export const V3_COLUMN_WRAPPER_IDS = [
  "left-column",
  "middle-column",
  "right-column",
  "middle-bottom",
] as const;

/**
 * v3 palette/blank-seed contract (cv3t-02): only flat leaf tabs, no column
 * wrappers. Throws if the nested template (or any non-leaf tree) is handed in.
 */
export function assertFlatLeafRegistry(panes: PaneDefinition[]): void {
  if (panes.some((p) => (p.children?.length ?? 0) > 0)) {
    throw new Error(
      "[v3 blank/palette] Expected a flat leaf registry (no pane.children). " +
        "Hand buildCockpitTabs(ctx) to CockpitV3Shell, not the column template.",
    );
  }
  for (const wrapperId of V3_COLUMN_WRAPPER_IDS) {
    if (panes.some((p) => p.id === wrapperId)) {
      throw new Error(
        `[v3 blank/palette] Column wrapper "${wrapperId}" must not appear in the palette/seed.`,
      );
    }
  }
}

/**
 * Guard for tests: every leaf's `render()` must return real content. Catches the
 * `render: () => null` wrapper defect without calling this in production
 * `blankLayout` (engine tests use synthetic null renders).
 */
export function assertLeafRegistryRenders(panes: PaneDefinition[]): void {
  assertFlatLeafRegistry(panes);
  for (const pane of panes) {
    const node = pane.render();
    if (node === null || node === undefined) {
      throw new Error(
        `[v3 blank/palette] Pane "${pane.id}" render() returned null — blank canvas defect.`,
      );
    }
  }
}

/** All panes present but hidden — renderer shows empty-state until one is added. */
export function blankLayout(panes: PaneDefinition[]): PatientProfileLayout {
  assertFlatLeafRegistry(panes);
  const paneOrder = panes.map((p) => p.id);
  const paneState = Object.fromEntries(
    panes.map((p) => [
      p.id,
      { sizePct: p.naturalSizePct ?? 33, hidden: true },
    ]),
  );
  return {
    version: LAYOUT_VERSION,
    paneTree: flatToPaneTree({ paneOrder, paneState }),
  };
}

export function blankLayoutFlat(panes: PaneDefinition[]) {
  return paneTreeToFlat(blankLayout(panes).paneTree);
}

export function countVisibleStructuralLeaves(root: PaneTreeNode): number {
  let count = 0;
  function walk(n: PaneTreeNode): void {
    if (!n.children?.length) {
      if (!n.hidden) count += 1;
      return;
    }
    for (const child of n.children) walk(child);
  }
  walk(root);
  return count;
}

export function hasVisibleLeaves(root: PaneTreeNode): boolean {
  return countVisibleStructuralLeaves(root) > 0;
}
