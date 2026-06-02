/**
 * routeCockpitDrop — pure routing tests (cv3d-03).
 */

import { describe, it, expect } from "vitest";
import { routeCockpitDrop } from "@/lib/patient-profile/v3/routeCockpitDrop";

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

  it("same-group drop on sibling tab → reorder", () => {
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
      beforePaneId: "chart",
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
});
