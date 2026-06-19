import { describe, it, expect } from "vitest";
import {
  cToF,
  fToC,
  kgToLb,
  lbToKg,
  cmToIn,
  inToCm,
  mgDlToMmolL,
  mmolLToMgDl,
  computeMap,
  computeBsa,
  evaluateRange,
} from "@/lib/cockpit/vitals-derive";

const EPS = 1e-9;

describe("unit converters", () => {
  it("converts temperature with known references", () => {
    expect(cToF(37)).toBeCloseTo(98.6, 6);
    expect(cToF(0)).toBe(32);
    expect(fToC(98.6)).toBeCloseTo(37, 6);
    expect(fToC(32)).toBe(0);
  });

  it("converts weight, height, and glucose with known references", () => {
    expect(kgToLb(1)).toBeCloseTo(2.2046226, 6);
    expect(lbToKg(1)).toBeCloseTo(0.4535924, 6);
    expect(cmToIn(2.54)).toBeCloseTo(1, 9);
    expect(inToCm(1)).toBe(2.54);
    expect(mgDlToMmolL(18.0182)).toBeCloseTo(1, 9);
    expect(mmolLToMgDl(1)).toBeCloseTo(18.0182, 6);
  });

  it.each([
    ["temp", cToF, fToC, 37.2],
    ["weight", kgToLb, lbToKg, 72.4],
    ["height", cmToIn, inToCm, 168.5],
    ["glucose", mgDlToMmolL, mmolLToMgDl, 126],
  ] as const)("round-trips %s canonical → display → canonical within epsilon", (_label, fwd, back, canonical) => {
    expect(back(fwd(canonical))).toBeCloseTo(canonical, 9);
    expect(Math.abs(back(fwd(canonical)) - canonical)).toBeLessThan(EPS);
  });
});

describe("computeMap", () => {
  it("computes diastolic + (systolic − diastolic)/3 to 1 decimal", () => {
    expect(computeMap(120, 80)).toBe(93.3);
    expect(computeMap(90, 60)).toBe(70);
  });

  it("is null-safe and rejects impossible inputs", () => {
    expect(computeMap(null, 80)).toBeNull();
    expect(computeMap(120, null)).toBeNull();
    expect(computeMap(undefined, undefined)).toBeNull();
    expect(computeMap(0, 0)).toBeNull();
    expect(computeMap(80, 120)).toBeNull(); // diastolic > systolic
  });
});

describe("computeBsa (Mosteller)", () => {
  it("matches known reference values to 2 decimals", () => {
    expect(computeBsa(170, 70)).toBe(1.82);
    expect(computeBsa(100, 15)).toBe(0.65);
  });

  it("is null-safe", () => {
    expect(computeBsa(null, 70)).toBeNull();
    expect(computeBsa(170, null)).toBeNull();
    expect(computeBsa(0, 70)).toBeNull();
  });
});

describe("evaluateRange", () => {
  it("returns null for missing values or vitals without a band", () => {
    expect(evaluateRange("vitalsHr", null)).toBeNull();
    expect(evaluateRange("vitalsHr", undefined)).toBeNull();
    expect(evaluateRange("vitalsWtKg", 70)).toBeNull();
    expect(evaluateRange("vitalsHtCm", 170)).toBeNull();
    expect(evaluateRange("vitalsPainScore", 8)).toBeNull();
    expect(evaluateRange("vitalsHeadCircumferenceCm", 35)).toBeNull();
  });

  it("flags adult heart rate at the band boundaries (60–100)", () => {
    const ctx = { ageYears: 30 };
    expect(evaluateRange("vitalsHr", 59, ctx)).toBe("low");
    expect(evaluateRange("vitalsHr", 60, ctx)).toBe("normal");
    expect(evaluateRange("vitalsHr", 100, ctx)).toBe("normal");
    expect(evaluateRange("vitalsHr", 101, ctx)).toBe("high");
  });

  it("uses an age-specific heart-rate band for infants (100–160)", () => {
    const ctx = { ageYears: 0.5 };
    expect(evaluateRange("vitalsHr", 90, ctx)).toBe("low");
    expect(evaluateRange("vitalsHr", 120, ctx)).toBe("normal");
    expect(evaluateRange("vitalsHr", 170, ctx)).toBe("high");
  });

  it("defaults to the adult band when no age is provided", () => {
    expect(evaluateRange("vitalsHr", 55)).toBe("low");
    expect(evaluateRange("vitalsHr", 80)).toBe("normal");
  });

  it("flags temperature at the fever edge", () => {
    expect(evaluateRange("vitalsTempC", 36.0)).toBe("low");
    expect(evaluateRange("vitalsTempC", 36.1)).toBe("normal");
    expect(evaluateRange("vitalsTempC", 37.5)).toBe("normal");
    expect(evaluateRange("vitalsTempC", 37.6)).toBe("high");
  });

  it("flags low SpO2 but never high (cap is 100)", () => {
    expect(evaluateRange("vitalsSpo2", 94)).toBe("low");
    expect(evaluateRange("vitalsSpo2", 95)).toBe("normal");
    expect(evaluateRange("vitalsSpo2", 100)).toBe("normal");
  });

  it("flags any GCS below 15 as low", () => {
    expect(evaluateRange("vitalsGcsTotal", 14)).toBe("low");
    expect(evaluateRange("vitalsGcsTotal", 15)).toBe("normal");
  });

  it("uses sex-aware waist cutoffs (male 90, female 80)", () => {
    expect(evaluateRange("vitalsWaistCm", 85, { sex: "male" })).toBe("normal");
    expect(evaluateRange("vitalsWaistCm", 95, { sex: "male" })).toBe("high");
    expect(evaluateRange("vitalsWaistCm", 85, { sex: "female" })).toBe("high");
    expect(evaluateRange("vitalsWaistCm", 75, { sex: "female" })).toBe("normal");
  });

  it("flags MUAC below the 11.5 cm cutoff", () => {
    expect(evaluateRange("vitalsMuacCm", 11.0)).toBe("low");
    expect(evaluateRange("vitalsMuacCm", 12.0)).toBe("normal");
  });
});
