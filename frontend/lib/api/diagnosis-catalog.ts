/**
 * Diagnosis catalog API client (assessment-tab · asmt-06)
 * GET /api/v1/diagnoses/search?q=&limit=
 * Mirrors `complaint-master.ts`.
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";
import type { DiagnosisCatalogRow } from "@/types/diagnosis-catalog";

export interface DiagnosisSearchResultsData {
  results: DiagnosisCatalogRow[];
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

export async function searchDiagnoses(
  token: string,
  query: string,
  options: { limit?: number } = {},
): Promise<ApiSuccess<DiagnosisSearchResultsData>> {
  const params = new URLSearchParams();
  params.set("q", query);
  if (options.limit) params.set("limit", String(options.limit));

  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/diagnoses/search?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );
  return parseJsonResponse<DiagnosisSearchResultsData>(res);
}
