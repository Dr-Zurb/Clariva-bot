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
    keywords?: string;
    include_when?: string;
    exclude_when?: string;
  };
}

export interface AiSuggestRequest {
  mode: AiSuggestMode;
  payload?: AiSuggestSingleCardPayload;
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
