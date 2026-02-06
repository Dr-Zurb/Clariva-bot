/**
 * Typed API client for backend. Per FRONTEND_RECIPES F1 and CONTRACTS.
 * Base URL from NEXT_PUBLIC_API_URL; auth via Bearer token (Supabase session).
 */

import type {
  AppointmentsListData,
  AppointmentDetailData,
} from "@/types/appointment";
import type { PatientDetailData } from "@/types/patient";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface ApiMeta {
  timestamp: string;
  requestId: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: ApiMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    statusCode?: number;
  };
  meta: ApiMeta;
}

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in json &&
    (json as ApiError).success === false
  );
}

async function request<T>(
  path: string,
  options: { token?: string } = {}
): Promise<ApiSuccess<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.token && { Authorization: `Bearer ${options.token}` }),
    },
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as ApiSuccess<T> | ApiError;

  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & {
      status?: number;
      body?: unknown;
    };
    err.status = res.status;
    err.body = json;
    throw err;
  }

  if (isApiError(json)) {
    const err = new Error(json.error.message) as Error & {
      status?: number;
      body?: unknown;
    };
    err.status = json.error.statusCode ?? 500;
    err.body = json;
    throw err;
  }

  return json as ApiSuccess<T>;
}

/**
 * Fetch list of appointments for the current doctor. Requires auth token.
 */
export async function getAppointments(
  token: string
): Promise<ApiSuccess<AppointmentsListData>> {
  return request<AppointmentsListData>("/api/v1/appointments", { token });
}

/**
 * Fetch a single appointment by ID. Requires auth token.
 * Throws on 404 (not found) or 403 (unauthorized).
 */
export async function getAppointmentById(
  id: string,
  token: string
): Promise<ApiSuccess<AppointmentDetailData>> {
  return request<AppointmentDetailData>(`/api/v1/appointments/${id}`, {
    token,
  });
}

/**
 * Fetch a single patient by ID. Requires auth token.
 * Throws on 404 (not found) or 403 (no access).
 */
export async function getPatientById(
  id: string,
  token: string
): Promise<ApiSuccess<PatientDetailData>> {
  return request<PatientDetailData>(`/api/v1/patients/${id}`, { token });
}
