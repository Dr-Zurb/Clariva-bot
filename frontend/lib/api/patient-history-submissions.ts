/**
 * Appointment-scoped desk history sidecar (dvp P2).
 * Doctor GET + per-item accept. Do not add these helpers to lib/api.ts.
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiError, ApiSuccess } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import type {
  AcceptHistorySubmissionBody,
  AcceptHistorySubmissionResult,
  HistorySubmissionView,
} from "@/types/patient-history-submissions";

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in (json as Record<string, unknown>) &&
    (json as { success?: unknown }).success === false
  );
}

async function requestJson<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<ApiSuccess<T>> {
  const res = await fetch(`${requireApiBaseUrl()}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    body: init?.body,
  });

  const json = (await res.json().catch(() => ({}))) as ApiSuccess<T> | ApiError;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = res.status;
    if (isApiError(json)) err.code = json.error.code;
    throw err;
  }
  if (isApiError(json)) {
    const err = new Error(json.error.message) as Error & {
      status?: number;
      code?: string;
    };
    err.status = json.error.statusCode ?? 500;
    err.code = json.error.code;
    throw err;
  }
  return json;
}

export function historySubmissionQueryKey(appointmentId: string) {
  return queryKeys.consult(appointmentId).historySubmission();
}

/** PHI-free ping so the safety surface refetches after a doctor accept. */
export const HISTORY_SUBMISSION_CHANGED_EVENT = "clariva:history-submission-changed";

export function notifyHistorySubmissionChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HISTORY_SUBMISSION_CHANGED_EVENT));
}

export async function getAppointmentHistorySubmission(
  token: string,
  appointmentId: string,
): Promise<ApiSuccess<HistorySubmissionView>> {
  return requestJson<HistorySubmissionView>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/history-submission`,
    token,
  );
}

export async function acceptHistorySubmissionItem(
  token: string,
  appointmentId: string,
  body: AcceptHistorySubmissionBody,
): Promise<ApiSuccess<AcceptHistorySubmissionResult>> {
  return requestJson<AcceptHistorySubmissionResult>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/history-submission/accept`,
    token,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}
