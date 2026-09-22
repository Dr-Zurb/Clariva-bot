import { describe, expect, it } from "vitest";
import { EMPTY_RX_MEDICINE } from "@/components/cockpit/rx/RxFormContext";
import {
  mergeAiParsedIntoMedicine,
  mergeCatalogDrugIntoRxMedicine,
  nameWorthCatalogLookup,
  pickUnambiguousCatalogDrug,
  rxMedicineFromAiMedicine,
  rxMedicineFromCombo,
  rxMedicineFromDrugMaster,
  rxMedicineFromParsed,
} from "@/lib/cockpit/rx-medicine-from-capture";
import type { ParsedMedicineLine } from "@/lib/cockpit/medicine-line-parse";
import type { DrugMasterRow } from "@/types/drug-master";

function drug(
  partial: Partial<DrugMasterRow> & Pick<DrugMasterRow, "id" | "generic_name">
): DrugMasterRow {
  return {
    brand_name: null,
    form: "tablet",
    strength: "5 mg",
    route_default: "oral",
    ...partial,
  } as DrugMasterRow;
}

function parsed(
  overrides: Partial<ParsedMedicineLine> = {}
): ParsedMedicineLine {
  return {
    medicineName: "Amlodipine",
    dosage: "5 mg",
    form: "tablet",
    doseQty: 1,
    doseUnit: "tab",
    frequencyCode: "OD",
    frequency: "Once daily",
    durationValue: 30,
    durationUnit: "days",
    duration: "30 days",
    foodTiming: "after_food",
    routeCode: "PO",
    route: "Oral",
    instructions: "",
    doseSchedule: null,
    intakePattern: null,
    source: null,
    startedAgoValue: null,
    startedAgoUnit: null,
    status: null,
    stoppedAgoValue: null,
    stoppedAgoUnit: null,
    stopReason: null,
    ...overrides,
  };
}

describe("rx-medicine-from-capture", () => {
  it("maps drug_master onto RxMedicine with route defaults", () => {
    expect(
      rxMedicineFromDrugMaster(
        drug({ id: "d1", generic_name: "Amlodipine", strength: "5 mg" })
      )
    ).toEqual(
      expect.objectContaining({
        medicineName: "Amlodipine",
        drugMasterId: "d1",
        dosage: "5 mg",
        form: "tablet",
        doseUnit: "tab",
      })
    );
  });

  it("preselects days when the captured line has no duration", () => {
    expect(
      rxMedicineFromParsed(
        parsed({ durationValue: null, durationUnit: null, duration: "" }),
      ),
    ).toEqual(expect.objectContaining({ durationUnit: "days", duration: "" }));
    expect(
      rxMedicineFromDrugMaster(
        drug({ id: "d2", generic_name: "ORS" }),
      ).durationUnit,
    ).toBe("days");
  });

  it("maps a parsed sig line including Plan duration + route", () => {
    expect(rxMedicineFromParsed(parsed())).toEqual(
      expect.objectContaining({
        medicineName: "Amlodipine",
        dosage: "5 mg",
        durationValue: 30,
        durationUnit: "days",
        duration: "30 days",
        routeCode: "PO",
        frequencyCode: "OD",
        doseSchedule: null,
      })
    );
  });

  it("maps a parsed 1-0-1 schedule onto the Rx row", () => {
    expect(
      rxMedicineFromParsed(
        parsed({
          frequencyCode: "BID",
          frequency: "Twice daily",
          doseSchedule: "1-0-1",
        })
      )
    ).toEqual(
      expect.objectContaining({
        frequencyCode: "BID",
        doseSchedule: "1-0-1",
        frequency: "1-0-1",
      })
    );
  });

  it("auto-fills 1-1-1 when the parsed line is TID", () => {
    expect(
      rxMedicineFromParsed(
        parsed({ frequencyCode: "TID", frequency: "Three times daily" })
      )
    ).toEqual(
      expect.objectContaining({
        frequencyCode: "TID",
        doseSchedule: "1-1-1",
        frequency: "1-1-1",
      })
    );
  });

  it("merges AI fields into an existing row and suggests a rename", () => {
    const existing = {
      ...EMPTY_RX_MEDICINE,
      medicineName: "pcm 500 bd",
      dosage: "500 mg",
    };
    const merged = mergeAiParsedIntoMedicine(existing, {
      name: "Paracetamol",
      strengthValue: 650,
      strengthUnit: "mg",
      frequencyCode: "BID",
    });
    expect(merged.suggestedName).toBe("Paracetamol");
    expect(merged.fieldPatch).toEqual(
      expect.objectContaining({ frequencyCode: "BID" })
    );
    expect(merged.fieldPatch.dosage).toBeUndefined();
  });

  it("maps AI medicine without PMH-only fields", () => {
    const row = rxMedicineFromAiMedicine({
      name: "Metformin",
      strengthValue: 500,
      strengthUnit: "mg",
      doseQty: 1,
      doseUnit: "tab",
      frequencyCode: "BID",
      foodTiming: "after_food",
      instructions: "with meals",
      startedAgoValue: 5,
      startedAgoUnit: "years",
      status: "past",
      source: "self",
    });
    expect(row).toEqual(
      expect.objectContaining({
        medicineName: "Metformin",
        dosage: "500 mg",
        doseQty: 1,
        doseUnit: "tab",
        frequencyCode: "BID",
        foodTiming: "after_food",
        instructions: "with meals",
        durationValue: null,
        drugMasterId: null,
      })
    );
    expect(row).toEqual(
      expect.objectContaining({
        ...EMPTY_RX_MEDICINE,
        medicineName: "Metformin",
        dosage: row.dosage,
        doseQty: 1,
        doseUnit: "tab",
        frequencyCode: "BID",
        frequency: row.frequency,
        foodTiming: "after_food",
        instructions: "with meals",
        form: "tablet",
      })
    );
  });

  it("maps AI route + site + duration onto Plan fields", () => {
    const row = rxMedicineFromAiMedicine({
      name: "B12",
      routeCode: "IM",
      routeSite: "gluteal",
      durationValue: 5,
      durationUnit: "days",
      form: "injection",
    });
    expect(row).toEqual(
      expect.objectContaining({
        medicineName: "B12",
        routeCode: "IM",
        route: "IM · Glute",
        durationValue: 5,
        durationUnit: "days",
        duration: "5 days",
        form: "injection",
      })
    );
  });

  it("formats combo strength from AI components", () => {
    expect(
      rxMedicineFromAiMedicine({
        name: "Telmisartan/Amlodipine",
        strengthComponents: [
          { value: 40, unit: "mg" },
          { value: 5, unit: "mg" },
        ],
      }).dosage
    ).toMatch(/40/);
  });

  it("merges catalog drug without clobbering typed dosage", () => {
    const base = {
      ...EMPTY_RX_MEDICINE,
      medicineName: "amlo",
      dosage: "10 mg",
      frequencyCode: "OD" as const,
      frequency: "Once daily",
    };
    const merged = mergeCatalogDrugIntoRxMedicine(
      base,
      drug({ id: "d2", generic_name: "Amlodipine", strength: "5 mg" })
    );
    expect(merged.medicineName).toBe("Amlodipine");
    expect(merged.drugMasterId).toBe("d2");
    expect(merged.dosage).toBe("10 mg");
  });

  it("maps a habit combo onto a finished Rx row", () => {
    const med = rxMedicineFromCombo({
      medicineName: "Multivitamin",
      nameKey: "multivitamin",
      dosage: "",
      doseQty: 1,
      doseUnit: "tab",
      frequencyCode: "OD",
      frequency: "",
      durationValue: 10,
      durationUnit: "days",
      duration: "10 days",
      foodTiming: "after_food",
      routeCode: "oral",
      route: "Oral",
      form: "tablet",
      drugMasterId: null,
      useCount: 24,
      lastUsedAt: "2026-09-01T00:00:00Z",
    });
    expect(med).toMatchObject({
      medicineName: "Multivitamin",
      doseQty: 1,
      doseUnit: "tab",
      frequencyCode: "OD",
      durationValue: 10,
      durationUnit: "days",
      foodTiming: "after_food",
    });
  });

  it("gates short names for catalog lookup", () => {
    expect(nameWorthCatalogLookup("amlo")).toBe(true);
    expect(nameWorthCatalogLookup("amlodipine")).toBe(false);
    expect(nameWorthCatalogLookup("telma h")).toBe(false);
  });

  it("picks a single unambiguous catalog prefix", () => {
    expect(
      pickUnambiguousCatalogDrug("amlo", [
        drug({ id: "1", generic_name: "Amlodipine" }),
        drug({ id: "2", generic_name: "Atenolol" }),
      ])?.generic_name
    ).toBe("Amlodipine");
    expect(
      pickUnambiguousCatalogDrug("met", [
        drug({ id: "1", generic_name: "Metformin" }),
        drug({ id: "2", generic_name: "Metoprolol" }),
      ])
    ).toBeNull();
  });
});
