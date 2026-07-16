/**
 * Save / apply helpers for Plan medications section templates.
 * Form-state only — persists the medicine list on
 * `doctor_rx_templates.medicines_json` (scope `medicines`).
 */

import {
  EMPTY_RX_MEDICINE,
  type RxFormFields,
  type RxMedicine,
} from "@/components/cockpit/rx/RxFormContext";
import type {
  CreateRxTemplatePayload,
  DoctorRxTemplate,
  RxTemplateMedicine,
} from "@/types/rx-template";

export const MEDICINES_TEMPLATE_SCOPE = "medicines" as const;

export function medicinesNamedCount(
  medicines: ReadonlyArray<Pick<RxMedicine, "medicineName">>,
): number {
  return medicines.filter((m) => m.medicineName.trim().length > 0).length;
}

export function medicinesScopeHasContent(
  fields: Pick<RxFormFields, "medicines">,
): boolean {
  return medicinesNamedCount(fields.medicines) > 0;
}

export function templateMedicinesHasContent(
  template: DoctorRxTemplate,
): boolean {
  return medicinesNamedCount(
    (template.medicines_json ?? []).map((m) => ({
      medicineName: m.medicineName ?? "",
    })),
  ) > 0;
}

export function templateMedicineToRxMedicine(
  m: RxTemplateMedicine,
): RxMedicine {
  return {
    ...EMPTY_RX_MEDICINE,
    medicineName: m.medicineName ?? "",
    dosage: m.dosage ?? "",
    route: m.route ?? "",
    frequency: m.frequency ?? "",
    duration: m.duration ?? "",
    instructions: m.instructions ?? "",
    drugMasterId: m.drugMasterId ?? null,
    frequencyCode: m.frequencyCode ?? null,
    durationValue: m.durationValue ?? null,
    durationUnit: m.durationUnit ?? null,
    routeCode: m.routeCode ?? null,
    doseQty: m.doseQty ?? null,
    doseUnit: m.doseUnit ?? null,
    form: m.form ?? null,
    foodTiming: m.foodTiming ?? null,
  };
}

/** Replace the current medicines list with the template (scoped replace). */
export function buildMedicinesFromTemplate(
  template: DoctorRxTemplate,
): RxMedicine[] {
  const meds = (template.medicines_json ?? [])
    .slice()
    .sort(
      (a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
        (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
    )
    .map(templateMedicineToRxMedicine);

  if (meds.length === 0) return [{ ...EMPTY_RX_MEDICINE }];
  return meds;
}

export function buildMedicinesTemplateSavePayload(
  fields: Pick<RxFormFields, "medicines">,
): Omit<CreateRxTemplatePayload, "name"> {
  const medicines: RxTemplateMedicine[] = fields.medicines
    .filter((m) => m.medicineName.trim().length > 0)
    .map((m, index) => ({
      drugMasterId: m.drugMasterId,
      medicineName: m.medicineName,
      dosage: m.dosage,
      route: m.route,
      frequency: m.frequency,
      duration: m.duration,
      instructions: m.instructions,
      sortOrder: index,
      frequencyCode: m.frequencyCode,
      durationValue: m.durationValue,
      durationUnit: m.durationUnit,
      routeCode: m.routeCode,
      doseQty: m.doseQty,
      doseUnit: m.doseUnit,
      form: m.form,
      foodTiming: m.foodTiming,
    }));

  return {
    scope: MEDICINES_TEMPLATE_SCOPE,
    medicines,
  };
}

export function defaultMedicinesSaveName(
  fields: Pick<RxFormFields, "medicines">,
): string {
  const named = fields.medicines.filter((m) => m.medicineName.trim().length > 0);
  if (named.length <= 0) return "Medicines";
  if (named.length === 1) {
    const label = named[0]!.medicineName.trim();
    return label.length > 40 ? `${label.slice(0, 37)}…` : label;
  }
  return `Medicines (${named.length})`;
}
