import { describe, it, expect } from "vitest";
import {
  CATEGORICAL_VITALS_REGISTRY,
  CATEGORICAL_VITAL_ORDER,
  categoricalVitalSelectMinWidthCh,
  categoricalVitalsByStorage,
  listCategoricalVitals,
  listCategoricalVitalsByGroup,
  resolveCategoricalVital,
  type CategoricalVitalKey,
} from "@/lib/cockpit/categorical-vitals-schema";

const ALL_KEYS: CategoricalVitalKey[] = [
  "vitalsO2DeliveryMethod",
  "vitalsSpo2Device",
  "vitalsPulseRhythm",
  "vitalsHrSource",
  "vitalsTempSite",
  "vitalsTempDevice",
  "vitalsGlucoseTiming",
  "vitalsGlucoseDevice",
  "vitalsPupilReactivityLeft",
  "vitalsPupilReactivityRight",
  "vitalsAvpu",
];

describe("categorical-vitals-schema registry", () => {
  it("covers the full categorical catalog with no duplicates", () => {
    expect(CATEGORICAL_VITAL_ORDER).toEqual(ALL_KEYS);
    expect(new Set(CATEGORICAL_VITAL_ORDER).size).toBe(CATEGORICAL_VITAL_ORDER.length);
    expect(listCategoricalVitals()).toBe(CATEGORICAL_VITALS_REGISTRY);
    expect(CATEGORICAL_VITALS_REGISTRY).toHaveLength(11);
  });

  it("declares group, storage, and non-empty allowed value sets", () => {
    for (const def of CATEGORICAL_VITALS_REGISTRY) {
      expect(def.group).toBeTruthy();
      expect(def.storage).toBe("json");
      expect(def.options.length).toBeGreaterThan(0);
      expect(new Set(def.options.map((o) => o.value)).size).toBe(def.options.length);
      for (const option of def.options) {
        expect(option.label.length).toBeGreaterThan(0);
        expect(option.value.length).toBeGreaterThan(0);
      }
    }
  });

  it("partitions categorical vitals by group and storage", () => {
    const core = listCategoricalVitalsByGroup("core").map((v) => v.key);
    const metabolic = listCategoricalVitalsByGroup("metabolic").map((v) => v.key);
    const neuro = listCategoricalVitalsByGroup("neuro").map((v) => v.key);

    expect(core).toEqual([
      "vitalsO2DeliveryMethod",
      "vitalsSpo2Device",
      "vitalsPulseRhythm",
      "vitalsHrSource",
      "vitalsTempSite",
      "vitalsTempDevice",
    ]);
    expect(metabolic).toEqual(["vitalsGlucoseTiming", "vitalsGlucoseDevice"]);
    expect(neuro).toEqual([
      "vitalsPupilReactivityLeft",
      "vitalsPupilReactivityRight",
      "vitalsAvpu",
    ]);

    expect(categoricalVitalsByStorage("json").map((v) => v.key)).toEqual(ALL_KEYS);
    expect(categoricalVitalsByStorage("column")).toEqual([]);
  });

  it("resolves every key and throws on unknown keys", () => {
    for (const key of ALL_KEYS) {
      expect(resolveCategoricalVital(key).key).toBe(key);
    }
    expect(() => resolveCategoricalVital("nope" as CategoricalVitalKey)).toThrow(
      /Unknown categorical vital key/,
    );
  });

  it("categoricalVitalSelectMinWidthCh fits the longest option per vital", () => {
    expect(categoricalVitalSelectMinWidthCh(resolveCategoricalVital("vitalsHrSource"))).toBeGreaterThanOrEqual(
      "Pulse oximeter".length,
    );
    expect(categoricalVitalSelectMinWidthCh(resolveCategoricalVital("vitalsTempDevice"))).toBeGreaterThanOrEqual(
      "Digital thermometer".length,
    );
    expect(
      categoricalVitalSelectMinWidthCh(resolveCategoricalVital("vitalsO2DeliveryMethod")),
    ).toBeGreaterThanOrEqual("Mechanical ventilation".length);
  });
});
