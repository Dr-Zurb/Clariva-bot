import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  hasBlockingOverlay,
  usePaneFocusSession,
} from "@/lib/patient-profile/v3/usePaneFocusSession";
import { getDefaultLayoutTree } from "@/lib/patient-profile/v3/default-layouts";
import {
  focusLeafInTree,
  narrowLeafInTree,
  peekLeafInTree,
  primaryLeafInTree,
} from "@/lib/patient-profile/v3/focus-leaf";
import {
  serialiseTree,
  type PaneTreeNode,
} from "@/lib/patient-profile/layout-tree";

function makeHarness(initial: PaneTreeNode) {
  let tree = initial;
  const applyTree = vi.fn(
    (next: PaneTreeNode, _opts?: { recordHistory?: boolean }) => {
      tree = next;
    },
  );
  const setPersistSuspended = vi.fn();
  return {
    getTree: () => tree,
    setTree: (next: PaneTreeNode) => {
      tree = next;
    },
    applyTree,
    setPersistSuspended,
  };
}

describe("usePaneFocusSession", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("enterSplit(full) applies focused tree; exitFocus restores exact prior", () => {
    const consult = getDefaultLayoutTree("consult");
    const harness = makeHarness(consult);
    const { result } = renderHook(() =>
      usePaneFocusSession({
        getTree: harness.getTree,
        applyTree: harness.applyTree,
        setPersistSuspended: harness.setPersistSuspended,
      }),
    );

    act(() => {
      expect(result.current.enterSplit("plan", "full")).toBe(true);
    });

    expect(result.current.isFocused).toBe(true);
    expect(result.current.focusedLeafId).toBe("plan");
    expect(result.current.ratio).toBe("full");
    expect(harness.setPersistSuspended).toHaveBeenCalledWith(true);

    const expectedFocused = focusLeafInTree(consult, "plan");
    expect(expectedFocused.ok).toBe(true);
    if (!expectedFocused.ok) return;
    expect(serialiseTree(harness.getTree())).toBe(
      serialiseTree(expectedFocused.tree),
    );

    act(() => {
      result.current.exitFocus();
    });

    expect(result.current.isFocused).toBe(false);
    expect(result.current.focusedLeafId).toBeNull();
    expect(result.current.ratio).toBeNull();
    expect(serialiseTree(harness.getTree())).toBe(serialiseTree(consult));
    expect(harness.setPersistSuspended).toHaveBeenCalledWith(false);
  });

  it("enterSplit(narrow) applies narrow tree; exit restores exact prior", () => {
    const consult = getDefaultLayoutTree("consult");
    const harness = makeHarness(consult);
    const { result } = renderHook(() =>
      usePaneFocusSession({
        getTree: harness.getTree,
        applyTree: harness.applyTree,
        setPersistSuspended: harness.setPersistSuspended,
      }),
    );

    act(() => {
      expect(result.current.enterSplit("plan", "narrow")).toBe(true);
    });

    expect(result.current.ratio).toBe("narrow");
    const expected = narrowLeafInTree(consult, "plan");
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;
    expect(serialiseTree(harness.getTree())).toBe(serialiseTree(expected.tree));

    act(() => {
      result.current.exitFocus();
    });
    expect(serialiseTree(harness.getTree())).toBe(serialiseTree(consult));
  });

  it("wide → even → narrow recomputes from original prior (CTF-D10)", () => {
    const consult = getDefaultLayoutTree("consult");
    const harness = makeHarness(consult);
    const { result } = renderHook(() =>
      usePaneFocusSession({
        getTree: harness.getTree,
        applyTree: harness.applyTree,
        setPersistSuspended: harness.setPersistSuspended,
      }),
    );

    act(() => {
      result.current.enterSplit("plan", "wide");
    });

    act(() => {
      result.current.enterSplit("plan", "even");
    });
    expect(result.current.ratio).toBe("even");
    const even = peekLeafInTree(consult, "plan");
    expect(even.ok).toBe(true);
    if (!even.ok) return;
    expect(serialiseTree(harness.getTree())).toBe(serialiseTree(even.tree));

    act(() => {
      result.current.enterSplit("plan", "narrow");
    });
    expect(result.current.ratio).toBe("narrow");
    const narrow = narrowLeafInTree(consult, "plan");
    expect(narrow.ok).toBe(true);
    if (!narrow.ok) return;
    expect(serialiseTree(harness.getTree())).toBe(serialiseTree(narrow.tree));

    expect(
      harness.setPersistSuspended.mock.calls.filter((c) => c[0] === true),
    ).toHaveLength(1);
  });

  it("full after wide restores Full transform from prior", () => {
    const consult = getDefaultLayoutTree("consult");
    const harness = makeHarness(consult);
    const { result } = renderHook(() =>
      usePaneFocusSession({
        getTree: harness.getTree,
        applyTree: harness.applyTree,
        setPersistSuspended: harness.setPersistSuspended,
      }),
    );

    act(() => {
      result.current.enterSplit("plan", "wide");
    });
    act(() => {
      result.current.enterSplit("plan", "full");
    });

    expect(result.current.ratio).toBe("full");
    const expected = focusLeafInTree(consult, "plan");
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;
    expect(serialiseTree(harness.getTree())).toBe(serialiseTree(expected.tree));
  });

  it("legacy enterPrimary / enterPeek aliases map to wide / even", () => {
    const consult = getDefaultLayoutTree("consult");
    const harness = makeHarness(consult);
    const { result } = renderHook(() =>
      usePaneFocusSession({
        getTree: harness.getTree,
        applyTree: harness.applyTree,
        setPersistSuspended: harness.setPersistSuspended,
      }),
    );

    act(() => {
      expect(result.current.enterPrimary("plan")).toBe(true);
    });
    expect(result.current.ratio).toBe("wide");
    const expectedPrimary = primaryLeafInTree(consult, "plan");
    expect(expectedPrimary.ok).toBe(true);
    if (!expectedPrimary.ok) return;
    expect(serialiseTree(harness.getTree())).toBe(
      serialiseTree(expectedPrimary.tree),
    );

    act(() => {
      expect(result.current.enterPeek("plan")).toBe(true);
    });
    expect(result.current.ratio).toBe("even");
    expect(result.current.mode).toBe("even");
  });

  it("re-focuses a different leaf from the original prior", () => {
    const consult = getDefaultLayoutTree("consult");
    const harness = makeHarness(consult);
    const { result } = renderHook(() =>
      usePaneFocusSession({
        getTree: harness.getTree,
        applyTree: harness.applyTree,
        setPersistSuspended: harness.setPersistSuspended,
      }),
    );

    act(() => {
      result.current.enterFocus("plan");
    });
    act(() => {
      result.current.enterFocus("subjective");
    });

    expect(result.current.focusedLeafId).toBe("subjective");
    const expected = focusLeafInTree(consult, "subjective");
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;
    expect(serialiseTree(harness.getTree())).toBe(serialiseTree(expected.tree));
    expect(
      harness.setPersistSuspended.mock.calls.filter((c) => c[0] === true),
    ).toHaveLength(1);
  });

  it("discardFocusSession keeps current tree and clears session", () => {
    const consult = getDefaultLayoutTree("consult");
    const harness = makeHarness(consult);
    const { result } = renderHook(() =>
      usePaneFocusSession({
        getTree: harness.getTree,
        applyTree: harness.applyTree,
        setPersistSuspended: harness.setPersistSuspended,
      }),
    );

    act(() => {
      result.current.enterFocus("plan");
    });
    const focusedSerial = serialiseTree(harness.getTree());

    act(() => {
      result.current.discardFocusSession();
    });

    expect(result.current.isFocused).toBe(false);
    expect(serialiseTree(harness.getTree())).toBe(focusedSerial);
    expect(harness.setPersistSuspended).toHaveBeenLastCalledWith(false);
  });

  it("exitFocus is idempotent when not focused", () => {
    const harness = makeHarness(getDefaultLayoutTree("consult"));
    const { result } = renderHook(() =>
      usePaneFocusSession({
        getTree: harness.getTree,
        applyTree: harness.applyTree,
      }),
    );

    act(() => {
      result.current.exitFocus();
    });
    expect(harness.applyTree).not.toHaveBeenCalled();
  });

  it("toggleFocus enters then restores", () => {
    const consult = getDefaultLayoutTree("consult");
    const harness = makeHarness(consult);
    const { result } = renderHook(() =>
      usePaneFocusSession({
        getTree: harness.getTree,
        applyTree: harness.applyTree,
        setPersistSuspended: harness.setPersistSuspended,
      }),
    );

    act(() => {
      result.current.toggleFocus("assessment");
    });
    expect(result.current.isFocused).toBe(true);

    act(() => {
      result.current.toggleFocus("assessment");
    });
    expect(result.current.isFocused).toBe(false);
    expect(serialiseTree(harness.getTree())).toBe(serialiseTree(consult));
  });

  it("Esc restores when no dialog overlay is present", () => {
    const consult = getDefaultLayoutTree("consult");
    const harness = makeHarness(consult);
    const { result } = renderHook(() =>
      usePaneFocusSession({
        getTree: harness.getTree,
        applyTree: harness.applyTree,
        setPersistSuspended: harness.setPersistSuspended,
      }),
    );

    act(() => {
      result.current.enterFocus("plan");
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(result.current.isFocused).toBe(false);
    expect(serialiseTree(harness.getTree())).toBe(serialiseTree(consult));
  });

  it("Esc does not restore when a role=dialog overlay is open", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);

    const consult = getDefaultLayoutTree("consult");
    const harness = makeHarness(consult);
    const { result } = renderHook(() =>
      usePaneFocusSession({
        getTree: harness.getTree,
        applyTree: harness.applyTree,
        setPersistSuspended: harness.setPersistSuspended,
      }),
    );

    act(() => {
      result.current.enterFocus("plan");
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(result.current.isFocused).toBe(true);
    expect(hasBlockingOverlay()).toBe(true);
  });

  it("enterSplit returns false for unknown leaf", () => {
    const harness = makeHarness(getDefaultLayoutTree("consult"));
    const { result } = renderHook(() =>
      usePaneFocusSession({
        getTree: harness.getTree,
        applyTree: harness.applyTree,
      }),
    );

    act(() => {
      expect(result.current.enterSplit("ghost", "full")).toBe(false);
    });
    expect(result.current.isFocused).toBe(false);
    expect(harness.applyTree).not.toHaveBeenCalled();
  });
});

describe("useCockpitLayoutSwitcher + Focus discard", () => {
  it("applyDefaultLayout discards Focus session before applying preset", async () => {
    const { useCockpitLayoutSwitcher } = await import(
      "@/lib/patient-profile/v3/useCockpitLayoutSwitcher"
    );
    const { LAYOUT_VERSION } = await import(
      "@/lib/patient-profile/v3/foundation"
    );

    let paneTree = getDefaultLayoutTree("consult");
    const discardFocusSession = vi.fn();
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
      discardFocusSession,
    } as unknown as import("@/lib/patient-profile/v3/useCockpitV3Layout").CockpitV3Layout;

    const { result } = renderHook(() => useCockpitLayoutSwitcher(layout));

    act(() => {
      result.current.applyDefaultLayout("document");
    });

    expect(discardFocusSession).toHaveBeenCalled();
    expect(applyLayout).toHaveBeenCalledWith({
      version: LAYOUT_VERSION,
      paneTree: getDefaultLayoutTree("document"),
    });
  });
});
