/**
 * Shell layout mutation wiring (clpm-05) — verifies DesktopShell's mutate
 * pipeline delegates to layout-tree-mutations and surfaces cap-reached.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { splitLeaf, countLeaves } from "@/lib/patient-profile/layout-tree-mutations";
import { layoutUxToast } from "@/lib/patient-profile/layout-ux-toast";
import { trackCockpitV2RLayoutUxTreeMutation } from "@/lib/patient-profile/telemetry";
import type { LayoutNode } from "@/lib/patient-profile/types";
vi.mock("@/lib/patient-profile/layout-ux-toast", () => ({
  layoutUxToast: { error: vi.fn() },
}));

vi.mock("@/lib/patient-profile/telemetry", () => ({
  trackCockpitV2RLayoutUxTreeMutation: vi.fn(),
}));

/** Mirrors DesktopShell's mutate helper (Shell.tsx). */
function shellMutate(
  current: LayoutNode,
  op: string,
  paneId: string,
  run: (tree: LayoutNode) => ReturnType<typeof splitLeaf>,
  onApplied: (tree: LayoutNode) => void,
) {
  const result = run(current);
  if (!result.ok) {
    if (result.reason === "cap-reached") {
      layoutUxToast.error(
        "Layout limit reached (10 sub-panes max). Merge or hide a pane to add more.",
      );
    }
    return;
  }
  onApplied(result.tree);
  trackCockpitV2RLayoutUxTreeMutation({ op, paneId });
}

function hsplit(children: LayoutNode[], sizes: number[]): LayoutNode {
  return { kind: "split", direction: "horizontal", children, sizes };
}

function pane(paneId: string): LayoutNode {
  return { kind: "pane", paneId };
}

describe("Shell layout mutation wiring", () => {
  const onApplied = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies split and tracks telemetry on success", () => {
    const tree = hsplit([pane("a"), pane("b")], [50, 50]);
    shellMutate(
      tree,
      "split-horizontal",
      "a",
      (t) => splitLeaf(t, "a", "horizontal", "custom-x"),
      onApplied,
    );
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(countLeaves(onApplied.mock.calls[0][0])).toBe(3);
    expect(trackCockpitV2RLayoutUxTreeMutation).toHaveBeenCalledWith({
      op: "split-horizontal",
      paneId: "a",
    });
  });

  it("toasts on cap-reached without applying", () => {
    let capped = hsplit([pane("a"), pane("b")], [50, 50]);
    for (let i = 0; i < 8; i++) {
      const r = splitLeaf(capped, "a", "horizontal", `custom-${i}`);
      if (r.ok) capped = r.tree;
    }
    expect(countLeaves(capped)).toBe(10);

    shellMutate(
      capped,
      "split-horizontal",
      "a",
      (t) => splitLeaf(t, "a", "horizontal", "custom-overflow"),
      onApplied,
    );
    expect(onApplied).not.toHaveBeenCalled();
    expect(layoutUxToast.error).toHaveBeenCalledWith(
      expect.stringContaining("Layout limit reached"),
    );
  });
});
