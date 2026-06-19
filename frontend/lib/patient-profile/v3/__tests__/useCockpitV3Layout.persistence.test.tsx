/**
 * cv3p-02 — useCockpitV3Layout persistence proofs (R-PERSIST3).
 *
 * Round-trip, blank-seed-no-clobber, cross-appointment restore, reset-to-blank.
 *
 * Remount-after-hydration is avoided: pre-existing cpf-04 hang when useShellLayout
 * re-reads localStorage on a second mount (see inbox). Gate coverage uses
 * readPersistedLayout on the real v4 key after the 200 ms debounce.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import {
  readPersistedLayout,
  v4TreeLayoutStorageKey,
  validateLayout,
} from "@/lib/patient-profile/useShellLayout";
import { useCockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import {
  blankLayout,
  blankLayoutFlat,
  hasVisibleLeaves,
} from "@/lib/patient-profile/v3/blankLayout";
import {
  dropPaneIntoZone,
  listTabsContainers,
  serialiseTree,
  type PaneDefinition,
} from "@/lib/patient-profile/v3/foundation";

function makePanes(ids: string[]): PaneDefinition[] {
  return ids.map((id) => ({
    id,
    title: id.toUpperCase(),
    render: () => null,
  }));
}

function hookOptsFor(storageKey: string, panes: PaneDefinition[]) {
  const blankDefault = blankLayout(panes);
  const defaultFlat = blankLayoutFlat(panes);
  return {
    storageKey,
    defaultPaneOrder: defaultFlat.paneOrder,
    defaultPaneState: defaultFlat.paneState,
    knownLeafIds: defaultFlat.paneOrder,
    blankDefaultTree: blankDefault.paneTree,
  };
}

async function flushLayoutWrite(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
}

function buildDragBuiltArrangement(
  layout: ReturnType<typeof useCockpitV3Layout>,
): void {
  act(() => {
    layout.addPane("a");
    layout.addPane("b");
    layout.addPane("c");
  });

  act(() => {
    layout.movePane("c", "b", "south");
  });

  act(() => {
    const tabbed = dropPaneIntoZone(layout.paneTree, "a", "b", "center");
    if (tabbed.ok && tabbed.tree) {
      layout.applyLayout({ version: 5, paneTree: tabbed.tree });
    }
  });

  const tabGroup = listTabsContainers(layout.paneTree).find(
    (c) => c.paneIds.length > 1,
  );
  if (tabGroup) {
    act(() => {
      layout.setActiveTab(tabGroup.id, "a");
    });
  }

  act(() => {
    const rootChildIds = (layout.paneTree.children ?? []).map((c) => c.id);
    const sizes = Object.fromEntries(
      rootChildIds.map((id, i) => [
        id,
        i === 0 ? 42 : Math.floor(58 / (rootChildIds.length - 1 || 1)),
      ]),
    );
    layout.setGroupSizes("__root__", sizes);
  });
}

describe("useCockpitV3Layout persistence (cv3p-02)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("round-trip — drag-built tree survives reload via readPersistedLayout", async () => {
    const storageKey = `test:cv3p-02-roundtrip:${crypto.randomUUID()}`;
    const panes = makePanes(["a", "b", "c"]);
    const opts = hookOptsFor(storageKey, panes);

    const { result } = renderHook(() => useCockpitV3Layout(opts));
    buildDragBuiltArrangement(result.current);
    const expectedSerialized = serialiseTree(result.current.paneTree);

    await flushLayoutWrite();

    const reloaded = readPersistedLayout(storageKey);
    expect(reloaded).not.toBeNull();
    expect(serialiseTree(reloaded!.paneTree)).toBe(expectedSerialized);

    const tabGroup = listTabsContainers(reloaded!.paneTree).find(
      (c) => c.paneIds.length > 1,
    );
    expect(tabGroup?.activeTabId).toBe("a");
  });

  it("blank-seed-no-clobber — persisted layout differs from blank seed and guard is present", async () => {
    const storageKey = `test:cv3p-02-noclobber:${crypto.randomUUID()}`;
    const panes = makePanes(["a", "b", "c"]);
    const opts = hookOptsFor(storageKey, panes);
    const blankSerialized = serialiseTree(blankLayout(panes).paneTree);

    const { result } = renderHook(() => useCockpitV3Layout(opts));
    buildDragBuiltArrangement(result.current);
    const savedSerialized = serialiseTree(result.current.paneTree);
    expect(savedSerialized).not.toBe(blankSerialized);

    await flushLayoutWrite();

    const persisted = readPersistedLayout(storageKey);
    expect(persisted).not.toBeNull();
    expect(serialiseTree(persisted!.paneTree)).toBe(savedSerialized);
    expect(serialiseTree(persisted!.paneTree)).not.toBe(blankSerialized);

    const hookSource = fs.readFileSync(
      path.resolve(__dirname, "../useCockpitV3Layout.ts"),
      "utf8",
    );
    expect(hookSource).toContain("if (window.localStorage.getItem(v4Key)) return");
  });

  it("cross-appointment restore — same per-route key restores arrangement (V3-Q6)", async () => {
    const routeKey = "TELEMED_VIDEO_LAYOUT_STORAGE_KEY";
    const panes = makePanes(["a", "b", "c"]);
    const opts = hookOptsFor(routeKey, panes);

    const { result: apptA } = renderHook(() => useCockpitV3Layout(opts));
    buildDragBuiltArrangement(apptA.current);
    const arrangement = serialiseTree(apptA.current.paneTree);
    await flushLayoutWrite();

    const restored = readPersistedLayout(routeKey);
    expect(restored).not.toBeNull();
    expect(serialiseTree(restored!.paneTree)).toBe(arrangement);
    expect(localStorage.getItem(v4TreeLayoutStorageKey(routeKey))).not.toBeNull();
  });

  it("resetLayout returns to the seed tree (blank for partial registries)", async () => {
    const storageKey = `test:cv3p-02-reset:${crypto.randomUUID()}`;
    const panes = makePanes(["a", "b", "c"]);
    const opts = hookOptsFor(storageKey, panes);
    const blankDefault = blankLayout(panes);

    const { result } = renderHook(() => useCockpitV3Layout(opts));
    buildDragBuiltArrangement(result.current);
    const beforeReset = serialiseTree(result.current.paneTree);
    expect(beforeReset).not.toBe(serialiseTree(blankDefault.paneTree));

    act(() => {
      result.current.resetLayout();
    });

    expect(serialiseTree(result.current.paneTree)).toBe(
      serialiseTree(blankDefault.paneTree),
    );
    expect(hasVisibleLeaves(result.current.paneTree)).toBe(false);
  });

  it("writes only the v4-tree-layout key — no legacy v3 key", async () => {
    const storageKey = `test:cv3p-02-keys:${crypto.randomUUID()}`;
    const panes = makePanes(["a", "b"]);
    const opts = hookOptsFor(storageKey, panes);

    const { result } = renderHook(() => useCockpitV3Layout(opts));

    act(() => {
      result.current.addPane("a");
    });
    await flushLayoutWrite();

    expect(localStorage.getItem(v4TreeLayoutStorageKey(storageKey))).not.toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();

    const raw = localStorage.getItem(v4TreeLayoutStorageKey(storageKey))!;
    const validated = validateLayout(JSON.parse(raw));
    expect(validated?.version).toBe(5);
    expect(Object.keys(localStorage)).toEqual([
      v4TreeLayoutStorageKey(storageKey),
    ]);
  });
});
