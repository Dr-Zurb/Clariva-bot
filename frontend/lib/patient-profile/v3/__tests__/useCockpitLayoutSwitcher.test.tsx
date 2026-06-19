import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  getDefaultLayoutTree,
  type DefaultLayoutId,
} from "@/lib/patient-profile/v3/default-layouts";
import { useCockpitLayoutSwitcher } from "@/lib/patient-profile/v3/useCockpitLayoutSwitcher";
import {
  LAYOUT_VERSION,
  serialiseTree,
  type PaneTreeNode,
} from "@/lib/patient-profile/v3/foundation";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";

function makeLayout(initial: PaneTreeNode) {
  let paneTree = initial;
  const applyLayout = vi.fn(
    (next: { version: number; paneTree: PaneTreeNode }) => {
      paneTree = next.paneTree;
    },
  );
  const layout = {
    get paneTree() {
      return paneTree;
    },
    applyLayout,
    paneState: {},
    addPane: vi.fn(),
    removePane: vi.fn(),
    resetLayout: vi.fn(),
    undo: vi.fn(),
    canUndo: false,
    redo: vi.fn(),
    canRedo: false,
  };
  return layout as unknown as CockpitV3Layout & {
    applyLayout: ReturnType<typeof vi.fn>;
  };
}

describe("useCockpitLayoutSwitcher (cv3l-02)", () => {
  it("applyDefaultLayout applies preset via shell applyLayout", () => {
    const read = getDefaultLayoutTree("read");
    const custom: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      paneIds: ["a"],
      activeTabId: "a",
    };
    const layout = makeLayout(custom);

    const { result } = renderHook(() => useCockpitLayoutSwitcher(layout));

    act(() => {
      result.current.applyDefaultLayout("read");
    });

    expect(layout.applyLayout).toHaveBeenCalledWith({
      version: LAYOUT_VERSION,
      paneTree: read,
    });
    expect(result.current.activeLayoutId).toBe("read");
  });

  it("detects active layout when live tree matches a built-in", () => {
    const consult = getDefaultLayoutTree("consult");
    const layout = makeLayout(consult);
    const { result } = renderHook(() => useCockpitLayoutSwitcher(layout));
    expect(result.current.activeLayoutId).toBe("consult");
    expect(serialiseTree(consult)).toBe(
      serialiseTree(getDefaultLayoutTree("consult")),
    );
  });

  it("uses lastAppliedId when live tree no longer matches a preset", () => {
    const layout = makeLayout(getDefaultLayoutTree("consult"));
    const { result, rerender } = renderHook(() =>
      useCockpitLayoutSwitcher(layout),
    );

    act(() => {
      result.current.applyDefaultLayout("read");
    });
    expect(result.current.activeLayoutId).toBe("read");

    const custom: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      paneIds: ["custom"],
      activeTabId: "custom",
    };
    act(() => {
      layout.applyLayout({ version: LAYOUT_VERSION, paneTree: custom });
    });
    rerender();

    expect(result.current.activeLayoutId).toBe("read");
  });
});
