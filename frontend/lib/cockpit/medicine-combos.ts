/**
 * Client-side filter + preview for doctor medicine+sig habits.
 */

import type { DoctorMedicineCombo } from "@/lib/api/doctor-medicine-combos";
import { formatMedicineSigLine } from "@/lib/medicineCodes";
import type {
  DoseUnit,
  DurationUnit,
  FoodTiming,
  FrequencyCode,
} from "@/types/prescription";

export const MEDICINE_COMBO_MIN_QUERY = 2;
export const MEDICINE_COMBO_DISPLAY_CAP = 3;

export function matchMedicineCombos(
  combos: readonly DoctorMedicineCombo[],
  query: string,
  limit = MEDICINE_COMBO_DISPLAY_CAP
): DoctorMedicineCombo[] {
  const q = query.trim().toLowerCase();
  if (q.length < MEDICINE_COMBO_MIN_QUERY) return [];

  return combos.filter((combo) => combo.nameKey.startsWith(q)).slice(0, limit);
}

export function formatMedicineComboSig(combo: DoctorMedicineCombo): string {
  return formatMedicineSigLine({
    dosage: combo.dosage,
    doseQty: combo.doseQty,
    doseUnit: combo.doseUnit as DoseUnit | null,
    frequencyCode: combo.frequencyCode as FrequencyCode | null,
    frequency: combo.frequency,
    durationValue: combo.durationValue,
    durationUnit: combo.durationUnit as DurationUnit | null,
    duration: combo.duration,
    foodTiming: combo.foodTiming as FoodTiming | null,
    route: combo.route,
    instructions: "",
  });
}

export function formatMedicineComboHint(combo: DoctorMedicineCombo): string {
  const sig = formatMedicineComboSig(combo);
  return sig ? `${combo.medicineName} · ${sig}` : combo.medicineName;
}
