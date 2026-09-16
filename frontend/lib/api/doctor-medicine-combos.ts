/**
 * Doctor medicine-combo API client.
 *
 * GET /api/v1/doctors/me/medicine-combos → { combos: DoctorMedicineCombo[] }
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";
import { authorizedFetch } from "@/lib/auth/authorized-fetch";

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

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in (json as Record<string, unknown>) &&
    (json as { success?: unknown }).success === false
  );
}

async function parseJsonResponse<T>(res: Response): Promise<ApiSuccess<T>> {
  const json = (await res.json().catch(() => ({}))) as ApiSuccess<T> | ApiError;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (isApiError(json)) {
    const err = new Error(json.error.message) as Error & { status?: number };
    err.status = json.error.statusCode ?? 500;
    throw err;
  }
  return json as ApiSuccess<T>;
}

export async function fetchDoctorMedicineCombos(
  token: string
): Promise<DoctorMedicineCombo[]> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/doctors/me/medicine-combos`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );
  const json = await parseJsonResponse<{ combos: DoctorMedicineCombo[] }>(res);
  return json.data.combos ?? [];
}

export type MedicineComboHabitKey = Pick<
  DoctorMedicineCombo,
  | "nameKey"
  | "dosage"
  | "doseQty"
  | "doseUnit"
  | "frequencyCode"
  | "frequency"
  | "durationValue"
  | "durationUnit"
  | "duration"
  | "foodTiming"
  | "routeCode"
  | "form"
>;

export function medicineComboHabitKey(
  combo: MedicineComboHabitKey
): MedicineComboHabitKey {
  return {
    nameKey: combo.nameKey,
    dosage: combo.dosage,
    doseQty: combo.doseQty,
    doseUnit: combo.doseUnit,
    frequencyCode: combo.frequencyCode,
    frequency: combo.frequency,
    durationValue: combo.durationValue,
    durationUnit: combo.durationUnit,
    duration: combo.duration,
    foodTiming: combo.foodTiming,
    routeCode: combo.routeCode,
    form: combo.form,
  };
}

export function sameMedicineComboHabit(
  a: MedicineComboHabitKey,
  b: MedicineComboHabitKey
): boolean {
  return (
    a.nameKey === b.nameKey &&
    a.dosage === b.dosage &&
    a.doseQty === b.doseQty &&
    a.doseUnit === b.doseUnit &&
    a.frequencyCode === b.frequencyCode &&
    a.frequency === b.frequency &&
    a.durationValue === b.durationValue &&
    a.durationUnit === b.durationUnit &&
    a.duration === b.duration &&
    a.foodTiming === b.foodTiming &&
    a.routeCode === b.routeCode &&
    a.form === b.form
  );
}

export async function clearDoctorMedicineCombo(
  token: string,
  habit: MedicineComboHabitKey
): Promise<void> {
  const res = await authorizedFetch(
    `${requireApiBaseUrl()}/api/v1/doctors/me/medicine-combos/clear`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      token,
      body: JSON.stringify(medicineComboHabitKey(habit)),
      cache: "no-store",
    }
  );
  await parseJsonResponse<{ cleared: true }>(res);
}
