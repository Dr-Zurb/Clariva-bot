/**
 * Typed API client for backend. Per FRONTEND_RECIPES F1 and CONTRACTS.
 * Base URL from NEXT_PUBLIC_API_URL; auth via Bearer token (Supabase session).
 */

import type {
  AppointmentsListData,
  AppointmentDetailData,
} from "@/types/appointment";
import type { PatientDetailData } from "@/types/patient";
import type {
  DoctorSettings,
  PatchDoctorSettingsPayload,
} from "@/types/doctor-settings";
import type {
  Availability,
  AvailabilitySlot,
} from "@/types/availability";
import type { BlockedTime } from "@/types/blocked-time";

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

// =============================================================================
// Doctor settings (e-task-5)
// =============================================================================

export interface DoctorSettingsData {
  settings: DoctorSettings;
}

/**
 * Fetch doctor settings. Requires auth token.
 */
export async function getDoctorSettings(
  token: string
): Promise<ApiSuccess<DoctorSettingsData>> {
  return request<DoctorSettingsData>("/api/v1/settings/doctor", { token });
}

/**
 * Patch doctor settings (partial update). Requires auth token.
 */
export async function patchDoctorSettings(
  token: string,
  payload: PatchDoctorSettingsPayload
): Promise<ApiSuccess<DoctorSettingsData>> {
  const res = await fetch(`${API_BASE}/api/v1/settings/doctor`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<DoctorSettingsData>
    | ApiError;
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
  return json as ApiSuccess<DoctorSettingsData>;
}

// =============================================================================
// Availability (e-task-5)
// =============================================================================

export interface AvailabilityData {
  availability: Availability[];
}

/**
 * Fetch doctor availability. Requires auth token.
 */
export async function getAvailability(
  token: string
): Promise<ApiSuccess<AvailabilityData>> {
  return request<AvailabilityData>("/api/v1/availability", { token });
}

/**
 * Replace entire availability schedule. Requires auth token.
 */
export async function putAvailability(
  token: string,
  slots: AvailabilitySlot[]
): Promise<ApiSuccess<AvailabilityData>> {
  const res = await fetch(`${API_BASE}/api/v1/availability`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ slots }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<AvailabilityData>
    | ApiError;
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
  return json as ApiSuccess<AvailabilityData>;
}

// =============================================================================
// Blocked times (e-task-5)
// =============================================================================

export interface BlockedTimesData {
  blockedTimes: BlockedTime[];
}

export interface BlockedTimeCreateData {
  blockedTime: BlockedTime;
}

/**
 * Fetch blocked times. Optional start_date and end_date (YYYY-MM-DD).
 */
export async function getBlockedTimes(
  token: string,
  params?: { start_date?: string; end_date?: string }
): Promise<ApiSuccess<BlockedTimesData>> {
  const search = new URLSearchParams();
  if (params?.start_date) search.set("start_date", params.start_date);
  if (params?.end_date) search.set("end_date", params.end_date);
  const qs = search.toString();
  const path = qs ? `/api/v1/blocked-times?${qs}` : "/api/v1/blocked-times";
  return request<BlockedTimesData>(path, { token });
}

/**
 * Create blocked time. Requires start_time and end_time (ISO 8601).
 */
export async function postBlockedTime(
  token: string,
  data: { start_time: string; end_time: string; reason?: string }
): Promise<ApiSuccess<BlockedTimeCreateData>> {
  const res = await fetch(`${API_BASE}/api/v1/blocked-times`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<BlockedTimeCreateData>
    | ApiError;
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
  return json as ApiSuccess<BlockedTimeCreateData>;
}

/**
 * Delete blocked time by ID. Returns 204 on success.
 */
export async function deleteBlockedTime(
  token: string,
  id: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/blocked-times/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as ApiError | unknown;
    const message =
      typeof json === "object" &&
      json !== null &&
      "error" in json &&
      typeof (json as ApiError).error?.message === "string"
        ? (json as ApiError).error.message
        : "Delete failed";
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}
