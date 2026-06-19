import type { MedicineRowValue } from "@/components/consultation/MedicineRow";

/**
 * Whether a medicine row is "complete + valid" — the gate for collapsing
 * from editor-mode to summary-mode (rxd-02 / R-RX-POLISH/2.1).
 *
 * Rules (DL-1 of rx-polish-densification):
 *  - drug name non-empty (trimmed)
 *  - dose present (strength text `dosage` OR structured `doseQty` + `doseUnit`)
 *  - frequency present (structured `frequencyCode` OR legacy text `frequency`)
 *  - duration present (structured `durationValue` + `durationUnit` OR legacy text `duration`)
 *  - route + instructions are OPTIONAL — a row can be complete without them
 *  - `drugMasterId` is OPTIONAL — free-text drug names are valid
 */
export function isMedicineRowComplete(value: MedicineRowValue): boolean {
  if (!value.medicineName.trim()) return false;

  const hasStructuredDose = value.doseQty != null && value.doseUnit != null;
  if (!value.dosage.trim() && !hasStructuredDose) return false;

  const hasFrequency =
    value.frequencyCode !== null || value.frequency.trim().length > 0;
  if (!hasFrequency) return false;

  const hasStructuredDuration =
    value.durationValue !== null && value.durationUnit !== null;
  const hasLegacyDuration = value.duration.trim().length > 0;
  if (!hasStructuredDuration && !hasLegacyDuration) return false;

  return true;
}
