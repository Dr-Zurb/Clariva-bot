/**
 * Complaint master API client (subjective-tab · subj-06)
 * GET /api/v1/complaints/search?q=&limit=
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";
import type { ComplaintMasterRow } from "@/types/complaint-master";

export interface ComplaintSearchResultsData {
  results: ComplaintMasterRow[];
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

export async function searchComplaints(
  token: string,
  query: string,
  options: { limit?: number } = {},
): Promise<ApiSuccess<ComplaintSearchResultsData>> {
  const params = new URLSearchParams();
  params.set("q", query);
  if (options.limit) params.set("limit", String(options.limit));

  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/complaints/search?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );
  return parseJsonResponse<ComplaintSearchResultsData>(res);
}
