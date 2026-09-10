/**
 * Front-desk hisab ledger. Records cash / UPI / card / no charge.
 * Does not create gateway payments or SaaS usage rows.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess, logDataModification } from '../utils/audit-logger';
import { resolveDeskVisitQuote } from '../utils/desk-visit-quote';
import { InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { getDoctorSettings, getDoctorTimezone } from './doctor-settings-service';
import { localDayUtcRange } from './opd/opd-queue-service';
import type {
  DeskHisabCollector,
  DeskHisabSnapshot,
  VisitPaymentCollectMethod,
  VisitPaymentReturnMethod,
  VisitPaymentRow,
  VisitPaymentStatus,
  VisitPaymentSummary,
} from '../types/visit-payment';

function admin(): SupabaseClient {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new InternalError('Service role client not available');
  }
  return client;
}

type DeskAppointmentRow = {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  status: string;
};

export function isVisitCollectMethod(
  method: VisitPaymentRow['method']
): method is 'cash' | 'upi' | 'card' {
  return method === 'cash' || method === 'upi' || method === 'card';
}

export function netVisitCollectedMinor(
  rows: Array<Pick<VisitPaymentRow, 'method' | 'amount_minor'>>
): number {
  return rows.reduce((sum, row) => {
    if (isVisitCollectMethod(row.method)) return sum + row.amount_minor;
    if (row.method === 'reversal') return sum - row.amount_minor;
    return sum;
  }, 0);
}

export function lastVisitCollectRow(rows: VisitPaymentRow[]): VisitPaymentRow | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row && isVisitCollectMethod(row.method)) return row;
  }
  return null;
}

export function deriveVisitPaymentStatus(
  rows: Array<Pick<VisitPaymentRow, 'method' | 'amount_minor'>>
): VisitPaymentStatus {
  const collected = netVisitCollectedMinor(rows);
  if (collected > 0) return 'paid';
  if (rows.some((row) => row.method === 'reversal')) return 'returned';
  if (rows.some((row) => row.method === 'no_charge')) return 'no_charge';
  return 'due';
}

export function summarizeVisitPayments(
  appointmentId: string,
  rows: VisitPaymentRow[]
): VisitPaymentSummary {
  const methods = [
    ...new Set(
      rows
        .map((row) => row.method)
        .filter((method): method is VisitPaymentCollectMethod => method !== 'reversal')
    ),
  ];
  return {
    appointmentId,
    status: deriveVisitPaymentStatus(rows),
    collectedMinor: Math.max(0, netVisitCollectedMinor(rows)),
    methods,
  };
}

async function loadDeskAppointment(
  appointmentId: string,
  doctorId: string,
  correlationId: string
): Promise<DeskAppointmentRow> {
  const { data, error } = await admin()
    .from('appointments')
    .select('id, doctor_id, patient_id, status')
    .eq('id', appointmentId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);
  if (!data || data.doctor_id !== doctorId) {
    throw new NotFoundError('Appointment not found');
  }
  return data as DeskAppointmentRow;
}

export async function listVisitPaymentsForAppointment(
  appointmentId: string,
  doctorId: string,
  correlationId: string
): Promise<VisitPaymentRow[]> {
  const { data, error } = await admin()
    .from('visit_payments')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('appointment_id', appointmentId)
    .order('collected_at', { ascending: true });

  if (error) handleSupabaseError(error, correlationId);
  return (data as VisitPaymentRow[] | null) ?? [];
}

export async function collectVisitPayment(
  appointmentId: string,
  doctorId: string,
  input: { method: VisitPaymentCollectMethod; amountMinor?: number; note?: string },
  correlationId: string,
  actorId: string
): Promise<{ payment: VisitPaymentRow; visit: VisitPaymentSummary }> {
  const appointment = await loadDeskAppointment(appointmentId, doctorId, correlationId);
  if (appointment.status === 'cancelled') {
    throw new ValidationError('Cannot record payment on a cancelled appointment');
  }

  const existing = await listVisitPaymentsForAppointment(appointmentId, doctorId, correlationId);
  const current = deriveVisitPaymentStatus(existing);
  if (current === 'returned') {
    throw new ValidationError('Visit collection was already returned');
  }

  if (input.method === 'no_charge') {
    if (current === 'paid') {
      throw new ValidationError('Visit already has a collection');
    }
    if (current === 'no_charge') {
      throw new ValidationError('Visit is already no charge');
    }
  }

  const settings = await getDoctorSettings(doctorId);
  const quote = resolveDeskVisitQuote(settings);
  const amountMinor = input.method === 'no_charge' ? 0 : (input.amountMinor ?? 0);
  const note = input.note?.trim() ? input.note.trim() : null;

  const insert = {
    doctor_id: doctorId,
    appointment_id: appointmentId,
    patient_id: appointment.patient_id,
    amount_minor: amountMinor,
    currency: quote.currency,
    method: input.method,
    collected_by: actorId,
    note,
  };

  const { data, error } = await admin().from('visit_payments').insert(insert).select('*').single();
  if (error || !data) handleSupabaseError(error, correlationId);

  const payment = data as VisitPaymentRow;
  const visit = summarizeVisitPayments(appointmentId, [...existing, payment]);
  const onBehalf = actorId !== doctorId ? doctorId : undefined;

  await logDataModification(
    correlationId,
    actorId,
    'create',
    'visit_payment',
    payment.id,
    ['method', 'amount_minor'],
    onBehalf
  );

  logger.info(
    {
      correlationId,
      appointmentId,
      method: payment.method,
      amountMinor: payment.amount_minor,
    },
    'visit_payment_recorded'
  );

  return { payment, visit };
}

export async function recordTillReversal(
  appointmentId: string,
  doctorId: string,
  input: {
    returnMethod: VisitPaymentReturnMethod;
    reversesPaymentId: string;
    amountMinor: number;
  },
  correlationId: string,
  actorId: string
): Promise<VisitPaymentRow> {
  const appointment = await loadDeskAppointment(appointmentId, doctorId, correlationId);
  const existing = await listVisitPaymentsForAppointment(appointmentId, doctorId, correlationId);
  const source = existing.find((row) => row.id === input.reversesPaymentId);
  if (!source || !isVisitCollectMethod(source.method)) {
    throw new ValidationError('No collection to return');
  }
  if (deriveVisitPaymentStatus(existing) !== 'paid') {
    throw new ValidationError('Visit has no collection to return');
  }
  if (input.amountMinor !== netVisitCollectedMinor(existing)) {
    throw new ValidationError('Return must be the full collected amount');
  }

  const insert = {
    doctor_id: doctorId,
    appointment_id: appointmentId,
    patient_id: appointment.patient_id,
    amount_minor: input.amountMinor,
    currency: source.currency,
    method: 'reversal' as const,
    collected_by: actorId,
    note: null,
    reverses_payment_id: input.reversesPaymentId,
    return_method: input.returnMethod,
  };

  const { data, error } = await admin().from('visit_payments').insert(insert).select('*').single();
  if (error || !data) handleSupabaseError(error, correlationId);

  const payment = data as VisitPaymentRow;
  const onBehalf = actorId !== doctorId ? doctorId : undefined;
  await logDataModification(
    correlationId,
    actorId,
    'create',
    'visit_payment',
    payment.id,
    ['method', 'amount_minor'],
    onBehalf
  );

  logger.info(
    {
      correlationId,
      appointmentId,
      amountMinor: payment.amount_minor,
      returnMethod: input.returnMethod,
    },
    'visit_payment_reversal_recorded'
  );

  return payment;
}

export async function getDeskHisab(
  doctorId: string,
  date: string,
  correlationId: string,
  actorId: string
): Promise<DeskHisabSnapshot> {
  const timezone = await getDoctorTimezone(doctorId);
  const { start, end } = localDayUtcRange(date, timezone);
  const settings = await getDoctorSettings(doctorId);
  const quote = resolveDeskVisitQuote(settings);

  const { data: appointmentRows, error: aptError } = await admin()
    .from('appointments')
    .select('id, status')
    .eq('doctor_id', doctorId)
    .gte('appointment_date', start)
    .lt('appointment_date', end);

  if (aptError) handleSupabaseError(aptError, correlationId);

  const dayAppointments = (appointmentRows as Array<{ id: string; status: string }> | null) ?? [];
  const openAppointments = dayAppointments.filter((row) => row.status !== 'cancelled');
  const appointmentIds = openAppointments.map((row) => row.id);
  const dayAppointmentIds = dayAppointments.map((row) => row.id);

  let paymentRows: VisitPaymentRow[] = [];
  if (dayAppointmentIds.length > 0) {
    const { data: payData, error: payError } = await admin()
      .from('visit_payments')
      .select('*')
      .eq('doctor_id', doctorId)
      .in('appointment_id', dayAppointmentIds);

    if (payError) handleSupabaseError(payError, correlationId);
    paymentRows = (payData as VisitPaymentRow[] | null) ?? [];
  }

  const byAppointment = new Map<string, VisitPaymentRow[]>();
  for (const id of appointmentIds) {
    byAppointment.set(id, []);
  }
  for (const row of paymentRows) {
    const list = byAppointment.get(row.appointment_id);
    if (list) list.push(row);
  }

  const visits: VisitPaymentSummary[] = [];
  let noChargeCount = 0;
  let dueCount = 0;
  for (const id of appointmentIds) {
    const summary = summarizeVisitPayments(id, byAppointment.get(id) ?? []);
    visits.push(summary);
    if (summary.status === 'no_charge') noChargeCount += 1;
    if (summary.status === 'due') dueCount += 1;
  }

  const totals = { cashMinor: 0, upiMinor: 0, cardMinor: 0, collectedMinor: 0 };
  const collectorMap = new Map<string, DeskHisabCollector>();
  for (const row of paymentRows) {
    if (row.method === 'no_charge') continue;

    const existing = collectorMap.get(row.collected_by) ?? {
      collectedBy: row.collected_by,
      cashMinor: 0,
      upiMinor: 0,
      cardMinor: 0,
    };

    if (row.method === 'reversal') {
      const channel = row.return_method;
      totals.collectedMinor -= row.amount_minor;
      if (channel === 'cash') totals.cashMinor -= row.amount_minor;
      if (channel === 'upi') totals.upiMinor -= row.amount_minor;
      if (channel === 'card') totals.cardMinor -= row.amount_minor;
      if (channel === 'cash') existing.cashMinor -= row.amount_minor;
      if (channel === 'upi') existing.upiMinor -= row.amount_minor;
      if (channel === 'card') existing.cardMinor -= row.amount_minor;
      collectorMap.set(row.collected_by, existing);
      continue;
    }

    totals.collectedMinor += row.amount_minor;
    if (row.method === 'cash') totals.cashMinor += row.amount_minor;
    if (row.method === 'upi') totals.upiMinor += row.amount_minor;
    if (row.method === 'card') totals.cardMinor += row.amount_minor;
    if (row.method === 'cash') existing.cashMinor += row.amount_minor;
    if (row.method === 'upi') existing.upiMinor += row.amount_minor;
    if (row.method === 'card') existing.cardMinor += row.amount_minor;
    collectorMap.set(row.collected_by, existing);
  }

  const onBehalf = actorId !== doctorId ? doctorId : undefined;
  await logDataAccess(correlationId, actorId, 'visit_payment', undefined, onBehalf);

  return {
    date,
    timezone,
    suggestedAmountMinor: quote.amountMinor,
    currency: quote.currency,
    totals,
    noChargeCount,
    dueCount,
    visits,
    collectors: [...collectorMap.values()],
  };
}
