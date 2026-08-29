import { afterEach, describe, expect, it } from "vitest";
import {
  markGrantHaltConfirm,
  markGrantHaltDone,
  rec24ConfirmMarkName,
  rec24HaltMarkName,
  rec24MeasureName,
} from "../rec24-halt-marks";

afterEach(() => {
  performance.clearMarks();
  performance.clearMeasures();
});

describe("rec-27a halt marks", () => {
  it("does not create the halt mark or the measure at confirm time", () => {
    markGrantHaltConfirm("pause");
    expect(performance.getEntriesByName(rec24ConfirmMarkName("pause"))).toHaveLength(1);
    expect(performance.getEntriesByName(rec24HaltMarkName("pause"))).toHaveLength(0);
    expect(performance.getEntriesByName(rec24MeasureName("pause"))).toHaveLength(0);
  });

  it("measures only after halt, and the duration includes the gap", async () => {
    markGrantHaltConfirm("stop");
    await new Promise((resolve) => {
      setTimeout(resolve, 15);
    });
    markGrantHaltDone("stop");
    const measures = performance.getEntriesByName(rec24MeasureName("stop"));
    expect(measures).toHaveLength(1);
    expect(measures[0]?.duration).toBeGreaterThanOrEqual(10);
  });
});
