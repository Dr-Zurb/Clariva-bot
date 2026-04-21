/**
 * Typed API client for backend. Per FRONTEND_RECIPES F1 and CONTRACTS.
 * Base URL: NEXT_PUBLIC_API_URL (all runtimes); optional API_URL / BACKEND_API_URL on the server.
 * Auth via Bearer token (Supabase session).
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type {
  Appointment,
  AppointmentsListData,
  AppointmentDetailData,
} from "@/types/appointment";
import type {
  PatientDetailData,
  PatientsListData,
  PossibleDuplicatesData,
} from "@/types/patient";
import type {
  DoctorSettings,
  PatchDoctorSettingsPayload,
} from "@/types/doctor-settings";
import type {
  Availability,
  AvailabilitySlot,
} from "@/types/availability";
import type { BlockedTime } from "@/types/blocked-time";
import type {
  PrescriptionWithRelations,
  CreatePrescriptionPayload,
  UpdatePrescriptionPayload,
} from "@/types/prescription";
import type { OpdSessionSnapshotData } from "@/types/opd-session";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";
import type {
  ServiceStaffReviewListItem,
  ServiceStaffReviewListQueryStatus,
} from "@/types/service-staff-review";

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
    /**
     * Optional structured detail payload. Backends surface per-error
     * hints here — e.g. `{ retry_after_seconds: 120 }` for rate-limit
     * responses and `{ lastVerifiedAt: ISO|null }` for the Plan 08
     * Task 44 `video_otp_required` gate. Shape is per-code and the
     * caller is responsible for a narrowing check.
     */
    details?: Record<string, unknown>;
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
  const base = requireApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.token && { Authorization: `Bearer ${options.token}` }),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let parsed: unknown = {};
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = {};
    }
  }
  const json = parsed as ApiSuccess<T> | ApiError;

  if (!res.ok) {
    let message = isApiError(json) ? json.error.message : "Request failed";
    if (!isApiError(json)) {
      const trimmed = text.trimStart();
      if (trimmed.startsWith("<") || trimmed.startsWith("<!")) {
        message =
          "The dashboard could not reach the Clariva API (received HTML instead of JSON). Set NEXT_PUBLIC_API_URL in your deployment to your backend origin (e.g. https://your-api.onrender.com), with no trailing slash.";
      }
    }
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

/** Payload for creating an appointment (doctor dashboard). */
export interface CreateAppointmentPayload {
  patientId?: string;
  patientName?: string;
  patientPhone?: string;
  appointmentDate: string;
  reasonForVisit: string;
  notes?: string;
  freeOfCost?: boolean;
}

/**
 * Create an appointment (doctor-only). Requires auth token.
 * Either patientId or both patientName and patientPhone required.
 */
export async function createAppointment(
  token: string,
  payload: CreateAppointmentPayload
): Promise<ApiSuccess<{ appointment: Appointment }>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/appointments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ appointment: Appointment }>
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
  return json as ApiSuccess<{ appointment: Appointment }>;
}

/** Available slot for doctor dashboard (start/end ISO strings). */
export interface AvailableSlot {
  start: string;
  end: string;
}

/**
 * Fetch available slots for a doctor on a date.
 * No auth required (used by public booking too).
 */
export async function getAvailableSlots(
  doctorId: string,
  date: string
): Promise<ApiSuccess<{ slots: AvailableSlot[] }>> {
  const params = new URLSearchParams({ doctorId, date });
  return request<{ slots: AvailableSlot[] }>(
    `/api/v1/appointments/available-slots?${params.toString()}`
  );
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
 * Fetch list of patients for the current doctor. Requires auth token.
 */
export async function getPatients(
  token: string
): Promise<ApiSuccess<PatientsListData>> {
  return request<PatientsListData>("/api/v1/patients", { token });
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

/**
 * Fetch possible duplicate patient groups. Requires auth token.
 */
export async function getPossibleDuplicates(
  token: string
): Promise<ApiSuccess<PossibleDuplicatesData>> {
  return request<PossibleDuplicatesData>("/api/v1/patients/possible-duplicates", {
    token,
  });
}

/**
 * Merge source patient into target patient. Requires auth token.
 * Body: { sourcePatientId, targetPatientId }
 */
export async function mergePatients(
  token: string,
  body: { sourcePatientId: string; targetPatientId: string }
): Promise<ApiSuccess<{ merged: boolean }>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/patients/merge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ merged: boolean }>
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
  return json as ApiSuccess<{ merged: boolean }>;
}

// =============================================================================
// Instagram settings (e-task-5)
// =============================================================================

/** Instagram health (RBH-10); from GET /settings/instagram/status */
export interface InstagramHealthData {
  level: "ok" | "warning" | "error" | "unknown" | "not_connected";
  checkedAt: string | null;
  tokenExpiresAt: string | null;
  lastDmSuccessAt: string | null;
  message: string;
  reconnectRecommended: boolean;
}

export interface InstagramStatusData {
  connected: boolean;
  username: string | null;
  health?: InstagramHealthData;
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
    `${requireApiBaseUrl()}/api/v1/settings/instagram/connect`,
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
    `${requireApiBaseUrl()}/api/v1/settings/instagram/disconnect`,
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
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/settings/doctor`, {
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
// Doctor OPD dashboard (e-task-opd-06)
// =============================================================================

export interface DoctorOpdQueueSessionData {
  entries: DoctorQueueSessionRow[];
  date: string;
}

/**
 * Queue list for a session day (queue mode). Requires auth.
 */
export async function getDoctorOpdQueueSession(
  token: string,
  date: string
): Promise<ApiSuccess<DoctorOpdQueueSessionData>> {
  const params = new URLSearchParams({ date });
  return request<DoctorOpdQueueSessionData>(
    `/api/v1/opd/queue-session?${params.toString()}`,
    { token }
  );
}

export async function postDoctorOfferEarlyJoin(
  token: string,
  appointmentId: string,
  body?: { expiresInMinutes?: number }
): Promise<ApiSuccess<{ offered: boolean; expiresInMinutes: number }>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/opd/appointments/${appointmentId}/offer-early-join`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ offered: boolean; expiresInMinutes: number }>
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
  return json as ApiSuccess<{ offered: boolean; expiresInMinutes: number }>;
}

export async function postDoctorSessionDelay(
  token: string,
  appointmentId: string,
  delayMinutes: number | null
): Promise<ApiSuccess<{ updated: boolean; delayMinutes: number | null }>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/opd/appointments/${appointmentId}/session-delay`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ delayMinutes }),
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ updated: boolean; delayMinutes: number | null }>
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
  return json as ApiSuccess<{ updated: boolean; delayMinutes: number | null }>;
}

export async function patchDoctorQueueEntry(
  token: string,
  entryId: string,
  status: "called" | "skipped"
): Promise<ApiSuccess<{ updated: boolean; status: string }>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/opd/queue-entries/${entryId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ updated: boolean; status: string }>
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
  return json as ApiSuccess<{ updated: boolean; status: string }>;
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
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/availability`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ slots }),
    cache: "no-store",
    keepalive: true,
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
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/blocked-times`, {
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
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/blocked-times/${id}`, {
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

// =============================================================================
// Booking slot picker (e-task-4) — public, token-based (no Bearer auth)
// =============================================================================

export type OpdModeApi = "slot" | "queue";

/** SFU-07: teleconsult modality for /book + select-slot-and-pay */
export type ConsultationModalityApi = "text" | "voice" | "video";

export interface BookingPageCatalogServiceApi {
  service_id: string;
  service_key: string;
  label: string;
  modalities: Partial<
    Record<ConsultationModalityApi, { enabled: true; price_minor: number }>
  >;
}

export interface BookingPageCatalogApi {
  version: 1;
  services: BookingPageCatalogServiceApi[];
  feeCurrency: string;
}

/** ARM-09: matcher band for /book UI (no PHI). */
export type ServiceCatalogMatchConfidenceApi = "high" | "medium" | "low";

/** ARM-10: why /book cannot proceed to payment yet */
export type BookingBlockedReasonApi =
  | "staff_review_pending"
  | "service_selection_not_finalized";

export interface SlotPageInfoData {
  doctorId: string;
  practiceName: string;
  conversationId: string;
  mode?: "book" | "reschedule";
  appointmentId?: string;
  opdMode?: OpdModeApi;
  /**
   * ARM-10: false when payment must not run until chat/staff gate clears.
   * Reschedule flow is always allowed here (true).
   */
  bookingAllowed?: boolean;
  bookingBlockedReason?: BookingBlockedReasonApi;
  /** Token-scoped doctor catalog for service + modality picker (book flow only). */
  serviceCatalog?: BookingPageCatalogApi | null;
  /** Pre-fill from chat when staff confirmed or auto-finalized; omitted if pending staff or not final. */
  suggestedCatalogServiceKey?: string;
  suggestedCatalogServiceId?: string;
  suggestedConsultationModality?: ConsultationModalityApi;
  matchConfidence?: ServiceCatalogMatchConfidenceApi;
  serviceSelectionFinalized?: boolean;
  /** When true, do not let the patient switch to another service row (visit type fixed in chat). */
  servicePickerLocked?: boolean;
}

export interface DaySlotWithStatus {
  start: string;
  end: string;
  status: "available" | "booked";
}

export interface DaySlotsData {
  slots: DaySlotWithStatus[];
  timezone: string;
  opdMode?: OpdModeApi;
}

export interface SelectSlotData {
  redirectUrl: string;
}

export interface SelectSlotAndPayData {
  paymentUrl: string | null;
  redirectUrl: string;
  appointmentId: string;
  mode?: "book" | "reschedule";
  opdMode?: OpdModeApi;
  tokenNumber?: number;
}

export interface RedirectUrlData {
  redirectUrl: string;
}

/**
 * Fetch slot page info (practice name, etc.). Verifies token.
 * Use on page load; if fails, token is invalid.
 */
export async function getSlotPageInfo(
  bookingToken: string
): Promise<ApiSuccess<SlotPageInfoData>> {
  const params = new URLSearchParams({ token: bookingToken });
  return request<SlotPageInfoData>(
    `/api/v1/bookings/slot-page-info?${params.toString()}`
  );
}

/**
 * Fetch all slots for a day with status (available | booked).
 */
export async function getDaySlots(
  bookingToken: string,
  date: string
): Promise<ApiSuccess<DaySlotsData>> {
  const params = new URLSearchParams({ token: bookingToken, date });
  return request<DaySlotsData>(
    `/api/v1/bookings/day-slots?${params.toString()}`
  );
}

/**
 * Submit selected slot. Returns redirectUrl to Instagram.
 */
export async function selectSlot(
  bookingToken: string,
  slotStart: string
): Promise<ApiSuccess<SelectSlotData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/bookings/select-slot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: bookingToken, slotStart }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<SelectSlotData>
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
  return json as ApiSuccess<SelectSlotData>;
}

/**
 * Submit selected slot and create appointment + payment link.
 * Returns paymentUrl (Razorpay) when fee > 0, or redirectUrl only when no fee.
 */
export async function selectSlotAndPay(
  bookingToken: string,
  slotStart: string,
  catalog?: {
    catalogServiceKey?: string;
    catalogServiceId?: string;
    consultationModality?: ConsultationModalityApi;
  }
): Promise<ApiSuccess<SelectSlotAndPayData>> {
  const body: {
    token: string;
    slotStart: string;
    catalogServiceKey?: string;
    catalogServiceId?: string;
    consultationModality?: ConsultationModalityApi;
  } = { token: bookingToken, slotStart };
  if (catalog?.catalogServiceKey) {
    body.catalogServiceKey = catalog.catalogServiceKey;
  }
  if (catalog?.catalogServiceId) {
    body.catalogServiceId = catalog.catalogServiceId;
  }
  if (catalog?.consultationModality) {
    body.consultationModality = catalog.consultationModality;
  }
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/bookings/select-slot-and-pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<SelectSlotAndPayData>
    | ApiError;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    if (isApiError(json)) {
      err.code = json.error.code;
    }
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
  return json as ApiSuccess<SelectSlotAndPayData>;
}

/**
 * Plan 02 · Task 27 — Persist the patient's recording-consent decision.
 *
 * Fires AFTER `selectSlotAndPay` returns (which gives us `appointmentId`)
 * and BEFORE the frontend redirects to the payment URL. Uses the booking
 * token from the URL for auth (patients are not logged in).
 *
 * Returns void on success (backend returns 204). Caller should catch and
 * log errors but should not block the payment redirect on failure — a
 * missed consent write still leaves the row in the default-NULL state,
 * which Plan 04 / 05 handle as "no explicit opt-out = proceed".
 */
export async function postRecordingConsent(
  bookingToken: string,
  appointmentId: string,
  decision: boolean,
  consentVersion: string
): Promise<void> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/appointments/${encodeURIComponent(appointmentId)}/recording-consent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, consentVersion, bookingToken }),
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = "Failed to record consent";
    try {
      const parsed = JSON.parse(text) as ApiError;
      if (isApiError(parsed)) {
        message = parsed.error.message;
      }
    } catch {
      // swallow parse failure; use default message
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}

/**
 * Plan 02 · Task 27 — Read recording-consent decision for a session.
 * Doctor-only (requires auth). Used by the `<SessionStartBanner>` to
 * decide whether to render the "patient declined recording" notice.
 */
export interface RecordingConsentForSessionData {
  decision: boolean | null;
  capturedAt: string | null;
  version: string | null;
}

export async function getRecordingConsentForSession(
  token: string,
  sessionId: string
): Promise<ApiSuccess<RecordingConsentForSessionData>> {
  return request<RecordingConsentForSessionData>(
    `/api/v1/consultation/${encodeURIComponent(sessionId)}/recording-consent`,
    { token }
  );
}

/**
 * Plan 02 · Task 33 — Request patient account deletion.
 *
 * Two auth shapes; the backend resolves internally:
 *   - Doctor JWT path:  pass `token` + `patientId`.
 *   - Booking-token path: pass `bookingToken` (from the patient's
 *     recent slot-picker URL). The backend resolves `patient_id`
 *     from the conversation the booking token binds to.
 *
 * Returns the server-computed `graceWindowUntil` (ISO timestamp) so
 * the UI can render "your account is scheduled for deletion on X".
 * `reused = true` means there was already a pending request — the
 * UI should treat this as an idempotent success, not an error.
 */
export interface AccountDeletionResponse {
  graceWindowUntil: string;
  reused: boolean;
}

export async function postAccountDeletion(params: {
  token?: string;
  bookingToken?: string;
  patientId?: string;
  reason?: string;
}): Promise<AccountDeletionResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (params.token) headers.Authorization = `Bearer ${params.token}`;
  const body: Record<string, unknown> = {};
  if (params.patientId) body.patientId = params.patientId;
  if (params.bookingToken) body.bookingToken = params.bookingToken;
  if (params.reason) body.reason = params.reason;

  const res = await fetch(`${requireApiBaseUrl()}/api/v1/me/account-deletion`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let message = "Failed to submit account-deletion request";
    try {
      const parsed = JSON.parse(text) as ApiError;
      if (isApiError(parsed)) message = parsed.error.message;
    } catch {
      // fall through
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const parsed = JSON.parse(text) as { success: true; data: AccountDeletionResponse };
  return parsed.data;
}

/**
 * Plan 02 · Task 33 — Cancel a pending account-deletion request.
 * Same auth matrix as `postAccountDeletion`. Throws if no pending
 * request exists or the grace window has already expired.
 */
export async function postAccountRecovery(params: {
  token?: string;
  bookingToken?: string;
  patientId?: string;
}): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (params.token) headers.Authorization = `Bearer ${params.token}`;
  const body: Record<string, unknown> = {};
  if (params.patientId) body.patientId = params.patientId;
  if (params.bookingToken) body.bookingToken = params.bookingToken;

  const res = await fetch(`${requireApiBaseUrl()}/api/v1/me/account-recovery`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = "Failed to cancel account-deletion request";
    try {
      const parsed = JSON.parse(text) as ApiError;
      if (isApiError(parsed)) message = parsed.error.message;
    } catch {
      // fall through
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}

/**
 * Get redirect URL for success page (Instagram DM).
 * Allows expired token so user can redirect after payment.
 */
export async function getBookingRedirectUrl(
  bookingToken: string
): Promise<ApiSuccess<RedirectUrlData>> {
  const params = new URLSearchParams({ token: bookingToken });
  return request<RedirectUrlData>(
    `/api/v1/bookings/redirect-url?${params.toString()}`
  );
}

// =============================================================================
// OPD patient session (e-task-opd-05) — public; consultation token in query
// =============================================================================

/**
 * Live appointment snapshot for patient PWA. Token = signed consultation token (same as /consult/join).
 */
export async function getOpdSessionSnapshot(
  consultationToken: string
): Promise<ApiSuccess<OpdSessionSnapshotData>> {
  const params = new URLSearchParams({ token: consultationToken });
  return request<OpdSessionSnapshotData>(
    `/api/v1/bookings/session/snapshot?${params.toString()}`
  );
}

/**
 * Accept early join offer (slot mode). Idempotent.
 */
export async function acceptOpdEarlyJoin(
  consultationToken: string
): Promise<ApiSuccess<{ accepted: boolean }>> {
  const params = new URLSearchParams({ token: consultationToken });
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/bookings/session/early-join/accept?${params.toString()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ accepted: boolean }>
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
  return json as ApiSuccess<{ accepted: boolean }>;
}

/**
 * Decline early join offer. Idempotent.
 */
export async function declineOpdEarlyJoin(
  consultationToken: string
): Promise<ApiSuccess<{ declined: boolean }>> {
  const params = new URLSearchParams({ token: consultationToken });
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/bookings/session/early-join/decline?${params.toString()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ declined: boolean }>
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
  return json as ApiSuccess<{ declined: boolean }>;
}

// =============================================================================
// Consultation (e-task-3, e-task-5, e-task-6)
// =============================================================================

export interface StartConsultationData {
  roomSid: string;
  roomName: string;
  doctorToken: string;
  patientJoinUrl: string;
  patientJoinToken: string;
  expiresAt: string;
  /**
   * Plan 06 · Task 36 · Decision 9 LOCKED — companion text channel
   * surface for the video session. Populated on a fresh `createSession`;
   * absent on the idempotent rejoin path (see `StartConsultationResult`
   * on the backend for the trade-off doc). Tasks 38 + 24c consume this
   * to mount `<TextConsultRoom>` inside `<VideoRoom>` / `<VoiceConsultRoom>`.
   */
  companion?: {
    /**
     * Task 38: `consultation_sessions.id` — the canonical session UUID
     * the doctor-side `<VideoRoom>` companion chat panel mounts against.
     * Mirrored from `SessionRecord.companion.sessionId` on the backend
     * so frontend code doesn't have to parse `patientJoinUrl` to find it.
     */
    sessionId: string;
    patientJoinUrl: string | null;
    patientToken: string | null;
    expiresAt: string;
  };
}

export interface GetConsultationTokenData {
  token: string;
  roomName: string;
}

/**
 * Start a video consultation for an appointment. Requires auth token.
 */
export async function startConsultation(
  token: string,
  appointmentId: string
): Promise<ApiSuccess<StartConsultationData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/consultation/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ appointmentId }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<StartConsultationData>
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
  return json as ApiSuccess<StartConsultationData>;
}

/**
 * Get Twilio Video access token for doctor or patient. Doctor uses token; patient uses token query param.
 */
export async function getConsultationToken(
  token: string | null,
  appointmentId: string,
  patientToken?: string
): Promise<ApiSuccess<GetConsultationTokenData>> {
  const params = new URLSearchParams({ appointmentId });
  if (patientToken) params.set("token", patientToken);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/token?${params.toString()}`,
    { headers, cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<GetConsultationTokenData>
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
  return json as ApiSuccess<GetConsultationTokenData>;
}

/**
 * Get Twilio Video access token for patient using join-link token only.
 * Public endpoint; no auth. Token is passed in URL (?token=xxx).
 */
export async function getConsultationTokenForPatient(
  patientToken: string
): Promise<ApiSuccess<GetConsultationTokenData>> {
  const params = new URLSearchParams({ token: patientToken });
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/consultation/token?${params.toString()}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<GetConsultationTokenData>
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
  return json as ApiSuccess<GetConsultationTokenData>;
}

// -----------------------------------------------------------------------------
// Voice consultation (Plan 05 · Task 24)
// -----------------------------------------------------------------------------

/**
 * Start a voice consultation. Mirrors `startConsultation` (video) but the
 * returned `doctorToken` connects to a Twilio Video room where recording
 * rules enforce audio-only (Principle 8 LOCKED — "audio only web call,
 * not a phone call"). The patient join URL targets `/c/voice/[sessionId]`.
 */
export async function startVoiceConsultation(
  token: string,
  appointmentId: string,
): Promise<ApiSuccess<StartConsultationData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/consultation/start-voice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ appointmentId }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<StartConsultationData>
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
  return json as ApiSuccess<StartConsultationData>;
}

export interface VoiceConsultTokenExchangeData {
  /** Twilio Video access token — null when session is ended/cancelled. */
  token: string | null;
  /** Twilio room name (`appointment-voice-{appointmentId}`). */
  roomName: string;
  /** Expiry of the Twilio token. Null when `token` is null. */
  expiresAt: string | null;
  sessionStatus: TextConsultSessionStatus;
  scheduledStartAt: string;
  expectedEndAt: string;
  practiceName?: string;
}

/**
 * Exchange the HMAC consultation-token (from the patient voice join URL)
 * for a Twilio access token + session metadata. Public endpoint — no
 * Bearer header; the HMAC is the proof of authority.
 */
export async function requestVoiceSessionToken(
  sessionId: string,
  urlToken: string,
): Promise<ApiSuccess<VoiceConsultTokenExchangeData>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/voice-token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: urlToken }),
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<VoiceConsultTokenExchangeData>
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
  return json as ApiSuccess<VoiceConsultTokenExchangeData>;
}

/**
 * Re-send the patient join link for a voice/video consultation. Doctor
 * only (Bearer auth required). The `channel` hint narrows the dispatch
 * target (advisory in v1 — backend currently fans to all configured
 * channels; the field is forwarded for audit).
 */
export async function resendConsultationLink(
  token: string,
  sessionId: string,
  channel?: "sms" | "ig_dm" | "email",
): Promise<ApiSuccess<{ sent: boolean; reason?: string }>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/resend-link`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(channel ? { channel } : {}),
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ sent: boolean; reason?: string }>
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
  return json as ApiSuccess<{ sent: boolean; reason?: string }>;
}

// -----------------------------------------------------------------------------
// Recording pause / resume / state inspector (Plan 07 · Task 28 · Decision 4)
// -----------------------------------------------------------------------------

/**
 * Response shape from `GET /api/v1/consultation/:sessionId/recording/state`.
 * Mirrors the backend `RecordingState` type; fields are ISO strings over
 * the wire and are parsed back into `Date` at render time if needed.
 */
export interface RecordingStateData {
  sessionId:   string;
  paused:      boolean;
  pausedAt?:   string;
  pausedBy?:   string;
  pauseReason?: string;
  resumedAt?:  string;
}

/**
 * POST /api/v1/consultation/:sessionId/recording/pause — doctor-only.
 *
 * Decision 4 LOCKED: a reason ≥5 / ≤200 chars is required. The backend
 * enforces the same bounds; this helper does NOT pre-validate so all
 * validation errors surface via the standardised API error envelope
 * (keeps the copy consistent between client + server without duplication).
 */
export async function pauseRecording(
  token: string,
  sessionId: string,
  reason: string,
): Promise<ApiSuccess<null>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/recording/pause`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason }),
      cache: "no-store",
    },
  );
  if (res.status === 204) {
    return { success: true, data: null } as ApiSuccess<null>;
  }
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<null>
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
  return json as ApiSuccess<null>;
}

/**
 * POST /api/v1/consultation/:sessionId/recording/resume — doctor-only.
 * No body; resume has no reason requirement (Decision 4).
 */
export async function resumeRecording(
  token: string,
  sessionId: string,
): Promise<ApiSuccess<null>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/recording/resume`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );
  if (res.status === 204) {
    return { success: true, data: null } as ApiSuccess<null>;
  }
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<null>
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
  return json as ApiSuccess<null>;
}

/**
 * GET /api/v1/consultation/:sessionId/recording/state — either participant.
 *
 * Used by `<RecordingControls>` + `<RecordingPausedIndicator>` to get
 * the authoritative initial state on mount. After mount, both components
 * tap into the companion-chat Realtime system-message stream to stay
 * fresh without polling.
 */
export async function getRecordingState(
  token: string,
  sessionId: string,
): Promise<ApiSuccess<RecordingStateData>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/recording/state`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<RecordingStateData>
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
  return json as ApiSuccess<RecordingStateData>;
}

// -----------------------------------------------------------------------------
// Recording replay (Plan 07 · Task 29 · Decision 4 + 10 LOCKED)
// -----------------------------------------------------------------------------

/**
 * Patient HMAC-exchange — `POST /api/v1/consultation/:sessionId/replay-token`.
 *
 * The patient receives a join link of shape
 * `/c/replay/[sessionId]?t=<HMAC-consultation-token>`. The HMAC binds
 * to the session's `appointmentId`; this endpoint verifies the HMAC and
 * mints a 15-minute Supabase JWT scoped to the session (custom claims
 * `consult_role: 'patient'` + `session_id`). The frontend then uses
 * this JWT as the Bearer for `/replay/audio/mint` and `/replay/status`.
 *
 * Public endpoint — no Bearer auth header. The HMAC IS the proof of authority.
 */
export interface ReplayTokenExchangeData {
  /** Patient-scoped Supabase JWT, valid for 15 minutes. */
  token: string;
  /** ISO-8601 expiry. */
  expiresAt: string;
}

export async function exchangeReplayToken(
  sessionId: string,
  urlToken: string,
): Promise<ApiSuccess<ReplayTokenExchangeData>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/replay-token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: urlToken }),
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<ReplayTokenExchangeData>
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
  return json as ApiSuccess<ReplayTokenExchangeData>;
}

/**
 * Subset of `MintReplayErrorCode` from the backend service. The frontend
 * uses this to switch on empty-state copy (revoked vs. expired vs.
 * still-processing) without re-doing the message-string match.
 */
export type ReplayDenyReason =
  | "not_a_participant"
  | "beyond_self_serve_window"
  | "revoked"
  | "artifact_not_ready"
  | "artifact_not_found"
  // Plan 08 · Task 44 · Decision 10 LOCKED — video replay gated on
  // 30-day-rolling SMS OTP. Client renders the OTP modal on this code.
  | "no_video_artifact"
  | "video_otp_required";

export interface ReplayMintData {
  signedUrl: string;
  /** ISO-8601; Twilio's signed URL TTL is 15 minutes. */
  expiresAt: string;
  /** Twilio Composition SID; surfaced for client-side cache-busting. */
  artifactRef: string;
  /**
   * Echoes the `artifactKind` that was actually minted. Lets the UI
   * assert "we asked for video and got video" (and re-render the
   * `<video>` element vs swapping the `<audio>` src). Plan 08 · Task 44.
   */
  artifactKind?: "audio" | "video";
}

/**
 * Mint a fresh signed URL for the audio recording.
 * `POST /api/v1/consultation/:sessionId/replay/audio/mint`.
 *
 * The `token` here is either:
 *   - A doctor's normal Supabase session JWT (from `useSession()`), OR
 *   - A patient-scoped JWT from `exchangeReplayToken` above.
 *
 * Both flows are supported by the backend's `resolveReplayCaller`
 * middleware. The mint is rate-limited (10 / hour / IP+session) so the
 * caller should re-mint only on first play and on `audio` element
 * `error` (signed URL expired). On a denial (403 / 404 / 409 / 410),
 * the thrown `Error` carries `.status` and the `ReplayDenyReason` is
 * available as `.code`.
 */
export async function mintReplayAudioUrl(
  token: string,
  sessionId: string,
  /**
   * Plan 08 · Task 44: opt-in `artifactKind` query param. Defaults to
   * `'audio'` so every existing caller keeps its current behaviour;
   * `<RecordingReplayPlayer>` passes `'video'` once the patient has
   * toggled "Show video" AND cleared the OTP gate (either inside the
   * 30-day window or just verified via `verifyVideoReplayOtp`).
   */
  artifactKind: "audio" | "video" = "audio",
): Promise<ApiSuccess<ReplayMintData>> {
  const qs = artifactKind === "video" ? "?artifactKind=video" : "";
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/replay/audio/mint${qs}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<ReplayMintData>
    | ApiError;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & {
      status?: number;
      code?: ReplayDenyReason | string;
      details?: Record<string, unknown>;
    };
    err.status = res.status;
    if (isApiError(json)) {
      err.code = json.error.code;
      // 403 `video_otp_required` carries `{ lastVerifiedAt: ISO|null }`
      // in details; the caller uses it to copy "last verified N days
      // ago" into the OTP modal preamble.
      if (json.error.details && typeof json.error.details === "object") {
        err.details = json.error.details as Record<string, unknown>;
      }
    }
    throw err;
  }
  if (isApiError(json)) {
    const err = new Error(json.error.message) as Error & {
      status?: number;
      code?: ReplayDenyReason | string;
    };
    err.status = json.error.statusCode ?? 500;
    err.code = json.error.code;
    throw err;
  }
  return json as ApiSuccess<ReplayMintData>;
}

export interface ReplayStatusData {
  available: boolean;
  /** Set when `available === false`. */
  reason?: ReplayDenyReason;
  /** Set for patients when `available === true`. ISO-8601. */
  selfServeExpiresAt?: string;
  /**
   * Plan 08 · Task 44: `true` when at least one completed video
   * composition exists for this session. Drives the "Show video"
   * toggle on `<RecordingReplayPlayer>`. Never an access gate — a
   * patient with `hasVideo=true` may still be blocked at mint time
   * by the 30-day OTP window.
   */
  hasVideo?: boolean;
}

/**
 * Preflight — does the player have something to play, and is the
 * caller allowed to play it? Read-only; does NOT write an audit row,
 * so safe to call on mount of the player (or every time the user
 * navigates to the artifacts panel).
 *
 * `GET /api/v1/consultation/:sessionId/replay/status`.
 */
export async function getReplayStatus(
  token: string,
  sessionId: string,
): Promise<ApiSuccess<ReplayStatusData>> {
  return request<ReplayStatusData>(
    `/api/v1/consultation/${encodeURIComponent(sessionId)}/replay/status`,
    { token },
  );
}

// -----------------------------------------------------------------------------
// Text consultation token exchange (Plan 04 · Task 19 — patient flow)
// -----------------------------------------------------------------------------

/**
 * Lifecycle status of a consultation session — mirrors the backend
 * `SessionStatus` type so the frontend can drive pre/live/post UI states
 * from a single source of truth.
 */
export type TextConsultSessionStatus =
  | "scheduled"
  | "live"
  | "ended"
  | "no_show"
  | "cancelled";

export interface TextConsultTokenExchangeData {
  /** Supabase JWT scoped to this session. `null` once the session has ended/cancelled. */
  token: string | null;
  /** Expiry of the JWT in ISO-8601. `null` when `token` is null. */
  expiresAt: string | null;
  /**
   * UUID the patient should put into `consultation_messages.sender_id` on
   * INSERT (and that the chat UI uses for self-vs-counterparty bubble
   * alignment). Backend derives this from `consultation_sessions.patient_id`,
   * falling back to `consultation_sessions.appointment_id` when the
   * patient row hasn't been linked yet (bot-booked guests).
   */
  currentUserId: string;
  sessionStatus: TextConsultSessionStatus;
  scheduledStartAt: string;
  expectedEndAt: string;
  /** Practice (clinic) name for the chat header. Optional. */
  practiceName?: string;
}

/**
 * Exchange the HMAC consultation-token (carried in the patient join URL
 * query string as `?t=...`) for a session-scoped Supabase JWT plus the
 * session metadata the chat UI needs to render the right state.
 *
 * Public endpoint — no Bearer auth header. The HMAC consultation-token
 * IS the proof of authority. The backend re-issues the JWT on every
 * call, so this also doubles as the token-refresh path when the prior
 * JWT is about to expire (or after a 401 from Supabase).
 *
 * @param sessionId - UUID of the `consultation_sessions` row, taken from
 *                    the URL path segment.
 * @param urlToken  - HMAC consultation-token from `?t=` query param.
 */
export async function requestTextSessionToken(
  sessionId: string,
  urlToken: string,
): Promise<ApiSuccess<TextConsultTokenExchangeData>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/text-token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: urlToken }),
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<TextConsultTokenExchangeData>
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
  return json as ApiSuccess<TextConsultTokenExchangeData>;
}

// =============================================================================
// Plan 07 · Task 31 — post-consult chat-history token exchange
// =============================================================================

export interface ChatHistoryTokenExchangeData {
  /** 90-day patient-scoped Supabase JWT for chat-history reads. */
  accessToken: string;
  /** ISO-8601 expiry of the JWT. */
  expiresAt: string;
  /**
   * UUID for self-vs-counterparty bubble alignment in `<TextConsultRoom>`.
   * Backend derives from `consultation_sessions.patient_id`, falling
   * back to `appointment_id` for bot patients (no patient row linked).
   */
  currentUserId: string;
  /**
   * Session status — for the readonly chat-history surface, this is
   * almost always `'ended'`, but exposed verbatim so the frontend
   * doesn't have to assume.
   */
  sessionStatus: TextConsultSessionStatus;
  /**
   * ISO-8601 timestamp of `consultation_sessions.actual_ended_at`.
   * Drives the readonly watermark date. Null when the session was
   * never explicitly ended (cancelled / no_show); the watermark falls
   * back to a generic "Read-only" label in that case.
   */
  consultEndedAt: string | null;
  /** Practice name for the chat header. Optional. */
  practiceName?: string;
}

/**
 * Exchange the HMAC consultation-token (carried in the post-consult
 * DM link as `?t=...`) for a 90-day patient-scoped Supabase JWT plus
 * the metadata needed to mount `<TextConsultRoom mode='readonly'>`.
 *
 * Public endpoint — no Bearer auth header. The HMAC is the proof of
 * authority; the backend re-issues a fresh JWT on every call so the
 * patient can re-tap the original DM link any time within 90 days
 * and obtain a fresh JWT (no support round-trip needed).
 *
 * @param sessionId - UUID of the `consultation_sessions` row from URL.
 * @param hmacToken - HMAC consultation-token from `?t=` query param.
 */
export async function requestChatHistoryToken(
  sessionId: string,
  hmacToken: string,
): Promise<ApiSuccess<ChatHistoryTokenExchangeData>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/chat-history-token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hmacToken }),
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<ChatHistoryTokenExchangeData>
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
  return json as ApiSuccess<ChatHistoryTokenExchangeData>;
}

// =============================================================================
// Plan 07 · Task 32 — Transcript PDF export
// =============================================================================

/**
 * Subset of `TranscriptExportErrorCode` from the backend. Surfaced on
 * thrown errors as `.code` so the UI can branch on a machine-readable
 * reason without substring-matching error messages.
 */
export type TranscriptExportDenyReason =
  | "not_a_participant"
  | "session_not_ended"
  | "beyond_self_serve_window"
  | "revoked"
  | "support_reason_required"
  | "internal_error";

export interface TranscriptTokenExchangeData {
  /** 15-minute patient-scoped Supabase JWT for the PDF route. */
  accessToken: string;
  /** ISO-8601 expiry — frontend re-exchanges ahead of this. */
  expiresAt: string;
}

/**
 * Exchange the HMAC consultation-token (carried as `?t=...` on the
 * post-consult DM link) for a **15-minute** patient-scoped JWT that
 * authorises the transcript PDF download.
 *
 * Mirrors `exchangeReplayToken` / `requestChatHistoryToken`: body
 * accepts `{ hmacToken }` (the backend route also accepts `{ token }`
 * for legacy parity with Task 29; we pick the newer field here).
 *
 * Public endpoint — no Bearer auth header. The HMAC IS the proof of
 * authority. Every call mints a fresh JWT, so the patient can retry
 * after a cold start without losing access.
 *
 * @param sessionId - UUID of the `consultation_sessions` row.
 * @param hmacToken - HMAC consultation-token from `?t=` query param.
 */
export async function requestTranscriptToken(
  sessionId: string,
  hmacToken: string,
): Promise<ApiSuccess<TranscriptTokenExchangeData>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/transcript-token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hmacToken }),
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<TranscriptTokenExchangeData>
    | ApiError;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & {
      status?: number;
      code?: string;
    };
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
  return json as ApiSuccess<TranscriptTokenExchangeData>;
}

export interface TranscriptDownloadData {
  /**
   * Time-limited Supabase Storage signed URL. Carries `download=<filename>`
   * so `Content-Disposition: attachment` lands naturally when the
   * browser navigates to it.
   */
  signedUrl: string;
  /** ISO-8601 expiry (15-minute Storage TTL). */
  expiresAt: string;
  /**
   * `true` when the PDF was served from the Storage cache (i.e. not
   * re-rendered). Surfaced for telemetry / debugging; the UI doesn't
   * need to differentiate.
   */
  cacheHit: boolean;
  /** Friendly save-as filename (e.g. `transcript-11111111.pdf`). */
  filename: string;
}

/**
 * Request a signed URL for the transcript PDF.
 *
 * `GET /api/v1/consultation/:sessionId/transcript.pdf` runs the
 * policy pipeline (authZ → session-ended → revocation → cache check
 * → compose-if-miss → upload → mint signed URL → audit → notify) and
 * responds with JSON `{ signedUrl, expiresAt, cacheHit, filename }`.
 *
 * **Why JSON instead of a 302 redirect**: this GET is Bearer-authed,
 * and browser navigations don't replay the `Authorization` header.
 * Returning the signed URL lets the frontend `window.location.assign`
 * directly to Supabase Storage (which carries its own token in the
 * URL, no header needed).
 *
 * Typical flow from `<TranscriptDownloadButton>`:
 *   const { data } = await downloadTranscript(token, sessionId);
 *   window.location.assign(data.signedUrl);  // triggers save-to-disk
 *
 * Denials (403 / 409 / 410 / 404) throw `Error` with `.code` set to
 * the machine-readable `TranscriptExportDenyReason` and `.status` set
 * to the HTTP code — callers branch on `.code` for empty-state copy.
 *
 * @param token      - Doctor's Supabase session JWT OR patient-scoped
 *                     JWT (from `requestTranscriptToken` /
 *                     `requestChatHistoryToken` / `exchangeReplayToken`
 *                     — all three have the same `consult_role:'patient'`
 *                     + `session_id` claim shape).
 * @param sessionId  - `consultation_sessions.id`.
 */
export async function downloadTranscript(
  token: string,
  sessionId: string,
): Promise<ApiSuccess<TranscriptDownloadData>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/transcript.pdf`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<TranscriptDownloadData>
    | ApiError;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & {
      status?: number;
      code?: TranscriptExportDenyReason | string;
    };
    err.status = res.status;
    if (isApiError(json)) err.code = json.error.code;
    throw err;
  }
  if (isApiError(json)) {
    const err = new Error(json.error.message) as Error & {
      status?: number;
      code?: TranscriptExportDenyReason | string;
    };
    err.status = json.error.statusCode ?? 500;
    err.code = json.error.code;
    throw err;
  }
  return json as ApiSuccess<TranscriptDownloadData>;
}

// =============================================================================
// Prescriptions (Prescription V1 - e-task-4)
// =============================================================================

export interface PrescriptionData {
  prescription: PrescriptionWithRelations;
}

export interface PrescriptionsListData {
  prescriptions: PrescriptionWithRelations[];
}

export interface CreateUploadUrlData {
  path: string;
  token: string;
}

export interface RegisterAttachmentData {
  attachment: import("@/types/prescription").PrescriptionAttachment;
}

export interface DownloadUrlData {
  downloadUrl: string;
}

/**
 * Create prescription. Requires auth token.
 */
export async function createPrescription(
  token: string,
  payload: CreatePrescriptionPayload
): Promise<ApiSuccess<PrescriptionData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/prescriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<PrescriptionData>
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
  return json as ApiSuccess<PrescriptionData>;
}

/**
 * Get prescription by ID. Requires auth token.
 */
export async function getPrescription(
  token: string,
  id: string
): Promise<ApiSuccess<PrescriptionData>> {
  return request<PrescriptionData>(`/api/v1/prescriptions/${id}`, { token });
}

/**
 * List prescriptions by appointment. Requires auth token.
 */
export async function listPrescriptionsByAppointment(
  token: string,
  appointmentId: string
): Promise<ApiSuccess<PrescriptionsListData>> {
  return request<PrescriptionsListData>(
    `/api/v1/prescriptions?appointmentId=${encodeURIComponent(appointmentId)}`,
    { token }
  );
}

/**
 * List prescriptions by patient. Requires auth token.
 */
export async function listPrescriptionsByPatient(
  token: string,
  patientId: string
): Promise<ApiSuccess<PrescriptionsListData>> {
  return request<PrescriptionsListData>(
    `/api/v1/prescriptions?patientId=${encodeURIComponent(patientId)}`,
    { token }
  );
}

/**
 * Update prescription. Requires auth token.
 */
export async function updatePrescription(
  token: string,
  id: string,
  payload: UpdatePrescriptionPayload
): Promise<ApiSuccess<PrescriptionData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/prescriptions/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<PrescriptionData>
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
  return json as ApiSuccess<PrescriptionData>;
}

/**
 * Get signed upload URL for prescription attachment. Requires auth token.
 * Returns { path, token } for supabase.storage.uploadToSignedUrl(path, token, file).
 */
export async function getPrescriptionUploadUrl(
  token: string,
  prescriptionId: string,
  body: { filename?: string; contentType?: string }
): Promise<ApiSuccess<CreateUploadUrlData>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/prescriptions/${prescriptionId}/attachments/upload-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<CreateUploadUrlData>
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
  return json as ApiSuccess<CreateUploadUrlData>;
}

/**
 * Register attachment after upload. Requires auth token.
 */
export async function registerPrescriptionAttachment(
  token: string,
  prescriptionId: string,
  body: { filePath: string; fileType: string; caption?: string | null }
): Promise<ApiSuccess<RegisterAttachmentData>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/prescriptions/${prescriptionId}/attachments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<RegisterAttachmentData>
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
  return json as ApiSuccess<RegisterAttachmentData>;
}

/**
 * Get signed download URL for attachment. Requires auth token.
 */
export async function getPrescriptionDownloadUrl(
  token: string,
  prescriptionId: string,
  attachmentId: string
): Promise<ApiSuccess<DownloadUrlData>> {
  return request<DownloadUrlData>(
    `/api/v1/prescriptions/${prescriptionId}/attachments/${attachmentId}/download-url`,
    { token }
  );
}

export interface SendPrescriptionData {
  sent: boolean;
  channels?: { instagram?: boolean; email?: boolean };
  reason?: string;
}

/**
 * Send prescription to patient via DM/email. Requires auth token.
 */
export async function sendPrescriptionToPatient(
  token: string,
  prescriptionId: string
): Promise<ApiSuccess<SendPrescriptionData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/prescriptions/${prescriptionId}/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<SendPrescriptionData>
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
  return json as ApiSuccess<SendPrescriptionData>;
}

// =============================================================================
// Appointments
// =============================================================================

export interface PatchAppointmentPayload {
  status?: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  clinical_notes?: string | null;
}

/**
 * Patch appointment (status and/or clinical_notes). Requires auth token.
 */
export async function patchAppointment(
  token: string,
  id: string,
  payload: PatchAppointmentPayload
): Promise<ApiSuccess<AppointmentDetailData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/appointments/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<AppointmentDetailData>
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
  return json as ApiSuccess<AppointmentDetailData>;
}

// =============================================================================
// Service staff reviews (ARM-06 / ARM-07)
// =============================================================================

export interface ServiceStaffReviewsListData {
  reviews: ServiceStaffReviewListItem[];
}

/**
 * Pending (or filtered) service match reviews for the logged-in doctor.
 */
export async function getServiceStaffReviews(
  token: string,
  status: ServiceStaffReviewListQueryStatus = "pending"
): Promise<ApiSuccess<ServiceStaffReviewsListData>> {
  const params = new URLSearchParams({ status });
  return request<ServiceStaffReviewsListData>(
    `/api/v1/service-staff-reviews?${params.toString()}`,
    { token }
  );
}

export async function postConfirmServiceStaffReview(
  token: string,
  reviewId: string,
  body: { note?: string }
): Promise<ApiSuccess<{ review: ServiceStaffReviewListItem }>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/service-staff-reviews/${encodeURIComponent(reviewId)}/confirm`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ review: ServiceStaffReviewListItem }>
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
  return json as ApiSuccess<{ review: ServiceStaffReviewListItem }>;
}

/** Append patch for one service's `matcher_hints`. Empty / omitted fields are ignored server-side. */
export type ServiceHintAppendPatch = {
  keywords?: string;
  include_when?: string;
  exclude_when?: string;
};

export async function postReassignServiceStaffReview(
  token: string,
  reviewId: string,
  body: {
    catalogServiceKey: string;
    catalogServiceId?: string;
    consultationModality?: "text" | "voice" | "video";
    /**
     * Optional fragments to APPEND to the reassigned-TO service's `matcher_hints`.
     * Omit (or send an object with only empty fields) to skip hint learning on this side.
     */
    correctServiceHintAppend?: ServiceHintAppendPatch;
    /**
     * Optional fragments to APPEND to the reassigned-FROM service's `matcher_hints`
     * (typically an `exclude_when` signal = patient's sanitized complaint).
     */
    wrongServiceHintAppend?: ServiceHintAppendPatch;
  }
): Promise<ApiSuccess<{ review: ServiceStaffReviewListItem }>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/service-staff-reviews/${encodeURIComponent(reviewId)}/reassign`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ review: ServiceStaffReviewListItem }>
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
  return json as ApiSuccess<{ review: ServiceStaffReviewListItem }>;
}

export async function postCancelServiceStaffReview(
  token: string,
  reviewId: string,
  body: { note?: string }
): Promise<ApiSuccess<{ review: ServiceStaffReviewListItem }>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/service-staff-reviews/${encodeURIComponent(reviewId)}/cancel`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ review: ServiceStaffReviewListItem }>
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
  return json as ApiSuccess<{ review: ServiceStaffReviewListItem }>;
}

// ============================================================================
// Plan 02 / Task 06 — POST /api/v1/catalog/ai-suggest
// ============================================================================

export type AiSuggestMode = "single_card" | "starter" | "review";

export interface AiSuggestSingleCardPayload {
  label?: string;
  freeformDescription?: string;
  existingHints?: {
    /**
     * Routing v2 (Task 06): primary patient-style phrase list. Backend echoes
     * legacy `keywords` / `include_when` only when `examples` is empty so the
     * LLM doesn't get duplicated routing material.
     */
    examples?: string[];
    keywords?: string;
    include_when?: string;
    exclude_when?: string;
  };
}

// Imported here (mid-file) so the AiSuggestRequest interface below can name it
// without forcing a re-shuffle of every export at the top of this big file.
import type { ServiceCatalogV1 } from "./service-catalog-schema";
export type { ServiceCatalogV1 } from "./service-catalog-schema";

export interface AiSuggestRequest {
  mode: AiSuggestMode;
  payload?: AiSuggestSingleCardPayload;
  /**
   * Optional unsaved-draft catalog the editor hands to the backend so the AI
   * critiques what is currently on screen rather than the persisted
   * `service_offerings_json`. The backend route validates the shape with
   * `serviceCatalogV1BaseSchema` and the service swaps it in for the DB row.
   *
   * - `undefined` → backend uses DB (default for non-editor callers).
   * - `null`      → editor signals "draft is empty" (no services yet).
   * - object      → use this exact catalog (must be structurally valid; the
   *                 catch-all check is performed by the review itself, so
   *                 in-progress drafts missing the catch-all are still
   *                 reviewable and surface `missing_catchall`).
   */
  catalog?: ServiceCatalogV1 | null;
}

export type AiSuggestWarning =
  | {
      kind: "price_clamped";
      service_key: string;
      modality: "text" | "voice" | "video";
      original_minor: number;
      clamped_minor: number;
      currency: string | null;
    }
  | {
      kind: "modality_disabled_no_global_setup";
      service_key: string;
      modality: "text" | "voice" | "video";
      reason: string;
    }
  | {
      kind: "keyword_overlap_with_sibling";
      service_key: string;
      sibling_service_key: string;
      overlap_ratio: number;
    }
  | {
      kind: "catch_all_scope_forced_flexible";
      service_key: string;
    };

/** Server-validated catalog card returned by the AI suggest endpoint. */
export interface AiSuggestCardV1 {
  service_id?: string;
  service_key: string;
  label: string;
  description?: string;
  scope_mode?: "strict" | "flexible";
  matcher_hints?: {
    /**
     * Routing v2 (Task 06): primary patient-style phrase list. Always present
     * when the backend has v2 examples to emit; the legacy fields below remain
     * for un-migrated rows / older AI runs.
     */
    examples?: string[];
    keywords?: string;
    include_when?: string;
    exclude_when?: string;
  };
  modalities: {
    text?: { enabled: boolean; price_minor: number };
    voice?: { enabled: boolean; price_minor: number };
    video?: { enabled: boolean; price_minor: number };
  };
}

export interface AiSuggestCardResponse {
  mode: "single_card" | "starter";
  cards: AiSuggestCardV1[];
  warnings: AiSuggestWarning[];
}

// Plan 02 / Task 07: `review` mode now returns a rich `QualityIssue[]` shared
// with the backend via `lib/catalog-quality-issues.ts`. The old
// `AiCatalogReviewIssue` / `AiCatalogReviewIssueKind` types were removed; nothing
// in the app consumed them yet, so there is no migration path to preserve.
import type { QualityIssue } from "./catalog-quality-issues";
export type {
  QualityIssue,
  QualityIssueAction,
  QualityIssueSeverity,
  QualityIssueSuggestion,
  QualityIssueSuggestedCard,
  QualityIssueType,
} from "./catalog-quality-issues";

export interface AiSuggestReviewResponse {
  mode: "review";
  issues: QualityIssue[];
  warnings: AiSuggestWarning[];
}

export type AiSuggestResponse = AiSuggestCardResponse | AiSuggestReviewResponse;

/** PHI-safe doctor-facing copy for warnings shown next to AI-filled drafts. */
export function describeAiSuggestWarning(w: AiSuggestWarning): string {
  switch (w.kind) {
    case "price_clamped":
      return `${w.modality} price was outside the typical range and clamped to ${(w.clamped_minor / 100).toFixed(2)} ${w.currency ?? ""}.`.trim();
    case "modality_disabled_no_global_setup":
      return `${w.modality} was disabled because that channel is not part of your configured consultation types.`;
    case "keyword_overlap_with_sibling":
      return `Keywords overlap heavily with "${w.sibling_service_key}" (${Math.round(w.overlap_ratio * 100)}%) — consider tightening one of the cards.`;
    case "catch_all_scope_forced_flexible":
      return `The catch-all card was kept on flexible scope so it can absorb anything.`;
    default:
      return "";
  }
}

/**
 * Plan 02 / Task 06: POST /api/v1/catalog/ai-suggest.
 * Backend validates the LLM output (`serviceOfferingV1Schema`) before returning.
 */
export async function postCatalogAiSuggest(
  token: string,
  body: AiSuggestRequest
): Promise<ApiSuccess<AiSuggestResponse>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/catalog/ai-suggest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<AiSuggestResponse>
    | ApiError;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "AI suggestion request failed";
    const err = new Error(message) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = json;
    throw err;
  }
  if (isApiError(json)) {
    const err = new Error(json.error.message) as Error & { status?: number; body?: unknown };
    err.status = json.error.statusCode ?? 500;
    err.body = json;
    throw err;
  }
  return json as ApiSuccess<AiSuggestResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan service-catalog-matcher-routing-v2 / Task 10 (Phase 4 hybrid):
// dev-only "Try as patient" preview helper. The route is mounted only when
// `CATALOG_PREVIEW_MATCH_ENABLED` is true on the backend (default: enabled
// off-prod). The frontend gates the UI separately via
// `NEXT_PUBLIC_CATALOG_PREVIEW_MATCH_ENABLED`. A 404 here = backend disabled.
// ─────────────────────────────────────────────────────────────────────────────
export type PreviewMatchPath = "stage_a" | "stage_b" | "fallback" | "single_fee";

export interface PreviewMatchRequest {
  catalog: ServiceCatalogV1;
  reasonForVisitText: string;
  recentUserMessages?: string[];
  doctorProfile?: { practiceName?: string | null; specialty?: string | null } | null;
}

export interface PreviewMatchResponse {
  path: PreviewMatchPath;
  matchedServiceKey: string;
  matchedLabel: string;
  suggestedModality: "text" | "voice" | "video" | null;
  confidence: "high" | "medium" | "low";
  autoFinalize: boolean;
  mixedComplaints: boolean;
  reasonCodes: string[];
  llmAvailable: boolean;
}

export async function postCatalogPreviewMatch(
  token: string,
  body: PreviewMatchRequest
): Promise<ApiSuccess<PreviewMatchResponse>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/catalog/preview-match`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<PreviewMatchResponse>
    | ApiError;
  if (!res.ok) {
    const message =
      res.status === 404
        ? "Preview is not enabled on this backend (set CATALOG_PREVIEW_MATCH_ENABLED=true)."
        : isApiError(json)
          ? json.error.message
          : "Preview request failed";
    const err = new Error(message) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = json;
    throw err;
  }
  if (isApiError(json)) {
    const err = new Error(json.error.message) as Error & { status?: number; body?: unknown };
    err.status = json.error.statusCode ?? 500;
    err.body = json;
    throw err;
  }
  return json as ApiSuccess<PreviewMatchResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan 07 / Task 30: Doctor dashboard event feed (mutual replay notifications).
//
// `getDashboardEvents` lists the doctor's feed (defaults to unread-first). The
// nextCursor is opaque — clients must treat it as a string and feed it back
// in verbatim. `acknowledgeDashboardEvent` marks one event read; the response
// is 204 (no body), modeled here as `void`.
//
// Backend: backend/src/controllers/dashboard-events-controller.ts
// ─────────────────────────────────────────────────────────────────────────────

/** Pinned payload shape for `event_kind === 'patient_replayed_recording'`. */
export interface PatientReplayedRecordingPayload {
  artifact_type: "audio" | "transcript";
  recording_access_audit_id: string;
  patient_display_name: string;
  replayed_at: string;
  consult_date: string | null;
  accessed_by_role: "patient" | "support_staff";
  accessed_by_user_id: string;
  escalation_reason?: string;
}

export type DashboardEventKind = "patient_replayed_recording";

export interface DashboardEvent {
  id: string;
  eventKind: DashboardEventKind;
  sessionId: string | null;
  payload: PatientReplayedRecordingPayload;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface DashboardEventsResponse {
  events: DashboardEvent[];
  nextCursor?: string;
}

export interface GetDashboardEventsOptions {
  unreadOnly?: boolean;
  limit?: number;
  cursor?: string;
}

export async function getDashboardEvents(
  token: string,
  options: GetDashboardEventsOptions = {}
): Promise<ApiSuccess<DashboardEventsResponse>> {
  const params = new URLSearchParams();
  if (options.unreadOnly) params.set("unread", "true");
  if (typeof options.limit === "number") {
    params.set("limit", String(options.limit));
  }
  if (options.cursor) params.set("cursor", options.cursor);
  const qs = params.toString();
  const path = qs.length > 0
    ? `/api/v1/dashboard/events?${qs}`
    : "/api/v1/dashboard/events";
  return request<DashboardEventsResponse>(path, { token });
}

export async function acknowledgeDashboardEvent(
  token: string,
  eventId: string
): Promise<void> {
  if (!eventId) throw new Error("eventId is required");
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/dashboard/events/${encodeURIComponent(eventId)}/acknowledge`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );
  if (res.status === 204) return;
  // Anything else is an error — try to extract a message from a JSON body.
  const text = await res.text();
  let parsed: unknown = {};
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = {};
    }
  }
  const json = parsed as ApiError | Record<string, unknown>;
  const message = isApiError(json) ? json.error.message : "Acknowledge failed";
  const err = new Error(message) as Error & { status?: number; body?: unknown };
  err.status = res.status;
  err.body = json;
  throw err;
}
