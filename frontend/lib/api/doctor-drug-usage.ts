/**
 * Doctor drug usage API client (rx-polish-favorites · rxf-05).
 *
 * GET /api/v1/doctors/me/drug-usage → { scores: Record<drug_master_id, count> }
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";

export type DoctorDrugUsageScores = Record<string, number>;

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

export async function fetchDoctorDrugUsage(token: string): Promise<DoctorDrugUsageScores> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/doctors/me/drug-usage`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "default",
  });
  const json = await parseJsonResponse<{ scores: DoctorDrugUsageScores }>(res);
  return json.data.scores ?? {};
}
