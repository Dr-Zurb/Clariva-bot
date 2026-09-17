/**
 * Recurring attested medicine-set suggestion (not a saved template yet).
 * Lines use the same habit identity as doctor medicine combos — no PHI.
 */

import type { DoctorMedicineCombo } from './doctor-medicine-combo';

export type DoctorMedicinePackLine = Omit<DoctorMedicineCombo, 'useCount' | 'lastUsedAt'>;

export interface DoctorMedicinePackSuggestion {
  medicines: DoctorMedicinePackLine[];
  useCount: number;
  lastUsedAt: string;
}
