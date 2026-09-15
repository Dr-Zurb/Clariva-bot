/**
 * Desk lab-order projection (desk-visit-prep Phase 4).
 *
 * Staff read `{ orderId, label, kind, status, … }` only — never the
 * prescription (DVP-DL-11). Orders appear after attest (DVP-DL-12).
 * Pending is derived; closed rows live on visit_lab_order_fulfillments
 * (DVP-DL-13). Service-role reads because prescription RLS is doctor-only.
 * Logs: appointment id + counts. No test names, no reasons, no patient
 * identifiers.
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { handleSupabaseError } from '../utils/db-helpers';
import { logAuditEvent } from '../utils/audit-logger';
import { InternalError, NotFoundError, ValidationError } from '../utils/errors';
import type { Sex } from '../types/database';

export const PENDING_LAB_WINDOW_DAYS = 60;
/** Keep PostgREST `in.()` URLs under undici's header/URL limit. */
export const POSTGREST_IN_CHUNK = 80;

export const LAB_NOT_DONE_REASON_CODES = [
  'sample_not_collected',
  'patient_refused',
  'sample_rejected',
  'machine_down',
  'done_outside',
  'other',
] as const;

export type LabNotDoneReasonCode = (typeof LAB_NOT_DONE_REASON_CODES)[number];
export type DeskLabOrderStatus = 'pending' | 'uploaded' | 'not_done';

export type DeskLabOrder = {
  orderId: string;
  label: string;
  kind: string;
  status: DeskLabOrderStatus;
  reasonCode: string | null;
  reasonNote: string | null;
  documentId: string | null;
};

export type LabOrderFulfillmentUpdate = {
  orderId: string;
  status: DeskLabOrderStatus;
  documentId?: string | null;
  reasonCode?: string | null;
  reasonNote?: string | null;
};

type FulfillmentRow = {
  appointment_id: string;
  order_id: string;
  status: string;
  reason_code: string | null;
  reason_note: string | null;
  document_id: string | null;
};

const FULFILLMENT_SELECT =
  'appointment_id, order_id, status, reason_code, reason_note, document_id';

function emptyFulfillment(): Pick<
  DeskLabOrder,
  'status' | 'reasonCode' | 'reasonNote' | 'documentId'
> {
  return {
    status: 'pending',
    reasonCode: null,
    reasonNote: null,
    documentId: null,
  };
}

export type DeskPendingLabItem = {
  id: string;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string;
  patient_mrn: string | null;
  patient_age: number | null;
  patient_sex: Sex | null;
  appointment_date: string;
  status: string;
  patient_checked_in_at: string | null;
  days_pending: number;
    report_uploaded: boolean;
    orders_closed: number;
    orders_total: number;
    orders: DeskLabOrder[];
    has_visit_documents: boolean;
    visit_document_count: number;
};

type PrescriptionOrderRow = {
  id: string;
  appointment_id: string;
  attested_at: string | null;
  superseded_by_id: string | null;
  created_at: string;
  investigations_orders_json: unknown;
};

type VisitDocumentKindRow = {
  id: string;
  appointment_id: string;
  document_type: string;
  ordered_by: string;
};

type PendingAppointmentRow = {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string;
  appointment_date: string | Date;
  status: string;
  patient_checked_in_at: string | Date | null;
  patient?: EmbeddedPatientJoin | EmbeddedPatientJoin[] | null;
};

type EmbeddedPatientJoin = {
  date_of_birth?: string | Date | null;
  gender?: string | null;
  age?: number | null;
  medical_record_number?: string | null;
};

const PENDING_APPOINTMENT_SELECT =
  'id, doctor_id, patient_id, patient_name, patient_phone, appointment_date, status, patient_checked_in_at, patient:patients(date_of_birth, gender, age, medical_record_number)';

const PRESCRIPTION_ORDER_SELECT =
  'id, appointment_id, attested_at, superseded_by_id, created_at, investigations_orders_json';

function adminClient(): NonNullable<ReturnType<typeof getSupabaseAdminClient>> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new InternalError('Service role client not available');
  }
  return client;
}

function onBehalfOf(actorId: string, doctorId: string): string | undefined {
  return actorId !== doctorId ? doctorId : undefined;
}

export function isAttestedStamp(attestedAt: unknown): boolean {
  return typeof attestedAt === 'string' && attestedAt.length > 0;
}

export function isSupersededRow(supersededById: unknown): boolean {
  return typeof supersededById === 'string' && supersededById.length > 0;
}

export function projectInvestigationOrders(raw: unknown): DeskLabOrder[] {
  if (!Array.isArray(raw)) return [];
  const orders: DeskLabOrder[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const orderId = typeof rec.id === 'string' ? rec.id.trim() : '';
    const label = typeof rec.label === 'string' ? rec.label.trim() : '';
    const kind = typeof rec.kind === 'string' ? rec.kind.trim() : '';
    if (!orderId || !label || !kind) continue;
    orders.push({ orderId, label, kind, ...emptyFulfillment() });
  }
  return orders;
}

export function isLabNotDoneReasonCode(value: string): value is LabNotDoneReasonCode {
  return (LAB_NOT_DONE_REASON_CODES as readonly string[]).includes(value);
}

export function isCoveringInternalDocument(documentType: string, orderedBy: string): boolean {
  return (
    (documentType === 'lab_report' || documentType === 'imaging') && orderedBy === 'us'
  );
}

export function mergeLabOrderFulfillment(
  order: DeskLabOrder,
  row: FulfillmentRow | undefined
): DeskLabOrder {
  if (!row) return { ...order, ...emptyFulfillment() };
  if (row.status === 'uploaded' && row.document_id) {
    return {
      ...order,
      status: 'uploaded',
      reasonCode: null,
      reasonNote: null,
      documentId: row.document_id,
    };
  }
  if (row.status === 'not_done' && row.reason_code && isLabNotDoneReasonCode(row.reason_code)) {
    return {
      ...order,
      status: 'not_done',
      reasonCode: row.reason_code,
      reasonNote: row.reason_note,
      documentId: null,
    };
  }
  return { ...order, ...emptyFulfillment() };
}

export function applyLabOrderFulfillments(
  orders: readonly DeskLabOrder[],
  rows: readonly FulfillmentRow[]
): DeskLabOrder[] {
  const byOrderId = new Map<string, FulfillmentRow>();
  for (const row of rows) {
    if (row.order_id) byOrderId.set(row.order_id, row);
  }
  return orders.map((order) => mergeLabOrderFulfillment(order, byOrderId.get(order.orderId)));
}

export function isLabLoopComplete(orders: readonly DeskLabOrder[]): boolean {
  return orders.length > 0 && orders.every((order) => order.status !== 'pending');
}

export function labLoopClosedCount(orders: readonly DeskLabOrder[]): number {
  return orders.filter((order) => order.status !== 'pending').length;
}

export function pickCurrentPrescription(
  rows: readonly PrescriptionOrderRow[]
): PrescriptionOrderRow | null {
  const current = rows.filter((row) => !isSupersededRow(row.superseded_by_id));
  if (current.length === 0) return null;
  return current.reduce((latest, row) =>
    Date.parse(row.created_at) > Date.parse(latest.created_at) ? row : latest
  );
}

export function isUsLabReportDocument(documentType: string, orderedBy: string): boolean {
  return documentType === 'lab_report' && orderedBy === 'us';
}

export function pendingWindowStart(now: Date, windowDays = PENDING_LAB_WINDOW_DAYS): Date {
  return new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
}

export function daysPendingSince(appointmentDate: string | Date, now: Date): number {
  const start = appointmentDate instanceof Date ? appointmentDate : new Date(appointmentDate);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86_400_000));
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return value;
}

function computeAgeYears(dob: string | Date | null | undefined): number | null {
  if (!dob) return null;
  const dt = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(dt.getTime())) return null;
  const now = new Date();
  let years = now.getUTCFullYear() - dt.getUTCFullYear();
  const m = now.getUTCMonth() - dt.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dt.getUTCDate())) {
    years -= 1;
  }
  if (years < 0 || years > 130) return null;
  return years;
}

function normalizePatientSex(raw: string | null | undefined): Sex | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'male' || v === 'm') return 'male';
  if (v === 'female' || v === 'f') return 'female';
  if (v === 'other' || v === 'o') return 'other';
  return null;
}

function embeddedPatient(
  raw: EmbeddedPatientJoin | EmbeddedPatientJoin[] | null | undefined
): EmbeddedPatientJoin | null {
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

function patientDemographics(row: PendingAppointmentRow): {
  patient_age: number | null;
  patient_sex: Sex | null;
  patient_mrn: string | null;
} {
  const patient = embeddedPatient(row.patient);
  const mrn = patient?.medical_record_number?.trim();
  return {
    patient_age:
      computeAgeYears(patient?.date_of_birth ?? null) ??
      (typeof patient?.age === 'number' ? patient.age : null),
    patient_sex: normalizePatientSex(patient?.gender ?? null),
    patient_mrn: mrn ? mrn : null,
  };
}

function ordersFromCurrentRx(rows: readonly PrescriptionOrderRow[]): DeskLabOrder[] {
  const current = pickCurrentPrescription(rows);
  if (!current || !isAttestedStamp(current.attested_at)) return [];
  return projectInvestigationOrders(current.investigations_orders_json);
}

function chunkIds(ids: readonly string[], size = POSTGREST_IN_CHUNK): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

async function emptyPendingAudit(
  actorId: string,
  doctorId: string,
  correlationId: string
): Promise<DeskPendingLabItem[]> {
  await logAuditEvent({
    correlationId,
    userId: actorId,
    action: 'read_lab_pending',
    resourceType: 'appointment',
    status: 'success',
    metadata: { item_count: 0, window_days: PENDING_LAB_WINDOW_DAYS },
    onBehalfOfDoctorId: onBehalfOf(actorId, doctorId),
  });
  logger.info({ correlationId, itemCount: 0 }, 'desk_lab_pending_read');
  return [];
}

export async function listLabOrdersForAppointment(
  appointmentId: string,
  doctorId: string,
  correlationId: string,
  actorId: string
): Promise<DeskLabOrder[]> {
  const admin = adminClient();

  const { data: appointment, error: aptError } = await admin
    .from('appointments')
    .select('id, doctor_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (aptError) handleSupabaseError(aptError, correlationId);
  if (!appointment || appointment.doctor_id !== doctorId) {
    throw new NotFoundError('Appointment not found');
  }

  const { data: rxRows, error: rxError } = await admin
    .from('prescriptions')
    .select(PRESCRIPTION_ORDER_SELECT)
    .eq('doctor_id', doctorId)
    .eq('appointment_id', appointmentId)
    .order('created_at', { ascending: false });

  if (rxError) handleSupabaseError(rxError, correlationId);

  const baseOrders = ordersFromCurrentRx((rxRows ?? []) as PrescriptionOrderRow[]);
  const fulfillments = await listFulfillmentsForAppointments(
    [appointmentId],
    doctorId,
    correlationId
  );
  const orders = applyLabOrderFulfillments(baseOrders, fulfillments);

  await logAuditEvent({
    correlationId,
    userId: actorId,
    action: 'read_lab_orders',
    resourceType: 'appointment',
    resourceId: appointmentId,
    status: 'success',
    metadata: { order_count: orders.length, closed_count: labLoopClosedCount(orders) },
    onBehalfOfDoctorId: onBehalfOf(actorId, doctorId),
  });

  logger.info({ correlationId, appointmentId, orderCount: orders.length }, 'desk_lab_orders_read');

  return orders;
}

export async function listPendingLabAppointments(
  doctorId: string,
  correlationId: string,
  actorId: string
): Promise<DeskPendingLabItem[]> {
  const admin = adminClient();
  const now = new Date();
  const windowStartAt = pendingWindowStart(now);
  const windowStartIso = windowStartAt.toISOString();
  const windowStartMs = windowStartAt.getTime();

  // Attested current Rxs first — never `.in()` every appointment in the window
  // (that GET blew undici's header limit: UND_ERR_HEADERS_OVERFLOW).
  const { data: rxRows, error: rxError } = await admin
    .from('prescriptions')
    .select(PRESCRIPTION_ORDER_SELECT)
    .eq('doctor_id', doctorId)
    .not('attested_at', 'is', null)
    .is('superseded_by_id', null)
    .gte('attested_at', windowStartIso)
    .order('created_at', { ascending: false });

  if (rxError) handleSupabaseError(rxError, correlationId);

  const rxByAppointment = new Map<string, PrescriptionOrderRow[]>();
  for (const row of (rxRows ?? []) as PrescriptionOrderRow[]) {
    const list = rxByAppointment.get(row.appointment_id) ?? [];
    list.push(row);
    rxByAppointment.set(row.appointment_id, list);
  }

  const orderedByAppointment = new Map<string, DeskLabOrder[]>();
  for (const [appointmentId, rows] of rxByAppointment) {
    const orders = ordersFromCurrentRx(rows);
    if (orders.length > 0) orderedByAppointment.set(appointmentId, orders);
  }

  const candidateIds = [...orderedByAppointment.keys()];
  if (candidateIds.length === 0) {
    return emptyPendingAudit(actorId, doctorId, correlationId);
  }

  const appointments: PendingAppointmentRow[] = [];
  for (const ids of chunkIds(candidateIds)) {
    const { data: aptRows, error: aptError } = await admin
      .from('appointments')
      .select(PENDING_APPOINTMENT_SELECT)
      .eq('doctor_id', doctorId)
      .neq('status', 'cancelled')
      .gte('appointment_date', windowStartIso)
      .in('id', ids)
      .order('appointment_date', { ascending: true });

    if (aptError) handleSupabaseError(aptError, correlationId);
    appointments.push(...((aptRows ?? []) as PendingAppointmentRow[]));
  }

  const inWindow = appointments.filter((row) => {
    if (row.status === 'cancelled') return false;
    const when =
      row.appointment_date instanceof Date ? row.appointment_date : new Date(row.appointment_date);
    return !Number.isNaN(when.getTime()) && when.getTime() >= windowStartMs;
  });

  if (inWindow.length === 0) {
    return emptyPendingAudit(actorId, doctorId, correlationId);
  }

  const windowIds = inWindow.map((row) => row.id);
  const documents: VisitDocumentKindRow[] = [];
  for (const ids of chunkIds(windowIds)) {
    const { data: docRows, error: docError } = await admin
      .from('visit_documents')
      .select('id, appointment_id, document_type, ordered_by')
      .eq('doctor_id', doctorId)
      .in('appointment_id', ids)
      .order('created_at', { ascending: true });

    if (docError) handleSupabaseError(docError, correlationId);
    documents.push(...((docRows ?? []) as VisitDocumentKindRow[]));
  }

  const fulfillments = await listFulfillmentsForAppointments(windowIds, doctorId, correlationId);
  const fulfillmentsByAppointment = new Map<string, FulfillmentRow[]>();
  for (const row of fulfillments) {
    const list = fulfillmentsByAppointment.get(row.appointment_id) ?? [];
    list.push(row);
    fulfillmentsByAppointment.set(row.appointment_id, list);
  }

  const docsByAppointment = new Map<string, VisitDocumentKindRow[]>();
  for (const row of documents) {
    const list = docsByAppointment.get(row.appointment_id) ?? [];
    list.push(row);
    docsByAppointment.set(row.appointment_id, list);
  }

  const items: DeskPendingLabItem[] = [];
  for (const appointment of inWindow) {
    const docs = docsByAppointment.get(appointment.id) ?? [];
    const orders = applyLabOrderFulfillments(
      orderedByAppointment.get(appointment.id) ?? [],
      fulfillmentsByAppointment.get(appointment.id) ?? []
    );
    if (orders.length === 0) continue;
    const reportUploaded = isLabLoopComplete(orders);

    const appointmentDate = toIso(appointment.appointment_date);
    if (!appointmentDate) continue;

    const demographics = patientDemographics(appointment);
    items.push({
      id: appointment.id,
      patient_id: appointment.patient_id,
      patient_name: appointment.patient_name,
      patient_phone: appointment.patient_phone,
      patient_mrn: demographics.patient_mrn,
      patient_age: demographics.patient_age,
      patient_sex: demographics.patient_sex,
      appointment_date: appointmentDate,
      status: appointment.status,
      patient_checked_in_at: toIso(appointment.patient_checked_in_at),
      days_pending: daysPendingSince(appointmentDate, now),
      report_uploaded: reportUploaded,
      orders_closed: labLoopClosedCount(orders),
      orders_total: orders.length,
      orders,
      visit_document_count: docs.length,
      has_visit_documents: docs.length > 0,
    });
  }

  items.sort((a, b) => {
    if (a.report_uploaded !== b.report_uploaded) return a.report_uploaded ? 1 : -1;
    if (b.days_pending !== a.days_pending) return b.days_pending - a.days_pending;
    return a.appointment_date.localeCompare(b.appointment_date);
  });

  await logAuditEvent({
    correlationId,
    userId: actorId,
    action: 'read_lab_pending',
    resourceType: 'appointment',
    status: 'success',
    metadata: { item_count: items.length, window_days: PENDING_LAB_WINDOW_DAYS },
    onBehalfOfDoctorId: onBehalfOf(actorId, doctorId),
  });

  logger.info({ correlationId, itemCount: items.length }, 'desk_lab_pending_read');

  return items;
}

async function listFulfillmentsForAppointments(
  appointmentIds: readonly string[],
  doctorId: string,
  correlationId: string
): Promise<FulfillmentRow[]> {
  if (appointmentIds.length === 0) return [];
  const admin = adminClient();
  const rows: FulfillmentRow[] = [];
  for (const ids of chunkIds(appointmentIds)) {
    const { data, error } = await admin
      .from('visit_lab_order_fulfillments')
      .select(FULFILLMENT_SELECT)
      .eq('doctor_id', doctorId)
      .in('appointment_id', ids)
      .order('updated_at', { ascending: true });

    if (error) handleSupabaseError(error, correlationId);
    rows.push(...((data ?? []) as FulfillmentRow[]));
  }
  return rows;
}

function lastUpdateByOrderId(
  updates: readonly LabOrderFulfillmentUpdate[]
): LabOrderFulfillmentUpdate[] {
  const byId = new Map<string, LabOrderFulfillmentUpdate>();
  for (const update of updates) {
    byId.set(update.orderId, update);
  }
  return [...byId.values()];
}

export async function upsertLabOrderFulfillments(
  appointmentId: string,
  doctorId: string,
  correlationId: string,
  actorId: string,
  updates: readonly LabOrderFulfillmentUpdate[]
): Promise<DeskLabOrder[]> {
  const unique = lastUpdateByOrderId(updates);
  if (unique.length === 0) {
    throw new ValidationError('Nothing to update');
  }

  const admin = adminClient();

  const { data: appointment, error: aptError } = await admin
    .from('appointments')
    .select('id, doctor_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (aptError) handleSupabaseError(aptError, correlationId);
  if (!appointment || appointment.doctor_id !== doctorId) {
    throw new NotFoundError('Appointment not found');
  }

  const { data: rxRows, error: rxError } = await admin
    .from('prescriptions')
    .select(PRESCRIPTION_ORDER_SELECT)
    .eq('doctor_id', doctorId)
    .eq('appointment_id', appointmentId)
    .order('created_at', { ascending: false });

  if (rxError) handleSupabaseError(rxError, correlationId);

  const baseOrders = ordersFromCurrentRx((rxRows ?? []) as PrescriptionOrderRow[]);
  if (baseOrders.length === 0) {
    throw new ValidationError('No tests on this visit yet.');
  }

  const allowed = new Set(baseOrders.map((order) => order.orderId));
  for (const update of unique) {
    if (!allowed.has(update.orderId)) {
      throw new ValidationError('That test is not on this visit.');
    }
  }

  const documentIds = [
    ...new Set(
      unique
        .filter((update) => update.status === 'uploaded' && update.documentId)
        .map((update) => update.documentId as string)
    ),
  ];

  const documentsById = new Map<
    string,
    { id: string; appointment_id: string; document_type: string; ordered_by: string }
  >();
  for (const ids of chunkIds(documentIds)) {
    const { data: docs, error: docError } = await admin
      .from('visit_documents')
      .select('id, appointment_id, document_type, ordered_by')
      .eq('doctor_id', doctorId)
      .in('id', ids)
      .order('created_at', { ascending: true });

    if (docError) handleSupabaseError(docError, correlationId);
    for (const doc of (docs ?? []) as Array<{
      id: string;
      appointment_id: string;
      document_type: string;
      ordered_by: string;
    }>) {
      documentsById.set(doc.id, doc);
    }
  }

  const upsertRows: Array<{
    doctor_id: string;
    appointment_id: string;
    order_id: string;
    status: 'uploaded' | 'not_done';
    reason_code: string | null;
    reason_note: string | null;
    document_id: string | null;
    actor_id: string;
  }> = [];
  const clearIds: string[] = [];

  for (const update of unique) {
    if (update.status === 'pending') {
      clearIds.push(update.orderId);
      continue;
    }
    if (update.status === 'uploaded') {
      const documentId = update.documentId ?? '';
      const document = documentsById.get(documentId);
      if (!document || document.appointment_id !== appointmentId) {
        throw new NotFoundError('Report not found');
      }
      if (!isCoveringInternalDocument(document.document_type, document.ordered_by)) {
        throw new ValidationError('That file cannot close an in-house test.');
      }
      upsertRows.push({
        doctor_id: doctorId,
        appointment_id: appointmentId,
        order_id: update.orderId,
        status: 'uploaded',
        reason_code: null,
        reason_note: null,
        document_id: documentId,
        actor_id: actorId,
      });
      continue;
    }

    const reasonCode = update.reasonCode ?? '';
    if (!isLabNotDoneReasonCode(reasonCode)) {
      throw new ValidationError('Choose why this test was not done.');
    }
    const note = update.reasonNote?.trim() ?? '';
    if (reasonCode === 'other' && !note) {
      throw new ValidationError('Add a short reason');
    }
    upsertRows.push({
      doctor_id: doctorId,
      appointment_id: appointmentId,
      order_id: update.orderId,
      status: 'not_done',
      reason_code: reasonCode,
      reason_note: reasonCode === 'other' ? note : null,
      document_id: null,
      actor_id: actorId,
    });
  }

  if (clearIds.length > 0) {
    const { error: deleteError } = await admin
      .from('visit_lab_order_fulfillments')
      .delete()
      .eq('doctor_id', doctorId)
      .eq('appointment_id', appointmentId)
      .in('order_id', clearIds);

    if (deleteError) handleSupabaseError(deleteError, correlationId);
  }

  if (upsertRows.length > 0) {
    const { error: upsertError } = await admin
      .from('visit_lab_order_fulfillments')
      .upsert(upsertRows, { onConflict: 'appointment_id,order_id' });

    if (upsertError) handleSupabaseError(upsertError, correlationId);
  }

  const fulfillments = await listFulfillmentsForAppointments(
    [appointmentId],
    doctorId,
    correlationId
  );
  const orders = applyLabOrderFulfillments(baseOrders, fulfillments);

  await logAuditEvent({
    correlationId,
    userId: actorId,
    action: 'write_lab_order_fulfillment',
    resourceType: 'appointment',
    resourceId: appointmentId,
    status: 'success',
    metadata: {
      update_count: unique.length,
      uploaded_count: unique.filter((row) => row.status === 'uploaded').length,
      not_done_count: unique.filter((row) => row.status === 'not_done').length,
    },
    onBehalfOfDoctorId: onBehalfOf(actorId, doctorId),
  });

  logger.info(
    { correlationId, appointmentId, updateCount: unique.length },
    'desk_lab_orders_write'
  );

  return orders;
}
