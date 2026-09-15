/**
 * default-layouts.ts — v3-native intent-based workflow layouts.
 *
 * Four complete PaneTreeNode presets. Ids stay consult / read / document /
 * review (hotkeys). Labels are Call / Notes / Write / After. Every tree
 * contains all `COCKPIT_TAB_ORDER` pane ids so the palette can toggle any
 * pane back on. At most two leaves are visible — a third column is a
 * palette click, not a default.
 */

import { COCKPIT_TAB_ORDER } from "@/lib/patient-profile/v3/cockpit-tabs";
import { blankLayout, assertFlatLeafRegistry } from "@/lib/patient-profile/v3/blankLayout";
import {
  LAYOUT_VERSION,
  type PaneDefinition,
  type PaneTreeNode,
  type PatientProfileLayout,
} from "@/lib/patient-profile/v3/foundation";

export type DefaultLayoutId = "consult" | "read" | "document" | "review";

export interface DefaultLayoutEntry {
  id: DefaultLayoutId;
  label: string;
  description: string;
  hotkey?: string;
  tree: PaneTreeNode;
}

/** In-clinic / full-registry first-open seed (Write). Tele-live passes `"consult"`. */
export const DEFAULT_SEED_ID: DefaultLayoutId = "document";

/** Live teleconsult first-open seed (Call). */
export const TELE_LIVE_SEED_ID: DefaultLayoutId = "consult";

const ALL_PANE_IDS = [...COCKPIT_TAB_ORDER] as const;

function visibleLeaf(paneId: string, sizePct: number): PaneTreeNode {
  return {
    id: paneId,
    sizePct,
    hidden: false,
    paneIds: [paneId],
    activeTabId: paneId,
  };
}

function hiddenLeaf(paneId: string): PaneTreeNode {
  return {
    id: paneId,
    sizePct: 33,
    hidden: true,
    paneIds: [paneId],
    activeTabId: paneId,
  };
}

/** Call — Consult dock + Plan. SOAP off-canvas. */
function buildConsultTree(): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      visibleLeaf("body", 22),
      visibleLeaf("plan", 78),
      hiddenLeaf("subjective"),
      hiddenLeaf("objective"),
      hiddenLeaf("assessment"),
    ],
  };
}

/** Notes — Subjective | Objective. Plan and Consult hidden. */
function buildReadTree(): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      visibleLeaf("subjective", 50),
      visibleLeaf("objective", 50),
      hiddenLeaf("assessment"),
      hiddenLeaf("body"),
      hiddenLeaf("plan"),
    ],
  };
}

/** Write — Subjective | Plan. In-clinic default. */
function buildDocumentTree(): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      visibleLeaf("subjective", 30),
      visibleLeaf("plan", 70),
      hiddenLeaf("objective"),
      hiddenLeaf("assessment"),
      hiddenLeaf("body"),
    ],
  };
}

/** After — visit summary strip over Plan. SOAP off-canvas. */
function buildReviewTree(): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "vertical",
    children: [
      visibleLeaf("body", 18),
      visibleLeaf("plan", 82),
      hiddenLeaf("subjective"),
      hiddenLeaf("objective"),
      hiddenLeaf("assessment"),
    ],
  };
}

const CONSULT_TREE = buildConsultTree();
const READ_TREE = buildReadTree();
const DOCUMENT_TREE = buildDocumentTree();
const REVIEW_TREE = buildReviewTree();

export const DEFAULT_LAYOUTS: readonly DefaultLayoutEntry[] = [
  {
    id: "consult",
    label: "Call",
    description: "Live tele — video dock, Plan fills the rest.",
    hotkey: "mod+shift+1",
    tree: CONSULT_TREE,
  },
  {
    id: "read",
    label: "Notes",
    description: "Subjective and Objective side by side.",
    hotkey: "mod+shift+2",
    tree: READ_TREE,
  },
  {
    id: "document",
    label: "Write",
    description: "In-clinic — complaints beside Plan.",
    hotkey: "mod+shift+3",
    tree: DOCUMENT_TREE,
  },
  {
    id: "review",
    label: "After",
    description: "Post-visit — summary strip over Plan.",
    hotkey: "mod+shift+4",
    tree: REVIEW_TREE,
  },
] as const;

const TREE_BY_ID: Record<DefaultLayoutId, PaneTreeNode> = {
  consult: CONSULT_TREE,
  read: READ_TREE,
  document: DOCUMENT_TREE,
  review: REVIEW_TREE,
};

export function getDefaultLayoutTree(id: DefaultLayoutId): PaneTreeNode {
  return TREE_BY_ID[id];
}

/**
 * True when the registry is the full cockpit (all `COCKPIT_TAB_ORDER` panes),
 * not the walk-in subset. Name is historical (was eight / seven tabs) — the
 * count tracks `COCKPIT_TAB_ORDER` (five after Snapshot/History retirement).
 */
export function isFullEightPaneRegistry(panes: PaneDefinition[]): boolean {
  if (panes.length !== ALL_PANE_IDS.length) return false;
  const ids = new Set(panes.map((p) => p.id));
  return ALL_PANE_IDS.every((id) => ids.has(id));
}

/**
 * Seed layout for CockpitV3Shell: Write/`document` for the full registry unless
 * the caller passes a tele seed (`consult`). Walk-in / partial subsets stay
 * a blank canvas (2-tab `body`+`plan` must not receive the five-pane tree).
 */
export function resolveSeedLayout(
  panes: PaneDefinition[],
  seedId: DefaultLayoutId = DEFAULT_SEED_ID,
): PatientProfileLayout {
  assertFlatLeafRegistry(panes);
  if (isFullEightPaneRegistry(panes)) {
    return {
      version: LAYOUT_VERSION,
      paneTree: getDefaultLayoutTree(seedId),
    };
  }
  return blankLayout(panes);
}
