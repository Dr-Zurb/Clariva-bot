import { describe, expect, it } from "vitest";
import {
  CORE_MAIN_GRID_KEYS,
  CORE_SECONDARY_GRID_KEYS,
  EXTENDED_VITAL_GROUPS,
  VITAL_GROUP_LABELS,
  VITAL_GROUP_ORDER,
  VITAL_GRID_FULL_SPAN_CLASS,
  VITAL_GRID_UNIT_SPAN_CLASS,
  VITALS_CONTAINER_CLASS,
  VITALS_GRID_CLASS,
  VITAL_CLUSTER_GRID_CLASS,
  allLayoutBuckets,
  bpReadingsGridSpanClass,
  glucoseReadingsGridSpanClass,
  contextKeysForNumericVital,
  isPairedContextCategorical,
  layoutCoversRegistry,
  visibleCategoricalVitalsInGroup,
  visibleCoreMainGridKeys,
  visibleCoreSecondaryGridKeys,
  visibleStandaloneCategoricalVitalsInGroup,
  visibleVitalsInGroup,
  vitalFieldShortLabel,
  vitalGridSpan,
} from "@/lib/cockpit/vitals-group-layout";
import {
  VITAL_ORDER,
  listVitalsByGroup,
  type VitalKey,
} from "@/lib/cockpit/vitals-schema";

describe("vitals-group-layout", () => {
  it("stacks vitals grids on container width, not viewport sm", () => {
    expect(VITALS_CONTAINER_CLASS).toContain("@container/vitals");
    expect(VITALS_GRID_CLASS).toContain("@[26rem]/vitals:grid-cols-2");
    expect(VITALS_GRID_CLASS).not.toContain("sm:grid-cols-2");
    expect(VITAL_CLUSTER_GRID_CLASS).toContain("@[26rem]/vitals:grid-cols-2");
    expect(VITAL_CLUSTER_GRID_CLASS).not.toContain("sm:grid-cols-2");
  });

  it("defines labels for every clinical group", () => {
    for (const group of VITAL_GROUP_ORDER) {
      expect(VITAL_GROUP_LABELS[group].length).toBeGreaterThan(0);
    }
  });

  it("partitions every registry vital into exactly one layout bucket", () => {
    expect(layoutCoversRegistry()).toBe(true);
    const buckets = allLayoutBuckets();
    const layoutKeys = VITAL_ORDER.filter((k) => k !== "vitalsPainScore");
    expect(new Set(buckets).size).toBe(layoutKeys.length);
    expect([...buckets].sort()).toEqual([...layoutKeys].sort());
  });

  it("preserves the shipped core main-grid order", () => {
    expect(CORE_MAIN_GRID_KEYS).toEqual([
      "vitalsHr",
      "vitalsTempC",
      "vitalsSpo2",
      "vitalsWtKg",
      "vitalsRr",
      "vitalsHtCm",
    ]);
    expect(CORE_SECONDARY_GRID_KEYS).toEqual([]);
  });

  it("filters visible vitals per group", () => {
    const visible = new Set<VitalKey>(["vitalsO2FlowLMin", "vitalsFio2Pct"]);
    expect(visibleVitalsInGroup("respiratory", visible)).toEqual([
      "vitalsO2FlowLMin",
      "vitalsFio2Pct",
    ]);
    expect(visibleVitalsInGroup("respiratory", visible)).not.toContain(
      "vitalsPefrLMin",
    );
  });

  it("returns empty arrays for groups with no visible vitals", () => {
    const hidden = new Set<VitalKey>(["vitalsHr"]);
    expect(visibleVitalsInGroup("obstetric", hidden)).toEqual([]);
    expect(visibleCoreMainGridKeys(hidden)).toEqual(["vitalsHr"]);
    expect(visibleCoreSecondaryGridKeys(hidden)).toEqual([]);
  });

  it("maps display labels from the registry for core fields", () => {
    expect(vitalFieldShortLabel("vitalsHr")).toBe("Pulse Rate (PR)");
    expect(vitalFieldShortLabel("vitalsWtKg")).toBe("Weight");
    expect(vitalFieldShortLabel("vitalsO2FlowLMin")).toBe("Oxygen Flow Rate (O₂)");
  });

  it("lists extended groups excluding core and paediatric", () => {
    const extendedKeys = EXTENDED_VITAL_GROUPS.flatMap((g) =>
      listVitalsByGroup(g).map((v) => v.key),
    );
    expect(extendedKeys).not.toContain("vitalsGlucoseMgDl");
    expect(extendedKeys).toContain("vitalsGcsTotal");
    expect(extendedKeys).not.toContain("vitalsHr");
    expect(extendedKeys).not.toContain("vitalsHeadCircumferenceCm");
  });

  it("partitions categorical vitals by group", () => {
    expect(visibleCategoricalVitalsInGroup("metabolic")).toEqual([
      "vitalsGlucoseTiming",
      "vitalsGlucoseDevice",
    ]);
    expect(visibleCategoricalVitalsInGroup("core")).toEqual([
      "vitalsO2DeliveryMethod",
      "vitalsSpo2Device",
      "vitalsPulseRhythm",
      "vitalsHrSource",
      "vitalsTempSite",
      "vitalsTempDevice",
    ]);
    expect(visibleStandaloneCategoricalVitalsInGroup("core")).toEqual([]);
    expect(visibleStandaloneCategoricalVitalsInGroup("metabolic")).toEqual([]);
  });

  it("excludes pupil reactivity from standalone neuro categoricals", () => {
    expect(visibleStandaloneCategoricalVitalsInGroup("neuro")).toEqual(["vitalsAvpu"]);
  });

  it("pairs core context categoricals with parent numeric vitals", () => {
    expect(contextKeysForNumericVital("vitalsSpo2")).toEqual([
      "vitalsO2DeliveryMethod",
      "vitalsSpo2Device",
    ]);
    expect(contextKeysForNumericVital("vitalsHr")).toEqual([
      "vitalsPulseRhythm",
      "vitalsHrSource",
    ]);
    expect(contextKeysForNumericVital("vitalsTempC")).toEqual(["vitalsTempSite", "vitalsTempDevice"]);
    expect(contextKeysForNumericVital("vitalsWtKg")).toEqual([]);
    expect(isPairedContextCategorical("vitalsPulseRhythm")).toBe(true);
    expect(isPairedContextCategorical("vitalsGlucoseTiming")).toBe(true);
  });

  it("uses unit span for all vitals in the 2-column grid", () => {
    expect(vitalGridSpan("vitalsHr")).toBe(1);
    expect(vitalGridSpan("vitalsTempC")).toBe(1);
    expect(vitalGridSpan("vitalsWtKg")).toBe(1);
    expect(vitalGridSpan("vitalsHtCm")).toBe(1);
    expect(vitalGridSpan("vitalsRr")).toBe(1);
  });

  it("spans BP full width only when multiple readings exist", () => {
    expect(bpReadingsGridSpanClass(1)).toBe(VITAL_GRID_UNIT_SPAN_CLASS);
    expect(bpReadingsGridSpanClass(2)).toBe(VITAL_GRID_FULL_SPAN_CLASS);
    expect(bpReadingsGridSpanClass(3)).toBe(VITAL_GRID_FULL_SPAN_CLASS);
  });

  it("spans glucose full width only when multiple readings exist", () => {
    expect(glucoseReadingsGridSpanClass(1)).toBe(VITAL_GRID_UNIT_SPAN_CLASS);
    expect(glucoseReadingsGridSpanClass(2)).toBe(VITAL_GRID_FULL_SPAN_CLASS);
    expect(glucoseReadingsGridSpanClass(3)).toBe(VITAL_GRID_FULL_SPAN_CLASS);
  });
});
