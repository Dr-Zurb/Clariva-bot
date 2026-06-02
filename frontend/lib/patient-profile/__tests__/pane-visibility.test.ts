import { describe, expect, it } from "vitest";
import {
  allPaneLeavesHidden,
  collectPaneLeafIds,
  type PaneDefinition,
  type PaneRuntimeState,
} from "../types";

function column(
  id: string,
  children: PaneDefinition[],
): PaneDefinition {
  return {
    id,
    title: id,
    render: () => null,
    children,
  };
}

function leaf(id: string): PaneDefinition {
  return { id, title: id, render: () => null };
}

describe("pane visibility helpers (layout-ux-01)", () => {
  const left = column("left-column", [leaf("snapshot"), leaf("history")]);

  it("collectPaneLeafIds returns leaves depth-first", () => {
    expect(collectPaneLeafIds(left)).toEqual(["snapshot", "history"]);
  });

  it("allPaneLeavesHidden is false when any leaf is visible", () => {
    const state: Record<string, PaneRuntimeState> = {
      snapshot: { sizePct: 40, hidden: true },
      history: { sizePct: 60, hidden: false },
    };
    expect(allPaneLeavesHidden(left, state)).toBe(false);
  });

  it("allPaneLeavesHidden is true when every leaf is hidden", () => {
    const state: Record<string, PaneRuntimeState> = {
      snapshot: { sizePct: 40, hidden: true },
      history: { sizePct: 60, hidden: true },
    };
    expect(allPaneLeavesHidden(left, state)).toBe(true);
  });

  it("allPaneLeavesHidden treats leaves absent from activeLeafIds as hidden", () => {
    const state: Record<string, PaneRuntimeState> = {
      history: { sizePct: 60, hidden: false },
    };
    expect(allPaneLeavesHidden(left, state, ["history"])).toBe(false);
    expect(allPaneLeavesHidden(left, state, [])).toBe(true);
  });

  it("allPaneLeavesHidden treats a bare leaf by its own hidden flag", () => {
    const state: Record<string, PaneRuntimeState> = {
      body: { sizePct: 50, hidden: true },
    };
    expect(allPaneLeavesHidden(leaf("body"), state)).toBe(true);
  });
});
