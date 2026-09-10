/**
 * `rxFocus` deep-link (rfeq-02).
 *
 * Parse the reserved query, restore + activate the SOAP pane on the
 * persisted tree (no snap-rail), then scroll the section. Hidden
 * *sections* stay hidden — this module does not write doctor_settings.
 */

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { scrollCollapsibleToStickyTop } from "@/lib/cockpit/collapse-scroll";
import { setActiveTab } from "@/lib/patient-profile/layout-tree-mutations";
import type { PaneTreeNode } from "@/lib/patient-profile/layout-tree";
import { LAYOUT_VERSION } from "@/lib/patient-profile/useShellLayout";
import { listRxFieldIndex, type RxFieldPaneId } from "@/lib/search/rx-fields";

const PANES = new Set<RxFieldPaneId>([
  "subjective",
  "objective",
  "assessment",
  "plan",
]);

const SECTION_ATTR: Record<RxFieldPaneId, string> = {
  subjective: "data-subjective-section-id",
  objective: "data-objective-section-id",
  assessment: "data-assessment-section-id",
  plan: "data-plan-section-id",
};

export interface RxFocusTarget {
  pane: RxFieldPaneId;
  section: string;
  field?: string;
}

export interface RxFocusHost {
  groupId: string;
  hidden: boolean;
  needsActivate: boolean;
}

function isPane(value: string): value is RxFieldPaneId {
  return PANES.has(value as RxFieldPaneId);
}

/** Fail-soft: unknown / malformed values → `null`. */
export function parseRxFocus(
  raw: string | null | undefined
): RxFocusTarget | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 2 && parts.length !== 3) return null;
  const pane = parts[0];
  const section = parts[1];
  const field = parts[2];
  if (!pane || !section || !isPane(pane)) return null;

  const hit = listRxFieldIndex().find((entry) => {
    if (entry.pane !== pane || entry.section !== section) return false;
    return field ? entry.field === field : entry.field === undefined;
  });
  return hit ? (field ? { pane, section, field } : { pane, section }) : null;
}

function isLeaf(node: PaneTreeNode): boolean {
  return !node.children?.length;
}

function paneIdsOf(node: PaneTreeNode): string[] {
  return node.paneIds && node.paneIds.length > 0 ? node.paneIds : [node.id];
}

/** Host leaf for a SOAP pane. Does not use the snap-rail finder. */
export function findRxFocusHost(
  tree: PaneTreeNode,
  paneId: string
): RxFocusHost | null {
  const walk = (node: PaneTreeNode): RxFocusHost | null => {
    if (isLeaf(node)) {
      const ids = paneIdsOf(node);
      if (!ids.includes(paneId)) return null;
      return {
        groupId: node.id,
        hidden: Boolean(node.hidden),
        needsActivate: (node.activeTabId ?? ids[0]) !== paneId,
      };
    }
    for (const child of node.children ?? []) {
      const hit = walk(child);
      if (hit) return hit;
    }
    return null;
  };
  return walk(tree);
}

function mapTree(
  tree: PaneTreeNode,
  fn: (node: PaneTreeNode) => PaneTreeNode
): PaneTreeNode {
  const next = fn(tree);
  if (!next.children) return next;
  return {
    ...next,
    children: next.children.map((child) => mapTree(child, fn)),
  };
}

/**
 * Unhide the host leaf (if needed) and activate the pane tab.
 * Does **not** call the snap-rail helper.
 */
export function applyRxFocusPane(
  tree: PaneTreeNode,
  paneId: string
): PaneTreeNode | null {
  const host = findRxFocusHost(tree, paneId);
  if (!host) return null;

  let next = tree;
  if (host.hidden) {
    next = mapTree(next, (node) =>
      node.id === host.groupId ? { ...node, hidden: false } : node
    );
  }
  const activated = setActiveTab(next, host.groupId, paneId);
  return activated.ok ? activated.tree : next;
}

export function stripRxFocusFromUrl(pathname: string, search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  params.delete("rxFocus");
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function querySection(target: RxFocusTarget): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(
    `[${SECTION_ATTR[target.pane]}="${target.section}"]`
  );
  return el instanceof HTMLElement ? el : null;
}

function queryFieldInput(
  section: HTMLElement,
  field: string
): HTMLElement | null {
  const entry = listRxFieldIndex().find((e) => e.field === field);
  if (!entry) return null;
  const inputs = Array.from(
    section.querySelectorAll("input, textarea, select")
  );
  for (const node of inputs) {
    if (!(node instanceof HTMLElement)) continue;
    const label = node.getAttribute("aria-label") ?? "";
    if (label.includes(entry.label)) return node;
  }
  return null;
}

/**
 * Scroll the section (if mounted). Focus the named field when its input
 * is in the DOM. Returns whether a section was found.
 */
export function revealRxFocusTarget(target: RxFocusTarget): boolean {
  const section = querySection(target);
  if (!section) return false;
  scrollCollapsibleToStickyTop(section);
  if (target.field) {
    const input = queryFieldInput(section, target.field);
    input?.focus();
  }
  return true;
}

const REVEAL_FRAMES = 12;

export interface RxFocusLayoutApi {
  hydrated: boolean;
  paneTree: PaneTreeNode;
  applyLayout: (
    next: { version: typeof LAYOUT_VERSION; paneTree: PaneTreeNode },
    options?: { recordHistory?: boolean }
  ) => void;
}

/**
 * Appointment-cockpit consumer. Waits for layout hydration, restores the
 * host pane in place (no snap-rail), strips `rxFocus`, then retries reveal
 * until the section mounts. Does not log the query value.
 */
export function useRxFocusDeepLink(layout: RxFocusLayoutApi): void {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const raw = searchParams.get("rxFocus");
  const handledRawRef = useRef<string | null>(null);
  const paneTree = layout.paneTree;
  const applyLayout = layout.applyLayout;
  const hydrated = layout.hydrated;

  useEffect(() => {
    if (!hydrated) return;
    if (!raw) {
      handledRawRef.current = null;
      return;
    }
    if (handledRawRef.current === raw) return;

    const target = parseRxFocus(raw);
    if (!target) return;

    handledRawRef.current = raw;
    const next = applyRxFocusPane(paneTree, target.pane);
    if (next) {
      applyLayout(
        { version: LAYOUT_VERSION, paneTree: next },
        { recordHistory: false }
      );
    }

    const nextUrl = stripRxFocusFromUrl(pathname, searchParams.toString());
    router.replace(nextUrl, { scroll: false });

    let attempts = 0;
    const reveal = () => {
      if (revealRxFocusTarget(target)) return;
      attempts += 1;
      if (attempts < REVEAL_FRAMES) requestAnimationFrame(reveal);
    };
    requestAnimationFrame(reveal);
  }, [applyLayout, hydrated, paneTree, pathname, raw, router, searchParams]);
}
