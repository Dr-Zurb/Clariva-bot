/**
 * Doctor medicine-combo API client.
 *
 * GET /api/v1/doctors/me/medicine-combos → { combos: DoctorMedicineCombo[] }
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";

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
      cache: "default",
    }
  );
  const json = await parseJsonResponse<{ combos: DoctorMedicineCombo[] }>(res);
  return json.data.combos ?? [];
}
