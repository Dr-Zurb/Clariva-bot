/**
 * Appointment reschedule primitives (pdm-09 — session overrun bulk-resolve).
 *
 * Moves pending|confirmed appointments to a new slot and clears
 * `session_overrun_at` on success.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import { getAvailableSlots } from './availability-service';
import { getDoctorSettings } from './doctor-settings-service';
import { resolveOpdModeFromSettings } from './opd/opd-mode-service';
import {
  createQueueEntryAfterBooking,
  deleteQueueEntryByAppointmentId,
} from './opd/opd-queue-service';

const SLOT_INTERVAL_MS = env.SLOT_INTERVAL_MINUTES * 60 * 1000;

export interface RescheduleOptions {
  triggeredBy: string;
  reason: string;
  correlationId?: string;
}

async function loadReschedulableAppointment(
  supabase: SupabaseClient,
  appointmentId: string,
  correlationId: string
): Promise<{
  id: string;
  doctor_id: string;
  status: string;
}> {
  const { data, error } = await supabase
    .from('appointments')
    .select('id, doctor_id, status')
    .eq('id', appointmentId)
    .single();

  if (error || !data) {
    handleSupabaseError(error, correlationId);
    throw new NotFoundError('Appointment not found');
  }

  if (data.status !== 'pending' && data.status !== 'confirmed') {
    throw new ValidationError('Only pending or confirmed appointments can be rescheduled');
  }

  return data;
}

async function checkSlotConflict(
  supabase: SupabaseClient,
  doctorId: string,
  slotStart: Date,
  slotEnd: Date,
  correlationId: string,
  excludeAppointmentId?: string
): Promise<boolean> {
  const rangeStart = new Date(slotStart.getTime() - SLOT_INTERVAL_MS);

  let query = supabase
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .in('status', ['pending', 'confirmed'])
    .gt('appointment_date', rangeStart.toISOString())
    .lt('appointment_date', slotEnd.toISOString());

  if (excludeAppointmentId) {
    query = query.neq('id', excludeAppointmentId);
  }

  const { data: existing, error } = await query;

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return (existing?.length ?? 0) > 0;
}

async function applyRescheduleDate(
  supabase: SupabaseClient,
  appointmentId: string,
  doctorId: string,
  newSlotStart: Date,
  correlationId: string
): Promise<void> {
  const settings = await getDoctorSettings(doctorId);
  const opdMode = resolveOpdModeFromSettings(settings);
  const timezone = settings?.timezone ?? 'Asia/Kolkata';

  if (opdMode === 'queue') {
    await deleteQueueEntryByAppointmentId(appointmentId, correlationId);
  } else {
    const slotEnd = new Date(newSlotStart.getTime() + SLOT_INTERVAL_MS);
    const hasConflict = await checkSlotConflict(
      supabase,
      doctorId,
      newSlotStart,
      slotEnd,
      correlationId,
      appointmentId
    );
    if (hasConflict) {
      throw new ConflictError('This time slot is no longer available');
    }
  }

  const { error } = await supabase
    .from('appointments')
    .update({
      appointment_date: newSlotStart.toISOString(),
      session_overrun_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  if (opdMode === 'queue') {
    await createQueueEntryAfterBooking(appointmentId, doctorId, newSlotStart, timezone, correlationId);
  }
}

async function findNextAvailableSlotStart(
  doctorId: string,
  correlationId: string,
  timezone: string
): Promise<Date | null> {
  const maxDays = env.AVAILABLE_SLOTS_MAX_FUTURE_DAYS;
  const today = DateTime.now().setZone(timezone).startOf('day');

  for (let offset = 0; offset <= maxDays; offset += 1) {
    const day = today.plus({ days: offset });
    const dateYmd = day.toISODate();
    if (!dateYmd) continue;

    const slots = await getAvailableSlots(doctorId, dateYmd, correlationId, { timezone });
    if (slots.length > 0) {
      return new Date(slots[0]!.start);
    }
  }

  return null;
}

/**
 * Move an appointment to the next available slot for the doctor.
 */
export async function rescheduleAppointmentToNextAvailable(
  supabase: SupabaseClient,
  appointmentId: string,
  options: RescheduleOptions
): Promise<void> {
  const correlationId = options.correlationId ?? `reschedule-${appointmentId}`;
  const row = await loadReschedulableAppointment(supabase, appointmentId, correlationId);
  const settings = await getDoctorSettings(row.doctor_id);
  const timezone = settings?.timezone ?? 'Asia/Kolkata';

  const nextStart = await findNextAvailableSlotStart(row.doctor_id, correlationId, timezone);
  if (!nextStart) {
    throw new ConflictError('No available slots found for reschedule');
  }

  if (nextStart < new Date()) {
    throw new ValidationError('Cannot reschedule to a slot in the past');
  }

  await applyRescheduleDate(supabase, appointmentId, row.doctor_id, nextStart, correlationId);

  logger.info(
    {
      event: 'opd_overrun.rescheduled',
      appointmentId,
      triggeredBy: options.triggeredBy,
      reason: options.reason,
      correlationId,
    },
    'opd_overrun.rescheduled'
  );
}

/**
 * Move an appointment to a specific slot (ISO datetime).
 */
export async function rescheduleAppointmentToSpecificSlot(
  supabase: SupabaseClient,
  appointmentId: string,
  rescheduleToIso: string,
  options: RescheduleOptions
): Promise<void> {
  const correlationId = options.correlationId ?? `reschedule-${appointmentId}`;
  const newSlotStart = new Date(rescheduleToIso);
  if (Number.isNaN(newSlotStart.getTime())) {
    throw new ValidationError('Invalid rescheduleTo datetime');
  }
  if (newSlotStart < new Date()) {
    throw new ValidationError('Cannot reschedule to a slot in the past');
  }

  const row = await loadReschedulableAppointment(supabase, appointmentId, correlationId);
  await applyRescheduleDate(supabase, appointmentId, row.doctor_id, newSlotStart, correlationId);

  logger.info(
    {
      event: 'opd_overrun.rescheduled',
      appointmentId,
      rescheduleTo: rescheduleToIso,
      triggeredBy: options.triggeredBy,
      reason: options.reason,
      correlationId,
    },
    'opd_overrun.rescheduled'
  );
}
