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

// =============================================================================
// Instagram settings (e-task-5)
// =============================================================================

export interface InstagramStatusData {
  connected: boolean;
  username: string | null;
}

/**
 * Fetch Instagram connection status for the current doctor. Requires auth token.
 */
export async function getInstagramStatus(
  token: string
): Promise<ApiSuccess<InstagramStatusData>> {
  return request<InstagramStatusData>("/api/v1/settings/instagram/status", {
    token,
  });
}

/**
 * Start Instagram connect flow: fetch backend connect endpoint with auth;
 * backend returns 200 with JSON { redirectUrl } (avoids opaqueredirect when
 * cross-origin fetch would get 302). Then navigate to redirectUrl for Meta OAuth.
 * Call from client only (browser navigation).
 */
export async function redirectToInstagramConnect(token: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/settings/instagram/connect`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new Error("Could not start Instagram connect");
  }
  const json = (await res.json()) as { redirectUrl?: string };
  if (json?.redirectUrl) {
    window.location.href = json.redirectUrl;
    return;
  }
  throw new Error("Could not start Instagram connect");
}

/**
 * Disconnect Instagram for the current doctor. Requires auth token.
 * Backend returns 204 No Content on success.
 */
export async function disconnectInstagram(token: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/settings/instagram/disconnect`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as ApiError | unknown;
    const message =
      typeof json === "object" &&
      json !== null &&
      "error" in json &&
      typeof (json as ApiError).error?.message === "string"
        ? (json as ApiError).error.message
        : "Disconnect failed";
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}
