/**
 * Staff-scoped API surface for `/desk` (receptionist-portal P3/P4).
 *
 * Desk pages import from here — not from `@/lib/api` — so they cannot
 * accidentally call chart / Rx / merge endpoints (principle 6).
 */

import { getAvailableSlots, getPatientById, getPatients } from "@/lib/api";
import type { ApiError, ApiSuccess } from "@/lib/api";
import { requireApiBaseUrl } from "@/lib/api-base";
import type { Appointment, AppointmentsListData } from "@/types/appointment";
import type { PatientVitalsReading } from "@/types/patient-chart";
import type { DeskVitalsPayload } from "@/lib/desk/vitals";
import type {
  Patient,
  PatientDetailData,
  PatientSummary,
  PatientsListPagedData,
} from "@/types/patient";

export type DeskAccessState = "ok" | "forbidden" | "unreachable";

export type DeskClinicContext = {
  doctorId: string;
  actorKind: "doctor" | "staff";
  timezone: string;
  today: string;
};

export type DeskDuplicateMatch = {
  patientId: string;
  name: string;
  phone: string;
  age?: number | null;
  gender?: string | null;
  medicalRecordNumber?: string | null;
  guardianName?: string | null;
  guardianRelation?: string | null;
  altPhone?: string | null;
  address?: string | null;
  confidence: number;
};

export type CreateDeskPatientBody = {
  name: string;
  phone: string;
  age?: number;
  ageUnit?: "years" | "months" | "days";
  dateOfBirth?: string;
  gender: "female" | "male" | "other";
  guardianName: string;
  guardianRelation: "father" | "spouse" | "mother" | "son" | "daughter";
  altPhone?: string;
  address?: string;
  confirmNew?: boolean;
};

export type DeskError = Error & {
  status?: number;
  body?: unknown;
};

export function classifyDeskAccessError(err: unknown): Exclude<DeskAccessState, "ok"> {
  const status =
    err instanceof Error && "status" in err
      ? Number((err as { status?: number }).status)
      : undefined;
  if (status === 403) return "forbidden";
  return "unreachable";
}

export function deskErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

export function deskErrorStatus(err: unknown): number | undefined {
  if (err instanceof Error && "status" in err) {
    const status = Number((err as { status?: number }).status);
    return Number.isFinite(status) ? status : undefined;
  }
  return undefined;
}

export type DeskAlreadyOnToday = {
  reason: "already_on_today";
  appointmentId: string;
  token: number | null;
  bucket: "waiting" | "arrived" | "seen";
};

export function parseAlreadyOnToday(err: unknown): DeskAlreadyOnToday | null {
  if (!(err instanceof Error) || !("body" in err)) return null;
  const body = (err as DeskError).body;
  if (!body || typeof body !== "object") return null;
  const details = (body as ApiError).error?.details;
  if (!details || typeof details !== "object") return null;
  if (details.reason !== "already_on_today") return null;
  if (typeof details.appointmentId !== "string") return null;
  const bucket = details.bucket;
  if (bucket !== "waiting" && bucket !== "arrived" && bucket !== "seen") return null;
  const token = details.token;
  return {
    reason: "already_on_today",
    appointmentId: details.appointmentId,
    token: typeof token === "number" ? token : null,
    bucket,
  };
}

export function parseDuplicateMatches(err: unknown): DeskDuplicateMatch[] {
  if (!(err instanceof Error) || !("body" in err)) return [];
  const body = (err as DeskError).body;
  if (!body || typeof body !== "object") return [];
  const details = (body as ApiError).error?.details;
  const matches = details?.matches;
  if (!Array.isArray(matches)) return [];
  return matches.filter(isDeskDuplicateMatch);
}

function isDeskDuplicateMatch(value: unknown): value is DeskDuplicateMatch {
  if (!value || typeof value !== "object") return false;
  const row = value as DeskDuplicateMatch;
  return typeof row.patientId === "string" && typeof row.name === "string";
}

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in json &&
    (json as ApiError).success === false
  );
}

export function isDeskAbortError(err: unknown): boolean {
  return err instanceof DOMException
    ? err.name === "AbortError"
    : err instanceof Error && err.name === "AbortError";
}

async function deskRequest<T>(
  path: string,
  options: { token: string; method?: string; body?: unknown; signal?: AbortSignal }
): Promise<ApiSuccess<T>> {
  const res = await fetch(`${requireApiBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.token}`,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    signal: options.signal,
  });

  const json = (await res.json().catch(() => ({}))) as ApiSuccess<T> | ApiError;
  if (!res.ok || isApiError(json)) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as DeskError;
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/** Connectivity + staff-link probe. Do not load the roster (P3). */
export async function probeDeskAccess(token: string): Promise<DeskAccessState> {
  try {
    await getDeskClinicContext(token);
    return "ok";
  } catch (err) {
    return classifyDeskAccessError(err);
  }
}

export function listDeskPatients(
  token: string
): Promise<ApiSuccess<import("@/types/patient").PatientsListData>> {
  return getPatients(token);
}

export function getDeskPatient(
  id: string,
  token: string
): Promise<ApiSuccess<PatientDetailData>> {
  return getPatientById(id, token);
}

export function getDeskClinicContext(
  token: string
): Promise<ApiSuccess<DeskClinicContext>> {
  return deskRequest<DeskClinicContext>("/api/v1/clinic-staff/me", { token });
}

/** First page for an explicit Find-a-patient search. Live typeahead stays smaller. */
export const DESK_SEARCH_PAGE_SIZE = 50;
export const DESK_LIVE_SEARCH_PAGE_SIZE = 10;

export function searchDeskPatients(
  token: string,
  q: string,
  includeArchived = false,
  signal?: AbortSignal,
  paging?: { page?: number; pageSize?: number }
): Promise<ApiSuccess<PatientsListPagedData>> {
  const params = new URLSearchParams({
    q,
    page: String(paging?.page ?? 1),
    pageSize: String(paging?.pageSize ?? DESK_SEARCH_PAGE_SIZE),
    sort: "last-visit-desc",
    lean: "true",
  });
  if (includeArchived) params.set("includeArchived", "true");
  return deskRequest<PatientsListPagedData>(`/api/v1/patients?${params.toString()}`, {
    token,
    signal,
  });
}

export function searchDeskIdentity(
  token: string,
  query: { name?: string; guardianName?: string; age?: number; gender?: string },
  includeArchived = false,
  signal?: AbortSignal,
  paging?: { page?: number; pageSize?: number }
): Promise<ApiSuccess<PatientsListPagedData>> {
  const params = new URLSearchParams({
    page: String(paging?.page ?? 1),
    pageSize: String(paging?.pageSize ?? DESK_LIVE_SEARCH_PAGE_SIZE),
    sort: "last-visit-desc",
    lean: "true",
  });
  if (query.name?.trim()) params.set("name", query.name.trim());
  if (query.guardianName?.trim()) params.set("guardianName", query.guardianName.trim());
  if (query.age != null) params.set("age", String(query.age));
  if (query.gender) params.set("gender", query.gender);
  if (includeArchived) params.set("includeArchived", "true");
  return deskRequest<PatientsListPagedData>(`/api/v1/patients?${params.toString()}`, {
    token,
    signal,
  });
}

export function createDeskPatient(
  token: string,
  body: CreateDeskPatientBody
): Promise<ApiSuccess<{ patient: Patient }>> {
  return deskRequest<{ patient: Patient }>("/api/v1/patients", {
    token,
    method: "POST",
    body,
  });
}

export function updateDeskPatient(
  token: string,
  id: string,
  body: CreateDeskPatientBody
): Promise<ApiSuccess<{ patient: Patient }>> {
  return deskRequest<{ patient: Patient }>(`/api/v1/patients/${encodeURIComponent(id)}`, {
    token,
    method: "PATCH",
    body,
  });
}

export function archiveDeskPatient(
  token: string,
  id: string
): Promise<ApiSuccess<{ patient: Patient }>> {
  return deskRequest<{ patient: Patient }>(
    `/api/v1/patients/${encodeURIComponent(id)}/archive`,
    { token, method: "POST" }
  );
}

export function restoreDeskPatient(
  token: string,
  id: string
): Promise<ApiSuccess<{ patient: Patient }>> {
  return deskRequest<{ patient: Patient }>(
    `/api/v1/patients/${encodeURIComponent(id)}/restore`,
    { token, method: "POST" }
  );
}

export function listDeskAppointments(
  token: string,
  date: string
): Promise<ApiSuccess<AppointmentsListData>> {
  const params = new URLSearchParams({ date });
  return deskRequest<AppointmentsListData>(
    `/api/v1/appointments?${params.toString()}`,
    { token }
  );
}

export function createDeskAppointment(
  token: string,
  payload: {
    patientId: string;
    appointmentDate: string;
    reasonForVisit?: string;
    bookingOrigin: "walk_in" | "booked";
    checkIn?: boolean;
  }
): Promise<ApiSuccess<{ appointment: Appointment }>> {
  return deskRequest<{ appointment: Appointment }>("/api/v1/appointments", {
    token,
    method: "POST",
    body: {
      patientId: payload.patientId,
      appointmentDate: payload.appointmentDate,
      reasonForVisit: payload.reasonForVisit ?? "Walk-in",
      freeOfCost: true,
      consultationType: "in_clinic",
      bookingOrigin: payload.bookingOrigin,
      ...(payload.checkIn ? { checkIn: true } : {}),
    },
  });
}

export function checkInDeskAppointment(
  token: string,
  appointmentId: string
): Promise<ApiSuccess<{ appointment: Appointment }>> {
  return deskRequest<{ appointment: Appointment }>(
    `/api/v1/appointments/${appointmentId}/check-in`,
    { token, method: "POST" }
  );
}

export function getDeskAppointmentVitals(
  token: string,
  appointmentId: string
): Promise<ApiSuccess<{ vitals: PatientVitalsReading | null }>> {
  return deskRequest<{ vitals: PatientVitalsReading | null }>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/desk-vitals`,
    { token }
  );
}

export function saveDeskAppointmentVitals(
  token: string,
  appointmentId: string,
  body: DeskVitalsPayload
): Promise<ApiSuccess<{ vitals: PatientVitalsReading }>> {
  return deskRequest<{ vitals: PatientVitalsReading }>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/desk-vitals`,
    { token, method: "PUT", body }
  );
}

export function getDeskAvailableSlots(doctorId: string, date: string) {
  return getAvailableSlots(doctorId, date);
}

export function patientToDeskRef(
  patient: Pick<Patient, "id" | "name" | "phone" | "gender"> & {
    age?: number | null;
    medical_record_number?: string | null;
    guardian_name?: string | null;
    guardian_relation?: string | null;
    alt_phone?: string | null;
    address?: string | null;
    date_of_birth?: string | null;
    archived_at?: string | null;
  }
): DeskPatientCard {
  return {
    id: patient.id,
    name: patient.name,
    phone: patient.phone,
    age: patient.age ?? null,
    gender: patient.gender ?? null,
    medical_record_number: patient.medical_record_number ?? null,
    guardian_name: patient.guardian_name ?? null,
    guardian_relation: patient.guardian_relation ?? null,
    alt_phone: patient.alt_phone ?? null,
    address: patient.address ?? null,
    date_of_birth: patient.date_of_birth?.slice(0, 10) ?? null,
    archived_at: patient.archived_at ?? null,
  };
}

export function summaryToDeskRef(row: PatientSummary): DeskPatientCard {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    age: row.age ?? null,
    gender: row.gender ?? null,
    medical_record_number: row.medical_record_number ?? null,
    last_appointment_date: row.last_appointment_date ?? null,
    next_appointment_date: row.next_appointment_date ?? null,
    guardian_name: row.guardian_name ?? null,
    guardian_relation: row.guardian_relation ?? null,
    alt_phone: row.alt_phone ?? null,
    address: row.address ?? null,
    date_of_birth: row.date_of_birth?.slice(0, 10) ?? null,
    archived_at: row.archived_at ?? null,
  };
}

export function matchToDeskRef(row: DeskDuplicateMatch): DeskPatientCard {
  return {
    id: row.patientId,
    name: row.name,
    phone: row.phone,
    age: row.age ?? null,
    gender: row.gender ?? null,
    medical_record_number: row.medicalRecordNumber ?? null,
    guardian_name: row.guardianName ?? null,
    guardian_relation: row.guardianRelation ?? null,
    alt_phone: row.altPhone ?? null,
    address: row.address ?? null,
  };
}

export type DeskPatientCard = {
  id: string;
  name: string;
  phone: string;
  age?: number | null;
  gender?: string | null;
  medical_record_number?: string | null;
  last_appointment_date?: string | null;
  next_appointment_date?: string | null;
  guardian_name?: string | null;
  guardian_relation?: string | null;
  alt_phone?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
  archived_at?: string | null;
};
