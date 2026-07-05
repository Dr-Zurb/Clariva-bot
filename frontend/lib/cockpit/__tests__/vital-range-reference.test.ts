import { describe, expect, it } from "vitest";
import {
  BP_ACC_AHA_ADULT_RANGES,
  resolveRegistryAdvisoryBand,
  vitalKeyHasRangeReference,
} from "@/lib/cockpit/vital-range-reference";

describe("vital-range-reference", () => {
  it("excludes block-level vitals from grid help", () => {
    expect(vitalKeyHasRangeReference("vitalsBpSystolic")).toBe(false);
    expect(vitalKeyHasRangeReference("vitalsGlucoseMgDl")).toBe(false);
  });

  it("includes tiered vitals and registry-banded vitals", () => {
    expect(vitalKeyHasRangeReference("vitalsTempC")).toBe(true);
    expect(vitalKeyHasRangeReference("vitalsSpo2")).toBe(true);
    expect(vitalKeyHasRangeReference("vitalsHr")).toBe(true);
    expect(vitalKeyHasRangeReference("vitalsWtKg")).toBe(false);
  });

  it("resolves age-aware registry bands", () => {
    const adult = resolveRegistryAdvisoryBand("vitalsHr", { ageYears: 30 });
    expect(adult).toEqual({
      label: "Pulse Rate (PR)",
      unit: "bpm",
      low: 60,
      high: 100,
    });

    const infant = resolveRegistryAdvisoryBand("vitalsHr", { ageYears: 0.5 });
    expect(infant?.low).toBe(100);
    expect(infant?.high).toBe(160);
  });

  it("exports ACC/AHA adult BP tiers", () => {
    expect(BP_ACC_AHA_ADULT_RANGES.some((row) => row.label === "Normal")).toBe(true);
    expect(BP_ACC_AHA_ADULT_RANGES.some((row) => row.label === "Hypertensive crisis")).toBe(
      true,
    );
  });
});
