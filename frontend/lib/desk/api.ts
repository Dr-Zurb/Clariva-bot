/**
 * Staff-scoped API surface for `/desk` (receptionist-portal P3/P4).
 *
 * Desk pages import from here — not from `@/lib/api` — so they cannot
 * accidentally call chart / Rx / merge endpoints (principle 6).
 */

import { getAvailableSlots, getPatientById, getPatients } from "@/lib/api";
import type { ApiError, ApiSuccess } from "@/lib/api";
import { requireApiBaseUrl } from "@/lib/api-base";
import type { Appointment } from "@/types/appointment";
import type {
  DeskHisabSnapshot,
  DeskPaymentMethod,
  DeskReturnMethod,
} from "@/lib/desk/payment";
import type { PatientVitalsReading } from "@/types/patient-chart";
import type { DeskVitalsPayload } from "@/lib/desk/vitals";
import type {
  ExtractVisitPageLabResult,
  VisitDocument,
  VisitDocumentOrderedBy,
  VisitExtractedLabPanel,
  VisitDocumentType,
} from "@/types/visit-documents";
import type {
  DeskLabOrderFulfillment,
  DeskLabOrderStatus,
} from "@/lib/desk/lab-fulfillment";
import type {
  HistorySubmissionView,
  PatientHistorySubmission,
  UpsertHistorySubmissionBody,
} from "@/types/patient-history-submissions";
import type {
  Patient,
  PatientDetailData,
  PatientSummary,
  PatientsListPagedData,
} from "@/types/patient";

/** Presence flags on dated GET /api/v1/appointments (desk today board). */
export type DeskAppointmentPrepFlags = {
  has_desk_vitals?: boolean;
  has_history_submission?: boolean;
  has_visit_documents?: boolean;
  visit_document_count?: number;
};

export type DeskListAppointment = Appointment & DeskAppointmentPrepFlags;

/** DVP-DL-11 — order projection plus close-out. Never the prescription. */
export type DeskLabOrder = {
  orderId: string;
  label: string;
  kind: string;
} & DeskLabOrderFulfillment;

export type DeskLabOrderUpdate = {
  orderId: string;
  status: DeskLabOrderStatus;
  documentId?: string | null;
  reasonCode?: string | null;
  reasonNote?: string | null;
};

export type DeskLabOrdersData = {
  orders: DeskLabOrder[];
};

/** UI-facing pending row. Wire may be snake_case (desk list) or camelCase. */
export type DeskLabPendingItem = {
  appointmentId: string;
  patientId: string | null;
  patientName: string | null;
  patientPhone: string | null;
  patientMrn: string | null;
  patientAge: number | null;
  patientSex: string | null;
  appointmentDate: string;
  status: string;
  patientCheckedInAt: string | null;
  daysPending: number;
  reportUploaded: boolean;
  ordersClosed: number;
  ordersTotal: number;
  orders: DeskLabOrder[];
  hasVisitDocuments: boolean;
  visitDocumentCount: number;
};

export type DeskLabPendingData = {
  items: DeskLabPendingItem[];
};

export type DeskAppointmentsListData = {
  appointments: DeskListAppointment[];
};

export type DeskAccessState = "ok" | "forbidden" | "unreachable";

export type DeskClinicContext = {
  doctorId: string;
  actorKind: "doctor" | "staff";
  timezone: string;
  today: string;
  capabilities?: string[];
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

export function classifyDeskAccessError(
  err: unknown
): Exclude<DeskAccessState, "ok"> {
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
  if (bucket !== "waiting" && bucket !== "arrived" && bucket !== "seen")
    return null;
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
  options: {
    token: string;
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
  }
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
  return deskRequest<PatientsListPagedData>(
    `/api/v1/patients?${params.toString()}`,
    {
      token,
      signal,
    }
  );
}

export function searchDeskIdentity(
  token: string,
  query: {
    name?: string;
    guardianName?: string;
    age?: number;
    gender?: string;
  },
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
  if (query.guardianName?.trim())
    params.set("guardianName", query.guardianName.trim());
  if (query.age != null) params.set("age", String(query.age));
  if (query.gender) params.set("gender", query.gender);
  if (includeArchived) params.set("includeArchived", "true");
  return deskRequest<PatientsListPagedData>(
    `/api/v1/patients?${params.toString()}`,
    {
      token,
      signal,
    }
  );
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
  return deskRequest<{ patient: Patient }>(
    `/api/v1/patients/${encodeURIComponent(id)}`,
    {
      token,
      method: "PATCH",
      body,
    }
  );
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
): Promise<ApiSuccess<DeskAppointmentsListData>> {
  const params = new URLSearchParams({ date });
  return deskRequest<DeskAppointmentsListData>(
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function readWireString(
  row: Record<string, unknown>,
  snake: string,
  camel: string
): string | null {
  const snakeVal = row[snake];
  if (typeof snakeVal === "string") return snakeVal;
  const camelVal = row[camel];
  if (typeof camelVal === "string") return camelVal;
  return null;
}

function readWireNumber(
  row: Record<string, unknown>,
  snake: string,
  camel: string
): number | null {
  const snakeVal = row[snake];
  if (typeof snakeVal === "number" && Number.isFinite(snakeVal)) return snakeVal;
  const camelVal = row[camel];
  if (typeof camelVal === "number" && Number.isFinite(camelVal)) return camelVal;
  return null;
}

function readWireBoolean(
  row: Record<string, unknown>,
  snake: string,
  camel: string
): boolean | null {
  const snakeVal = row[snake];
  if (typeof snakeVal === "boolean") return snakeVal;
  const camelVal = row[camel];
  if (typeof camelVal === "boolean") return camelVal;
  return null;
}

/**
 * Wire adapter for lab-order / lab-pending payloads.
 * Live backend (desk-lab-orders-service): pending rows use appointment `id`
 * plus desk-list snake_case; each order is `{ orderId, label, kind }`.
 * Still accepts `appointment_id` / camelCase if the envelope shifts.
 */
function readLabOrderStatus(value: string | null): DeskLabOrderStatus {
  if (value === "uploaded" || value === "not_done") return value;
  return "pending";
}

export function mapDeskLabOrder(value: unknown): DeskLabOrder | null {
  const row = asRecord(value);
  if (!row) return null;
  const orderId = readWireString(row, "order_id", "orderId");
  const label = readWireString(row, "label", "label");
  const kind = readWireString(row, "kind", "kind");
  if (!orderId || !label || kind == null) return null;
  return {
    orderId,
    label,
    kind,
    status: readLabOrderStatus(readWireString(row, "status", "status")),
    reasonCode: readWireString(row, "reason_code", "reasonCode"),
    reasonNote: readWireString(row, "reason_note", "reasonNote"),
    documentId: readWireString(row, "document_id", "documentId"),
  };
}

export function mapDeskLabPendingItem(value: unknown): DeskLabPendingItem | null {
  const row = asRecord(value);
  if (!row) return null;
  const appointmentId =
    readWireString(row, "id", "id") ??
    readWireString(row, "appointment_id", "appointmentId");
  if (!appointmentId) return null;
  const rawOrders = row.orders;
  const orders = Array.isArray(rawOrders)
    ? rawOrders
        .map(mapDeskLabOrder)
        .filter((order): order is DeskLabOrder => order !== null)
    : [];
  return {
    appointmentId,
    patientId: readWireString(row, "patient_id", "patientId"),
    patientName: readWireString(row, "patient_name", "patientName"),
    patientPhone: readWireString(row, "patient_phone", "patientPhone"),
    patientMrn: readWireString(row, "patient_mrn", "patientMrn"),
    patientAge: readWireNumber(row, "patient_age", "patientAge"),
    patientSex: readWireString(row, "patient_sex", "patientSex"),
    appointmentDate:
      readWireString(row, "appointment_date", "appointmentDate") ?? "",
    status: readWireString(row, "status", "status") ?? "",
    patientCheckedInAt: readWireString(
      row,
      "patient_checked_in_at",
      "patientCheckedInAt"
    ),
    daysPending: readWireNumber(row, "days_pending", "daysPending") ?? 0,
    reportUploaded:
      readWireBoolean(row, "report_uploaded", "reportUploaded") ?? false,
    ordersClosed: readWireNumber(row, "orders_closed", "ordersClosed") ?? 0,
    ordersTotal:
      readWireNumber(row, "orders_total", "ordersTotal") ?? orders.length,
    orders,
    hasVisitDocuments:
      readWireBoolean(row, "has_visit_documents", "hasVisitDocuments") ?? false,
    visitDocumentCount:
      readWireNumber(row, "visit_document_count", "visitDocumentCount") ?? 0,
  };
}

export async function listDeskLabOrders(
  token: string,
  appointmentId: string
): Promise<ApiSuccess<DeskLabOrdersData>> {
  const res = await deskRequest<{ orders?: unknown }>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/lab-orders`,
    { token }
  );
  const orders = Array.isArray(res.data.orders)
    ? res.data.orders
        .map(mapDeskLabOrder)
        .filter((order): order is DeskLabOrder => order !== null)
    : [];
  return { ...res, data: { orders } };
}

export async function upsertDeskLabOrders(
  token: string,
  appointmentId: string,
  updates: DeskLabOrderUpdate[]
): Promise<ApiSuccess<DeskLabOrdersData>> {
  const res = await deskRequest<{ orders?: unknown }>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/lab-orders`,
    { token, method: "PUT", body: { updates } }
  );
  const orders = Array.isArray(res.data.orders)
    ? res.data.orders
        .map(mapDeskLabOrder)
        .filter((order): order is DeskLabOrder => order !== null)
    : [];
  return { ...res, data: { orders } };
}

export async function listDeskLabPending(
  token: string
): Promise<ApiSuccess<DeskLabPendingData>> {
  const res = await deskRequest<{ items?: unknown }>(
    "/api/v1/appointments/lab-pending",
    { token }
  );
  const items = Array.isArray(res.data.items)
    ? res.data.items
        .map(mapDeskLabPendingItem)
        .filter((item): item is DeskLabPendingItem => item !== null)
    : [];
  return { ...res, data: { items } };
}

export function listDeskVisitDocuments(
  token: string,
  appointmentId: string
): Promise<ApiSuccess<{ documents: VisitDocument[] }>> {
  return deskRequest<{ documents: VisitDocument[] }>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/documents`,
    { token }
  );
}

export function getDeskVisitDocumentUploadUrl(
  token: string,
  appointmentId: string,
  body: { filename?: string; contentType?: string }
): Promise<ApiSuccess<{ path: string; token: string }>> {
  return deskRequest<{ path: string; token: string }>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/documents/upload-url`,
    { token, method: "POST", body }
  );
}

export function createDeskVisitDocument(
  token: string,
  appointmentId: string,
  body: {
    documentType?: VisitDocumentType;
    reportDate?: string | null;
    orderedBy?: VisitDocumentOrderedBy;
    filePath: string;
    fileType: string;
  }
): Promise<ApiSuccess<{ document: VisitDocument }>> {
  return deskRequest<{ document: VisitDocument }>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/documents`,
    { token, method: "POST", body }
  );
}

export function addDeskVisitDocumentPage(
  token: string,
  appointmentId: string,
  documentId: string,
  body: { filePath: string; fileType: string }
): Promise<ApiSuccess<{ document: VisitDocument }>> {
  return deskRequest<{ document: VisitDocument }>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/documents/${encodeURIComponent(documentId)}/pages`,
    { token, method: "POST", body }
  );
}

export function updateDeskVisitDocument(
  token: string,
  appointmentId: string,
  documentId: string,
  body: {
    documentType?: VisitDocumentType;
    reportDate?: string | null;
    orderedBy?: VisitDocumentOrderedBy;
  }
): Promise<ApiSuccess<{ document: VisitDocument }>> {
  return deskRequest<{ document: VisitDocument }>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/documents/${encodeURIComponent(documentId)}`,
    { token, method: "PATCH", body }
  );
}

export function getDeskVisitDocumentDownloadUrl(
  token: string,
  appointmentId: string,
  documentId: string,
  pageId: string
): Promise<ApiSuccess<{ downloadUrl: string }>> {
  return deskRequest<{ downloadUrl: string }>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/documents/${encodeURIComponent(documentId)}/pages/${encodeURIComponent(pageId)}/download-url`,
    { token }
  );
}

export function extractDeskVisitDocumentPageLab(
  token: string,
  appointmentId: string,
  documentId: string,
  pageId: string
): Promise<ApiSuccess<ExtractVisitPageLabResult>> {
  return deskRequest<ExtractVisitPageLabResult>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/documents/${encodeURIComponent(documentId)}/pages/${encodeURIComponent(pageId)}/extract-lab`,
    { token, method: "POST" }
  );
}

export function confirmDeskVisitDocumentExtractedResults(
  token: string,
  appointmentId: string,
  documentId: string,
  panels: Array<Pick<VisitExtractedLabPanel, "pageId" | "report" | "rows">>
): Promise<ApiSuccess<{ document: VisitDocument }>> {
  return deskRequest<{ document: VisitDocument }>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/documents/${encodeURIComponent(documentId)}/extracted-results`,
    { token, method: "PUT", body: { panels } }
  );
}

export function deleteDeskVisitDocument(
  token: string,
  appointmentId: string,
  documentId: string
): Promise<void> {
  return deskRequest<Record<string, never>>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/documents/${encodeURIComponent(documentId)}`,
    { token, method: "DELETE" }
  ).then(() => undefined);
}

export function getDeskHistorySubmission(
  token: string,
  appointmentId: string
): Promise<ApiSuccess<HistorySubmissionView>> {
  return deskRequest<HistorySubmissionView>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/history-submission`,
    { token }
  );
}

export function saveDeskHistorySubmission(
  token: string,
  appointmentId: string,
  body: UpsertHistorySubmissionBody
): Promise<ApiSuccess<{ submission: PatientHistorySubmission }>> {
  return deskRequest<{ submission: PatientHistorySubmission }>(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/history-submission`,
    { token, method: "PUT", body }
  );
}

export function getDeskHisab(
  token: string,
  date: string
): Promise<ApiSuccess<{ hisab: DeskHisabSnapshot }>> {
  const params = new URLSearchParams({ date });
  return deskRequest<{ hisab: DeskHisabSnapshot }>(
    `/api/v1/clinic-staff/hisab?${params.toString()}`,
    { token }
  );
}

export function cancelDeskAppointment(
  token: string,
  appointmentId: string,
  reason?: string
): Promise<
  ApiSuccess<{
    appointment: {
      id: string;
      status: "cancelled";
      opd_token_number: number | null;
    };
  }>
> {
  return deskRequest(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/desk-cancel`,
    {
      token,
      method: "POST",
      body: reason ? { reason } : {},
    }
  );
}

export function leaveDeskAppointment(
  token: string,
  appointmentId: string,
  returnMethod?: DeskReturnMethod
): Promise<
  ApiSuccess<{
    appointment: {
      id: string;
      status: "cancelled";
      opd_token_number: number | null;
    };
  }>
> {
  return deskRequest(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/desk-left`,
    {
      token,
      method: "POST",
      body: returnMethod ? { returnMethod } : {},
    }
  );
}

export function rescheduleDeskAppointment(
  token: string,
  appointmentId: string,
  appointmentDate: string
): Promise<
  ApiSuccess<{
    appointment: {
      id: string;
      status: string;
      appointment_date: string;
      opd_token_number: number | null;
    };
  }>
> {
  return deskRequest(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/desk-reschedule`,
    {
      token,
      method: "POST",
      body: { appointmentDate },
    }
  );
}

export function collectDeskVisitPayment(
  token: string,
  appointmentId: string,
  payload: { method: DeskPaymentMethod; amountMinor?: number }
): Promise<
  ApiSuccess<{
    payment: { id: string; method: DeskPaymentMethod; amount_minor: number };
    visit: DeskHisabSnapshot["visits"][number];
  }>
> {
  return deskRequest(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/visit-payments`,
    {
      token,
      method: "POST",
      body: payload,
    }
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
