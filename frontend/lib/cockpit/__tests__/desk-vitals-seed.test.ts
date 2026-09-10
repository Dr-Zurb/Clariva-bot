import { describe, expect, it } from "vitest";
import { createEmptyRxFormFields } from "@/components/cockpit/rx/RxFormContext";
import { createEmptyBpReading } from "@/lib/cockpit/bp-readings";
import {
  mergeDeskVitalsIntoFields,
  patchEmptyFieldsFromDeskVitals,
} from "@/lib/cockpit/desk-vitals-seed";

describe("patchEmptyFieldsFromDeskVitals", () => {
  it("fills empty scalars, BP, and note from desk", () => {
    const fields = createEmptyRxFormFields();
    const patch = patchEmptyFieldsFromDeskVitals(fields, {
      note: "sitting, post-walk",
      ghost: {
        vitalsHr: 88,
        vitalsBpSystolic: 123,
        vitalsBpDiastolic: 58,
        vitalsWtKg: 18.5,
      },
    });

    expect(patch.vitalsSectionNote).toBe("sitting, post-walk");
    expect(patch.vitalsHr).toBe(88);
    expect(patch.vitalsWtKg).toBe(18.5);
    expect(patch.vitalsBpSystolic).toBe(123);
    expect(patch.vitalsBpDiastolic).toBe(58);
    expect(patch.vitalsBpReadings?.[0]).toMatchObject({
      systolic: 123,
      diastolic: 58,
    });
  });

  it("does not overwrite values already on the Rx", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsHr = 72;
    fields.vitalsSectionNote = "doctor note";
    fields.vitalsBpSystolic = 120;
    fields.vitalsBpDiastolic = 80;
    fields.vitalsBpReadings = [
      { ...createEmptyBpReading(), systolic: 120, diastolic: 80 },
    ];

    const patch = patchEmptyFieldsFromDeskVitals(fields, {
      note: "desk note",
      ghost: {
        vitalsHr: 88,
        vitalsBpSystolic: 123,
        vitalsBpDiastolic: 58,
        vitalsTempC: 37.2,
      },
    });

    expect(patch.vitalsHr).toBeUndefined();
    expect(patch.vitalsSectionNote).toBeUndefined();
    expect(patch.vitalsBpSystolic).toBeUndefined();
    expect(patch.vitalsBpReadings).toBeUndefined();
    expect(patch.vitalsTempC).toBe(37.2);
  });

  it("skips incomplete desk BP", () => {
    const fields = createEmptyRxFormFields();
    const patch = patchEmptyFieldsFromDeskVitals(fields, {
      note: null,
      ghost: { vitalsBpSystolic: 123 },
    });
    expect(patch.vitalsBpSystolic).toBeUndefined();
    expect(patch.vitalsBpReadings).toBeUndefined();
  });

  it("mergeDeskVitalsIntoFields returns a new object with desk values filled", () => {
    const fields = createEmptyRxFormFields();
    const merged = mergeDeskVitalsIntoFields(fields, {
      note: null,
      ghost: { vitalsHr: 71, vitalsBpSystolic: 89, vitalsBpDiastolic: 58 },
    });
    expect(merged.vitalsHr).toBe(71);
    expect(merged.vitalsBpSystolic).toBe(89);
    expect(merged.vitalsBpDiastolic).toBe(58);
    expect(fields.vitalsHr).toBeNull();
  });
});
