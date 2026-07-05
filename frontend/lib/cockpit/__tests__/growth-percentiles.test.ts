import { describe, expect, it } from "vitest";
import {
  ageInMonthsAtDate,
  buildGrowthChartRows,
  canShowGrowthChart,
  getGrowthPercentileBandsAtAge,
  projectMeasurementsByAge,
  resolveGrowthSex,
} from "@/lib/cockpit/growth-percentiles";
import { GROWTH_REFERENCE_VERSION } from "@/lib/cockpit/growth-reference/who-iap-v1";
import type { VitalTrendPoint } from "@/lib/cockpit/vitals-trends";

const DOB = "2024-01-01";

describe("growth reference accessor (obj-28)", () => {
  it("exposes a versioned bundled dataset", () => {
    expect(GROWTH_REFERENCE_VERSION).toBe("who-iap-v1");
  });

  it("returns interpolated percentile bands between checkpoints", () => {
    const bands = getGrowthPercentileBandsAtAge("weight_kg", "male", 4.5);
    expect(bands).not.toBeNull();
    expect(bands!.p3).toBeLessThan(bands!.p50);
    expect(bands!.p50).toBeLessThan(bands!.p97);
  });

  it("resolveGrowthSex accepts male/female and rejects other/unknown", () => {
    expect(resolveGrowthSex("male")).toBe("male");
    expect(resolveGrowthSex("Female")).toBe("female");
    expect(resolveGrowthSex("other")).toBeNull();
    expect(resolveGrowthSex(null)).toBeNull();
  });
});

describe("age-at-visit derivation (obj-28)", () => {
  it("computes fractional age in months", () => {
    const months = ageInMonthsAtDate(DOB, "2024-07-01T10:00:00.000Z");
    expect(months).not.toBeNull();
    expect(months!).toBeGreaterThan(5.5);
    expect(months!).toBeLessThan(6.5);
  });

  it("returns null for invalid or pre-birth visits", () => {
    expect(ageInMonthsAtDate(DOB, "2023-12-01T10:00:00.000Z")).toBeNull();
    expect(ageInMonthsAtDate("invalid", "2024-07-01T10:00:00.000Z")).toBeNull();
  });

  it("projects visit points to age-indexed measurements", () => {
    const points: VitalTrendPoint[] = [
      { value: 7.5, at: "2024-07-01T10:00:00.000Z" },
      { value: 8.0, at: "2024-10-01T10:00:00.000Z" },
    ];
    const projected = projectMeasurementsByAge(DOB, points);
    expect(projected).toHaveLength(2);
    expect(projected[0].value).toBe(7.5);
    expect(projected[1].value).toBe(8.0);
  });
});

describe("buildGrowthChartRows (obj-28)", () => {
  it("includes patient values and percentile bands on shared age rows", () => {
    const rows = buildGrowthChartRows("weight_kg", "male", DOB, [
      { value: 7.8, at: "2024-07-01T10:00:00.000Z" },
    ]);
    const patientRow = rows.find((r) => r.patient === 7.8);
    expect(patientRow).toBeDefined();
    expect(patientRow!.p50).toBeDefined();
    expect(patientRow!.p3!).toBeLessThan(patientRow!.p50!);
    expect(patientRow!.p97!).toBeGreaterThan(patientRow!.p50!);
  });
});

describe("canShowGrowthChart (obj-28)", () => {
  it("requires DOB and male/female sex", () => {
    expect(canShowGrowthChart(DOB, "male")).toBe(true);
    expect(canShowGrowthChart(DOB, "female")).toBe(true);
    expect(canShowGrowthChart(null, "male")).toBe(false);
    expect(canShowGrowthChart(DOB, "other")).toBe(false);
    expect(canShowGrowthChart("", "female")).toBe(false);
  });
});
