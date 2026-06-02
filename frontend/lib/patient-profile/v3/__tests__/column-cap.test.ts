/**
 * P5 — column-cap unit tests.
 *
 * Locks the viewport→grid budget math (columns from width, rows from height) and
 * the *balanced* auto-stack targeting the shell + layout hook depend on: once the
 * column budget is spent, palette-add spreads panes into the SHORTEST column
 * (ties → rightmost) so the grid stays even instead of growing one tall tower.
 */
import { describe, it, expect } from "vitest";
import { MAX_LEAVES, type PaneTreeNode } from "@/lib/patient-profile/v3/foundation";
import {
  MIN_COMFORTABLE_COLUMN_PX,
  MIN_COMFORTABLE_ROW_PX,
  maxComfortableColumns,
  maxRowsPerColumn,
  countVisibleRootColumns,
  findBalancedStackTarget,
} from "@/lib/patient-profile/v3/column-cap";

function leaf(id: string, hidden = false): PaneTreeNode {
  return { id, sizePct: 25, hidden, paneIds: [id], activeTabId: id };
}

function group(
  id: string,
  direction: "horizontal" | "vertical",
  children: PaneTreeNode[],
  hidden = false,
): PaneTreeNode {
  return { id, sizePct: 50, hidden, direction, children };
}

function root(children: PaneTreeNode[]): PaneTreeNode {
  return { id: "__root__", sizePct: 100, hidden: false, direction: "horizontal", children };
}

describe("maxComfortableColumns", () => {
  it("returns 1 for non-positive / non-finite widths", () => {
    expect(maxComfortableColumns(0)).toBe(1);
    expect(maxComfortableColumns(-500)).toBe(1);
    expect(maxComfortableColumns(Number.NaN)).toBe(1);
    expect(maxComfortableColumns(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("floors width / 340px and never drops below 1", () => {
    expect(MIN_COMFORTABLE_COLUMN_PX).toBe(340);
    expect(maxComfortableColumns(MIN_COMFORTABLE_COLUMN_PX - 1)).toBe(1);
    expect(maxComfortableColumns(340)).toBe(1);
    expect(maxComfortableColumns(680)).toBe(2);
    expect(maxComfortableColumns(1024)).toBe(3);
    expect(maxComfortableColumns(1366)).toBe(4);
    expect(maxComfortableColumns(1920)).toBe(5);
  });

  it("ceilings at MAX_LEAVES on ultrawide viewports", () => {
    expect(maxComfortableColumns(100_000)).toBe(MAX_LEAVES);
  });
});

describe("maxRowsPerColumn", () => {
  it("returns 1 for non-positive / non-finite heights", () => {
    expect(maxRowsPerColumn(0)).toBe(1);
    expect(maxRowsPerColumn(-300)).toBe(1);
    expect(maxRowsPerColumn(Number.NaN)).toBe(1);
    expect(maxRowsPerColumn(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("floors height / 150px and never drops below 1", () => {
    expect(MIN_COMFORTABLE_ROW_PX).toBe(150);
    expect(maxRowsPerColumn(MIN_COMFORTABLE_ROW_PX - 1)).toBe(1);
    expect(maxRowsPerColumn(150)).toBe(1);
    expect(maxRowsPerColumn(300)).toBe(2);
    expect(maxRowsPerColumn(900)).toBe(6);
  });

  it("ceilings at MAX_LEAVES on very tall viewports", () => {
    expect(maxRowsPerColumn(100_000)).toBe(MAX_LEAVES);
  });
});

describe("countVisibleRootColumns", () => {
  it("counts visible direct children of the horizontal root", () => {
    expect(countVisibleRootColumns(root([leaf("a"), leaf("b"), leaf("c")]))).toBe(3);
  });

  it("ignores hidden columns", () => {
    expect(
      countVisibleRootColumns(root([leaf("a"), leaf("b", true), leaf("c")])),
    ).toBe(2);
  });

  it("counts a nested split as a single column", () => {
    const tree = root([
      leaf("a"),
      group("__split_0", "vertical", [leaf("b"), leaf("c")]),
    ]);
    expect(countVisibleRootColumns(tree)).toBe(2);
  });

  it("treats a bare leaf root as one column (zero when hidden)", () => {
    expect(countVisibleRootColumns(leaf("solo"))).toBe(1);
    expect(countVisibleRootColumns(leaf("solo", true))).toBe(0);
  });
});

describe("findBalancedStackTarget", () => {
  it("targets the rightmost column when all columns are equally short (ties → right)", () => {
    expect(findBalancedStackTarget(root([leaf("a"), leaf("b"), leaf("c")]))).toEqual({
      leafId: "c",
      rowCount: 1,
    });
  });

  it("targets the SHORTEST column, not the last one", () => {
    // col0 is a 2-row stack, col1 is a single leaf → balance into col1.
    const tree = root([
      group("__split_0", "vertical", [leaf("a"), leaf("b")]),
      leaf("c"),
    ]);
    expect(findBalancedStackTarget(tree)).toEqual({ leafId: "c", rowCount: 1 });
  });

  it("breaks ties between equally-short columns by choosing the rightmost", () => {
    // a (1) | [b,c] (2) | d (1) → shortest are a & d; rightmost wins → d.
    const tree = root([
      leaf("a"),
      group("__split_0", "vertical", [leaf("b"), leaf("c")]),
      leaf("d"),
    ]);
    expect(findBalancedStackTarget(tree)).toEqual({ leafId: "d", rowCount: 1 });
  });

  it("descends to the last visible LEAF of the chosen stacked column (keeps the stack flat)", () => {
    // [a,b,c] (3) | [d,e] (2) → shortest is the second stack; target its last leaf.
    const tree = root([
      group("__split_0", "vertical", [leaf("a"), leaf("b"), leaf("c")]),
      group("__split_1", "vertical", [leaf("d"), leaf("e")]),
    ]);
    expect(findBalancedStackTarget(tree)).toEqual({ leafId: "e", rowCount: 2 });
  });

  it("ignores hidden columns and hidden rows within a column", () => {
    // visible cols: a (1), b (1); c hidden → tie → rightmost visible = b.
    expect(
      findBalancedStackTarget(root([leaf("a"), leaf("b"), leaf("c", true)])),
    ).toEqual({ leafId: "b", rowCount: 1 });
    // a hidden row inside a stack doesn't inflate the row count.
    const tree = root([
      leaf("x"),
      group("__split_0", "vertical", [leaf("y"), leaf("z", true)]),
    ]);
    // x (1) and the stack (1 visible row) tie → rightmost = the stack's leaf "y".
    expect(findBalancedStackTarget(tree)).toEqual({ leafId: "y", rowCount: 1 });
  });

  it("returns the leaf id for a bare leaf root, null when nothing is visible", () => {
    expect(findBalancedStackTarget(leaf("solo"))).toEqual({ leafId: "solo", rowCount: 1 });
    expect(findBalancedStackTarget(leaf("solo", true))).toBeNull();
    expect(findBalancedStackTarget(root([leaf("a", true), leaf("b", true)]))).toBeNull();
  });
});
