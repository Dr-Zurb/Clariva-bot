/**
 * Usage ledger recorder (billing P1).
 * Never throws into the caller's path. Idempotent on appointment_id.
 * Does not import care-episode / consultation-fees / service-catalog.
 */

import { DateTime } from 'luxon';
import { getSupabaseAdminClient } from '../../config/database';
import {
  BILLING_TZ,
  SAME_ENCOUNTER_MAX_SECONDS,
} from '../../config/billing-levels';
import { logger } from '../../config/logger';
import { logDataModification } from '../../utils/audit-logger';
import type {
  BillableModality,
  BillableStatus,
  RecordBillableConsultInput,
  RecordBillableConsultResult,
  VoidBillableConsultResult,
} from '../../types/billing';

const PG_UNIQUE_VIOLATION = '23505';

const EMPTY: RecordBillableConsultResult = {
  recorded: false,
  duplicate: false,
  status: null,
  voidReason: null,
};

export function billingPeriodFor(occurredAt: Date | string): string {
  const dt =
    typeof occurredAt === 'string'
      ? DateTime.fromISO(occurredAt, { setZone: true }).setZone(BILLING_TZ)
      : DateTime.fromJSDate(occurredAt, { zone: BILLING_TZ });
  const safe = dt.isValid ? dt : DateTime.now().setZone(BILLING_TZ);
  return safe.startOf('month').toISODate()!;
}

export function mapConsultationTypeToModality(
  consultationType: string | null | undefined,
  fallback: BillableModality
): BillableModality {
  if (consultationType === 'video' || consultationType === 'voice' || consultationType === 'text') {
    return consultationType;
  }
  if (consultationType === 'in_clinic' || consultationType === 'in_person') {
    return 'in_person';
  }
  return fallback;
}

export async function recordBillableConsult(
  input: RecordBillableConsultInput,
  correlationId: string
): Promise<RecordBillableConsultResult> {
  try {
    return await recordBillableConsultInner(input, correlationId);
  } catch (err) {
    logger.warn(
      {
        correlationId,
        appointmentId: input.appointmentId,
        error: err instanceof Error ? err.message : String(err),
      },
      'recordBillableConsult: swallowed failure'
    );
    return EMPTY;
  }
}

async function recordBillableConsultInner(
  input: RecordBillableConsultInput,
  correlationId: string
): Promise<RecordBillableConsultResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn({ correlationId, appointmentId: input.appointmentId }, 'recordBillableConsult: no admin client');
    return EMPTY;
  }

  const occurredAt =
    typeof input.occurredAt === 'string' ? input.occurredAt : input.occurredAt.toISOString();
  const billingPeriod = billingPeriodFor(occurredAt);

  const sameEncounter = await isSameEncounterContinuation(
    admin,
    input.appointmentId,
    input.doctorId,
    occurredAt,
    correlationId
  );

  const status: BillableStatus = sameEncounter ? 'void' : 'billable';
  const voidReason = sameEncounter ? 'same_encounter_continuation' : null;

  const { data, error } = await admin
    .from('billable_consults')
    .insert({
      doctor_id: input.doctorId,
      appointment_id: input.appointmentId,
      billing_period: billingPeriod,
      occurred_at: occurredAt,
      modality: input.modality,
      source: input.source,
      status,
      void_reason: voidReason,
    })
    .select('id, status')
    .maybeSingle();

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      logger.debug(
        { correlationId, appointmentId: input.appointmentId },
        'recordBillableConsult: duplicate appointment_id'
      );
      return { recorded: false, duplicate: true, status: null, voidReason: null };
    }
    logger.warn(
      { correlationId, appointmentId: input.appointmentId, error: error.message },
      'recordBillableConsult: insert failed'
    );
    return EMPTY;
  }

  if (!data) {
    return EMPTY;
  }

  await logDataModification(
    correlationId,
    undefined as unknown as string,
    'create',
    'billable_consult',
    input.appointmentId,
    ['status', 'source', 'modality']
  );

  return {
    recorded: true,
    duplicate: false,
    status,
    voidReason,
  };
}

export async function voidBillableConsult(
  appointmentId: string,
  reason: string,
  correlationId: string
): Promise<VoidBillableConsultResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return { voided: false, reason: 'not_found' };
  }

  const { data: existing, error: fetchError } = await admin
    .from('billable_consults')
    .select('id, status, invoiced_at')
    .eq('appointment_id', appointmentId)
    .maybeSingle();

  if (fetchError || !existing) {
    return { voided: false, reason: 'not_found' };
  }
  if (existing.invoiced_at) {
    logger.info({ correlationId, appointmentId }, 'voidBillableConsult: refused — already invoiced');
    return { voided: false, reason: 'already_invoiced' };
  }
  if (existing.status === 'void') {
    return { voided: false, reason: 'already_void' };
  }

  const { data: updated, error } = await admin
    .from('billable_consults')
    .update({ status: 'void', void_reason: reason })
    .eq('appointment_id', appointmentId)
    .is('invoiced_at', null)
    .neq('status', 'void')
    .select('id')
    .maybeSingle();

  if (error || !updated) {
    return { voided: false, reason: 'already_invoiced' };
  }

  await logDataModification(
    correlationId,
    undefined as unknown as string,
    'update',
    'billable_consult',
    appointmentId,
    ['status', 'void_reason']
  );
  return { voided: true, reason: 'voided' };
}

export async function recordAsyncReplyForSession(
  sessionId: string,
  correlationId: string
): Promise<void> {
  try {
    const admin = getSupabaseAdminClient();
    if (!admin) return;
    const { data: session, error } = await admin
      .from('consultation_sessions')
      .select('appointment_id, doctor_id, modality')
      .eq('id', sessionId)
      .maybeSingle();
    if (error || !session?.appointment_id || !session.doctor_id) return;

    await recordBillableConsult(
      {
        appointmentId: session.appointment_id as string,
        doctorId: session.doctor_id as string,
        modality: mapConsultationTypeToModality(session.modality as string | null, 'text'),
        source: 'async_reply',
        occurredAt: new Date(),
      },
      correlationId
    );
  } catch (err) {
    logger.warn(
      {
        correlationId,
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      },
      'recordAsyncReplyForSession: swallowed failure'
    );
  }
}

async function isSameEncounterContinuation(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  appointmentId: string,
  doctorId: string,
  occurredAtIso: string,
  correlationId: string
): Promise<boolean> {
  const { data: current, error: currentError } = await admin
    .from('appointments')
    .select('id, patient_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (currentError) {
    logger.warn(
      { correlationId, appointmentId, error: currentError.message },
      'recordBillableConsult: appointment lookup for same-encounter failed'
    );
    return false;
  }

  const patientId = (current?.patient_id as string | null | undefined) ?? null;
  if (!patientId) return false;

  const day = DateTime.fromISO(occurredAtIso, { setZone: true }).setZone(BILLING_TZ);
  const start = (day.isValid ? day : DateTime.now().setZone(BILLING_TZ)).startOf('day').toUTC().toISO();
  const end = (day.isValid ? day : DateTime.now().setZone(BILLING_TZ)).endOf('day').toUTC().toISO();
  if (!start || !end) return false;

  const { data: priorRows, error: priorError } = await admin
    .from('billable_consults')
    .select('appointment_id')
    .eq('doctor_id', doctorId)
    .eq('status', 'billable')
    .gte('occurred_at', start)
    .lte('occurred_at', end)
    .neq('appointment_id', appointmentId);

  if (priorError || !priorRows?.length) {
    return false;
  }

  const priorIds = priorRows.map((r) => r.appointment_id as string).filter(Boolean);
  if (priorIds.length === 0) return false;

  const { data: priorApts, error: aptError } = await admin
    .from('appointments')
    .select('id, consultation_duration_seconds, patient_id')
    .in('id', priorIds)
    .eq('patient_id', patientId);

  if (aptError || !priorApts) {
    return false;
  }

  return priorApts.some((row) => {
    const duration = row.consultation_duration_seconds as number | null;
    return duration != null && duration < SAME_ENCOUNTER_MAX_SECONDS;
  });
}
