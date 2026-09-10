/**
 * Per-doctor medicine + sig habit (typed name, not catalog generic).
 * Aggregated from attested prescription_medicines — no patient fields.
 */

export interface DoctorMedicineCombo {
  medicineName: string;
  nameKey: string;
  dosage: string;
  doseQty: number | null;
  doseUnit: string | null;
  frequencyCode: string | null;
  frequency: string;
  durationValue: number | null;
  durationUnit: string | null;
  duration: string;
  foodTiming: string | null;
  routeCode: string | null;
  route: string;
  form: string | null;
  drugMasterId: string | null;
  useCount: number;
  lastUsedAt: string;
}
