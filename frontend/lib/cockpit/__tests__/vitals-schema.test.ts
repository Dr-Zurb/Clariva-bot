import { describe, it, expect } from "vitest";
import {
  VITALS_REGISTRY,
  VITAL_ORDER,
  listVitals,
  listVitalsByGroup,
  resolveVital,
  vitalsByStorage,
  type ColumnVitalKey,
  type RangeContext,
  type VitalGroup,
  type VitalKey,
} from "@/lib/cockpit/vitals-schema";
import type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";

// Shipped column keys must remain real RxFormFields keys until vit-04 wires json vitals.
const _columnKeyCheck: Record<ColumnVitalKey, keyof RxFormFields> = {
  vitalsBpSystolic: "vitalsBpSystolic",
  vitalsBpDiastolic: "vitalsBpDiastolic",
  vitalsHr: "vitalsHr",
  vitalsRr: "vitalsRr",
  vitalsTempC: "vitalsTempC",
  vitalsSpo2: "vitalsSpo2",
  vitalsWtKg: "vitalsWtKg",
  vitalsHtCm: "vitalsHtCm",
  vitalsPainScore: "vitalsPainScore",
  vitalsGlucoseMgDl: "vitalsGlucoseMgDl",
  vitalsGcsTotal: "vitalsGcsTotal",
  vitalsHeadCircumferenceCm: "vitalsHeadCircumferenceCm",
  vitalsMuacCm: "vitalsMuacCm",
  vitalsWaistCm: "vitalsWaistCm",
};
void _columnKeyCheck;

const COLUMN_KEYS: ColumnVitalKey[] = [
  "vitalsBpSystolic",
  "vitalsBpDiastolic",
  "vitalsHr",
  "vitalsRr",
  "vitalsTempC",
  "vitalsSpo2",
  "vitalsWtKg",
  "vitalsHtCm",
  "vitalsPainScore",
  "vitalsGlucoseMgDl",
  "vitalsGcsTotal",
  "vitalsHeadCircumferenceCm",
  "vitalsMuacCm",
  "vitalsWaistCm",
];

const JSON_KEYS: VitalKey[] = [
  "vitalsO2FlowLMin",
  "vitalsFio2Pct",
  "vitalsPefrLMin",
  "vitalsBloodKetonesMmolL",
  "vitalsHipCm",
  "vitalsGcsE",
  "vitalsGcsV",
  "vitalsGcsM",
  "vitalsPupilSizeLeftMm",
  "vitalsPupilSizeRightMm",
  "vitalsCapillaryRefillS",
  "vitalsFetalHeartRateBpm",
  "vitalsFundalHeightCm",
];

const ALL_KEYS: VitalKey[] = [...COLUMN_KEYS, ...JSON_KEYS];

const SAMPLE_CONTEXTS: RangeContext[] = [
  {},
  { ageYears: null, sex: null },
  { ageYears: 0.5 },
  { ageYears: 2 },
  { ageYears: 4 },
  { ageYears: 8 },
  { ageYears: 20, sex: "male" },
  { ageYears: 40, sex: "female" },
];

describe("vitals-schema registry", () => {
  it("covers the full catalog with no duplicates", () => {
    expect(VITAL_ORDER).toEqual(ALL_KEYS);
    expect(new Set(VITAL_ORDER).size).toBe(VITAL_ORDER.length);
    expect(listVitals()).toBe(VITALS_REGISTRY);
    expect(VITALS_REGISTRY).toHaveLength(27);
  });

  it("keeps the original 14 column keys first and storage: column", () => {
    expect(VITAL_ORDER.slice(0, 14)).toEqual(COLUMN_KEYS);
    for (const key of COLUMN_KEYS) {
      expect(resolveVital(key).storage).toBe("column");
    }
  });

  it("declares group + storage on every registry entry", () => {
    for (const def of VITALS_REGISTRY) {
      expect(def.group).toBeTruthy();
      expect(["core", "respiratory", "metabolic", "neuro", "paediatric", "obstetric"]).toContain(
        def.group,
      );
      expect(["column", "json"]).toContain(def.storage);
    }
  });

  it("partitions vitals by group and storage via helpers", () => {
    const groups: VitalGroup[] = [
      "core",
      "respiratory",
      "metabolic",
      "neuro",
      "paediatric",
      "obstetric",
    ];
    const byGroup = groups.flatMap((g) => listVitalsByGroup(g).map((v) => v.key));
    expect(new Set(byGroup).size).toBe(VITALS_REGISTRY.length);
    expect(byGroup.sort()).toEqual([...ALL_KEYS].sort());

    const column = vitalsByStorage("column").map((v) => v.key);
    const json = vitalsByStorage("json").map((v) => v.key);
    expect(column).toEqual(COLUMN_KEYS);
    expect(json).toEqual(JSON_KEYS);
    expect(column.length + json.length).toBe(VITALS_REGISTRY.length);
  });

  it("resolves every key with a matching definition", () => {
    for (const key of ALL_KEYS) {
      const def = resolveVital(key);
      expect(def.key).toBe(key);
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.canonicalUnit.length).toBeGreaterThan(0);
    }
  });

  it("throws on an unknown key", () => {
    expect(() => resolveVital("nope" as VitalKey)).toThrow(/Unknown vital key/);
  });

  it("lists the canonical unit first in displayUnits", () => {
    for (const def of VITALS_REGISTRY) {
      expect(def.displayUnits.length).toBeGreaterThan(0);
      expect(def.displayUnits[0].unit).toBe(def.canonicalUnit);
    }
  });

  it("keeps the canonical (first) display unit a no-op conversion", () => {
    for (const def of VITALS_REGISTRY) {
      const canonical = def.displayUnits[0];
      const v = (def.hardMin + def.hardMax) / 2;
      expect(canonical.toCanonical(v)).toBe(v);
      expect(canonical.fromCanonical(v)).toBe(v);
    }
  });

  it("marks only head circumference and MUAC as peds-only", () => {
    const peds = VITALS_REGISTRY.filter((v) => v.pedsOnly).map((v) => v.key);
    expect(peds.sort()).toEqual(["vitalsHeadCircumferenceCm", "vitalsMuacCm"].sort());
  });

  it("exposes unit toggles for temp, weight, height, glucose, and hip", () => {
    const toggled = VITALS_REGISTRY.filter((v) => v.displayUnits.length > 1).map((v) => v.key);
    expect(toggled).toEqual(
      expect.arrayContaining([
        "vitalsTempC",
        "vitalsWtKg",
        "vitalsHtCm",
        "vitalsGlucoseMgDl",
        "vitalsHipCm",
      ]),
    );
  });

  it("never lets an advisory band exceed the hard CHECK bounds", () => {
    for (const def of VITALS_REGISTRY) {
      for (const ctx of SAMPLE_CONTEXTS) {
        const band = def.range(ctx);
        if (band == null) continue;
        expect(band.low).toBeLessThanOrEqual(band.high);
        expect(band.low).toBeGreaterThanOrEqual(def.hardMin);
        expect(band.high).toBeLessThanOrEqual(def.hardMax);
      }
    }
  });

  it("has sane hard bounds (min < max) matching the migration shape", () => {
    for (const def of VITALS_REGISTRY) {
      expect(def.hardMin).toBeLessThan(def.hardMax);
    }
    // Spot-check a few against migration 103/151 CHECK constraints.
    expect(resolveVital("vitalsBpSystolic")).toMatchObject({ hardMin: 30, hardMax: 300 });
    expect(resolveVital("vitalsGcsTotal")).toMatchObject({ hardMin: 3, hardMax: 15 });
    expect(resolveVital("vitalsGlucoseMgDl")).toMatchObject({ hardMin: 10, hardMax: 1500 });
    expect(resolveVital("vitalsRr")).toMatchObject({ hardMin: 0, hardMax: 120 });
  });

  it("preserves byte-stable bounds on the original 14 column vitals", () => {
    const unchanged = {
      vitalsBpSystolic: { hardMin: 30, hardMax: 300 },
      vitalsBpDiastolic: { hardMin: 20, hardMax: 200 },
      vitalsHr: { hardMin: 20, hardMax: 250 },
      vitalsRr: { hardMin: 0, hardMax: 120 },
      vitalsTempC: { hardMin: 30, hardMax: 45 },
      vitalsSpo2: { hardMin: 0, hardMax: 100 },
      vitalsWtKg: { hardMin: 0.5, hardMax: 500 },
      vitalsHtCm: { hardMin: 20, hardMax: 250 },
      vitalsPainScore: { hardMin: 0, hardMax: 10 },
      vitalsGlucoseMgDl: { hardMin: 10, hardMax: 1500 },
      vitalsGcsTotal: { hardMin: 3, hardMax: 15 },
      vitalsHeadCircumferenceCm: { hardMin: 10, hardMax: 80 },
      vitalsMuacCm: { hardMin: 5, hardMax: 60 },
      vitalsWaistCm: { hardMin: 20, hardMax: 300 },
    } as const;
    for (const [key, bounds] of Object.entries(unchanged)) {
      expect(resolveVital(key as ColumnVitalKey)).toMatchObject(bounds);
    }
  });
});
