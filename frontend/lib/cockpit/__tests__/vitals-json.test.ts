import { describe, it, expect } from "vitest";
import { deriveVitalsText, normalizeVitalsJson } from "@/lib/cockpit/vitals-json";
import type { VitalsJson } from "@/types/prescription";

describe("normalizeVitalsJson (vit-03)", () => {
  it("returns {} for empty / null / non-object input", () => {
    expect(normalizeVitalsJson({})).toEqual({});
    expect(normalizeVitalsJson(null)).toEqual({});
    expect(normalizeVitalsJson(undefined)).toEqual({});
    expect(normalizeVitalsJson("nope" as unknown as VitalsJson)).toEqual({});
  });

  it("keeps in-bounds numeric + valid categorical values", () => {
    const clean = normalizeVitalsJson({
      vitalsO2FlowLMin: 4,
      vitalsGcsE: 3,
      vitalsO2DeliveryMethod: "nasal_cannula",
      vitalsAvpu: "voice",
    });
    expect(clean).toEqual({
      vitalsO2FlowLMin: 4,
      vitalsGcsE: 3,
      vitalsO2DeliveryMethod: "nasal_cannula",
      vitalsAvpu: "voice",
    });
  });

  it("drops out-of-bounds, non-finite, and unknown keys", () => {
    const clean = normalizeVitalsJson({
      vitalsFio2Pct: 150, // > hardMax 100
      vitalsGcsE: 0, // < hardMin 1
      vitalsPefrLMin: Number.NaN,
      vitalsUnknownKey: 5,
      vitalsO2DeliveryMethod: "space_helmet",
    } as unknown as VitalsJson);
    expect(clean).toEqual({});
  });

  it("drops null values (only finite numbers survive)", () => {
    expect(normalizeVitalsJson({ vitalsHipCm: null })).toEqual({});
  });

  it("keeps valid vitalProvenance overrides", () => {
    expect(
      normalizeVitalsJson({
        vitalProvenance: {
          vitalsWtKg: { measuredBy: "nurse", setting: "clinic" },
          vitalsUnknown: { measuredBy: "nurse" },
        },
      } as unknown as VitalsJson),
    ).toEqual({
      vitalProvenance: { vitalsWtKg: { measuredBy: "nurse", setting: "clinic" } },
    });
  });
});

describe("deriveVitalsText byte-parity (vit-03)", () => {
  it("derives '' for empty / null / undefined (appends nothing — shipped-column parity)", () => {
    expect(deriveVitalsText({})).toBe("");
    expect(deriveVitalsText(null)).toBe("");
    expect(deriveVitalsText(undefined)).toBe("");
  });

  it("derives '' when every key is invalid (no partial leakage)", () => {
    expect(
      deriveVitalsText({
        vitalsFio2Pct: 9999,
        vitalsO2DeliveryMethod: "bogus",
      } as unknown as VitalsJson),
    ).toBe("");
  });

  it("renders numeric vitals as 'Label: value unit' in registry order", () => {
    const text = deriveVitalsText({
      vitalsFio2Pct: 40,
      vitalsO2FlowLMin: 4,
    });
    // O₂ Flow precedes FiO₂ in the registry (respiratory group order).
    expect(text).toBe("Oxygen Flow Rate (O₂): 4 L/min\nFraction of Inspired Oxygen (FiO₂): 40 %");
  });

  it("renders categorical vitals as 'Label: <option label>' (enum → human label)", () => {
    const text = deriveVitalsText({
      vitalsO2DeliveryMethod: "nasal_cannula",
      vitalsAvpu: "alert",
    });
    expect(text).toContain("O₂ Delivery: Nasal cannula");
    expect(text).toContain("Alert, Voice, Pain, Unresponsive (AVPU): Alert");
  });

  it("appends numeric then categorical, additively", () => {
    const text = deriveVitalsText({
      vitalsFetalHeartRateBpm: 140,
      vitalsPulseRhythm: "irregular",
    });
    const lines = text.split("\n");
    expect(lines[0]).toBe("Fetal Heart Rate: 140 bpm");
    expect(lines[1]).toBe("Pulse Rhythm: Irregular");
  });

  it("is pure + deterministic (stable across repeated calls)", () => {
    const input: VitalsJson = { vitalsGcsE: 4, vitalsGcsV: 5, vitalsGcsM: 6 };
    const snapshot = JSON.parse(JSON.stringify(input));
    const a = deriveVitalsText(input);
    const b = deriveVitalsText(input);
    expect(a).toBe(b);
    expect(input).toEqual(snapshot); // input never mutated
  });

  it("appends per-vital provenance lines when overrides are stored", () => {
    const text = deriveVitalsText({
      measurementContext: { measuredBy: "patient", setting: "home" },
      vitalProvenance: { vitalsWtKg: { measuredBy: "nurse", setting: "clinic" } },
    });
    expect(text).toBe("Weight: measured by Clinic staff at Clinic");
  });
});
