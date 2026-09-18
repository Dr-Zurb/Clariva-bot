/**
 * Doctor complaint-combo API client.
 *
 * GET /api/v1/doctors/me/complaint-combos → { combos: DoctorComplaintCombo[] }
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";
import { authorizedFetch } from "@/lib/auth/authorized-fetch";

export interface DoctorComplaintCombo {
  complaintName: string;
  nameKey: string;
  category: string | null;
  severityBand: string | null;
  laterality: string | null;
  character: string | null;
  associatedNames: string[];
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

export async function fetchDoctorComplaintCombos(
  token: string
): Promise<DoctorComplaintCombo[]> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/doctors/me/complaint-combos`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );
  const json = await parseJsonResponse<{ combos: DoctorComplaintCombo[] }>(res);
  return json.data.combos ?? [];
}

export type ComplaintComboHabitKey = Pick<
  DoctorComplaintCombo,
  | "nameKey"
  | "category"
  | "severityBand"
  | "laterality"
  | "character"
  | "associatedNames"
>;

export function complaintComboHabitKey(
  combo: ComplaintComboHabitKey
): ComplaintComboHabitKey {
  return {
    nameKey: combo.nameKey,
    category: combo.category,
    severityBand: combo.severityBand,
    laterality: combo.laterality,
    character: combo.character,
    associatedNames: combo.associatedNames,
  };
}

function associatedKey(names: readonly string[]): string {
  return names
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(",");
}

export function sameComplaintComboHabit(
  a: ComplaintComboHabitKey,
  b: ComplaintComboHabitKey
): boolean {
  return (
    a.nameKey === b.nameKey &&
    (a.category ?? "") === (b.category ?? "") &&
    (a.severityBand ?? "") === (b.severityBand ?? "") &&
    (a.laterality ?? "") === (b.laterality ?? "") &&
    (a.character ?? "") === (b.character ?? "") &&
    associatedKey(a.associatedNames) === associatedKey(b.associatedNames)
  );
}

export async function clearDoctorComplaintCombo(
  token: string,
  habit: ComplaintComboHabitKey
): Promise<void> {
  const res = await authorizedFetch(
    `${requireApiBaseUrl()}/api/v1/doctors/me/complaint-combos/clear`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      token,
      body: JSON.stringify(complaintComboHabitKey(habit)),
      cache: "no-store",
    }
  );
  await parseJsonResponse<{ cleared: true }>(res);
}
