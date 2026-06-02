/**
 * cockpit telemetry — cpfc Phase 3 events
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  trackCockpitPaneFreedomCustomizeToggled,
  trackCockpitPaneFreedomPresetCrud,
  trackCockpitPaneFreedomLayoutShape,
} from "@/lib/patient-profile/telemetry";

describe("cockpit_pane_freedom telemetry (cpfc)", () => {
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("customize_toggled logs enabled + source on every toggle", () => {
    trackCockpitPaneFreedomCustomizeToggled({ enabled: true, source: "button" });
    trackCockpitPaneFreedomCustomizeToggled({ enabled: false, source: "hotkey" });

    expect(console.debug).toHaveBeenCalledTimes(2);
    expect(console.debug).toHaveBeenNthCalledWith(
      1,
      "[telemetry]",
      "cockpit_pane_freedom.customize_toggled",
      { enabled: true, source: "button" },
    );
    expect(console.debug).toHaveBeenNthCalledWith(
      2,
      "[telemetry]",
      "cockpit_pane_freedom.customize_toggled",
      { enabled: false, source: "hotkey" },
    );
  });

  it("preset_crud logs op + presetCount on rename and delete", () => {
    trackCockpitPaneFreedomPresetCrud({ op: "rename", presetCount: 3 });
    trackCockpitPaneFreedomPresetCrud({ op: "delete", presetCount: 2 });

    expect(console.debug).toHaveBeenCalledTimes(2);
    expect(console.debug).toHaveBeenCalledWith(
      "[telemetry]",
      "cockpit_pane_freedom.preset_crud",
      { op: "rename", presetCount: 3 },
    );
    expect(console.debug).toHaveBeenCalledWith(
      "[telemetry]",
      "cockpit_pane_freedom.preset_crud",
      { op: "delete", presetCount: 2 },
    );
  });

  it("layout_shape logs leafCount, tabContainers, maxRootSiblings on customize-off", () => {
    const payload = {
      leafCount: 6,
      tabContainers: 1,
      maxRootSiblings: 6,
    };

    trackCockpitPaneFreedomLayoutShape(payload);

    expect(console.debug).toHaveBeenCalledOnce();
    expect(console.debug).toHaveBeenCalledWith(
      "[telemetry]",
      "cockpit_pane_freedom.layout_shape",
      payload,
    );
  });
});
