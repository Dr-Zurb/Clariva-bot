/**
 * Mint a history-form path from a consultation token (clk-21).
 * Runs only when the patient taps share. The polled snapshot does not call this.
 * Logs the appointment id. Never the token or the path.
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { buildHistoryFormPath } from '../utils/booking-page-url';
import { verifyConsultationToken } from '../utils/consultation-token';
import { handleSupabaseError } from '../utils/db-helpers';
import { AppError, NotFoundError, ValidationError } from '../utils/errors';
import { historyFormExpiresAt } from '../utils/history-form-token';

type Admin = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

function client(): Admin {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new ValidationError('Service is unavailable');
  return supabase;
}

export async function mintPrepPathForConsultationToken(
  token: string,
  correlationId: string
): Promise<{ prepPath: string }> {
  const { appointmentId } = verifyConsultationToken(token);
  const supabase = client();
  const { data: appointment, error } = await supabase
    .from('appointments')
    .select('id, status, appointment_date, doctor_id')
    .eq('id', appointmentId)
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId);
  if (!appointment) throw new NotFoundError('This visit was not found');

  const status = appointment.status as string;
  if (status === 'cancelled' || status === 'no_show') {
    throw new AppError('This prep link is no longer available', 410);
  }

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
  const visit = { id: appointment.id as string, status, scheduledEnd };
  const exp = historyFormExpiresAt(visit);
  if (exp < Math.floor(Date.now() / 1000)) {
    throw new AppError('This prep link is no longer available', 410);
  }

  const prepPath = buildHistoryFormPath(visit);
  logger.info({ appointmentId: appointment.id }, 'prep_link_minted');
  return { prepPath };
}
