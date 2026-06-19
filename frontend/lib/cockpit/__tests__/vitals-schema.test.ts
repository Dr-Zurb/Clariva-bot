import { describe, it, expect } from "vitest";
import {
  VITALS_REGISTRY,
  VITAL_ORDER,
  listVitals,
  resolveVital,
  type RangeContext,
  type VitalKey,
} from "@/lib/cockpit/vitals-schema";
import type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";

// Type-level guard: every registry key must be a real RxFormFields key.
// (Compile-time only; if a key drifts this file fails `tsc`.)
const _keyCheck: Record<VitalKey, keyof RxFormFields> = {
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
void _keyCheck;

const ALL_KEYS: VitalKey[] = [
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
  it("covers exactly the 14 numeric vital keys, no duplicates", () => {
    expect(VITAL_ORDER).toEqual(ALL_KEYS);
    expect(new Set(VITAL_ORDER).size).toBe(VITAL_ORDER.length);
    expect(listVitals()).toBe(VITALS_REGISTRY);
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

  it("exposes unit toggles for temp, weight, height, and glucose", () => {
    const toggled = VITALS_REGISTRY.filter((v) => v.displayUnits.length > 1).map((v) => v.key);
    expect(toggled).toEqual(
      expect.arrayContaining([
        "vitalsTempC",
        "vitalsWtKg",
        "vitalsHtCm",
        "vitalsGlucoseMgDl",
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
});
