"use client";

import { useCallback, useMemo, useState } from "react";
import {
  deserialiseTree,
  LAYOUT_VERSION,
  serialiseTree,
  type PaneTreeNode,
} from "@/lib/patient-profile/v3/foundation";
import {
  DEFAULT_LAYOUTS,
  type DefaultLayoutEntry,
  type DefaultLayoutId,
} from "@/lib/patient-profile/v3/default-layouts";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";

function findMatchingLayoutId(tree: PaneTreeNode): DefaultLayoutId | null {
  const live = serialiseTree(tree);
  for (const entry of DEFAULT_LAYOUTS) {
    if (serialiseTree(entry.tree) === live) return entry.id;
  }
  return null;
}

export interface LayoutMenuSection {
  id: "built-in" | "my-layouts";
  title: string;
  entries: readonly DefaultLayoutEntry[];
  /** Shown when `entries` is empty (Phase 7 custom presets). */
  placeholder?: string;
}

/** Data-driven menu sections — append custom presets to `my-layouts` in Phase 7. */
export const LAYOUT_MENU_SECTIONS: readonly LayoutMenuSection[] = [
  {
    id: "built-in",
    title: "Built-in layouts",
    entries: DEFAULT_LAYOUTS,
  },
] as const;

export interface CockpitLayoutSwitcher {
  activeLayoutId: DefaultLayoutId | null;
  activeSavedPresetId: string | null;
  applyDefaultLayout: (id: DefaultLayoutId) => void;
  applySavedLayout: (paneTree: PaneTreeNode, presetId: string) => void;
}

export function useCockpitLayoutSwitcher(
  layout: CockpitV3Layout,
  savedPresets: readonly { id: string; paneTreeV3: PaneTreeNode }[] = [],
): CockpitLayoutSwitcher {
  const [lastAppliedId, setLastAppliedId] = useState<DefaultLayoutId | null>(
    null,
  );
  const [lastAppliedSavedId, setLastAppliedSavedId] = useState<string | null>(
    null,
  );

  const activeLayoutId = useMemo(() => {
    const matched = findMatchingLayoutId(layout.paneTree);
    if (matched) return matched;
    const matchesSaved = savedPresets.some(
      (p) => serialiseTree(p.paneTreeV3) === serialiseTree(layout.paneTree),
    );
    return matchesSaved ? null : lastAppliedId;
  }, [layout.paneTree, lastAppliedId, savedPresets]);

  const activeSavedPresetId = useMemo(() => {
    const live = serialiseTree(layout.paneTree);
    for (const preset of savedPresets) {
      if (serialiseTree(preset.paneTreeV3) === live) return preset.id;
    }
    return lastAppliedSavedId;
  }, [layout.paneTree, lastAppliedSavedId, savedPresets]);

  const applyDefaultLayout = useCallback(
    (id: DefaultLayoutId) => {
      const entry = DEFAULT_LAYOUTS.find((e) => e.id === id);
      if (!entry) return;
      layout.applyLayout({ version: LAYOUT_VERSION, paneTree: entry.tree });
      setLastAppliedId(id);
      setLastAppliedSavedId(null);
    },
    [layout],
  );

  const applySavedLayout = useCallback(
    (paneTree: PaneTreeNode, presetId: string) => {
      layout.applyLayout({
        version: LAYOUT_VERSION,
        paneTree: deserialiseTree(serialiseTree(paneTree)),
      });
      setLastAppliedSavedId(presetId);
      setLastAppliedId(null);
    },
    [layout],
  );

  return {
    activeLayoutId,
    activeSavedPresetId,
    applyDefaultLayout,
    applySavedLayout,
  };
}
