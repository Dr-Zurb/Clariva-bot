/**
 * Loads affected appointments and dispatches DL-6 mode-change copy (pdm-06).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { sendOpdModeChangeMessageToPatient } from '../notification-service';
import { getDoctorSettings } from '../doctor-settings-service';
import { buildReschedulePageUrl } from '../slot-selection-service';
import type { OpdMode } from '../../types/doctor-settings';
import {
  estimateQueueEtaMinutes,
  formatSessionDateInDoctorTZ,
  formatTimeInDoctorTZ,
  pickTemplate,
  renderTemplate,
} from './opd-mode-conversion-templates';
import type { PendingModeNotificationPayload } from './opd-mode-notifications-service';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export interface NotifyParams {
  doctorId: string;
  sessionDate: string;
  latestMode: OpdMode;
  payloadJson: PendingModeNotificationPayload;
}

interface QueueEntryRow {
  token_number: number;
}

interface AppointmentRow {
  id: string;
  patient_id: string | null;
  appointment_date: string;
  opd_event_type: 'standard' | 'return_after_completed' | null;
  status: string;
  conversation_id: string | null;
  opd_queue_entries: QueueEntryRow[] | QueueEntryRow | null;
}

export async function notifyConversionAffectedPatients(
  supabase: SupabaseClient,
  params: NotifyParams
): Promise<void> {
  const { doctorId, sessionDate, latestMode, payloadJson } = params;
  const previousMode = payloadJson.from_mode ?? null;
  const correlationId =
    payloadJson.correlation_id ?? `opd-mode-dispatch-${doctorId}-${sessionDate}`;

  const settings = await getDoctorSettings(doctorId);
  const timezone = settings?.timezone ?? DEFAULT_TIMEZONE;
  const doctorName = settings?.practice_name?.trim() || 'your doctor';

  const startUtc = DateTime.fromISO(sessionDate, { zone: timezone }).startOf('day');
  const endUtc = startUtc.plus({ days: 1 });

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(
      'id, patient_id, appointment_date, opd_event_type, status, conversation_id, ' +
        'opd_queue_entries (token_number)'
    )
    .eq('doctor_id', doctorId)
    .in('status', ['pending', 'confirmed'])
    .gte('appointment_date', startUtc.toUTC().toISO()!)
    .lt('appointment_date', endUtc.toUTC().toISO()!);

  if (error) {
    logger.error(
      { doctorId, sessionDate, err: error.message, context: 'opd_mode_notification_dispatcher' },
      'appointments_load_failed'
    );
    throw error;
  }

  const formattedDate = formatSessionDateInDoctorTZ(sessionDate, timezone);
  const bookingBase = env.BOOKING_PAGE_URL?.trim() || 'https://example.com/book';

  for (const raw of (appointments ?? []) as unknown as AppointmentRow[]) {
    const queueEntries = raw.opd_queue_entries;
    const tokenNumber = Array.isArray(queueEntries)
      ? queueEntries[0]?.token_number
      : queueEntries?.token_number;

    const isOverflow = raw.opd_event_type === 'return_after_completed';
    const templateKey = pickTemplate(latestMode, previousMode, isOverflow);

    const rescheduleUrl = raw.conversation_id
      ? buildReschedulePageUrl(raw.conversation_id, doctorId, raw.id)
      : bookingBase;

    const vars = {
      doctorName,
      date: formattedDate,
      time:
        latestMode === 'slot'
          ? formatTimeInDoctorTZ(raw.appointment_date, timezone)
          : latestMode === 'queue' && previousMode === 'slot'
            ? formatTimeInDoctorTZ(raw.appointment_date, timezone)
            : undefined,
      tokenNumber,
      eta: latestMode === 'queue' ? estimateQueueEtaMinutes(tokenNumber) : undefined,
      rescheduleUrl,
      isOverflow,
    };

    const body = renderTemplate(templateKey, vars);

    await sendOpdModeChangeMessageToPatient({
      appointmentId: raw.id,
      message: body,
      correlationId,
    });
  }
}
