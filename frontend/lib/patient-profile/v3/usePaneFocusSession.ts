/**
 * usePaneFocusSession — temporary Full / Wide / Even / Narrow / Restore session
 * (cockpit-tab-focus · CTF-D22 share-based local ratios).
 *
 * Persist policy (CTF-D3 Option A): while session active, durable localStorage
 * writes are suspended via `setPersistSuspended(true)`. Prior tree + focusedLeafId
 * + ratio live in React state only.
 *
 * Ratio switches always recompute from the original prior (CTF-D10).
 *
 * @see docs/Work/Daily-plans/July 2026/17-07-2026/cockpit-tab-focus/
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApplyLayoutOptions } from "@/lib/patient-profile/useShellLayout";
import type { PaneTreeNode } from "@/lib/patient-profile/layout-tree";
import {
  clonePaneTree,
  splitLeafByRatio,
  type PaneSplitRatio,
} from "@/lib/patient-profile/v3/focus-leaf";

export type { PaneSplitRatio };

/** @deprecated Prefer PaneSplitRatio — kept for chrome until ctf-17. */
export type PaneFocusMode = PaneSplitRatio;

export interface PaneFocusSessionState {
  /** Exact pre-session tree for Restore. */
  prior: PaneTreeNode;
  /** leafId last passed to enterSplit. */
  focusedLeafId: string;
  ratio: PaneSplitRatio;
}

export interface UsePaneFocusSessionOptions {
  getTree: () => PaneTreeNode;
  applyTree: (tree: PaneTreeNode, options?: ApplyLayoutOptions) => void;
  /** CTF-D3 Option A — skip durable writes while session active. */
  setPersistSuspended?: (suspended: boolean) => void;
  /** When false, Esc listener is not registered (default true). */
  enableEsc?: boolean;
}

export interface PaneFocusSession {
  isFocused: boolean;
  focusedLeafId: string | null;
  ratio: PaneSplitRatio | null;
  /** @deprecated Alias of `ratio`. */
  mode: PaneSplitRatio | null;
  /** Prior tree while session active (for Show here candidate base). */
  focusPrior: PaneTreeNode | null;
  enterSplit: (leafId: string, ratio: PaneSplitRatio) => boolean;
  /** Thin aliases → enterSplit. */
  enterFocus: (leafId: string) => boolean;
  enterPrimary: (leafId: string) => boolean;
  enterPeek: (leafId: string) => boolean;
  exitFocus: () => void;
  toggleFocus: (leafId: string) => void;
  /**
   * Clear session without restoring prior (CTF-D6 drag-exit / preset apply).
   * Keeps the current live tree and resumes persistence.
   */
  discardFocusSession: () => void;
}

/** True when a dialog/sheet should own Esc before Focus Restore. */
export function hasBlockingOverlay(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector('[role="dialog"]'));
}

export function usePaneFocusSession(
  opts: UsePaneFocusSessionOptions,
): PaneFocusSession {
  const { getTree, applyTree, setPersistSuspended, enableEsc = true } = opts;
  const [session, setSession] = useState<PaneFocusSessionState | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const getTreeRef = useRef(getTree);
  getTreeRef.current = getTree;
  const applyTreeRef = useRef(applyTree);
  applyTreeRef.current = applyTree;
  const setPersistSuspendedRef = useRef(setPersistSuspended);
  setPersistSuspendedRef.current = setPersistSuspended;

  const discardFocusSession = useCallback(() => {
    if (!sessionRef.current) return;
    setSession(null);
    setPersistSuspendedRef.current?.(false);
  }, []);

  const exitFocus = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    const prior = current.prior;
    setSession(null);
    applyTreeRef.current(prior, { recordHistory: false });
    setPersistSuspendedRef.current?.(false);
  }, []);

  const enterSplit = useCallback(
    (leafId: string, ratio: PaneSplitRatio): boolean => {
      const current = sessionRef.current;
      // Always recompute from the original prior (CTF-D10).
      const base = current ? current.prior : clonePaneTree(getTreeRef.current());

      const result = splitLeafByRatio(base, leafId, ratio);
      if (!result.ok) return false;

      if (!current) {
        setPersistSuspendedRef.current?.(true);
      }
      setSession({
        prior: base,
        focusedLeafId: leafId,
        ratio,
      });
      applyTreeRef.current(result.tree, { recordHistory: false });
      return true;
    },
    [],
  );

  const enterFocus = useCallback(
    (leafId: string): boolean => enterSplit(leafId, "full"),
    [enterSplit],
  );

  const enterPrimary = useCallback(
    (leafId: string): boolean => enterSplit(leafId, "wide"),
    [enterSplit],
  );

  const enterPeek = useCallback(
    (leafId: string): boolean => enterSplit(leafId, "even"),
    [enterSplit],
  );

  const toggleFocus = useCallback(
    (leafId: string) => {
      const current = sessionRef.current;
      if (
        current &&
        current.focusedLeafId === leafId &&
        current.ratio === "full"
      ) {
        exitFocus();
        return;
      }
      enterFocus(leafId);
    },
    [enterFocus, exitFocus],
  );

  useEffect(() => {
    if (!enableEsc || !session) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (hasBlockingOverlay()) return;
      e.preventDefault();
      exitFocus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enableEsc, session, exitFocus]);

  return {
    isFocused: session !== null,
    focusedLeafId: session?.focusedLeafId ?? null,
    ratio: session?.ratio ?? null,
    mode: session?.ratio ?? null,
    focusPrior: session?.prior ?? null,
    enterSplit,
    enterFocus,
    enterPrimary,
    enterPeek,
    exitFocus,
    toggleFocus,
    discardFocusSession,
  };
}
