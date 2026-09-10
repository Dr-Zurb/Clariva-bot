import { describe, expect, it } from "vitest";
import { createEmptyBpReading } from "@/lib/cockpit/bp-readings";
import { createEmptyGlucoseReading } from "@/lib/cockpit/glucose-readings";
import {
  bpReadingExtrasHaveData,
  customVitalExtrasHaveData,
  glucoseReadingExtrasHaveData,
  numericVitalExtrasHaveData,
  type VitalExtrasFieldSlice,
} from "@/lib/cockpit/vital-extras";

function emptyFields(
  patch: Partial<VitalExtrasFieldSlice> = {}
): VitalExtrasFieldSlice {
  return {
    vitalsNotes: {},
    vitalsProvenanceOverrides: {},
    vitalsMeasurementContext: { measuredBy: "patient", setting: "home" },
    ...patch,
  };
}

describe("vital extras have-data", () => {
  it("is false for an empty numeric vital", () => {
    expect(numericVitalExtrasHaveData(emptyFields(), "vitalsHr")).toBe(false);
  });

  it("is true when a paired context select is set", () => {
    expect(
      numericVitalExtrasHaveData(
        {
          ...emptyFields(),
          vitalsPulseRhythm: "regular",
        } as VitalExtrasFieldSlice,
        "vitalsHr"
      )
    ).toBe(true);
  });

  it("is true when a per-vital note is set", () => {
    expect(
      numericVitalExtrasHaveData(
        emptyFields({ vitalsNotes: { vitalsHr: "sitting" } }),
        "vitalsHr"
      )
    ).toBe(true);
  });

  it("is true when provenance differs from the visit default", () => {
    expect(
      numericVitalExtrasHaveData(
        emptyFields({
          vitalsProvenanceOverrides: {
            vitalsHr: { measuredBy: "nurse", setting: "clinic" },
          },
        }),
        "vitalsHr"
      )
    ).toBe(true);
  });

  it("is true for a custom vital note", () => {
    expect(
      customVitalExtrasHaveData(
        emptyFields({ vitalsNotes: { custom_1: "tape" } }),
        "custom_1"
      )
    ).toBe(true);
  });

  it("is true for BP extras when posture is set", () => {
    expect(
      bpReadingExtrasHaveData({
        ...createEmptyBpReading(),
        posture: "sitting",
      })
    ).toBe(true);
    expect(bpReadingExtrasHaveData(createEmptyBpReading())).toBe(false);
  });

  it("is true for glucose extras when timing is set", () => {
    expect(
      glucoseReadingExtrasHaveData(
        { ...createEmptyGlucoseReading(), timing: "fasting" },
        emptyFields(),
        true
      )
    ).toBe(true);
    expect(
      glucoseReadingExtrasHaveData(
        createEmptyGlucoseReading(),
        emptyFields(),
        true
      )
    ).toBe(false);
  });
});
