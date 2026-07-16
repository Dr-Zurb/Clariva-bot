import { describe, expect, it } from "vitest";
import {
  buildMedicinesFromTemplate,
  buildMedicinesTemplateSavePayload,
  defaultMedicinesSaveName,
  MEDICINES_TEMPLATE_SCOPE,
  medicinesScopeHasContent,
  templateMedicineToRxMedicine,
  templateMedicinesHasContent,
} from "@/lib/cockpit/apply-medicines-template";
import {
  createEmptyRxFormFields,
  EMPTY_RX_MEDICINE,
} from "@/components/cockpit/rx/RxFormContext";
import type { DoctorRxTemplate } from "@/types/rx-template";

function makeTemplate(
  medicines_json: DoctorRxTemplate["medicines_json"],
): DoctorRxTemplate {
  return {
    id: "tpl-1",
    doctor_id: "doc-1",
    name: "URI pack",
    description: null,
    scope: MEDICINES_TEMPLATE_SCOPE,
    medicines_json,
    cc: null,
    hopi: null,
    provisional_diagnosis: null,
    investigations: null,
    follow_up: null,
    patient_education: null,
    clinical_notes: null,
    subjective_json: {},
    objective_json: {},
    plan_json: {},
    assessment_json: {},
    pmh_json: { conditions: [], medications: [] },
    allergies_json: { allergies: [] },
    use_count: 0,
    last_used_at: null,
    archived_at: null,
    created_at: "2026-07-13T00:00:00Z",
    updated_at: "2026-07-13T00:00:00Z",
  };
}

describe("apply-medicines-template", () => {
  it("detects content from named medicine rows", () => {
    expect(
      medicinesScopeHasContent({
        ...createEmptyRxFormFields(),
        medicines: [{ ...EMPTY_RX_MEDICINE, medicineName: "PCM" }],
      }),
    ).toBe(true);
    expect(
      medicinesScopeHasContent({
        ...createEmptyRxFormFields(),
        medicines: [{ ...EMPTY_RX_MEDICINE }],
      }),
    ).toBe(false);
    expect(
      templateMedicinesHasContent(
        makeTemplate([{ medicineName: "PCM", sortOrder: 0 }]),
      ),
    ).toBe(true);
    expect(templateMedicinesHasContent(makeTemplate([]))).toBe(false);
  });

  it("builds a scoped save payload on medicines_json fields", () => {
    const payload = buildMedicinesTemplateSavePayload({
      ...createEmptyRxFormFields(),
      medicines: [
        {
          ...EMPTY_RX_MEDICINE,
          medicineName: "Paracetamol",
          dosage: "500 mg",
          frequencyCode: "TID",
          frequency: "Three times daily",
          durationValue: 5,
          durationUnit: "days",
          duration: "5 days",
        },
        { ...EMPTY_RX_MEDICINE },
      ],
    });
    expect(payload.scope).toBe(MEDICINES_TEMPLATE_SCOPE);
    expect(payload.medicines).toEqual([
      expect.objectContaining({
        medicineName: "Paracetamol",
        dosage: "500 mg",
        frequencyCode: "TID",
        sortOrder: 0,
      }),
    ]);
  });

  it("applies by replacing medicines sorted by sortOrder", () => {
    const meds = buildMedicinesFromTemplate(
      makeTemplate([
        { medicineName: "Second", sortOrder: 2 },
        { medicineName: "First", sortOrder: 1 },
      ]),
    );
    expect(meds.map((m) => m.medicineName)).toEqual(["First", "Second"]);
  });

  it("seeds an empty editor row when the template has no medicines", () => {
    expect(buildMedicinesFromTemplate(makeTemplate([]))).toEqual([
      { ...EMPTY_RX_MEDICINE },
    ]);
  });

  it("maps template medicine fields onto RxMedicine defaults", () => {
    expect(
      templateMedicineToRxMedicine({
        medicineName: "Amlodipine",
        dosage: "5 mg",
        doseQty: 1,
        doseUnit: "tab",
        frequencyCode: "OD",
      }),
    ).toEqual(
      expect.objectContaining({
        medicineName: "Amlodipine",
        dosage: "5 mg",
        doseQty: 1,
        doseUnit: "tab",
        frequencyCode: "OD",
        drugMasterId: null,
        route: "",
      }),
    );
  });

  it("seeds a short save name from the medicine list", () => {
    expect(
      defaultMedicinesSaveName({
        ...createEmptyRxFormFields(),
        medicines: [{ ...EMPTY_RX_MEDICINE, medicineName: "Paracetamol" }],
      }),
    ).toBe("Paracetamol");
    expect(
      defaultMedicinesSaveName({
        ...createEmptyRxFormFields(),
        medicines: [
          { ...EMPTY_RX_MEDICINE, medicineName: "A" },
          { ...EMPTY_RX_MEDICINE, medicineName: "B" },
          { ...EMPTY_RX_MEDICINE, medicineName: "C" },
        ],
      }),
    ).toBe("Medicines (3)");
  });
});
