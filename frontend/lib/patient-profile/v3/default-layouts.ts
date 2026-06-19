/**
 * default-layouts.ts — v3-native intent-based workflow layouts (cv3l-01 / P6-DL-4).
 *
 * Four complete PaneTreeNode presets: Consult (seed + reset), Read, Document,
 * Review. Every tree contains all eight pane ids (visible in structure, hidden
 * as root leaves) so the palette can toggle any pane back on.
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

export const DEFAULT_SEED_ID: DefaultLayoutId = "consult";

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

function split(
  id: string,
  sizePct: number,
  direction: "horizontal" | "vertical",
  children: PaneTreeNode[],
): PaneTreeNode {
  return { id, sizePct, hidden: false, direction, children };
}

/** v2 8-pane telemed-video: 3 columns, no hidden panes. */
function buildConsultTree(): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      split("col-left", 22, "vertical", [
        visibleLeaf("snapshot", 40),
        visibleLeaf("history", 60),
      ]),
      split("col-mid", 56, "vertical", [
        visibleLeaf("body", 42),
        visibleLeaf("assessment", 8),
        split("c-mid-bottom", 50, "horizontal", [
          visibleLeaf("investigations-orders", 40),
          visibleLeaf("plan", 60),
        ]),
      ]),
      split("col-right", 22, "vertical", [
        visibleLeaf("subjective", 50),
        visibleLeaf("objective", 50),
      ]),
    ],
  };
}

/** Case-history focus: wide History; body / investigations / plan hidden at root. */
function buildReadTree(): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      split("read-left", 18, "vertical", [
        visibleLeaf("snapshot", 35),
        visibleLeaf("assessment", 65),
      ]),
      split("read-center", 52, "vertical", [visibleLeaf("history", 100)]),
      split("read-right", 30, "vertical", [
        visibleLeaf("subjective", 50),
        visibleLeaf("objective", 50),
      ]),
      hiddenLeaf("body"),
      hiddenLeaf("investigations-orders"),
      hiddenLeaf("plan"),
    ],
  };
}

/** SOAP + Rx: Plan dominant on the right; body / history hidden at root. */
function buildDocumentTree(): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      split("doc-left", 12, "vertical", [
        visibleLeaf("snapshot", 40),
        visibleLeaf("assessment", 60),
      ]),
      split("doc-mid", 28, "vertical", [
        visibleLeaf("subjective", 50),
        visibleLeaf("objective", 50),
      ]),
      split("doc-right", 60, "vertical", [
        visibleLeaf("investigations-orders", 28),
        visibleLeaf("plan", 72),
      ]),
      hiddenLeaf("body"),
      hiddenLeaf("history"),
    ],
  };
}

/** Post-visit calm reading: all eight visible, Consult-like columns. */
function buildReviewTree(): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      split("review-left", 24, "vertical", [
        visibleLeaf("snapshot", 38),
        visibleLeaf("history", 62),
      ]),
      split("review-mid", 50, "vertical", [
        visibleLeaf("body", 28),
        visibleLeaf("assessment", 10),
        visibleLeaf("subjective", 31),
        visibleLeaf("objective", 31),
      ]),
      split("review-right", 26, "vertical", [
        visibleLeaf("plan", 58),
        visibleLeaf("investigations-orders", 42),
      ]),
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
    label: "Consult",
    description: "Live visit — the familiar 8-pane cockpit.",
    hotkey: "mod+shift+1",
    tree: CONSULT_TREE,
  },
  {
    id: "read",
    label: "Read",
    description: "Case history — wide chart rail and notes.",
    hotkey: "mod+shift+2",
    tree: READ_TREE,
  },
  {
    id: "document",
    label: "Document",
    description: "SOAP + Rx — plan and investigations forward.",
    hotkey: "mod+shift+3",
    tree: DOCUMENT_TREE,
  },
  {
    id: "review",
    label: "Review",
    description: "Post-visit read-only — calm full-chart scan.",
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

/** True when the registry is the full eight-tab cockpit (not walk-in subset). */
export function isFullEightPaneRegistry(panes: PaneDefinition[]): boolean {
  if (panes.length !== ALL_PANE_IDS.length) return false;
  const ids = new Set(panes.map((p) => p.id));
  return ALL_PANE_IDS.every((id) => ids.has(id));
}

/**
 * Seed layout for CockpitV3Shell: Consult for the full registry, blank for
 * walk-in / partial subsets (Consult references all eight pane ids).
 */
export function resolveSeedLayout(panes: PaneDefinition[]): PatientProfileLayout {
  assertFlatLeafRegistry(panes);
  if (isFullEightPaneRegistry(panes)) {
    return {
      version: LAYOUT_VERSION,
      paneTree: getDefaultLayoutTree(DEFAULT_SEED_ID),
    };
  }
  return blankLayout(panes);
}
