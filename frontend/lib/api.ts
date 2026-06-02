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
  OpdMode,
  OpdSessionDayModeSource,
  PatchDoctorSettingsPayload,
} from "@/types/doctor-settings";
import type {
  Availability,
  AvailabilitySlot,
} from "@/types/availability";
import type { BlockedTime } from "@/types/blocked-time";
import type {
  PrescriptionMedicine,
  PrescriptionRecentSummary,
  PrescriptionWithRelations,
  CreatePrescriptionPayload,
  UpdatePrescriptionPayload,
} from "@/types/prescription";
import type {
  AllergyData,
  AllergiesListData,
  ConditionData,
  ConditionsListData,
  CreatePatientAllergyPayload,
  CreatePatientConditionPayload,
  CreatePatientVitalsPayload,
  UpdatePatientAllergyPayload,
  UpdatePatientConditionPayload,
  UpdatePatientVitalsPayload,
  VitalsData,
  VitalsListData,
} from "@/types/patient-chart";
import type {
  ConvertSessionDayModeResult,
  OpdSessionDayMode,
  OpdSessionPayload,
  OpdSessionSnapshotData,
} from "@/types/opd-session";
import type {
  DoctorQueueSessionRow,
  SlotSessionCounts,
  SlotSessionRow,
} from "@/types/opd-doctor";
import type {
  ServiceStaffReviewListItem,
  ServiceStaffReviewListQueryStatus,
} from "@/types/service-staff-review";
import type { DrugMasterRow } from "@/types/drug-master";
import type {
  CreateRxTemplatePayload,
  DoctorRxTemplate,
  UpdateRxTemplatePayload,
} from "@/types/rx-template";

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
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.token && { Authorization: `Bearer ${options.token}` }),
      },
      cache: "no-store",
    });
  } catch (err) {
    const isNetworkFailure =
      err instanceof TypeError &&
      /load failed|failed to fetch|networkerror/i.test(
        err instanceof Error ? err.message : ""
      );
    if (isNetworkFailure) {
      throw new Error(
        "Could not reach the Clariva API. Check that the backend is running (npm run dev in backend/) and that NEXT_PUBLIC_API_URL matches your setup."
      );
    }
    throw err;
  }

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

/** Per-patient appointment list (pr-11). Uses `?patient_id=` on the list endpoint. */
export async function getAppointmentsForPatient(
  token: string,
  patientId: string,
): Promise<ApiSuccess<AppointmentsListData>> {
  return request<AppointmentsListData>(
    `/api/v1/appointments?patient_id=${encodeURIComponent(patientId)}`,
    { token },
  );
}

/** Payload for creating an appointment (doctor dashboard). */
export interface CreateAppointmentPayload {
  patientId?: string;
  patientName?: string;
  patientPhone?: string;
  appointmentDate: string;
  reasonForVisit?: string;
  notes?: string;
  freeOfCost?: boolean;
  /** pf-16: walk-in fast path — bypasses patient / reason requirements. */
  walkin?: boolean;
  /** pf-16: optional name hint stored in appointment notes until a patient row is linked. */
  patientNameHint?: string | null;
  /** Consultation modality for the appointment. */
  consultationType?: "video" | "in_clinic" | "text" | "voice";
  /** OPD slot hub — sl-06 add-slot / overflow dialog. */
  opdEventType?: "standard" | "return_after_completed";
  relatedAppointmentId?: string | null;
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

export interface ModeScheduleTestDateData {
  date: string;
  mode: OpdMode;
  source: OpdSessionDayModeSource;
}

/**
 * Resolve OPD mode for a date (full cascade: fact → policy → column → default).
 * GET /api/v1/opd/mode-schedule/test-date?date=YYYY-MM-DD
 */
export async function previewResolveModeForDate(
  token: string,
  date: string
): Promise<ApiSuccess<ModeScheduleTestDateData>> {
  const params = new URLSearchParams({ date });
  return request<ModeScheduleTestDateData>(
    `/api/v1/opd/mode-schedule/test-date?${params.toString()}`,
    { token }
  );
}

// =============================================================================
// Doctor OPD dashboard (e-task-opd-06)
// =============================================================================

export interface DoctorOpdQueueSessionData {
  entries: DoctorQueueSessionRow[];
  date: string;
}

export type DoctorOpdSessionData = OpdSessionPayload;

/**
 * Doctor-only — returns the widened OQ-D1 payload (full PHI for the authenticated
 * doctor's session). See `frontend/types/opd-doctor.ts` for the privacy contract.
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

/**
 * Unified doctor OPD session snapshot (pdm-02). Mode is resolved per
 * (doctor, session_date) from the fact table with policy/settings fallbacks.
 */
export async function getDoctorOpdSession(
  token: string,
  date: string
): Promise<ApiSuccess<DoctorOpdSessionData>> {
  const params = new URLSearchParams({ date });
  return request<DoctorOpdSessionData>(
    `/api/v1/opd/session?${params.toString()}`,
    { token }
  );
}

// ---------------------------------------------------------------------------
// Session overrun tray (pdm-09 backend · pdm-10 UI)
// ---------------------------------------------------------------------------

export interface OverrunRow {
  id: string;
  status: "pending" | "confirmed";
  appointment_date: string;
  opd_event_type: string | null;
  modality: string;
  patients: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
  };
  services: { id: string; name: string; duration_min: number };
}

export type OverrunAction =
  | "reschedule_all"
  | "reschedule_per_patient"
  | "mark_completed"
  | "cancel_refund"
  | "mark_no_show";

export interface PerRowOverride {
  appointmentId: string;
  action: OverrunAction;
  rescheduleTo?: string;
}

export interface PerRowResult {
  appointmentId: string;
  action: OverrunAction;
  status: "success" | "skipped" | "error";
  message?: string;
}

type RawOverrunRow = {
  id: string;
  status: string;
  appointment_date: string;
  opd_event_type?: string | null;
  modality?: string | null;
  consultation_type?: string | null;
  patient_name?: string | null;
  patient_phone?: string | null;
  catalog_service_key?: string | null;
  patients?: OverrunRow["patients"];
  patient?: { id: string; phone?: string | null } | null;
  services?: OverrunRow["services"];
};

function splitPatientName(name: string | null | undefined): {
  first_name: string;
  last_name: string;
} {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return { first_name: "Unknown", last_name: "" };
  const parts = trimmed.split(/\s+/);
  return {
    first_name: parts[0] ?? "",
    last_name: parts.slice(1).join(" "),
  };
}

function normalizeOverrunRow(raw: RawOverrunRow): OverrunRow {
  if (raw.patients && raw.services) {
    return {
      id: raw.id,
      status: raw.status as OverrunRow["status"],
      appointment_date: raw.appointment_date,
      opd_event_type: raw.opd_event_type ?? null,
      modality: raw.modality ?? raw.consultation_type ?? "in_person",
      patients: raw.patients,
      services: raw.services,
    };
  }

  const names = splitPatientName(raw.patient_name);
  return {
    id: raw.id,
    status: raw.status as OverrunRow["status"],
    appointment_date: raw.appointment_date,
    opd_event_type: raw.opd_event_type ?? null,
    modality: raw.modality ?? raw.consultation_type ?? "in_person",
    patients: {
      id: raw.patient?.id ?? "",
      first_name: names.first_name,
      last_name: names.last_name,
      phone: raw.patient_phone ?? raw.patient?.phone ?? "",
    },
    services: {
      id: raw.catalog_service_key ?? "",
      name: raw.catalog_service_key ?? "Consultation",
      duration_min: 0,
    },
  };
}

export async function getOpdSessionOverrun(
  token: string,
  date: string
): Promise<ApiSuccess<{ date: string; count: number; rows: OverrunRow[] }>> {
  const params = new URLSearchParams({ date });
  const res = await request<{
    date: string;
    count: number;
    rows: RawOverrunRow[];
  }>(`/api/v1/opd/session/overrun?${params.toString()}`, { token });
  return {
    ...res,
    data: {
      ...res.data,
      rows: res.data.rows.map(normalizeOverrunRow),
    },
  };
}

export async function bulkResolveOpdSessionOverrun(
  token: string,
  body: {
    date: string;
    action: OverrunAction;
    perRowOverrides?: PerRowOverride[];
  }
): Promise<ApiSuccess<{ resolved: number; results: PerRowResult[] }>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/opd/session/overrun/bulk-resolve`,
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
  const text = await res.text();
  let parsed: unknown = {};
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = {};
    }
  }
  const json = parsed as
    | ApiSuccess<{ resolved: number; results: PerRowResult[] }>
    | ApiError;

  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  if (isApiError(json)) {
    throw new Error(json.error.message);
  }

  return json as ApiSuccess<{ resolved: number; results: PerRowResult[] }>;
}

/** Thrown by session mode conversion helpers (pdm-05). */
export class OpdSessionConvertError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = "OpdSessionConvertError";
  }
}

function parseConvertSessionError(
  res: Response,
  json: unknown,
  retryAfterHeader: string | null
): OpdSessionConvertError {
  const parsedRetry = retryAfterHeader
    ? Number.parseInt(retryAfterHeader, 10)
    : undefined;
  const retryAfterSeconds =
    parsedRetry !== undefined && Number.isFinite(parsedRetry)
      ? parsedRetry
      : undefined;

  let message = "Request failed";
  let errorCode: string | undefined;

  if (typeof json === "object" && json !== null) {
    const body = json as Record<string, unknown>;
    if (typeof body.error === "string") {
      message = body.error;
    } else if (
      typeof body.error === "object" &&
      body.error !== null &&
      typeof (body.error as { message?: unknown }).message === "string"
    ) {
      message = (body.error as { message: string }).message;
    }
    if (typeof body.error_code === "string") {
      errorCode = body.error_code;
    }
  }

  return new OpdSessionConvertError(
    message,
    res.status,
    retryAfterSeconds,
    errorCode
  );
}

/**
 * Dry-run conversion impact for the preview dialog (pdm-05).
 * POST /api/v1/opd/session/preview-convert
 */
export async function previewConvertSession(
  token: string,
  params: { date: string; toMode: OpdSessionDayMode }
): Promise<{ data: ConvertSessionDayModeResult }> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/opd/session/preview-convert`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    throw parseConvertSessionError(res, json, res.headers.get("Retry-After"));
  }
  const envelope = json as ApiSuccess<ConvertSessionDayModeResult>;
  return { data: envelope.data };
}

/**
 * Commit a session mode conversion (pdm-05).
 * POST /api/v1/opd/session/convert
 */
export async function convertSession(
  token: string,
  params: { date: string; toMode: OpdSessionDayMode; notes?: string }
): Promise<{ data: ConvertSessionDayModeResult; retryAfterSeconds?: number }> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/opd/session/convert`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
    cache: "no-store",
  });
  const retryAfterHeader = res.headers.get("Retry-After");
  const json = (await res.json().catch(() => ({}))) as unknown;
  const parsedRetry = retryAfterHeader
    ? Number.parseInt(retryAfterHeader, 10)
    : undefined;
  const retryAfterSeconds =
    parsedRetry !== undefined && Number.isFinite(parsedRetry)
      ? parsedRetry
      : undefined;

  if (!res.ok) {
    throw parseConvertSessionError(res, json, retryAfterHeader);
  }
  const envelope = json as ApiSuccess<ConvertSessionDayModeResult>;
  return { data: envelope.data, retryAfterSeconds };
}

export interface DoctorOpdSlotSessionData {
  entries: SlotSessionRow[];
  counts: SlotSessionCounts;
  snapshotAt: string;
  date: string;
}

/**
 * Doctor-only — slot-mode session snapshot. Server-derives slotStatus + counts
 * so the chip counts match what the patient sees on their own snapshot.
 */
export async function getDoctorOpdSlotSession(
  token: string,
  date: string
): Promise<ApiSuccess<DoctorOpdSlotSessionData>> {
  const params = new URLSearchParams({ date });
  return request<DoctorOpdSlotSessionData>(
    `/api/v1/opd/slot-session?${params.toString()}`,
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

/**
 * OPD-08: requeue a queue entry whose patient missed their turn.
 *
 * Strategies:
 *  - 'after_current': insert immediately after the patient currently in_consultation.
 *    If nobody is in consultation, falls back to end-of-queue.
 *  - 'end_of_queue':  push to the end of the day's queue.
 *
 * Server route: POST /api/v1/opd/queue-entries/:entryId/requeue
 */
export async function postDoctorRequeueQueueEntry(
  token: string,
  entryId: string,
  strategy: "after_current" | "end_of_queue"
): Promise<ApiSuccess<{ requeued: boolean; strategy: string }>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/opd/queue-entries/${entryId}/requeue`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ strategy }),
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ requeued: boolean; strategy: string }>
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
  return json as ApiSuccess<{ requeued: boolean; strategy: string }>;
}

/**
 * Wrap-up payload accepted by `POST /api/v1/appointments/:id/wrap-up` (pf-02).
 *
 * All fields are optional — the backend accepts an empty body and persists
 * `null` / `[]` defaults. The cockpit uses the empty-body shape because the
 * doctor has already filled diagnosis + follow-up inside the prescription
 * pad; the wrap-up endpoint exists to flip `appointments.status → completed`
 * (and best-effort end the live consultation session).
 */
export interface WrapUpAppointmentPayload {
  diagnosis_text?: string | null;
  diagnosis_tags?: string[];
  followup_date?: string | null;
  followup_kind?: "none" | "in_person" | "tele" | null;
}

/**
 * Finalise an appointment — flips `status → completed` and ends the live
 * consultation session if one is open. Idempotent: a second call on an
 * already-completed appointment is a 200 no-op (returns the existing row).
 *
 * Server route: POST /api/v1/appointments/:id/wrap-up
 *
 * Used by the cockpit's "Send Rx & finish" / "Finish visit" / "Done with
 * patient" CTAs. The body is optional — pass `{}` when the doctor has
 * already captured diagnosis + follow-up in the Rx pad (the standard case).
 */
export async function postAppointmentWrapUp(
  token: string,
  appointmentId: string,
  payload: WrapUpAppointmentPayload = {}
): Promise<ApiSuccess<{ appointment: Appointment }>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/appointments/${appointmentId}/wrap-up`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ appointment: Appointment }>
    | ApiError;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Wrap-up failed";
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

/**
 * Mark an appointment as no-show. The backend updates appointment.status → 'no_show'
 * and syncs the queue entry to 'missed' when applicable.
 *
 * Server route: POST /api/v1/opd/appointments/:appointmentId/mark-no-show
 */
export async function postDoctorMarkNoShow(
  token: string,
  appointmentId: string
): Promise<ApiSuccess<{ marked: boolean }>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/opd/appointments/${appointmentId}/mark-no-show`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ marked: boolean }>
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
  return json as ApiSuccess<{ marked: boolean }>;
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
  /**
   * `consultation_sessions.id` — surfaced so the patient join page can
   * call `POST /api/v1/consultation/:sessionId/text-token` for the
   * companion chat (Plan 06 Decision 9 / voice-0B). Optional only for
   * defensive-typing during the deploy window where backend + frontend
   * may briefly disagree; once both ship together this is always
   * present in practice.
   */
  sessionId?: string;
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

// -----------------------------------------------------------------------------
// Text consultation — doctor-side start (Plan 04 · Task 18)
// -----------------------------------------------------------------------------

/**
 * Response envelope returned by `POST /api/v1/consultation/start-text`.
 *
 * Unlike video / voice, text consults don't involve a Twilio room — the
 * backend provisions a `consultation_sessions` row (Supabase Realtime
 * is the transport) and returns the session UUID. The doctor's
 * `<TextConsultRoom>` then authenticates directly against Supabase
 * using the doctor's dashboard JWT (RLS keys on `auth.uid() =
 * doctor_id`), so there is no separate "doctor token" in the response.
 *
 * The handler also flips the session from `scheduled → live` as part
 * of the start-text call (doctor hitting Start = "we are live"), so
 * `status` is typically `'live'` on success. See
 * `backend/src/controllers/consultation-controller.ts#startTextConsultationHandler`.
 */
export interface StartTextConsultationData {
  sessionId: string;
  modality: "text";
  status: TextConsultSessionStatus;
}

/**
 * Start a text consultation for an appointment. Requires a doctor
 * Supabase Bearer JWT.
 *
 * Idempotent: re-calling for the same appointment returns the existing
 * session row (Plan 01 facade short-circuit). Safe to invoke on page
 * refresh as a rejoin path when the doctor re-opens the appointment
 * detail page mid-consult.
 */
export async function startTextConsultation(
  token: string,
  appointmentId: string,
): Promise<ApiSuccess<StartTextConsultationData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/consultation/start-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ appointmentId }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<StartTextConsultationData>
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
  return json as ApiSuccess<StartTextConsultationData>;
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

/**
 * voice-B6 · Mint a signed replay URL for post-call playback.
 *
 * Plan 07 exposes `POST …/replay/audio/mint` (not a GET `/replay` route).
 * This helper maps the mint response to the shape the lightweight
 * `<RecordingPlaybackPlayer>` expects.
 */
export async function getReplayUrl(
  token: string,
  sessionId: string,
): Promise<{ replayUrl: string; expiresAt: string }> {
  const res = await mintReplayAudioUrl(token, sessionId, "audio");
  return {
    replayUrl: res.data.signedUrl,
    expiresAt: res.data.expiresAt,
  };
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
// Plan 06 — Attachment signed-URL minting (backend-mediated)
//
// `client.storage.createSignedUrl()` from the patient browser empirically
// fails on at least one Supabase Storage version when the bearer is our
// custom `patient:{appointmentId}` JWT (the `storage.objects` RLS would
// allow the read, but the storage-api auth layer trips on the synthetic
// sub). Routing through the backend `POST /:sessionId/attachments/sign`
// route side-steps the issue — the backend uses service-role and
// re-enforces session membership from the same JWT claims the storage
// RLS would key on.
// =============================================================================

export interface SignedAttachmentUrlsResult {
  /**
   * Map from storage object path → short-lived signed download URL.
   * Paths absent from this map mean the backend dropped them (bad
   * prefix / object missing / transient storage error). Callers
   * should re-render with a "tap to retry" affordance for absent
   * paths rather than infinite-loading.
   */
  urls: Record<string, string>;
}

/**
 * Mint signed download URLs for `consultation-attachments` objects via
 * the backend's service-role path. Used by `<TextConsultRoom>` to
 * render `kind='attachment'` rows.
 *
 * @param sessionId - `consultation_sessions.id` from the URL path.
 * @param paths     - storage object keys, each must start with
 *                    `${sessionId}/`. Bad paths are silently dropped
 *                    by the backend.
 * @param accessToken - the same Supabase JWT the chat surface uses
 *                      for Realtime + queries.
 * @throws on network / non-2xx response. Per-path failures are
 *         surfaced as missing entries in `urls`.
 */
export async function signAttachmentUrls(
  sessionId: string,
  paths: string[],
  accessToken: string,
): Promise<SignedAttachmentUrlsResult> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/attachments/sign`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ paths }),
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<SignedAttachmentUrlsResult>
    | ApiError;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Sign request failed";
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (isApiError(json)) {
    const err = new Error(json.error.message) as Error & { status?: number };
    err.status = json.error.statusCode ?? 500;
    throw err;
  }
  return (json as ApiSuccess<SignedAttachmentUrlsResult>).data;
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
 * EHR Sub-batch B1 / T2.14 — fetch the most recent prescription in
 * the same care episode as the given appointment, EXCLUDING the
 * appointment itself. Returns `{ prescription: null }` (200) when no
 * prior Rx exists — used by the "Copy from last visit" CTA on the
 * doctor-side Rx form to decide whether to render itself.
 */
export interface LastPrescriptionInEpisodeData {
  prescription: PrescriptionWithRelations | null;
}

export async function getLastPrescriptionInEpisode(
  token: string,
  appointmentId: string
): Promise<ApiSuccess<LastPrescriptionInEpisodeData>> {
  return request<LastPrescriptionInEpisodeData>(
    `/api/v1/prescriptions/last-in-episode?appointmentId=${encodeURIComponent(appointmentId)}`,
    { token }
  );
}

// ============================================================================
// EHR Sub-batch B2 / T3.16 — Public prescription share-link surface
// ============================================================================

/**
 * Mirror of the public prescription endpoint payload. Snake-case matches
 * the backend wire format; the page does the snake→camel projection
 * when building the <PatientRxView> view-model.
 */
export interface PublicPrescriptionData {
  prescription: {
    id: string;
    type: "structured" | "photo" | "both";
    cc: string | null;
    hopi: string | null;
    provisional_diagnosis: string | null;
    investigations: string | null;
    follow_up: string | null;
    patient_education: string | null;
    sent_to_patient_at: string | null;
    created_at: string;
    prescription_medicines: PrescriptionMedicine[];
  };
  doctor: {
    display_name: string;
    specialty: string | null;
    clinic_name: string | null;
    clinic_address: string | null;
  };
  patient: {
    display_name: string;
  };
  appointment: {
    id: string | null;
    appointment_date: string | null;
  };
  /** Fresh ~24h signed URL (re-minted on every visit). May be null when render fails. */
  signed_pdf_url: string | null;
  /** ISO timestamp the share-token expires. */
  token_expires_at: string | null;
}

/**
 * Fetch the patient-facing prescription view. NO auth — the URL token
 * is the auth surface. The wrapper delegates to the same `request()`
 * helper for consistent error shapes; we omit the `token` option so
 * `Authorization` isn't sent (the public route doesn't need it and
 * setting one would add a CORS preflight).
 *
 * Errors thrown by `request()` carry the HTTP status on `err.status`
 * — the page branches its UI between 410 (expired) and everything
 * else (invalid / not-found / generic).
 */
export async function getPublicPrescription(
  prescriptionId: string,
  token: string,
): Promise<ApiSuccess<PublicPrescriptionData>> {
  const url = `/api/v1/public/prescriptions/${encodeURIComponent(prescriptionId)}?t=${encodeURIComponent(token)}`;
  return request<PublicPrescriptionData>(url);
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

/** Alias for patients-v2 Rx tab (pr-11). */
export const getPrescriptionsForPatient = listPrescriptionsByPatient;

/**
 * EHR Sub-batch A / T1.6 — list the N most recent prescriptions for a
 * patient (lightweight summary; no full body / medicines / attachments).
 * Powers the chart panel's "Previous prescriptions" section.
 *
 * @see backend/src/services/prescription-service.ts:listRecentPrescriptionsByPatient
 */
export interface RecentPrescriptionsListData {
  prescriptions: PrescriptionRecentSummary[];
}

export async function listRecentPrescriptionsByPatient(
  token: string,
  patientId: string,
  options: { limit?: number } = {}
): Promise<ApiSuccess<RecentPrescriptionsListData>> {
  const qs = options.limit ? `?limit=${encodeURIComponent(String(options.limit))}` : "";
  return request<RecentPrescriptionsListData>(
    `/api/v1/patients/${encodeURIComponent(patientId)}/prescriptions/recent${qs}`,
    { token }
  );
}

/**
 * EHR Sub-batch B1 / T2.7 — Drug master search.
 *
 * @see backend/src/services/drug-master-service.ts
 * @see backend/src/routes/api/v1/drug-master.ts
 *
 * Hard-cap on `limit` is enforced server-side at 25 (anything above is
 * silently clamped); below 2 chars the server returns `[]` so the UI
 * dropdown should hide itself rather than fire a request.
 */
export interface DrugSearchResultsData {
  results: DrugMasterRow[];
}

export async function searchDrugs(
  token: string,
  query: string,
  options: { limit?: number } = {}
): Promise<ApiSuccess<DrugSearchResultsData>> {
  const params = new URLSearchParams();
  params.set("q", query);
  if (options.limit) params.set("limit", String(options.limit));
  return request<DrugSearchResultsData>(
    `/api/v1/drugs/search?${params.toString()}`,
    { token }
  );
}

// ============================================================================
// EHR Sub-batch B1 / T2.11 + T2.12 — Doctor Rx Templates
// ============================================================================

export interface RxTemplatesListData {
  templates: DoctorRxTemplate[];
}

export interface RxTemplateData {
  template: DoctorRxTemplate;
}

/** List active templates for the calling doctor. Sorted server-side. */
export async function listRxTemplates(
  token: string
): Promise<ApiSuccess<RxTemplatesListData>> {
  return request<RxTemplatesListData>(`/api/v1/rx-templates`, { token });
}

/** Create a new template. */
export async function createRxTemplate(
  token: string,
  payload: CreateRxTemplatePayload
): Promise<ApiSuccess<RxTemplateData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/rx-templates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<RxTemplateData>
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
  return json as ApiSuccess<RxTemplateData>;
}

/** PATCH an existing template (partial update). */
export async function updateRxTemplate(
  token: string,
  id: string,
  payload: UpdateRxTemplatePayload
): Promise<ApiSuccess<RxTemplateData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/rx-templates/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<RxTemplateData>
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
  return json as ApiSuccess<RxTemplateData>;
}

/**
 * Bump the template's `use_count` + `last_used_at`. Called by the
 * <TemplatePicker> Apply path so the most-used templates surface to
 * the top of the picker over time.
 */
export async function recordRxTemplateUse(
  token: string,
  id: string
): Promise<ApiSuccess<RxTemplateData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/rx-templates/${id}/use`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<RxTemplateData>
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
  return json as ApiSuccess<RxTemplateData>;
}

/** Soft-delete (archive) a template. */
export async function archiveRxTemplate(
  token: string,
  id: string
): Promise<ApiSuccess<RxTemplateData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/rx-templates/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<RxTemplateData>
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
  return json as ApiSuccess<RxTemplateData>;
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
  /**
   * EHR Sub-batch B2 / T3.17 — populated when PDF generation succeeded.
   * `null` when the PDF service was unavailable or no patient channels
   * were resolvable.
   */
  pdfStoragePath?: string | null;
  /**
   * 24h public share URL minted alongside the send. `null` when
   * `APP_BASE_URL` / `RX_SHARE_TOKEN_SECRET` aren't configured.
   */
  publicLink?: string | null;
}

/**
 * EHR Sub-batch B2 / T3.19 — Regenerate PDF (kebab action).
 * Forces a fresh render bypassing the 5-min cache.
 */
export interface RegeneratePrescriptionPdfData {
  storagePath: string;
  signedUrl: string;
  generatedAt: string;
  byteCount: number;
}

/**
 * EHR Sub-batch B2 / T3.19 — Copy share link (kebab action).
 * Mints a fresh 24h HMAC token; no side effects.
 */
export interface PrescriptionShareLinkData {
  url: string;
  expiresAt: string;
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

/**
 * EHR Sub-batch B2 / T3.19 — Regenerate the prescription PDF (force
 * a fresh render bypassing the 5-min in-memory cache). Used by the
 * past-Rx kebab when the doctor's letterhead changed.
 */
export async function regeneratePrescriptionPdf(
  token: string,
  prescriptionId: string,
): Promise<ApiSuccess<RegeneratePrescriptionPdfData>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/prescriptions/${prescriptionId}/regenerate-pdf`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<RegeneratePrescriptionPdfData>
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
  return json as ApiSuccess<RegeneratePrescriptionPdfData>;
}

/**
 * EHR Sub-batch B2 / T3.19 — Mint a fresh 24h share-link token for an
 * existing prescription (no side effects beyond logging the doctor
 * action). Used by the "Copy share link" kebab item.
 */
export async function createPrescriptionShareLink(
  token: string,
  prescriptionId: string,
): Promise<ApiSuccess<PrescriptionShareLinkData>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/prescriptions/${prescriptionId}/share-link`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<PrescriptionShareLinkData>
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
  return json as ApiSuccess<PrescriptionShareLinkData>;
}

// =============================================================================
// EHR Sub-batch A · T1.2 / T1.3 — Patient chart context
//
// Doctor-only CRUD wrappers around
//   /api/v1/patients/:patientId/chart/{allergies,conditions,vitals}
// (server: backend/src/routes/api/v1/patient-chart-routes.ts).
//
// Soft-delete sentinel: pass `archivedAt: 'now'` on PATCH to archive a row.
// The server resolves it to an ISO timestamp; pass `null` to un-archive.
//
// Types are imported at the top of this file (search for "@/types/patient-chart").
// =============================================================================

/**
 * Internal helper used by all six patient-chart mutations
 * (`POST` and `PATCH`). Mirrors the inline-fetch + isApiError pattern
 * used by `createPrescription` / `updatePrescription`. Hoisted to a
 * single place so we don't repeat the boilerplate per route.
 */
async function patientChartMutate<T>(
  method: "POST" | "PATCH",
  path: string,
  token: string,
  payload: unknown,
): Promise<ApiSuccess<T>> {
  const res = await fetch(`${requireApiBaseUrl()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
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

// ---- Allergies -------------------------------------------------------------

export async function listPatientAllergies(
  token: string,
  patientId: string,
): Promise<ApiSuccess<AllergiesListData>> {
  return request<AllergiesListData>(
    `/api/v1/patients/${encodeURIComponent(patientId)}/chart/allergies`,
    { token },
  );
}

export async function createPatientAllergy(
  token: string,
  patientId: string,
  payload: CreatePatientAllergyPayload,
): Promise<ApiSuccess<AllergyData>> {
  return patientChartMutate<AllergyData>(
    "POST",
    `/api/v1/patients/${encodeURIComponent(patientId)}/chart/allergies`,
    token,
    payload,
  );
}

export async function updatePatientAllergy(
  token: string,
  patientId: string,
  id: string,
  payload: UpdatePatientAllergyPayload,
): Promise<ApiSuccess<AllergyData>> {
  return patientChartMutate<AllergyData>(
    "PATCH",
    `/api/v1/patients/${encodeURIComponent(patientId)}/chart/allergies/${encodeURIComponent(id)}`,
    token,
    payload,
  );
}

/** Archive (soft-delete) helper — wraps the PATCH with `{ archivedAt: 'now' }`. */
export function archivePatientAllergy(
  token: string,
  patientId: string,
  id: string,
): Promise<ApiSuccess<AllergyData>> {
  return updatePatientAllergy(token, patientId, id, { archivedAt: "now" });
}

// ---- Chronic conditions ----------------------------------------------------

export async function listPatientConditions(
  token: string,
  patientId: string,
): Promise<ApiSuccess<ConditionsListData>> {
  return request<ConditionsListData>(
    `/api/v1/patients/${encodeURIComponent(patientId)}/chart/conditions`,
    { token },
  );
}

export async function createPatientCondition(
  token: string,
  patientId: string,
  payload: CreatePatientConditionPayload,
): Promise<ApiSuccess<ConditionData>> {
  return patientChartMutate<ConditionData>(
    "POST",
    `/api/v1/patients/${encodeURIComponent(patientId)}/chart/conditions`,
    token,
    payload,
  );
}

export async function updatePatientCondition(
  token: string,
  patientId: string,
  id: string,
  payload: UpdatePatientConditionPayload,
): Promise<ApiSuccess<ConditionData>> {
  return patientChartMutate<ConditionData>(
    "PATCH",
    `/api/v1/patients/${encodeURIComponent(patientId)}/chart/conditions/${encodeURIComponent(id)}`,
    token,
    payload,
  );
}

export function archivePatientCondition(
  token: string,
  patientId: string,
  id: string,
): Promise<ApiSuccess<ConditionData>> {
  return updatePatientCondition(token, patientId, id, { archivedAt: "now" });
}

// ---- Vitals ----------------------------------------------------------------

export async function listPatientVitals(
  token: string,
  patientId: string,
  options: { limit?: number } = {},
): Promise<ApiSuccess<VitalsListData>> {
  const qs = options.limit ? `?limit=${encodeURIComponent(String(options.limit))}` : "";
  return request<VitalsListData>(
    `/api/v1/patients/${encodeURIComponent(patientId)}/chart/vitals${qs}`,
    { token },
  );
}

export async function createPatientVitals(
  token: string,
  patientId: string,
  payload: CreatePatientVitalsPayload,
): Promise<ApiSuccess<VitalsData>> {
  return patientChartMutate<VitalsData>(
    "POST",
    `/api/v1/patients/${encodeURIComponent(patientId)}/chart/vitals`,
    token,
    payload,
  );
}

export async function updatePatientVitals(
  token: string,
  patientId: string,
  id: string,
  payload: UpdatePatientVitalsPayload,
): Promise<ApiSuccess<VitalsData>> {
  return patientChartMutate<VitalsData>(
    "PATCH",
    `/api/v1/patients/${encodeURIComponent(patientId)}/chart/vitals/${encodeURIComponent(id)}`,
    token,
    payload,
  );
}

export function archivePatientVitals(
  token: string,
  patientId: string,
  id: string,
): Promise<ApiSuccess<VitalsData>> {
  return updatePatientVitals(token, patientId, id, { archivedAt: "now" });
}

// =============================================================================
// Sub-batch C · task-video-C6 — In-call quick-action banners
//
// Posts a system-row banner (`'rx_sent'` or `'follow_up_scheduled'`)
// into the consultation chat AFTER the doctor has used the in-call
// action panel to send a prescription / schedule a follow-up. The
// underlying clinical action is already done by the existing dashboard
// helpers (`sendPrescriptionToPatient` / `createAppointment`) — this
// helper only mints the in-channel breadcrumb so the patient sees a
// notification in the chat thread without leaving the consult.
//
// Doctor-only on the backend (patient JWTs are 403'd at the service gate).
// =============================================================================

export type ConsultationQuickActionPayload =
  | { kind: "rx_sent"; prescriptionId: string }
  | {
      kind: "follow_up_scheduled";
      appointmentId: string;
      /** ISO timestamp from the freshly created appointment row's `appointment_date`. */
      scheduledAt: string;
    };

export interface ConsultationQuickActionResult {
  kind: "rx_sent" | "follow_up_scheduled";
  /** UTC ISO timestamp of when the backend finished emitting. */
  emittedAt: string;
}

export async function postConsultationQuickActionBanner(
  token: string,
  sessionId: string,
  payload: ConsultationQuickActionPayload,
): Promise<ApiSuccess<ConsultationQuickActionResult>> {
  const url = `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(
    sessionId,
  )}/quick-action-banner`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<ConsultationQuickActionResult>
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
  return json as ApiSuccess<ConsultationQuickActionResult>;
}

// =============================================================================
// Sub-batch E · task-video-E2 — Auto audio-only fallback lifecycle banner
//
// Posts an `auto_audio_fallback` (engaged) or `auto_audio_recovered`
// (restored) system row into the consultation chat after the local
// <VideoRoom>'s adaptive controller has either engaged audio-only
// fallback (E1's "very low" floor breach) or the doctor has clicked
// "Try video again" to restore video.
//
// Doctor-only on the backend (patient JWTs are 403'd at the service gate).
// =============================================================================

/**
 * Why we dropped to audio-only. Mirrors the backend's
 * `AutoAudioFallbackReason` whitelist (single source of truth in
 * `consultation-message-service.ts`). Decision §34 — F.1 / task-video-F4
 * reuses the `auto_audio_fallback` event with this discriminator
 * carried in `meta.reason` rather than introducing a new event name.
 *
 *   - `low_bandwidth`    → adaptive controller (E.2 / E.3) tripped.
 *                          Default; back-compat for legacy callers
 *                          that don't send the field.
 *   - `battery_low`      → patient confirmed the 15% prompt by
 *                          clicking "Switch to audio-only".
 *   - `battery_critical` → patient battery <5% and not charging;
 *                          fallback was forced.
 */
export type AutoFallbackReason =
  | "low_bandwidth"
  | "battery_low"
  | "battery_critical";

export type ConsultationAutoFallbackPayload =
  | {
      kind: "engaged";
      attempt: number;
      /**
       * Twilio `networkQualityLevel` that tripped the fallback. REQUIRED
       * for `reason: 'low_bandwidth'`. Optional / null for battery-
       * triggered engagements (F.1 / task-video-F4) where there's no
       * Twilio threshold — the trigger is the OS Battery API level
       * crossing the configured floor.
       */
      thresholdLevel: number | null;
      /**
       * Defaults to `'low_bandwidth'` server-side when omitted (the E.2
       * frontend doesn't send it, and that path keeps working
       * unchanged). F.1 battery callers send `'battery_low'` (15%
       * user-confirmed) or `'battery_critical'` (5% forced).
       */
      reason?: AutoFallbackReason;
    }
  | { kind: "restored"; attempt: number; durationSeconds: number };

export interface ConsultationAutoFallbackResult {
  kind: "engaged" | "restored";
  /** UTC ISO timestamp of when the backend finished emitting. */
  emittedAt: string;
}

// =============================================================================
// Sub-batch A · voice T1.8 / task-voice-A7 — mute / unmute companion banner
// =============================================================================

export interface ConsultationMuteChangedPayload {
  muted: boolean;
  /** Display label for third-person copy ("Dr. Sharma", "Patient"). */
  actorName?: string;
}

export interface ConsultationMuteChangedResult {
  muted: boolean;
  emittedAt: string;
}

export async function postConsultationMuteChanged(
  token: string,
  sessionId: string,
  payload: ConsultationMuteChangedPayload,
): Promise<ApiSuccess<ConsultationMuteChangedResult>> {
  const url = `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(
    sessionId,
  )}/mute-changed`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<ConsultationMuteChangedResult>
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
  return json as ApiSuccess<ConsultationMuteChangedResult>;
}

// =============================================================================
// Sub-batch B · voice T2.11 / task-voice-B3 — hold / resume companion banner
// =============================================================================

export interface ConsultationHoldChangedPayload {
  onHold: boolean;
  actorName?: string;
}

export interface ConsultationHoldChangedResult {
  onHold: boolean;
  emittedAt: string;
}

export async function postConsultationHoldChanged(
  token: string,
  sessionId: string,
  payload: ConsultationHoldChangedPayload,
): Promise<ApiSuccess<ConsultationHoldChangedResult>> {
  const url = `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(
    sessionId,
  )}/hold-changed`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<ConsultationHoldChangedResult>
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
  return json as ApiSuccess<ConsultationHoldChangedResult>;
}

export async function postConsultationAutoFallbackBanner(
  token: string,
  sessionId: string,
  payload: ConsultationAutoFallbackPayload,
): Promise<ApiSuccess<ConsultationAutoFallbackResult>> {
  const url = `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(
    sessionId,
  )}/auto-fallback-banner`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<ConsultationAutoFallbackResult>
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
  return json as ApiSuccess<ConsultationAutoFallbackResult>;
}

// =============================================================================
// Sub-batch E · task-video-E6 — Video QoS health metrics ingest
//
// Posts a batch of QoS samples (RTT, jitter, packet loss, network
// quality level, audio in/out levels, video resolution/fps, kbps) into
// the `video_call_quality` table (Migration 086). Called by the
// frontend `quality-reporter.ts` on a 60s flush cadence + on call end.
//
// Auth: doctor Supabase JWT OR patient companion JWT (the backend
// service routes on the `consult_role` claim).
// =============================================================================

export interface VideoQualitySamplePayload {
  /** Per-(session, role) monotonic 0-indexed counter. */
  sampleSeq: number;
  networkQualityLevel?: number | null;
  rttMs?: number | null;
  jitterMs?: number | null;
  packetLossPct?: number | null;
  audioInputLevel?: number | null;
  audioOutputLevel?: number | null;
  videoResolutionW?: number | null;
  videoResolutionH?: number | null;
  videoFps?: number | null;
  kbpsSend?: number | null;
  kbpsReceive?: number | null;
  twilioRoomSid?: string | null;
}

export interface VideoQualityIngestResult {
  inserted: number;
  sessionId: string;
  role: "doctor" | "patient" | "extra_participant";
}

export async function postConsultationVideoQuality(
  token: string,
  sessionId: string,
  samples: VideoQualitySamplePayload[],
): Promise<ApiSuccess<VideoQualityIngestResult>> {
  const url = `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(
    sessionId,
  )}/video-quality`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ samples }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<VideoQualityIngestResult>
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
  return json as ApiSuccess<VideoQualityIngestResult>;
}

// =============================================================================
// Sub-batch C · task-voice-C2 — Voice QoS health metrics ingest
//
// Posts a batch of voice QoS samples (RTT, jitter, packet loss, network
// quality level, audio in/out levels) into the `voice_call_quality`
// table (Migration 105). Called by the frontend voice
// `quality-reporter.ts` on a 60s flush cadence + on call end.
//
// Auth: doctor Supabase JWT OR patient companion JWT (the backend
// service routes on the `consult_role` claim — same shape as the
// video sibling).
// =============================================================================

export interface VoiceQualitySamplePayload {
  /** Per-(session, role) monotonic 0-indexed counter. */
  sampleSeq: number;
  networkQualityLevel?: number | null;
  rttMs?: number | null;
  jitterMs?: number | null;
  packetLossPct?: number | null;
  audioInputLevel?: number | null;
  audioOutputLevel?: number | null;
  twilioRoomSid?: string | null;
}

export interface VoiceQualityIngestResult {
  inserted: number;
  sessionId: string;
  role: "doctor" | "patient" | "extra_participant";
}

export async function postConsultationVoiceQuality(
  token: string,
  sessionId: string,
  samples: VoiceQualitySamplePayload[],
): Promise<ApiSuccess<VoiceQualityIngestResult>> {
  const url = `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(
    sessionId,
  )}/voice-quality`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ samples }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<VoiceQualityIngestResult>
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
  return json as ApiSuccess<VoiceQualityIngestResult>;
}

// =============================================================================
// Sub-batch D · task-text-D4 — Text chat delivery health metrics ingest
//
// Posts a 30s aggregate sample into `text_chat_quality` (Migration 108).
// Auth: doctor Supabase JWT OR patient companion JWT.
// Returns 204 No Content on success.
// =============================================================================

export interface TextChatQualitySamplePayload {
  session_id: string;
  roundtrip_p95_ms?: number | null;
  realtime_reconnects: number;
  presence_flaps: number;
  messages_in_window: number;
}

export async function postConsultationTextQualitySample(
  token: string,
  sessionId: string,
  sample: TextChatQualitySamplePayload,
): Promise<void> {
  const url = `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(
    sessionId,
  )}/text-quality-sample`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(sample),
    cache: "no-store",
  });
  if (res.status === 204) return;
  const json = (await res.json().catch(() => ({}))) as ApiError | Record<string, unknown>;
  const message = isApiError(json) ? json.error.message : "Request failed";
  const err = new Error(message) as Error & { status?: number };
  err.status = res.status;
  throw err;
}

// =============================================================================
// Web Push subscriptions (task-text-D6b)
// =============================================================================

export interface PushSubscribePayload {
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  userAgent?: string;
}

export interface PushSubscriptionSummary {
  id: string;
  endpoint: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
}

export async function subscribePushSubscription(
  token: string,
  body: PushSubscribePayload,
): Promise<{ id: string }> {
  const url = `${requireApiBaseUrl()}/api/v1/push/subscribe`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ id: string }>
    | ApiError
    | Record<string, unknown>;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    throw new Error(message);
  }
  if (!("success" in json) || !json.success) {
    throw new Error("Invalid push subscribe response");
  }
  const data = (json as ApiSuccess<{ id: string }>).data;
  if (!data?.id) {
    throw new Error("Invalid push subscribe response");
  }
  return { id: data.id };
}

export async function deletePushSubscription(token: string, id: string): Promise<void> {
  const url = `${requireApiBaseUrl()}/api/v1/push/subscribe/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (res.status === 204) return;
  const json = (await res.json().catch(() => ({}))) as ApiError | Record<string, unknown>;
  const message = isApiError(json) ? json.error.message : "Request failed";
  throw new Error(message);
}

export async function listPushSubscriptions(
  token: string,
): Promise<PushSubscriptionSummary[]> {
  const url = `${requireApiBaseUrl()}/api/v1/push/subscriptions`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ subscriptions: PushSubscriptionSummary[] }>
    | ApiError
    | Record<string, unknown>;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    throw new Error(message);
  }
  if (!("success" in json) || !json.success) {
    throw new Error("Invalid push subscriptions response");
  }
  return (json as ApiSuccess<{ subscriptions: PushSubscriptionSummary[] }>).data
    ?.subscriptions ?? [];
}

// =============================================================================
// Sub-batch C · task-video-C8 — Three-way / multi-participant invite helpers
//
// Doctor-side helpers wrap the four authenticated endpoints
// (`/extra-participants` create / revoke / list, plus the
// `extra-participant-exchange` public endpoint and the
// `extra-participants/leave` extra-participant-JWT endpoint).
//
// Mirrors the C6 helper shape — Bearer token in the header for the
// authenticated routes; no token for the public exchange.
// =============================================================================

export interface ExtraParticipantInvite {
  id: string;
  displayName: string;
  roleLabel: string | null;
  invitedAt: string;
  joinedAt: string | null;
  leftAt: string | null;
  revokedAt: string | null;
  /** Server-computed: joined && !left && !revoked. */
  active: boolean;
}

export interface CreateExtraParticipantResult {
  participantId: string;
  inviteToken: string;
  /** Fully-qualified `/c/video-invite/{token}` URL, or null when APP_BASE_URL isn't configured. */
  inviteUrl: string | null;
  invitedAt: string;
}

export interface ExchangeExtraParticipantResult {
  participantId: string;
  sessionId: string;
  displayName: string;
  roleLabel: string | null;
  joinedAt: string;
  /** Supabase JWT scoped to consult_role='extra_participant'. */
  jwt: string;
  jwtExpiresAt: string;
  /** Twilio Video access token (null when Twilio Video isn't configured server-side). */
  twilioToken: string | null;
  /** Twilio room name (== `consultation_sessions.provider_session_id`). */
  roomName: string | null;
}

export interface RevokeExtraParticipantResult {
  participantId: string;
  revokedAt: string;
  leftStamped: boolean;
}

export interface RecordExtraParticipantLeftResult {
  participantId: string;
  leftAt: string;
  /** False on idempotent re-call. */
  newlyStamped: boolean;
}

export async function createExtraParticipantInvite(
  token: string,
  sessionId: string,
  payload: { displayName: string; roleLabel?: string | null },
): Promise<ApiSuccess<CreateExtraParticipantResult>> {
  const url = `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(
    sessionId,
  )}/extra-participants`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<CreateExtraParticipantResult>
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
  return json as ApiSuccess<CreateExtraParticipantResult>;
}

export async function exchangeExtraParticipantInvite(
  inviteToken: string,
): Promise<ApiSuccess<ExchangeExtraParticipantResult>> {
  const url = `${requireApiBaseUrl()}/api/v1/consultation/extra-participant-exchange`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteToken }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<ExchangeExtraParticipantResult>
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
  return json as ApiSuccess<ExchangeExtraParticipantResult>;
}

export async function revokeExtraParticipantInvite(
  token: string,
  sessionId: string,
  participantId: string,
): Promise<ApiSuccess<RevokeExtraParticipantResult>> {
  const url = `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(
    sessionId,
  )}/extra-participants/${encodeURIComponent(participantId)}/revoke`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<RevokeExtraParticipantResult>
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
  return json as ApiSuccess<RevokeExtraParticipantResult>;
}

export async function listExtraParticipantInvites(
  token: string,
  sessionId: string,
): Promise<ApiSuccess<{ invites: ExtraParticipantInvite[] }>> {
  const url = `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(
    sessionId,
  )}/extra-participants`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<{ invites: ExtraParticipantInvite[] }>
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
  return json as ApiSuccess<{ invites: ExtraParticipantInvite[] }>;
}

export async function recordExtraParticipantLeft(
  extraParticipantJwt: string,
): Promise<ApiSuccess<RecordExtraParticipantLeftResult>> {
  const url = `${requireApiBaseUrl()}/api/v1/consultation/extra-participants/leave`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${extraParticipantJwt}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<RecordExtraParticipantLeftResult>
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
  return json as ApiSuccess<RecordExtraParticipantLeftResult>;
}

// =============================================================================
// Sub-batch D · task-video-D1 — post-call summary
// =============================================================================

/**
 * Mirrors `PostCallSummaryDto` in `backend/src/services/post-call-summary-service.ts`.
 * Modality-aware shape; used by video, voice, and appointment history.
 */
export interface PostCallSummary {
  sessionId: string;
  modality: "text" | "voice" | "video";
  status: "scheduled" | "live" | "ended" | "no_show" | "cancelled";
  duration: {
    startedAt: string | null;
    endedAt: string | null;
    secondsTotal: number | null;
  };
  counterparty: {
    name: string;
    role: "doctor" | "patient";
  };
  attachmentsCount: number;
  snapshotsCount: number;
  prescriptionSent: boolean;
  prescriptionId?: string;
  recording: {
    status: "available" | "processing" | "not-recorded" | "not-available";
    hasVideo?: boolean;
  };
}

/**
 * Fetch the post-call summary for a consultation session. Accepts EITHER
 * a doctor's Supabase JWT OR a scoped patient/extra-participant JWT.
 * Server-side `resolveCaller` discriminates and enforces session_id
 * claim match for scoped tokens.
 */
export async function getPostCallSummary(
  sessionId: string,
  bearerJwt: string,
): Promise<ApiSuccess<PostCallSummary>> {
  const url = `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/post-call-summary`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${bearerJwt}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<PostCallSummary>
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
  return json as ApiSuccess<PostCallSummary>;
}

// =============================================================================
// Sub-batch D · task-video-D3 — snapshot review-and-attach
// =============================================================================

/**
 * Canonical SOAP-style sections (Decision §19). Mirrors
 * `CLINICAL_SECTIONS` in `backend/src/services/snapshot-review-service.ts`.
 * Kept in sync by hand — the values are stable enough that a shared types
 * package isn't justified yet (same posture as the snapshot-annotations
 * type drift between backend + frontend).
 */
export const CLINICAL_SECTIONS = [
  "Subjective",
  "Objective",
  "Assessment",
  "Plan",
  "Attachments",
] as const;

export type ClinicalSection = (typeof CLINICAL_SECTIONS)[number];

/**
 * Mirrors `SnapshotSummary` in the backend service. One row per snapshot
 * captured during the session.
 */
export interface SnapshotReviewItem {
  snapshotId: string;
  attachmentPath: string;
  /** 1h-TTL signed URL for the JPEG. Empty string on mint failure. */
  signedUrl: string;
  capturedAt: string | null;
  dimensions: { width: number; height: number } | null;
  capturerRole: "doctor" | "patient";
  target: "self" | "remote";
  annotated: boolean;
  /** Section assignment from a previous attach call; null if unattached. */
  clinicalSection: ClinicalSection | null;
  /** ISO-8601 if soft-deleted; null otherwise. */
  discardedAt: string | null;
}

export interface SnapshotReviewListResponse {
  items: SnapshotReviewItem[];
}

/**
 * List all snapshots from a session. Doctor-only on the backend.
 *
 * `includeDiscarded` — defaults to `true` so the doctor can see soft-
 * discarded rows. Pass `false` to hide them (gallery render path
 * usually wants the visible-only subset).
 */
export async function listConsultSnapshots(
  sessionId: string,
  bearerJwt: string,
  includeDiscarded = true,
): Promise<ApiSuccess<SnapshotReviewListResponse>> {
  const params = new URLSearchParams();
  if (!includeDiscarded) params.set("includeDiscarded", "false");
  const qs = params.toString();
  const url = `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/snapshots${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${bearerJwt}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<SnapshotReviewListResponse>
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
  return json as ApiSuccess<SnapshotReviewListResponse>;
}

/**
 * Attach a snapshot to a clinical section. Doctor-only.
 *
 * Phase 1 persists the assignment on the snapshot row's metadata
 * (`metadata.clinical_section`). Future SOAP-section infrastructure
 * can re-project by reading this field.
 */
export async function attachConsultSnapshotToSection(
  sessionId: string,
  snapshotId: string,
  section: ClinicalSection,
  bearerJwt: string,
): Promise<ApiSuccess<SnapshotReviewItem>> {
  const url = `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/snapshots/${encodeURIComponent(snapshotId)}/attach-to-section`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerJwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ section }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<SnapshotReviewItem>
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
  return json as ApiSuccess<SnapshotReviewItem>;
}

/**
 * Soft-discard a snapshot. Doctor-only. Sets `metadata.discarded_at`
 * on the row; idempotent re-call preserves the original timestamp.
 */
export async function discardConsultSnapshot(
  sessionId: string,
  snapshotId: string,
  bearerJwt: string,
): Promise<ApiSuccess<SnapshotReviewItem>> {
  const url = `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/snapshots/${encodeURIComponent(snapshotId)}/discard`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearerJwt}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<SnapshotReviewItem>
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
  return json as ApiSuccess<SnapshotReviewItem>;
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
