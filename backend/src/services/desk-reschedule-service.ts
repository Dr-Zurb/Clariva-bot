/**
 * Desk reschedule for waiting / booked visits.
 * Does not call updateAppointmentDateForPatient (webhook / patient path).
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { logDataModification } from '../utils/audit-logger';
import { handleSupabaseError } from '../utils/db-helpers';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { getAvailableSlots } from './availability-service';
import {
  ALREADY_ON_DAY_MESSAGE,
  enforcesClockSlot,
  findBlockingAppointmentOnSessionDate,
} from './appointment-service';
import { getDoctorSettings } from './doctor-settings-service';
import { resolveSessionDayMode } from './opd/opd-mode-service';
import {
  createQueueEntryAfterBooking,
  deleteQueueEntryByAppointmentId,
  getQueueTokenForAppointment,
  sessionDateFromAppointmentDate,
} from './opd/opd-queue-service';

const SLOT_INTERVAL_MS = env.SLOT_INTERVAL_MINUTES * 60 * 1000;

const DESK_RESCHEDULE_SELECT =
  'id, status, doctor_id, patient_id, patient_checked_in_at, appointment_date, booking_origin, opd_queue_entry:opd_queue_entries(token_number)' as const;

export type DeskRescheduleAppointment = {
  id: string;
  status: string;
  appointment_date: string;
  opd_token_number: number | null;
};

type DeskRescheduleRow = {
  id: string;
  status: string;
  doctor_id: string;
  patient_id: string | null;
  patient_checked_in_at: string | null;
  appointment_date: string;
  booking_origin: string | null;
  opd_queue_entry?: { token_number?: number | null } | { token_number?: number | null }[] | null;
};

function queueToken(row: Pick<DeskRescheduleRow, 'opd_queue_entry'>): number | null {
  const raw = row.opd_queue_entry;
  const entry = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  return entry?.token_number ?? null;
}

async function hasTillRow(
  appointmentId: string,
  doctorId: string,
  correlationId: string
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { count, error } = await admin
    .from('visit_payments')
    .select('id', { count: 'exact', head: true })
    .eq('appointment_id', appointmentId)
    .eq('doctor_id', doctorId);
  if (error) handleSupabaseError(error, correlationId);
  return (count ?? 0) > 0;
}

async function slotTaken(
  doctorId: string,
  slotStart: Date,
  correlationId: string,
  excludeAppointmentId: string
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const slotEnd = new Date(slotStart.getTime() + SLOT_INTERVAL_MS);
  const rangeStart = new Date(slotStart.getTime() - SLOT_INTERVAL_MS);
  const { data, error } = await admin
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .in('status', ['pending', 'confirmed'])
    .neq('id', excludeAppointmentId)
    .gt('appointment_date', rangeStart.toISOString())
    .lt('appointment_date', slotEnd.toISOString());
  if (error) handleSupabaseError(error, correlationId);
  return (data?.length ?? 0) > 0;
}

async function walkInMatchesClockSlot(
  doctorId: string,
  sessionDateYmd: string,
  newSlotStart: Date,
  timezone: string,
  correlationId: string
): Promise<boolean> {
  const slots = await getAvailableSlots(doctorId, sessionDateYmd, correlationId, { timezone });
  const target = newSlotStart.getTime();
  return slots.some((slot) => new Date(slot.start).getTime() === target);
}

export async function rescheduleAppointmentForDesk(
  appointmentId: string,
  doctorId: string,
  actorId: string,
  appointmentDateIso: string,
  correlationId: string
): Promise<{ appointment: DeskRescheduleAppointment }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const newSlotStart = new Date(appointmentDateIso);
  if (Number.isNaN(newSlotStart.getTime())) {
    throw new ValidationError('appointmentDate must be ISO 8601 datetime');
  }
  if (newSlotStart < new Date()) {
    throw new ValidationError('Cannot reschedule to a slot in the past');
  }

  const { data: existing, error: fetchError } = await admin
    .from('appointments')
    .select(DESK_RESCHEDULE_SELECT)
    .eq('id', appointmentId)
    .maybeSingle();

  if (fetchError) handleSupabaseError(fetchError, correlationId);
  const row = existing as DeskRescheduleRow | null;
  if (!row || row.doctor_id !== doctorId) {
    throw new NotFoundError('Appointment not found');
  }

  if (row.status === 'cancelled' || row.status === 'completed' || row.status === 'no_show') {
    throw new ValidationError('Appointment is already cancelled, completed, or marked no-show');
  }
  if (row.status !== 'pending' && row.status !== 'confirmed') {
    throw new ValidationError('Only pending or confirmed appointments can be rescheduled');
  }
  if (row.patient_checked_in_at) {
    throw new ValidationError('Already checked in');
  }

  const settings = await getDoctorSettings(doctorId);
  const timezone = settings?.timezone ?? 'Asia/Kolkata';
  const oldSession = sessionDateFromAppointmentDate(new Date(row.appointment_date), timezone);
  const newSession = sessionDateFromAppointmentDate(newSlotStart, timezone);
  const sessionDay = await resolveSessionDayMode(admin, doctorId, newSession);
  const opdMode = sessionDay.mode;

  if (row.patient_id && newSession !== oldSession) {
    const blocking = await findBlockingAppointmentOnSessionDate(
      doctorId,
      row.patient_id,
      newSession,
      timezone,
      correlationId
    );
    if (blocking && blocking.id !== appointmentId) {
      throw new ConflictError(ALREADY_ON_DAY_MESSAGE, {
        reason: 'already_on_today',
        appointmentId: blocking.id,
        token: blocking.token,
        bucket: blocking.bucket,
      });
    }
  }

  let nextOrigin = row.booking_origin ?? 'booked';
  if (nextOrigin === 'walk_in' && opdMode === 'slot') {
    const isClock = await walkInMatchesClockSlot(
      doctorId,
      newSession,
      newSlotStart,
      timezone,
      correlationId
    );
    if (isClock) nextOrigin = 'booked';
  }

  if (enforcesClockSlot(opdMode, nextOrigin as 'booked' | 'walk_in' | 'overflow' | 'return_after_completed' | 'rebooked')) {
    if (await slotTaken(doctorId, newSlotStart, correlationId, appointmentId)) {
      throw new ConflictError('This time slot is no longer available');
    }
  }

  const tillRow = await hasTillRow(appointmentId, doctorId, correlationId);
  const keepToken =
    opdMode === 'queue' && newSession === oldSession && !tillRow && !row.patient_checked_in_at;

  if (opdMode === 'queue' && !keepToken) {
    await deleteQueueEntryByAppointmentId(appointmentId, correlationId);
  }

  const patch: Record<string, unknown> = { appointment_date: newSlotStart.toISOString() };
  if (nextOrigin !== row.booking_origin) {
    patch.booking_origin = nextOrigin;
  }

  const { data: updated, error } = await admin
    .from('appointments')
    .update(patch)
    .eq('id', appointmentId)
    .select(DESK_RESCHEDULE_SELECT)
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  if (opdMode === 'queue' && !keepToken) {
    await createQueueEntryAfterBooking(appointmentId, doctorId, newSlotStart, timezone, correlationId);
  }

  const onBehalf = actorId !== doctorId ? doctorId : undefined;
  await logDataModification(
    correlationId,
    actorId,
    'update',
    'appointment',
    appointmentId,
    Object.keys(patch),
    onBehalf
  );

  logger.info({ correlationId, appointmentId, keepToken }, 'desk_appointment_rescheduled');

  const next = updated as DeskRescheduleRow;
  const token =
    opdMode === 'queue' && !keepToken
      ? await getQueueTokenForAppointment(appointmentId, correlationId)
      : queueToken(next);

  return {
    appointment: {
      id: next.id,
      status: next.status,
      appointment_date: next.appointment_date,
      opd_token_number: token,
    },
  };
}
