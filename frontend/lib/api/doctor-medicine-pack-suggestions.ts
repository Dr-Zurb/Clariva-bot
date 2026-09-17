/**
 * Doctor medicine-pack suggestion API client.
 *
 * GET  /api/v1/doctors/me/medicine-pack-suggestions
 * POST /api/v1/doctors/me/medicine-pack-suggestions/dismiss
 * POST /api/v1/doctors/me/medicine-pack-suggestions/seen
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";
import { authorizedFetch } from "@/lib/auth/authorized-fetch";
import type { DoctorMedicineCombo } from "@/lib/api/doctor-medicine-combos";
import { medicineComboHabitKey } from "@/lib/api/doctor-medicine-combos";

export type DoctorMedicinePackLine = Omit<
  DoctorMedicineCombo,
  "useCount" | "lastUsedAt"
>;

export interface DoctorMedicinePackSuggestion {
  medicines: DoctorMedicinePackLine[];
  useCount: number;
  lastUsedAt: string;
}

export interface DoctorMedicinePackSuggestionList {
  suggestions: DoctorMedicinePackSuggestion[];
  unseenCount: number;
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

export async function fetchDoctorMedicinePackSuggestions(
  token: string
): Promise<DoctorMedicinePackSuggestionList> {
  const res = await authorizedFetch(
    `${requireApiBaseUrl()}/api/v1/doctors/me/medicine-pack-suggestions`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      token,
      cache: "no-store",
    }
  );
  const json = await parseJsonResponse<DoctorMedicinePackSuggestionList>(res);
  return {
    suggestions: json.data.suggestions ?? [],
    unseenCount: json.data.unseenCount ?? 0,
  };
}

export async function dismissDoctorMedicinePackSuggestion(
  token: string,
  medicines: DoctorMedicinePackLine[]
): Promise<void> {
  const res = await authorizedFetch(
    `${requireApiBaseUrl()}/api/v1/doctors/me/medicine-pack-suggestions/dismiss`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      token,
      body: JSON.stringify({
        medicines: medicines.map((row) => medicineComboHabitKey(row)),
      }),
      cache: "no-store",
    }
  );
  await parseJsonResponse<{ dismissed: true }>(res);
}

export async function markDoctorMedicinePackSuggestionsSeen(
  token: string
): Promise<void> {
  const res = await authorizedFetch(
    `${requireApiBaseUrl()}/api/v1/doctors/me/medicine-pack-suggestions/seen`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      token,
      cache: "no-store",
    }
  );
  await parseJsonResponse<{ seen: true }>(res);
}
