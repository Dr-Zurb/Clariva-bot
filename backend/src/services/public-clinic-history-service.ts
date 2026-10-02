/**
 * Patient history submit (clk-11).
 * Inserts the sidecar once. Does not call the desk upsert and does not
 * write chart tables. Illness chips save on the appointment even when a
 * desk row already owns the lists.
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { logAuditEvent } from '../utils/audit-logger';
import { handleSupabaseError } from '../utils/db-helpers';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import {
  historyFormDenyStatus,
  readHistoryFormAppointmentId,
  verifyHistoryFormToken,
  type HistoryFormDenyReason,
} from '../utils/history-form-token';

export const PUBLIC_DURATION_UNITS = ['days', 'months', 'years'] as const;
export type PublicDurationUnit = (typeof PUBLIC_DURATION_UNITS)[number];

export interface PublicHistoryItem {
  name: string;
  durationValue?: number | null;
  durationUnit?: PublicDurationUnit | null;
}

export interface PatientHistoryListInput {
  none: boolean;
  items: PublicHistoryItem[];
}

export interface PatientHistoryChipsInput {
  since?: string;
  course?: 'better' | 'same' | 'worse';
  tried?: string;
  aim?: 'new_problem' | 'follow_up' | 'reports' | 'refill';
}

export interface SubmitPatientHistoryInput {
  token: string;
  noticeVersion: string;
  allergies: PatientHistoryListInput;
  medicines: PatientHistoryListInput;
  conditions: PatientHistoryListInput;
  chips?: PatientHistoryChipsInput;
}

export interface SubmitPatientHistoryResult {
  listsStored: boolean;
  chipsSaved: boolean;
}

export interface PublicHistoryList {
  none: boolean;
  items: PublicHistoryItem[];
}

export interface PublicHistoryChips {
  since?: string;
  course?: 'better' | 'same' | 'worse';
  tried?: string;
  aim?: 'new_problem' | 'follow_up' | 'reports' | 'refill';
}

export type PublicConsultationType = 'video' | 'voice' | 'in_clinic' | 'text';

export interface PublicHistoryRead {
  listsEditable: boolean;
  listsHidden: boolean;
  alreadySent: boolean;
  consultationType: PublicConsultationType | null;
  chips: PublicHistoryChips | null;
  allergies?: PublicHistoryList;
  medicines?: PublicHistoryList;
  conditions?: PublicHistoryList;
}

type Admin = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

function client(): Admin {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new ValidationError('Service is unavailable');
  return supabase;
}

function deny(reason: HistoryFormDenyReason): never {
  throw new AppError('This prep link is no longer available', historyFormDenyStatus(reason));
}

const DURATION_MAX: Record<PublicDurationUnit, number> = {
  days: 365,
  months: 1200,
  years: 120,
};

function storedDuration(
  item: PublicHistoryItem
): { durationValue: number; durationUnit: PublicDurationUnit } | null {
  const value = item.durationValue ?? null;
  const unit = item.durationUnit ?? null;
  if (value == null && unit == null) return null;
  if (value == null || unit == null || !PUBLIC_DURATION_UNITS.includes(unit)) {
    throw new ValidationError('How long needs a number and a unit');
  }
  if (!Number.isInteger(value) || value < 1 || value > DURATION_MAX[unit]) {
    throw new ValidationError('How long is out of range');
  }
  return { durationValue: value, durationUnit: unit };
}

function listPayload(
  list: PatientHistoryListInput,
  timed: boolean
): { none: boolean; items: PublicHistoryItem[] } {
  if (list.none && list.items.length > 0) {
    throw new ValidationError('A none list cannot also include items');
  }
  return {
    none: list.none,
    items: list.none
      ? []
      : list.items.map((item) => {
          const duration = timed ? storedDuration(item) : null;
          return duration ? { name: item.name, ...duration } : { name: item.name };
        }),
  };
}

function chipsOrNull(chips: PatientHistoryChipsInput): Record<string, string> | null {
  const out: Record<string, string> = {};
  if (chips.since) out.since = chips.since;
  if (chips.course) out.course = chips.course;
  if (chips.tried) out.tried = chips.tried;
  if (chips.aim) out.aim = chips.aim;
  return Object.keys(out).length > 0 ? out : null;
}

export async function submitPatientHistory(
  input: SubmitPatientHistoryInput,
  correlationId: string
): Promise<SubmitPatientHistoryResult> {
  const opened = readHistoryFormAppointmentId(input.token);
  if (!opened.ok) deny(opened.reason);

  const supabase = client();
  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('id, doctor_id, patient_id, status, appointment_date, reason_for_visit')
    .eq('id', opened.appointmentId)
    .maybeSingle();
  if (appointmentError) handleSupabaseError(appointmentError, correlationId);
  if (!appointment) throw new NotFoundError('This visit was not found');

  const { data: settings, error: settingsError } = await supabase
    .from('doctor_settings')
    .select('slot_interval_minutes')
    .eq('doctor_id', appointment.doctor_id)
    .maybeSingle();
  if (settingsError) handleSupabaseError(settingsError, correlationId);

  const start = new Date(appointment.appointment_date as string);
  const minutes = Number(settings?.slot_interval_minutes ?? 15);
  const scheduledEnd = Number.isNaN(start.getTime())
    ? null
    : new Date(start.getTime() + minutes * 60 * 1000);

  const verified = verifyHistoryFormToken(
    input.token,
    { id: appointment.id as string, status: appointment.status as string, scheduledEnd },
    new Date()
  );
  if (!verified.ok) deny(verified.reason);
  if (!appointment.patient_id) throw new ValidationError('This visit has no patient');

  const { data: existing, error: existingError } = await supabase
    .from('patient_history_submissions')
    .select('id, source')
    .eq('appointment_id', appointment.id)
    .maybeSingle();
  if (existingError) handleSupabaseError(existingError, correlationId);

  if (existing?.source === 'patient') {
    throw new ConflictError('History for this visit was already submitted');
  }

  let chipsSaved = false;
  if (input.chips) {
    const { error: chipError } = await supabase
      .from('appointments')
      .update({ previsit_context: chipsOrNull(input.chips) })
      .eq('id', appointment.id);
    if (chipError) handleSupabaseError(chipError, correlationId);
    chipsSaved = true;
  }

  const listsStored = !existing;
  if (listsStored) {
    const { error: insertError } = await supabase.from('patient_history_submissions').insert({
      doctor_id: appointment.doctor_id,
      patient_id: appointment.patient_id,
      appointment_id: appointment.id,
      source: 'patient',
      actor_id: appointment.patient_id,
      why_today: (appointment.reason_for_visit as string | null)?.trim() || '',
      allergies: listPayload(input.allergies, false),
      medicines: listPayload(input.medicines, true),
      conditions: listPayload(input.conditions, true),
      notice_version: input.noticeVersion,
    });
    if (insertError) handleSupabaseError(insertError, correlationId);
  }

  logger.info(
    {
      appointmentId: appointment.id,
      listsStored,
      chipsSaved,
      medicineCount: input.medicines.items.length,
      allergyCount: input.allergies.items.length,
      conditionCount: input.conditions.items.length,
    },
    'patient_history_submitted'
  );
  await logAuditEvent({
    correlationId,
    action: 'create_patient_history_submission',
    resourceType: 'appointment',
    resourceId: appointment.id as string,
    status: 'success',
    metadata: {
      listsStored,
      chipsSaved,
      medicineCount: input.medicines.items.length,
      allergyCount: input.allergies.items.length,
      conditionCount: input.conditions.items.length,
    },
  });

  return { listsStored, chipsSaved };
}

function publicChips(value: unknown): PublicHistoryChips | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const out: PublicHistoryChips = {};
  if (typeof row.since === 'string' && row.since.trim()) out.since = row.since.trim();
  if (row.course === 'better' || row.course === 'same' || row.course === 'worse') out.course = row.course;
  if (typeof row.tried === 'string' && row.tried.trim()) out.tried = row.tried.trim();
  if (
    row.aim === 'new_problem' ||
    row.aim === 'follow_up' ||
    row.aim === 'reports' ||
    row.aim === 'refill'
  ) {
    out.aim = row.aim;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function publicDuration(item: {
  durationValue?: unknown;
  durationUnit?: unknown;
}): { durationValue: number; durationUnit: PublicDurationUnit } | null {
  const { durationValue: value, durationUnit: unit } = item;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return null;
  if (unit !== 'days' && unit !== 'months' && unit !== 'years') return null;
  if (value > DURATION_MAX[unit]) return null;
  return { durationValue: value, durationUnit: unit };
}

function publicList(value: unknown, timed = false): PublicHistoryList {
  const row = value && typeof value === 'object' ? (value as { none?: unknown; items?: unknown }) : {};
  const items = Array.isArray(row.items)
    ? row.items.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const name = (item as { name?: unknown }).name;
        if (typeof name !== 'string' || !name.trim()) return [];
        const duration = timed ? publicDuration(item as { durationValue?: unknown; durationUnit?: unknown }) : null;
        return [duration ? { name: name.trim(), ...duration } : { name: name.trim() }];
      })
    : [];
  return { none: row.none === true, items: row.none === true ? [] : items };
}

const EMPTY_LIST: PublicHistoryList = { none: false, items: [] };

function publicConsultationType(value: unknown): PublicConsultationType | null {
  if (value === 'video' || value === 'voice' || value === 'in_clinic' || value === 'text') {
    return value;
  }
  return null;
}

export async function readPatientHistory(
  token: string,
  correlationId: string
): Promise<PublicHistoryRead> {
  const opened = readHistoryFormAppointmentId(token);
  if (!opened.ok) deny(opened.reason);

  const supabase = client();
  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('id, doctor_id, patient_id, status, appointment_date, previsit_context, consultation_type')
    .eq('id', opened.appointmentId)
    .maybeSingle();
  if (appointmentError) handleSupabaseError(appointmentError, correlationId);
  if (!appointment) throw new NotFoundError('This visit was not found');

  const { data: settings, error: settingsError } = await supabase
    .from('doctor_settings')
    .select('slot_interval_minutes')
    .eq('doctor_id', appointment.doctor_id)
    .maybeSingle();
  if (settingsError) handleSupabaseError(settingsError, correlationId);

  const start = new Date(appointment.appointment_date as string);
  const minutes = Number(settings?.slot_interval_minutes ?? 15);
  const scheduledEnd = Number.isNaN(start.getTime())
    ? null
    : new Date(start.getTime() + minutes * 60 * 1000);

  const verified = verifyHistoryFormToken(
    token,
    { id: appointment.id as string, status: appointment.status as string, scheduledEnd },
    new Date()
  );
  if (!verified.ok) deny(verified.reason);

  const { data: existing, error: existingError } = await supabase
    .from('patient_history_submissions')
    .select('source, allergies, medicines, conditions')
    .eq('appointment_id', appointment.id)
    .maybeSingle();
  if (existingError) handleSupabaseError(existingError, correlationId);

  const chips = publicChips(appointment.previsit_context);
  const consultationType = publicConsultationType(appointment.consultation_type);
  const listsHidden = existing?.source === 'front_desk' || existing?.source === 'assistant';
  const alreadySent = existing?.source === 'patient';

  logger.info({ appointmentId: appointment.id, listsHidden, alreadySent }, 'patient_history_read');
  await logAuditEvent({
    correlationId,
    action: 'read_patient_history_submission',
    resourceType: 'appointment',
    resourceId: appointment.id as string,
    status: 'success',
    metadata: { listsHidden, alreadySent },
  });

  if (listsHidden) {
    return { listsEditable: false, listsHidden: true, alreadySent: false, consultationType, chips };
  }
  if (alreadySent) {
    return {
      listsEditable: false,
      listsHidden: false,
      alreadySent: true,
      consultationType,
      chips,
      allergies: publicList(existing?.allergies),
      medicines: publicList(existing?.medicines, true),
      conditions: publicList(existing?.conditions, true),
    };
  }
  return {
    listsEditable: true,
    listsHidden: false,
    alreadySent: false,
    consultationType,
    chips,
    allergies: EMPTY_LIST,
    medicines: EMPTY_LIST,
    conditions: EMPTY_LIST,
  };
}
