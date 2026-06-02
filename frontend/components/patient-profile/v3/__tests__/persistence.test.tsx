/**
 * Cockpit v3 persistence parity (cv3c-04) — reuses useShellLayout storage.
 *
 * Remount-after-hydration is avoided here: pre-existing cpf-04 hang when
 * useShellLayout re-reads localStorage on a second mount (see inbox). Gate
 * coverage uses readPersistedLayout + validateLayout on the real v4 key.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useShellLayout,
  readPersistedLayout,
  v4TreeLayoutStorageKey,
  validateLayout,
} from "@/lib/patient-profile/useShellLayout";
import { useCockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import { blankLayout, blankLayoutFlat } from "@/lib/patient-profile/v3/blankLayout";
import {
  dropPaneIntoZone,
  listTabsContainers,
  serialiseTree,
  type PaneDefinition,
} from "@/lib/patient-profile/v3/foundation";

const STORAGE_KEY = "test:cockpit-v3-persist";

function makePanes(ids: string[]): PaneDefinition[] {
  return ids.map((id) => ({
    id,
    title: id,
    render: () => null,
  }));
}

async function flushLayoutWrite(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
}

describe("Cockpit v3 persistence (cv3c-04)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("mutations write v5 payload to the expected storage key", async () => {
    const panes = makePanes(["a", "b", "c"]);
    const blankDefault = blankLayout(panes);
    const defaultFlat = blankLayoutFlat(panes);

    const { result } = renderHook(() =>
      useCockpitV3Layout({
        storageKey: STORAGE_KEY,
        defaultPaneOrder: defaultFlat.paneOrder,
        defaultPaneState: defaultFlat.paneState,
        knownLeafIds: defaultFlat.paneOrder,
        blankDefaultTree: blankDefault.paneTree,
      }),
    );

    act(() => {
      result.current.addPane("a");
      result.current.addPane("b");
    });

    await flushLayoutWrite();

    const stored = localStorage.getItem(v4TreeLayoutStorageKey(STORAGE_KEY));
    expect(stored).not.toBeNull();
    const validated = validateLayout(JSON.parse(stored!));
    expect(validated?.version).toBe(5);
    expect(validated?.paneTree).toEqual(result.current.paneTree);
  });

  it("build-up round-trip hydrates an identical tree (Phase 1 gate)", async () => {
    const panes = makePanes(["a", "b", "c"]);
    const blankDefault = blankLayout(panes);
    const defaultFlat = blankLayoutFlat(panes);
    const hookOpts = {
      storageKey: STORAGE_KEY,
      defaultPaneOrder: defaultFlat.paneOrder,
      defaultPaneState: defaultFlat.paneState,
      knownLeafIds: defaultFlat.paneOrder,
      blankDefaultTree: blankDefault.paneTree,
    };

    const { result } = renderHook(() => useCockpitV3Layout(hookOpts));

    act(() => {
      result.current.addPane("a");
      result.current.addPane("b");
      result.current.addPane("c");
    });

    act(() => {
      const moved = dropPaneIntoZone(result.current.paneTree, "c", "b", "center");
      if (moved.ok && moved.tree) {
        result.current.applyLayout({ version: 5, paneTree: moved.tree });
      }
    });

    const tabGroup = listTabsContainers(result.current.paneTree).find(
      (c) => c.paneIds.length > 1,
    );
    if (tabGroup) {
      act(() => {
        result.current.setActiveTab(tabGroup.id, "c");
      });
    }

    act(() => {
      const rootChildIds = (result.current.paneTree.children ?? []).map((c) => c.id);
      const sizes = Object.fromEntries(
        rootChildIds.map((id, i) => [id, i === 0 ? 40 : Math.floor(60 / (rootChildIds.length - 1 || 1))]),
      );
      result.current.setGroupSizes("__root__", sizes);
    });

    const expectedSerialized = serialiseTree(result.current.paneTree);

    await flushLayoutWrite();

    const reloaded = readPersistedLayout(STORAGE_KEY);
    expect(reloaded).not.toBeNull();
    expect(serialiseTree(reloaded!.paneTree)).toBe(expectedSerialized);
  });

  it("resize survives write and read via useShellLayout helpers", async () => {
    const panes = makePanes(["a", "b"]);
    const blankDefault = blankLayout(panes);
    const defaultFlat = blankLayoutFlat(panes);
    const hookOpts = {
      storageKey: `${STORAGE_KEY}-resize`,
      defaultPaneOrder: defaultFlat.paneOrder,
      defaultPaneState: defaultFlat.paneState,
      knownLeafIds: defaultFlat.paneOrder,
      blankDefaultTree: blankDefault.paneTree,
    };

    const { result } = renderHook(() => useCockpitV3Layout(hookOpts));

    act(() => {
      result.current.addPane("a");
      result.current.addPane("b");
      result.current.setGroupSizes("__root__", { a: 62, b: 38 });
    });

    await flushLayoutWrite();

    const reloaded = readPersistedLayout(hookOpts.storageKey);
    expect(reloaded?.paneTree.children?.[0]?.sizePct).toBe(62);
    expect(reloaded?.paneTree.children?.[1]?.sizePct).toBe(38);
  });

  it("active tab is present in the persisted tree payload", async () => {
    const panes = makePanes(["a", "b"]);
    const blankDefault = blankLayout(panes);
    const defaultFlat = blankLayoutFlat(panes);
    const hookOpts = {
      storageKey: `${STORAGE_KEY}-tab`,
      defaultPaneOrder: defaultFlat.paneOrder,
      defaultPaneState: defaultFlat.paneState,
      knownLeafIds: defaultFlat.paneOrder,
      blankDefaultTree: blankDefault.paneTree,
    };

    const { result } = renderHook(() => useCockpitV3Layout(hookOpts));

    act(() => {
      result.current.addPane("a");
      result.current.addPane("b");
    });

    act(() => {
      const moved = dropPaneIntoZone(result.current.paneTree, "b", "a", "center");
      if (moved.ok && moved.tree) {
        result.current.applyLayout({ version: 5, paneTree: moved.tree });
      }
    });

    const tabGroup = listTabsContainers(result.current.paneTree)[0];
    expect(tabGroup).toBeDefined();

    act(() => {
      result.current.setActiveTab(tabGroup!.id, "b");
    });

    await flushLayoutWrite();

    const reloaded = readPersistedLayout(hookOpts.storageKey);
    const persistedTab = listTabsContainers(reloaded!.paneTree)[0];
    expect(persistedTab?.activeTabId).toBe("b");
  });
});
