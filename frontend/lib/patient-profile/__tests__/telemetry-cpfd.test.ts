/**
 * cockpit telemetry — cpfd-03 drag-drop event
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trackCockpitPaneFreedomDragDrop } from "@/lib/patient-profile/telemetry";

describe("trackCockpitPaneFreedomDragDrop (cpfd-03)", () => {
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs cockpit_pane_freedom.drag_drop with sourcePaneId, targetGroupId, zone", () => {
    const payload = {
      sourcePaneId: "history",
      targetGroupId: "snapshot",
      zone: "center" as const,
    };

    trackCockpitPaneFreedomDragDrop(payload);

    expect(console.debug).toHaveBeenCalledOnce();
    expect(console.debug).toHaveBeenCalledWith(
      "[telemetry]",
      "cockpit_pane_freedom.drag_drop",
      payload,
    );
  });

  it("fires on every call (no session dedupe — success-only is enforced at call-site)", () => {
    trackCockpitPaneFreedomDragDrop({
      sourcePaneId: "rx",
      targetGroupId: "body",
      zone: "east",
    });
    trackCockpitPaneFreedomDragDrop({
      sourcePaneId: "plan",
      targetGroupId: "__tabs_0",
      zone: "south",
    });

    expect(console.debug).toHaveBeenCalledTimes(2);
  });
});
