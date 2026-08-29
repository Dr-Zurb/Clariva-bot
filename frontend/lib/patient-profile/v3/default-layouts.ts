/**
 * default-layouts.ts — v3-native intent-based workflow layouts (cv3l-01 / P6-DL-4).
 *
 * Four complete PaneTreeNode presets: Consult (seed + reset), Read, Document,
 * Review. Every tree contains all `COCKPIT_TAB_ORDER` pane ids (visible in
 * structure, or hidden as root leaves) so the palette can toggle any pane back on.
 *
 * Phase 2 (ribbon-expand): Snapshot / History retired from the registry — chart
 * + visit history live on the patient ribbon. Defaults are mid+right SOAP/Rx
 * layouts with no left chart column.
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

/** Live visit — Consult/Assessment/Plan + Subjective/Objective (no chart rail). */
function buildConsultTree(): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      split("col-mid", 68, "vertical", [
        visibleLeaf("body", 42),
        visibleLeaf("assessment", 8),
        visibleLeaf("plan", 50),
      ]),
      split("col-right", 32, "vertical", [
        visibleLeaf("subjective", 50),
        visibleLeaf("objective", 50),
      ]),
    ],
  };
}

/** Notes focus — Assessment + Subjective/Objective; body / plan hidden. */
function buildReadTree(): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      split("read-left", 28, "vertical", [visibleLeaf("assessment", 100)]),
      split("read-right", 72, "vertical", [
        visibleLeaf("subjective", 50),
        visibleLeaf("objective", 50),
      ]),
      hiddenLeaf("body"),
      hiddenLeaf("plan"),
    ],
  };
}

/** SOAP + Rx — Plan dominant; body hidden. */
function buildDocumentTree(): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      split("doc-left", 14, "vertical", [visibleLeaf("assessment", 100)]),
      split("doc-mid", 30, "vertical", [
        visibleLeaf("subjective", 50),
        visibleLeaf("objective", 50),
      ]),
      split("doc-right", 56, "vertical", [visibleLeaf("plan", 100)]),
      hiddenLeaf("body"),
    ],
  };
}

/** Post-visit calm reading — body + notes + plan. */
function buildReviewTree(): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      split("review-mid", 55, "vertical", [
        visibleLeaf("body", 28),
        visibleLeaf("assessment", 12),
        visibleLeaf("subjective", 30),
        visibleLeaf("objective", 30),
      ]),
      split("review-right", 45, "vertical", [visibleLeaf("plan", 100)]),
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
    description: "Live visit — Consult, SOAP notes, and Plan.",
    hotkey: "mod+shift+1",
    tree: CONSULT_TREE,
  },
  {
    id: "read",
    label: "Read",
    description: "Case review — Assessment and Subjective/Objective.",
    hotkey: "mod+shift+2",
    tree: READ_TREE,
  },
  {
    id: "document",
    label: "Document",
    description: "SOAP + Rx — plan forward.",
    hotkey: "mod+shift+3",
    tree: DOCUMENT_TREE,
  },
  {
    id: "review",
    label: "Review",
    description: "Post-visit read — calm full-note scan.",
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
 * Seed layout for CockpitV3Shell: Consult for the full registry, blank for
 * walk-in / partial subsets (Consult references all pane ids).
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
