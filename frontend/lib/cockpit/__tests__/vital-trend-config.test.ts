/**
 * Unit tests for the metric → trend-chart spec map (vitals-section · trend redesign).
 */

import { describe, expect, it } from "vitest";
import { resolveVitalTrendConfig } from "@/lib/cockpit/vital-trend-config";

describe("resolveVitalTrendConfig", () => {
  it("collapses systolic and diastolic into one shared blood-pressure chart", () => {
    const sys = resolveVitalTrendConfig("vitalsBpSystolic", "Systolic");
    const dia = resolveVitalTrendConfig("vitalsBpDiastolic", "Diastolic");

    expect(sys.title).toBe("Blood pressure");
    expect(dia.title).toBe("Blood pressure");
    expect(sys.lines.map((l) => l.metric)).toEqual([
      "vitalsBpSystolic",
      "vitalsBpDiastolic",
      "map",
    ]);
  });

  it("pairs weight with derived BMI on a dual axis plus a normal-BMI band", () => {
    const config = resolveVitalTrendConfig("vitalsWtKg", "Weight");
    expect(config.title).toBe("Weight & BMI");
    expect(config.lines.map((l) => ({ metric: l.metric, axis: l.yAxisId }))).toEqual([
      { metric: "vitalsWtKg", axis: "left" },
      { metric: "bmi", axis: "right" },
    ]);
    expect(config.bands({})).toEqual([
      { y1: 18.5, y2: 24.9, yAxisId: "right", label: "Normal BMI" },
    ]);
  });

  it("falls back to a single-line config with the registry advisory band for plain vitals", () => {
    const config = resolveVitalTrendConfig("vitalsSpo2", "SpO₂");
    expect(config.title).toBe("SpO₂");
    expect(config.lines).toHaveLength(1);
    expect(config.lines[0]?.metric).toBe("vitalsSpo2");
    // SpO₂ advisory band is 95–100 regardless of demographics.
    expect(config.bands({})).toEqual([{ y1: 95, y2: 100, label: "Reference range" }]);
  });

  it("uses a clinical title for derived metrics with no registry band", () => {
    const map = resolveVitalTrendConfig("map", "MAP");
    expect(map.title).toBe("Blood pressure");

    const bsa = resolveVitalTrendConfig("bsa", "BSA");
    expect(bsa.title).toBe("Body surface area");
    expect(bsa.bands({})).toEqual([]);
  });
});
