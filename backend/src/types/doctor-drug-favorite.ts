/**
 * Doctor drug favorite types (rx-polish-favorites · rxf-04).
 *
 * Per-doctor saved medicine row templates. `template` JSONB stores the
 * camelCase MedicineRowValue shape used by the cockpit <MedicineRow>.
 */

import type {
  DurationUnit,
  FrequencyCode,
  RouteCode,
} from './prescription';

/** Matches frontend `MedicineRowValue`. */
export interface MedicineRowTemplate {
  medicineName: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
  drugMasterId: string | null;
  frequencyCode: FrequencyCode | null;
  durationValue: number | null;
  durationUnit: DurationUnit | null;
  routeCode: RouteCode | null;
}

export interface DoctorDrugFavoriteRow {
  id: string;
  doctor_id: string;
  name: string;
  template: MedicineRowTemplate;
  created_at: string;
  updated_at: string;
}

export interface CreateDoctorDrugFavoriteInput {
  name: string;
  template: MedicineRowTemplate;
}

export interface UpdateDoctorDrugFavoriteInput {
  name?: string;
  template?: MedicineRowTemplate;
}
