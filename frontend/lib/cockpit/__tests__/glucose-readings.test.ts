import { describe, expect, it } from "vitest";
import { createEmptyRxFormFields } from "@/components/cockpit/rx/RxFormContext";
import {
  createEmptyGlucoseReading,
  glucosePresetFastingAnd2hPp,
  glucosePresetWouldDropReadings,
  hydrateGlucoseReadingsFromPrescription,
  mergeGlucoseReadingsWithPreset,
  mirrorPrimaryGlucoseReading,
  serializeGlucoseReadingsForVitalsJson,
} from "@/lib/cockpit/glucose-readings";
import { assembleVitalsJsonPayload, createEmptyJsonVitalFields, deriveVitalsText } from "@/lib/cockpit/vitals-json";

describe("glucose-readings", () => {
  it("hydrates a single reading from legacy column + timing", () => {
    const rows = hydrateGlucoseReadingsFromPrescription({
      columns: { valueMgDl: 108, timing: "fasting", device: "glucometer" },
      vitalsJson: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ valueMgDl: 108, timing: "fasting" });
  });

  it("merges preset templates while preserving values by index", () => {
    const current = [
      { ...createEmptyGlucoseReading(), valueMgDl: 95, timing: "fasting" },
      { ...createEmptyGlucoseReading(), valueMgDl: 142 },
    ];
    const merged = mergeGlucoseReadingsWithPreset(current, glucosePresetFastingAnd2hPp());
    expect(merged).toHaveLength(2);
    expect(merged[0]?.valueMgDl).toBe(95);
    expect(merged[1]?.valueMgDl).toBe(142);
    expect(merged[1]?.timing).toBe("post_prandial_2h");
  });

  it("detects when a preset would drop readings with data", () => {
    const current = [
      { ...createEmptyGlucoseReading(), valueMgDl: 95 },
      { ...createEmptyGlucoseReading(), valueMgDl: 140 },
      { ...createEmptyGlucoseReading(), valueMgDl: 120 },
    ];
    expect(glucosePresetWouldDropReadings(current, glucosePresetFastingAnd2hPp())).toBe(true);
  });

  it("mirrors primary reading to legacy columns", () => {
    expect(
      mirrorPrimaryGlucoseReading([
        { ...createEmptyGlucoseReading(), valueMgDl: 110, timing: "random" },
      ]),
    ).toEqual({ valueMgDl: 110, timing: "random", device: null });
  });

  it("persists multi-reading glucose in vitals_json and derives text", () => {
    const json = assembleVitalsJsonPayload(
      createEmptyJsonVitalFields(),
      [],
      null,
      null,
      null,
      [],
      [
        { ...createEmptyGlucoseReading(), valueMgDl: 95, timing: "fasting" },
        { ...createEmptyGlucoseReading(), valueMgDl: 142, timing: "post_prandial_2h" },
      ],
    );
    expect(json.glucoseReadings).toHaveLength(2);
    expect(deriveVitalsText(json)).toContain("Blood Glucose (2h post-prandial): 142 mg/dL");
  });

  it("keeps single-reading parity without json array when only value + timing", () => {
    const json = serializeGlucoseReadingsForVitalsJson([
      { ...createEmptyGlucoseReading(), valueMgDl: 110, timing: "fasting" },
    ]);
    expect(json).toBeUndefined();
  });
});

describe("glucose-readings · form defaults", () => {
  it("seeds empty glucose readings in createEmptyRxFormFields", () => {
    const fields = createEmptyRxFormFields();
    expect(fields.vitalsGlucoseReadings).toHaveLength(1);
    expect(fields.vitalsGlucoseReadings[0]?.valueMgDl).toBeNull();
  });
});
