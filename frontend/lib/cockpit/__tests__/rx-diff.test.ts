import { describe, it, expect } from "vitest";
import type { MedicineRowValue } from "@/components/consultation/MedicineRow";
import type { PrescriptionMedicine } from "@/types/prescription";
import {
  applyMode,
  diffMedicines,
  medicineToRowValue,
} from "@/lib/cockpit/rx-diff";

function row(name: string, dosage = "10mg"): MedicineRowValue {
  return {
    medicineName: name,
    dosage,
    route: "",
    frequency: "",
    duration: "",
    instructions: "",
    drugMasterId: null,
    frequencyCode: null,
    durationValue: null,
    durationUnit: null,
    routeCode: null,
  };
}

function dbMed(name: string, dosage: string | null = "10mg"): PrescriptionMedicine {
  return {
    id: "med-1",
    prescription_id: "rx-1",
    medicine_name: name,
    dosage,
    route: null,
    frequency: null,
    duration: null,
    instructions: null,
    sort_order: 0,
    created_at: "2026-05-01T10:00:00.000Z",
    drug_master_id: null,
    frequency_code: null,
    duration_value: null,
    duration_unit: null,
    route_code: null,
  };
}

describe("medicineToRowValue", () => {
  it("maps prescription medicine fields to row value", () => {
    expect(medicineToRowValue(dbMed("Amlodipine", "5mg"))).toEqual(
      expect.objectContaining({ medicineName: "Amlodipine", dosage: "5mg" }),
    );
  });
});

describe("applyMode", () => {
  it("replace returns a copy of prior meds only", () => {
    const current = [row("A"), row("B")];
    const prior = [row("C")];
    expect(applyMode(current, prior, "replace")).toEqual(prior);
    expect(applyMode(current, prior, "replace")).not.toBe(prior);
  });

  it("append de-dupes by name and dosage (case-insensitive)", () => {
    const current = [row("Paracetamol", "500mg")];
    const prior = [row("Paracetamol", "500mg"), row("Ibuprofen", "400mg")];
    expect(applyMode(current, prior, "append")).toEqual([
      row("Paracetamol", "500mg"),
      row("Ibuprofen", "400mg"),
    ]);
  });

  it("append keeps current order and appends new prior rows", () => {
    const current = [row("A"), row("B")];
    const prior = [row("C")];
    expect(applyMode(current, prior, "append")).toEqual([row("A"), row("B"), row("C")]);
  });
});

describe("diffMedicines", () => {
  it("marks added, unchanged, and removed rows", () => {
    const current = [row("A"), row("B")];
    const final = [row("A"), row("C")];
    const rows = diffMedicines(current, final);

    expect(rows).toContainEqual({
      status: "unchanged",
      value: row("A"),
      source: "current",
    });
    expect(rows).toContainEqual({
      status: "added",
      value: row("C"),
      source: "prior",
    });
    expect(rows).toContainEqual({
      status: "removed",
      value: row("B"),
      source: "current",
    });
  });
});
