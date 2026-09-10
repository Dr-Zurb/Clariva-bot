import { describe, expect, it } from "vitest";
import { createEmptyRxFormFields } from "@/components/cockpit/rx/RxFormContext";
import {
  formatCockpitVitalsStrip,
  formatCockpitVitalsStripFromDesk,
} from "@/lib/cockpit/vitals-strip";

describe("formatCockpitVitalsStrip", () => {
  it("returns null when no vitals are recorded", () => {
    expect(formatCockpitVitalsStrip(createEmptyRxFormFields())).toBeNull();
  });

  it("joins BP, other numbers, and the visit note", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsBpReadings = [{ systolic: 120, diastolic: 80 }];
    fields.vitalsHr = 72;
    fields.vitalsSectionNote = "sitting, post-walk";
    expect(formatCockpitVitalsStrip(fields)).toBe(
      "BP 120/80 · HR 72 — sitting, post-walk"
    );
  });

  it("formats a same-visit desk reading before the form is seeded", () => {
    expect(
      formatCockpitVitalsStripFromDesk({
        note: null,
        ghost: {
          vitalsBpSystolic: 89,
          vitalsBpDiastolic: 58,
          vitalsHr: 71,
        },
      })
    ).toBe("BP 89/58 · HR 71");
  });
});
