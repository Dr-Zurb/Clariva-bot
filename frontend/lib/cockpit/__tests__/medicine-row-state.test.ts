import { describe, it, expect } from "vitest";
import type { MedicineRowValue } from "@/components/consultation/MedicineRow";
import { isMedicineRowComplete } from "@/lib/cockpit/medicine-row-state";

function emptyRow(overrides: Partial<MedicineRowValue> = {}): MedicineRowValue {
  return {
    medicineName: "",
    dosage: "",
    route: "",
    frequency: "",
    duration: "",
    instructions: "",
    drugMasterId: null,
    frequencyCode: null,
    durationValue: null,
    durationUnit: null,
    routeCode: null,
    ...overrides,
  };
}

describe("isMedicineRowComplete", () => {
  it("returns false for empty value (all fields empty/null)", () => {
    expect(isMedicineRowComplete(emptyRow())).toBe(false);
  });

  it("returns false when only medicineName is set", () => {
    expect(isMedicineRowComplete(emptyRow({ medicineName: "Paracetamol" }))).toBe(
      false,
    );
  });

  it("returns false when medicineName and dosage only are set", () => {
    expect(
      isMedicineRowComplete(
        emptyRow({ medicineName: "Paracetamol", dosage: "500mg" }),
      ),
    ).toBe(false);
  });

  it("returns false when medicineName, dosage, and frequencyCode are set without duration", () => {
    expect(
      isMedicineRowComplete(
        emptyRow({
          medicineName: "Paracetamol",
          dosage: "500mg",
          frequencyCode: "TID",
        }),
      ),
    ).toBe(false);
  });

  it("returns true when medicineName, dosage, frequencyCode, and structured duration are set", () => {
    expect(
      isMedicineRowComplete(
        emptyRow({
          medicineName: "Paracetamol",
          dosage: "500mg",
          frequencyCode: "TID",
          durationValue: 5,
          durationUnit: "days",
        }),
      ),
    ).toBe(true);
  });

  it("returns true when medicineName, dosage, legacy frequency, and legacy duration are set", () => {
    expect(
      isMedicineRowComplete(
        emptyRow({
          medicineName: "Paracetamol",
          dosage: "500mg",
          frequency: "TID",
          duration: "5 days",
        }),
      ),
    ).toBe(true);
  });

  it("returns true when complete with route and instructions empty", () => {
    expect(
      isMedicineRowComplete(
        emptyRow({
          medicineName: "Paracetamol",
          dosage: "500mg",
          frequencyCode: "BID",
          durationValue: 7,
          durationUnit: "days",
          route: "",
          instructions: "",
        }),
      ),
    ).toBe(true);
  });

  it("returns true when complete with drugMasterId null but free-text drug name", () => {
    expect(
      isMedicineRowComplete(
        emptyRow({
          medicineName: "Custom Brand X",
          dosage: "1 tab",
          frequencyCode: "OD",
          durationValue: 10,
          durationUnit: "days",
          drugMasterId: null,
        }),
      ),
    ).toBe(true);
  });

  it("returns false when whitespace-only fields are treated as empty", () => {
    expect(
      isMedicineRowComplete(
        emptyRow({
          medicineName: "   ",
          dosage: "  ",
          frequency: " ",
          duration: "\t",
        }),
      ),
    ).toBe(false);
  });

  it("returns false when durationValue is set but durationUnit is null and legacy duration is empty", () => {
    expect(
      isMedicineRowComplete(
        emptyRow({
          medicineName: "Paracetamol",
          dosage: "500mg",
          frequencyCode: "TID",
          durationValue: 5,
          durationUnit: null,
          duration: "",
        }),
      ),
    ).toBe(false);
  });

  it("returns true when both structured and legacy duration/frequency are present", () => {
    expect(
      isMedicineRowComplete(
        emptyRow({
          medicineName: "Paracetamol",
          dosage: "500mg",
          frequencyCode: "TID",
          frequency: "Three times daily",
          durationValue: 5,
          durationUnit: "days",
          duration: "5 days",
        }),
      ),
    ).toBe(true);
  });
});
