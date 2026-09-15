import { describe, expect, it } from "vitest";
import type { DoctorMedicineCombo } from "@/lib/api/doctor-medicine-combos";
import {
  formatMedicineComboHint,
  matchMedicineCombos,
} from "@/lib/cockpit/medicine-combos";

function combo(
  overrides: Partial<DoctorMedicineCombo> &
    Pick<DoctorMedicineCombo, "medicineName" | "nameKey">
): DoctorMedicineCombo {
  return {
    dosage: "",
    doseQty: 1,
    doseUnit: "tab",
    frequencyCode: "OD",
    frequency: "",
    durationValue: 10,
    durationUnit: "days",
    duration: "10 days",
    foodTiming: null,
    routeCode: null,
    route: "",
    form: null,
    drugMasterId: null,
    useCount: 1,
    lastUsedAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("matchMedicineCombos", () => {
  const rows = [
    combo({
      medicineName: "Multivitamin",
      nameKey: "multivitamin",
      durationValue: 10,
      useCount: 24,
    }),
    combo({
      medicineName: "Multivitamin",
      nameKey: "multivitamin",
      durationValue: 30,
      duration: "30 days",
      useCount: 4,
    }),
    combo({
      medicineName: "pcm",
      nameKey: "pcm",
      dosage: "650",
      frequencyCode: "PRN",
      durationValue: null,
      durationUnit: null,
      duration: "",
    }),
  ];

  it("returns prefix matches for a bare drug name, already-ranked order", () => {
    const matched = matchMedicineCombos(rows, "multi");
    expect(matched.map((c) => c.durationValue)).toEqual([10, 30]);
  });

  it("matches the doctor's typed shorthand", () => {
    expect(matchMedicineCombos(rows, "pc").map((c) => c.nameKey)).toEqual([
      "pcm",
    ]);
  });

  it("stays silent below two characters", () => {
    expect(matchMedicineCombos(rows, "m")).toEqual([]);
  });

  it("caps the list at three", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      combo({
        medicineName: "Multivitamin",
        nameKey: "multivitamin",
        durationValue: i + 1,
        useCount: 8 - i,
      })
    );
    expect(matchMedicineCombos(many, "multi")).toHaveLength(3);
  });
});

describe("formatMedicineComboHint", () => {
  it("shows name and sig without a use count", () => {
    const hint = formatMedicineComboHint(
      combo({
        medicineName: "Multivitamin",
        nameKey: "multivitamin",
        useCount: 24,
      })
    );
    expect(hint).toMatch(/Multivitamin/);
    expect(hint).toMatch(/OD|10 days/);
    expect(hint).not.toMatch(/24|used|×/);
  });
});
