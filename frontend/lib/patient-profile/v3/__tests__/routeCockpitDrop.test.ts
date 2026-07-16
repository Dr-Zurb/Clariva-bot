/**
 * routeCockpitDrop — pure routing tests (cv3d-03).
 */

import { describe, it, expect } from "vitest";
import {
  resolveTabInsertPlace,
  routeCockpitDrop,
} from "@/lib/patient-profile/v3/routeCockpitDrop";

describe("routeCockpitDrop (cv3d-03)", () => {
  const active = { paneId: "rx", groupId: "group-a" };

  it("cross-group body drop → move with resolved zone", () => {
    expect(
      routeCockpitDrop(active, { groupId: "group-b" }, "east"),
    ).toEqual({
      kind: "move",
      sourcePaneId: "rx",
      targetGroupId: "group-b",
      zone: "east",
    });
  });

  it("tab-bar drop → move with center zone", () => {
    expect(
      routeCockpitDrop(active, { groupId: "group-b", overTabBar: true }, null),
    ).toEqual({
      kind: "move",
      sourcePaneId: "rx",
      targetGroupId: "group-b",
      zone: "center",
    });
  });

  it("same-group drop on sibling tab → reorder before by default", () => {
    expect(
      routeCockpitDrop(
        active,
        { groupId: "group-a", sortableTabId: "chart" },
        null,
      ),
    ).toEqual({
      kind: "reorder",
      groupId: "group-a",
      sourcePaneId: "rx",
      overPaneId: "chart",
      place: "before",
    });
  });

  it("same-group drop with tabInsertPlace after → append past that tab", () => {
    expect(
      routeCockpitDrop(
        active,
        { groupId: "group-a", sortableTabId: "chart" },
        null,
        { tabInsertPlace: "after" },
      ),
    ).toEqual({
      kind: "reorder",
      groupId: "group-a",
      sourcePaneId: "rx",
      overPaneId: "chart",
      place: "after",
    });
  });

  it("same-group drop on trailing strip end → reorder after last pane", () => {
    expect(
      routeCockpitDrop(
        active,
        {
          groupId: "group-a",
          tabStripEnd: true,
          lastPaneId: "chart",
        },
        null,
      ),
    ).toEqual({
      kind: "reorder",
      groupId: "group-a",
      sourcePaneId: "rx",
      overPaneId: "chart",
      place: "after",
    });
  });

  it("same-group drop on trailing strip end when source is last → null", () => {
    expect(
      routeCockpitDrop(
        { paneId: "chart", groupId: "group-a" },
        {
          groupId: "group-a",
          tabStripEnd: true,
          lastPaneId: "chart",
        },
        null,
      ),
    ).toBeNull();
  });

  it("cross-group drop on trailing strip end → tab-into (center)", () => {
    expect(
      routeCockpitDrop(
        active,
        {
          groupId: "group-b",
          tabStripEnd: true,
          lastPaneId: "body",
        },
        null,
      ),
    ).toEqual({
      kind: "move",
      sourcePaneId: "rx",
      targetGroupId: "group-b",
      zone: "center",
    });
  });

  it("body-centre with swap option → swap the two leaves", () => {
    expect(
      routeCockpitDrop(active, { groupId: "group-b" }, "center", {
        swap: true,
      }),
    ).toEqual({
      kind: "swap",
      sourceGroupId: "group-a",
      targetGroupId: "group-b",
      sourcePaneId: "rx",
    });
  });

  it("body-centre swap onto own group → null", () => {
    expect(
      routeCockpitDrop(active, { groupId: "group-a" }, "center", {
        swap: true,
      }),
    ).toBeNull();
  });

  it("tab-bar centre ignores swap option → stays merge (center move)", () => {
    expect(
      routeCockpitDrop(
        active,
        { groupId: "group-b", overTabBar: true },
        "center",
        { swap: true },
      ),
    ).toEqual({
      kind: "move",
      sourcePaneId: "rx",
      targetGroupId: "group-b",
      zone: "center",
    });
  });

  it("cross-group drop on another group's tab → tab-into (center)", () => {
    expect(
      routeCockpitDrop(
        active,
        { groupId: "group-b", sortableTabId: "body" },
        null,
      ),
    ).toEqual({
      kind: "move",
      sourcePaneId: "rx",
      targetGroupId: "group-b",
      zone: "center",
    });
  });

  it("same-group drop on itself → null", () => {
    expect(
      routeCockpitDrop(
        active,
        { groupId: "group-a", sortableTabId: "rx" },
        null,
      ),
    ).toBeNull();
  });

  it("missing active or over → null", () => {
    expect(routeCockpitDrop(null, { groupId: "g" }, "west")).toBeNull();
    expect(routeCockpitDrop(active, null, "west")).toBeNull();
  });

  it("horizontal gutter drop → move carrying the seam context for reorder", () => {
    expect(
      routeCockpitDrop(
        active,
        {
          gutter: true,
          parentId: "__root__",
          leftChildId: "col-left",
          rightChildId: "col-right",
          orientation: "horizontal",
        },
        null,
      ),
    ).toEqual({
      kind: "move",
      sourcePaneId: "rx",
      targetGroupId: "col-left",
      zone: "east",
      gutter: {
        parentId: "__root__",
        leftChildId: "col-left",
        rightChildId: "col-right",
        orientation: "horizontal",
      },
    });
  });

  it("vertical gutter drop → move carrying the seam context for reorder", () => {
    expect(
      routeCockpitDrop(
        active,
        {
          gutter: true,
          parentId: "col-mid",
          leftChildId: "row-top",
          rightChildId: "row-bottom",
          orientation: "vertical",
        },
        null,
      ),
    ).toEqual({
      kind: "move",
      sourcePaneId: "rx",
      targetGroupId: "row-top",
      zone: "south",
      gutter: {
        parentId: "col-mid",
        leftChildId: "row-top",
        rightChildId: "row-bottom",
        orientation: "vertical",
      },
    });
  });

  it("gutter drop whose left child is the drag source → insert fallback targets the right side", () => {
    expect(
      routeCockpitDrop(
        { paneId: "rx", groupId: "col-left" },
        {
          gutter: true,
          parentId: "__root__",
          leftChildId: "col-left",
          rightChildId: "col-right",
          orientation: "horizontal",
        },
        null,
      ),
    ).toEqual({
      kind: "move",
      sourcePaneId: "rx",
      targetGroupId: "col-right",
      zone: "west",
      gutter: {
        parentId: "__root__",
        leftChildId: "col-left",
        rightChildId: "col-right",
        orientation: "horizontal",
      },
    });
  });
});

describe("resolveTabInsertPlace", () => {
  it("left half → before; right half → after", () => {
    expect(resolveTabInsertPlace(10, 0, 100)).toBe("before");
    expect(resolveTabInsertPlace(49, 0, 100)).toBe("before");
    expect(resolveTabInsertPlace(50, 0, 100)).toBe("after");
    expect(resolveTabInsertPlace(99, 0, 100)).toBe("after");
  });

  it("zero-width tab → before (or previous)", () => {
    expect(resolveTabInsertPlace(10, 0, 0)).toBe("before");
    expect(resolveTabInsertPlace(10, 0, 0, "after")).toBe("after");
  });

  it("hysteresis keeps previous place near midpoint", () => {
    // 15% of 100 = 15px band around mid (50) → [35, 65)
    expect(resolveTabInsertPlace(48, 0, 100, "before")).toBe("before");
    expect(resolveTabInsertPlace(52, 0, 100, "before")).toBe("before");
    expect(resolveTabInsertPlace(48, 0, 100, "after")).toBe("after");
    // Outside the band → follow pointer
    expect(resolveTabInsertPlace(20, 0, 100, "after")).toBe("before");
    expect(resolveTabInsertPlace(80, 0, 100, "before")).toBe("after");
  });
});
