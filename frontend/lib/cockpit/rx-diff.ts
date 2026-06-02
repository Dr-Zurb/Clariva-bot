import type { MedicineRowValue } from "@/components/consultation/MedicineRow";
import type { PrescriptionMedicine } from "@/types/prescription";

export interface MedicineDiffRow {
  status: "added" | "removed" | "unchanged";
  value: MedicineRowValue;
  /** Source — "current" or "prior" — useful for the diff preview UI. */
  source: "current" | "prior";
}

/**
 * Convert a PrescriptionMedicine (DB shape) to MedicineRowValue (form shape).
 */
export function medicineToRowValue(m: PrescriptionMedicine): MedicineRowValue {
  return {
    medicineName: m.medicine_name ?? "",
    dosage: m.dosage ?? "",
    route: m.route ?? "",
    frequency: m.frequency ?? "",
    duration: m.duration ?? "",
    instructions: m.instructions ?? "",
    drugMasterId: m.drug_master_id ?? null,
    frequencyCode: m.frequency_code ?? null,
    durationValue: m.duration_value ?? null,
    durationUnit: m.duration_unit ?? null,
    routeCode: m.route_code ?? null,
  };
}

/**
 * Compute the result of applying `priorMeds` to `currentMeds` in the given mode.
 * - "append": result = currentMeds + priorMeds (de-duped by drug name + dosage)
 * - "replace": result = priorMeds (current discarded)
 */
export function applyMode(
  currentMeds: MedicineRowValue[],
  priorMeds: MedicineRowValue[],
  mode: "append" | "replace",
): MedicineRowValue[] {
  if (mode === "replace") return priorMeds.slice();
  const seenKey = (m: MedicineRowValue) =>
    `${m.medicineName.toLowerCase().trim()}|${m.dosage.toLowerCase().trim()}`;
  const seen = new Set(currentMeds.map(seenKey));
  const additions = priorMeds.filter((m) => !seen.has(seenKey(m)));
  return [...currentMeds, ...additions];
}

/** Per-row diff for the preview UI. */
export function diffMedicines(
  currentMeds: MedicineRowValue[],
  finalMeds: MedicineRowValue[],
): MedicineDiffRow[] {
  const finalKeys = new Set(finalMeds.map((m) => `${m.medicineName}|${m.dosage}`));
  const currentKeys = new Set(currentMeds.map((m) => `${m.medicineName}|${m.dosage}`));

  const rows: MedicineDiffRow[] = [];
  for (const m of finalMeds) {
    const k = `${m.medicineName}|${m.dosage}`;
    rows.push({
      status: currentKeys.has(k) ? "unchanged" : "added",
      value: m,
      source: currentKeys.has(k) ? "current" : "prior",
    });
  }
  for (const m of currentMeds) {
    const k = `${m.medicineName}|${m.dosage}`;
    if (!finalKeys.has(k)) rows.push({ status: "removed", value: m, source: "current" });
  }
  return rows;
}
