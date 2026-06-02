"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  flatToPaneTree,
  paneTreeToFlat,
  reorderSiblingNodes,
  updateGroupSizes,
  updateNodeHidden,
  updateNodeSize,
  isValidTreeNode,
  upgradeV4LeavesToV5,
  type PaneTreeNode,
} from "./layout-tree";
import { setActiveTab as setActiveTabMutation } from "./layout-tree-mutations";
import type {
  PaneDefinition,
  PaneRuntimeState,
  PatientProfileLayout,
} from "./types";

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

/** v4 recursive-tree payload — sole write target after cv2-02 (v5 shape from cpf-01). */
export const v4TreeLayoutStorageKey = (callerKey: string) =>
  `patient-profile/v4-tree-layout::${callerKey}`;

export const LAYOUT_VERSION = 5 as const;

/** Stable empty default — never use `= []` in destructuring (fresh ref every render → hydration loop). */
const EMPTY_LEGACY_STORAGE_KEYS: readonly string[] = [];

/** Read persisted layout: v4 key first, then legacy v3 (migrated on success). */
export function readPersistedLayout(
  callerKey: string,
  legacyKeys: string[] = [],
): PatientProfileLayout | null {
  if (typeof window === "undefined") return null;
  for (const key of [callerKey, ...legacyKeys]) {
    try {
      const rawV4 = window.localStorage.getItem(v4TreeLayoutStorageKey(key));
      if (rawV4) {
        const v4 = validateLayout(JSON.parse(rawV4));
        if (v4) return v4;
      }
      const rawV3 = window.localStorage.getItem(key);
      if (rawV3) {
        const v3 = validateLayout(JSON.parse(rawV3));
        if (v3) return v3;
      }
    } catch {
      // parse / access failure — try next key
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pure helpers — exported so they can be unit-tested directly
// ---------------------------------------------------------------------------

/**
 * Validate an untrusted value (typically a `localStorage` payload) against
 * the {@link PatientProfileLayout} schema. Returns the narrowed v5 layout on
 * success, `null` on any failure — callers fall back to defaults.
 *
 * Accepts v2, v3 (migrated forward), v4 (migrated to v5), or v5. Rejects v1
 * and malformed payloads.
 */
export function validateLayout(raw: unknown): PatientProfileLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // v5 — current
  if (r.version === 5 && isValidTreeNode(r.paneTree)) {
    return {
      version: 5,
      paneTree: upgradeV4LeavesToV5(r.paneTree as PaneTreeNode),
    };
  }

  // v4 — migrate leaves to v5 shape.
  if (r.version === 4 && isValidTreeNode(r.paneTree)) {
    const upgraded = upgradeV4LeavesToV5(r.paneTree as PaneTreeNode);
    if (typeof console !== "undefined") {
      console.info(
        "[useShellLayout] migrated v4 layout to v5 (paneIds + activeTabId on leaves)",
      );
    }
    return { version: 5, paneTree: upgraded };
  }

  if (r.version !== 2 && r.version !== 3) return null;
  if (!Array.isArray(r.paneOrder)) return null;
  if (!r.paneOrder.every((id): id is string => typeof id === "string"))
    return null;
  if (new Set(r.paneOrder).size !== r.paneOrder.length) return null;
  if (!r.paneState || typeof r.paneState !== "object") return null;
  const state = r.paneState as Record<string, unknown>;

  let paneOrder = r.paneOrder as string[];
  let paneState: Record<string, PaneRuntimeState>;

  if (r.version === 2) {
    for (const id of paneOrder) {
      const s = state[id];
      if (!s || typeof s !== "object") return null;
      const sObj = s as Record<string, unknown>;
      if (typeof sObj.sizePct !== "number" || !Number.isFinite(sObj.sizePct))
        return null;
      if (sObj.sizePct < 0 || sObj.sizePct > 100) return null;
      if (typeof sObj.collapsed !== "boolean") return null;
    }
    const migratedState: Record<string, PaneRuntimeState> = {};
    for (const id of paneOrder) {
      const sObj = state[id] as Record<string, unknown>;
      migratedState[id] = {
        sizePct: sObj.sizePct as number,
        hidden: sObj.collapsed as boolean,
      };
    }
    console.info("[useShellLayout] migrated v2 layout payload to v3");
    paneState = migratedState;
  } else {
    for (const id of paneOrder) {
      const s = state[id];
      if (!s || typeof s !== "object") return null;
      const sObj = s as Record<string, unknown>;
      if (typeof sObj.sizePct !== "number" || !Number.isFinite(sObj.sizePct))
        return null;
      if (sObj.sizePct < 0 || sObj.sizePct > 100) return null;
      if (typeof sObj.hidden !== "boolean") return null;
    }
    paneState = state as Record<string, PaneRuntimeState>;
  }

  return {
    version: 5,
    paneTree: flatToPaneTree({ paneOrder, paneState }),
  };
}

/**
 * Returns `true` if at least one leaf id in `layout`'s tree appears in
 * `knownLeafIds`. Used by `useShellLayout` (csl-03, 2026-05-26) to discard
 * persisted layouts whose IDs no longer match the current template — e.g.
 * a Chrome user who saved a v1 cockpit layout (`chart`/`body`/`rx`) and
 * landed on the v2 8-pane template (`snapshot`/`history`/…). Without this
 * guard the toggle bar / pane registry iterates dead IDs and silently
 * renders zero buttons.
 *
 * Empty `knownLeafIds` is treated as "no current template advertised" —
 * we cannot tell whether the persisted layout is stale, so we default to
 * accept (preserve existing behavior).
 */
export function isLayoutAlignedWith(
  layout: PatientProfileLayout,
  knownLeafIds: ReadonlySet<string> | readonly string[],
): boolean {
  const known =
    knownLeafIds instanceof Set
      ? knownLeafIds
      : new Set<string>(knownLeafIds as readonly string[]);
  if (known.size === 0) return true;
  const { paneOrder } = paneTreeToFlat(layout.paneTree);
  const persisted = new Set(paneOrder);
  // Every current-template leaf must exist in the persisted tree. Partial
  // overlap (e.g. v1 `chart`/`rx` alongside v2 `snapshot`/`plan`) leaves
  // column toggles updating ids that are not in storage — toggles appear dead.
  if (Array.from(known).some((id) => !persisted.has(id))) return false;
  return true;
}

/**
 * Deep-compare two {@link PatientProfileLayout} objects. Used by ppr-09 to
 * mark the active preset with a check in the preset menu.
 */
export function layoutsEqual(
  a: PatientProfileLayout,
  b: PatientProfileLayout,
): boolean {
  const fa = paneTreeToFlat(a.paneTree);
  const fb = paneTreeToFlat(b.paneTree);
  if (fa.paneOrder.length !== fb.paneOrder.length) return false;
  for (let i = 0; i < fa.paneOrder.length; i++) {
    if (fa.paneOrder[i] !== fb.paneOrder[i]) return false;
  }
  for (const id of fa.paneOrder) {
    const sa = fa.paneState[id];
    const sb = fb.paneState[id];
    if (!sa || !sb) return false;
    if (sa.sizePct !== sb.sizePct || sa.hidden !== sb.hidden) return false;
  }
  return true;
}

/**
 * Build a default {@link PatientProfileLayout} from a {@link PaneDefinition}[]
 * in their authored order. Each pane uses its `naturalSizePct` (or 33 as a
 * fallback) for initial sizing. Used by ppr-07 when constructing the initial
 * layout seed for `<PatientProfilePage>`.
 */
export function defaultLayout(
  panes: PaneDefinition[],
  _storageKey: string,
): PatientProfileLayout {
  const paneOrder = panes.map((p) => p.id);
  const paneState: Record<string, PaneRuntimeState> = {};
  for (const pane of panes) {
    paneState[pane.id] = {
      sizePct: pane.naturalSizePct ?? 33,
      hidden: false,
    };
  }
  return {
    version: 5,
    paneTree: flatToPaneTree({ paneOrder, paneState }),
  };
}
// ---------------------------------------------------------------------------

export interface UseShellLayoutOptions {
  /** localStorage key for persisting the layout (v3 legacy read-only; v4 write). */
  storageKey: string;
  /**
   * Prior storage namespaces to read when the primary key has no payload
   * (csf-04: `patient-profile:v1:layout` → `v2:telemed-video-layout`).
   */
  legacyStorageKeys?: string[];
  /** Pane ids in their initial left-to-right order. */
  defaultPaneOrder: string[];
  /**
   * Initial sizePct + collapsed per pane. The shell falls back to
   * `defaults` only when storage is empty or unparseable.
   */
  defaultPaneState: Record<string, PaneRuntimeState>;
  /**
   * Optional callback fired when the persisted layout was rehydrated from
   * the v1-shape legacy key. Lets the caller log telemetry without
   * involving the shell. (ppr-08 supplies the actual seed reader.)
   */
  onLegacySeed?: () => void;
  /**
   * Leaf ids advertised by the current template. When present, the
   * hydration step discards any persisted layout whose paneTree has zero
   * overlap with this set (csl-03). The stale localStorage entry is
   * cleared so the next write seeds a clean v4 tree from defaults.
   *
   * Omit (or pass an empty array) to preserve legacy behavior — useful
   * for hosts that don't have a stable pane registry yet.
   */
  knownLeafIds?: readonly string[];
}

export interface UseShellLayoutResult {
  paneOrder: string[];
  paneState: Record<string, PaneRuntimeState>;
  /** Reorder by swapping `fromId` with the slot currently held by `toId`. */
  reorderPane: (fromId: string, toId: string) => void;
  /** Set the absolute sizePct for one pane (delegates to setLeafSize). */
  setPaneSize: (id: string, sizePct: number) => void;
  /** Toggle a pane's hidden bit. The shell owns the absorber math. */
  setPaneHidden: (id: string, hidden: boolean) => void;
  /** Batch-toggle hidden on multiple leaves (column toggle). */
  setLeafIdsHidden: (leafIds: string[], hidden: boolean) => void;
  /** Reset to defaults (used by "Reset layout" preset). */
  resetLayout: () => void;
  /** Apply a preset snapshot (used by `applyPreset` in ppr-09). */
  applyLayout: (layout: PatientProfileLayout) => void;
  layoutVersion: number;
  hydrated: boolean;
  /** Set a leaf's size by id. Walks the tree, updates the matching node. */
  setLeafSize: (nodeId: string, sizePct: number) => void;
  /** Set the sizes of all children of a group (keyed by group id). */
  setGroupSizes: (groupId: string, sizes: Record<string, number>) => void;
  /**
   * Switch the active tab in a multi-pane tabs leaf (cpf-04). Identifies the
   * leaf by `groupId` (its node id in the persisted tree) and sets
   * `activeTabId = paneId` when `paneIds.includes(paneId)`. Pure metadata
   * update — does NOT bump `layoutVersion` (no rebalance, no remount).
   */
  setActiveTab: (groupId: string, paneId: string) => void;
  /** Read-only access to the persisted tree (for tree-aware consumers). */
  paneTree: PaneTreeNode;
}

export function useShellLayout(opts: UseShellLayoutOptions): UseShellLayoutResult {
  const {
    storageKey,
    defaultPaneOrder,
    defaultPaneState,
    legacyStorageKeys = EMPTY_LEGACY_STORAGE_KEYS,
    knownLeafIds,
  } = opts;
  const legacyKeysFingerprint = legacyStorageKeys.join("\0");
  const storageKeysToRead = useMemo(
    () => [storageKey, ...legacyStorageKeys],
    [storageKey, legacyKeysFingerprint],
  );
  const v4Key = v4TreeLayoutStorageKey(storageKey);

  // Memoise the key so the hydration effect only re-runs when the *set* of
  // known ids actually changes — not on every parent re-render with a fresh
  // array reference.
  const knownLeafIdsKey = (knownLeafIds ?? []).slice().sort().join("|");
  const knownLeafIdsSet = useMemo<ReadonlySet<string>>(
    () => new Set(knownLeafIds ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [knownLeafIdsKey],
  );

  const defaultTree = useMemo(
    () => flatToPaneTree({ paneOrder: defaultPaneOrder, paneState: defaultPaneState }),
    [defaultPaneOrder, defaultPaneState],
  );

  const [layout, setLayout] = useState<PatientProfileLayout>(() => ({
    version: LAYOUT_VERSION,
    paneTree: defaultTree,
  }));

  const [layoutVersion, setLayoutVersion] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const prevLayoutRef = useRef<PatientProfileLayout | null>(null);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { paneOrder, paneState } = useMemo(
    () => paneTreeToFlat(layout.paneTree),
    [layout.paneTree],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hydrated) return;
    if (writeTimerRef.current !== null) {
      clearTimeout(writeTimerRef.current);
    }
    writeTimerRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(v4Key, JSON.stringify(layout));
      } catch {
        // quota exceeded or private-browsing restriction
      }
      writeTimerRef.current = null;
    }, 200);

    return () => {
      if (writeTimerRef.current !== null) {
        clearTimeout(writeTimerRef.current);
      }
    };
  }, [v4Key, layout, hydrated]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setHydrated(true);
      return;
    }
    let validated: PatientProfileLayout | null = null;
    try {
      for (const key of storageKeysToRead) {
        const keyV4 = v4TreeLayoutStorageKey(key);
        const rawV4 = window.localStorage.getItem(keyV4);
        if (rawV4) validated = validateLayout(JSON.parse(rawV4));
        if (!validated) {
          const rawV3 = window.localStorage.getItem(key);
          if (rawV3) validated = validateLayout(JSON.parse(rawV3));
        }
        if (validated) break;
      }
      // csl-03 (2026-05-26): if the schema-valid layout has zero leaves in
      // common with the current template, treat it as stale (legacy v1
      // ids like `chart` / `body` / `rx`) and discard. Also nukes the
      // localStorage entry so the next write seeds a clean default.
      if (
        validated &&
        knownLeafIdsSet.size > 0 &&
        !isLayoutAlignedWith(validated, knownLeafIdsSet)
      ) {
        try {
          window.localStorage.removeItem(v4Key);
          for (const key of storageKeysToRead) {
            window.localStorage.removeItem(v4TreeLayoutStorageKey(key));
            window.localStorage.removeItem(key);
          }
        } catch {
          // ignore quota / access errors
        }
        if (typeof console !== "undefined") {
          console.info(
            "[useShellLayout] discarded stale persisted layout — missing one or more current-template leaf ids",
          );
        }
        validated = null;
      }
      if (validated) {
        try {
          window.localStorage.setItem(v4Key, JSON.stringify(validated));
        } catch {
          // ignore quota errors on one-time migration write
        }
      }
    } catch {
      // JSON parse failure or storage access denied
    }
    if (validated) {
      setLayout(validated);
      setLayoutVersion((v) => v + 1);
    }
    setHydrated(true);
  }, [storageKey, storageKeysToRead, v4Key, knownLeafIdsSet]);

  const setPaneTree = useCallback((updater: (prev: PaneTreeNode) => PaneTreeNode) => {
    setLayout((prev) => ({ version: LAYOUT_VERSION, paneTree: updater(prev.paneTree) }));
  }, []);

  const setLeafSize = useCallback(
    (nodeId: string, sizePct: number) => {
      if (Number.isNaN(sizePct)) return;
      setPaneTree((prev) => updateNodeSize(prev, nodeId, sizePct));
    },
    [setPaneTree],
  );

  const setGroupSizes = useCallback(
    (groupId: string, sizes: Record<string, number>) => {
      setPaneTree((prev) => updateGroupSizes(prev, groupId, sizes));
    },
    [setPaneTree],
  );

  const setActiveTab = useCallback(
    (groupId: string, paneId: string) => {
      setPaneTree((prev) => {
        const result = setActiveTabMutation(prev, groupId, paneId);
        if (!result.ok) return prev;
        return result.tree;
      });
    },
    [setPaneTree],
  );

  const setPaneSize = useCallback(
    (id: string, sizePct: number) => {
      setLeafSize(id, sizePct);
    },
    [setLeafSize],
  );

  const reorderPane = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setLayout((prev) => {
      const nextTree = reorderSiblingNodes(prev.paneTree, fromId, toId);
      if (!nextTree) {
        if (typeof console !== "undefined") {
          console.warn(
            "[useShellLayout] reorderPane: cross-group reorder ignored",
            { fromId, toId },
          );
        }
        return prev;
      }
      return { version: LAYOUT_VERSION, paneTree: nextTree };
    });
    prevLayoutRef.current = null;
    setLayoutVersion((v) => v + 1);
  }, []);

  const setPaneHidden = useCallback(
    (id: string, hidden: boolean) => {
      if (hidden) {
        setLayout((prev) => {
          prevLayoutRef.current = prev;
          return {
            version: LAYOUT_VERSION,
            paneTree: updateNodeHidden(prev.paneTree, id, true),
          };
        });
        setLayoutVersion((v) => v + 1);
        return;
      }
      const snap = prevLayoutRef.current;
      const snapFlat = snap ? paneTreeToFlat(snap.paneTree) : null;
      if (
        snap &&
        snapFlat &&
        snapFlat.paneState[id]?.hidden === false &&
        snapFlat.paneOrder.length === paneOrder.length
      ) {
        setLayout(snap);
        prevLayoutRef.current = null;
        setLayoutVersion((v) => v + 1);
        return;
      }
      setLayout((prev) => ({
        version: LAYOUT_VERSION,
        paneTree: updateNodeHidden(prev.paneTree, id, false),
      }));
      setLayoutVersion((v) => v + 1);
    },
    [paneOrder.length],
  );

  const setLeafIdsHidden = useCallback((leafIds: string[], hidden: boolean) => {
    if (leafIds.length === 0) return;
    if (hidden) {
      setLayout((prev) => {
        prevLayoutRef.current = prev;
        let tree = prev.paneTree;
        for (const id of leafIds) {
          tree = updateNodeHidden(tree, id, true);
        }
        return { version: LAYOUT_VERSION, paneTree: tree };
      });
    } else {
      setLayout((prev) => {
        let tree = prev.paneTree;
        for (const id of leafIds) {
          tree = updateNodeHidden(tree, id, false);
        }
        return { version: LAYOUT_VERSION, paneTree: tree };
      });
      prevLayoutRef.current = null;
    }
    setLayoutVersion((v) => v + 1);
  }, []);

  const resetLayout = useCallback(() => {
    setLayout({ version: LAYOUT_VERSION, paneTree: defaultTree });
    prevLayoutRef.current = null;
    setLayoutVersion((v) => v + 1);
  }, [defaultTree]);

  const applyLayout = useCallback((next: PatientProfileLayout) => {
    const validated = validateLayout(next);
    if (!validated) return;
    setLayout(validated);
    prevLayoutRef.current = null;
    setLayoutVersion((v) => v + 1);
  }, []);

  return {
    paneOrder,
    paneState,
    paneTree: layout.paneTree,
    reorderPane,
    setPaneSize,
    setPaneHidden,
    setLeafIdsHidden,
    resetLayout,
    applyLayout,
    layoutVersion,
    hydrated,
    setLeafSize,
    setGroupSizes,
    setActiveTab,
  };
}
