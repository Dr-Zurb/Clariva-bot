/**
 * One SMS after a public clinic booking: practice and when.
 * No reason. A second call for the same appointment does not send again.
 * Failure does not throw.
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { getDoctorSettings } from './doctor-settings-service';
import { sendSms } from './twilio-sms-service';
import { logAuditEvent } from '../utils/audit-logger';
import { buildHistoryFormUrl } from '../utils/booking-page-url';

const SMS_TYPE = 'public_clinic_booking_sms';

function formatVisitWhen(isoDate: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(isoDate));
}

async function alreadySent(appointmentId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { data, error } = await admin
    .from('audit_logs')
    .select('id')
    .eq('action', 'notification_sent')
    .eq('resource_id', appointmentId)
    .eq('metadata->>notification_type', SMS_TYPE)
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * Practice name and visit time only. Returns false when nothing was sent.
 */
export async function sendPublicClinicBookingSms(
  appointmentId: string,
  correlationId: string
): Promise<boolean> {
  try {
    if (await alreadySent(appointmentId)) {
      logger.info({ correlationId, appointmentId }, 'public_clinic_booking_sms_already_sent');
      return true;
    }

    const admin = getSupabaseAdminClient();
    if (!admin) {
      logger.warn({ correlationId, appointmentId }, 'public_clinic_booking_sms_skipped');
      return false;
    }

    const { data, error } = await admin
      .from('appointments')
      .select('id, appointment_date, patient_phone, doctor_id, status')
      .eq('id', appointmentId)
      .maybeSingle();

    if (error || !data) {
      logger.info({ correlationId, appointmentId }, 'public_clinic_booking_sms_skipped');
      return false;
    }

    const row = data as {
      appointment_date?: string | Date | null;
      patient_phone?: string | null;
      doctor_id?: string | null;
      status?: string | null;
    };
    const phone = row.patient_phone?.trim() ?? '';
    const doctorId = row.doctor_id ?? '';
    const iso =
      typeof row.appointment_date === 'string'
        ? row.appointment_date
        : row.appointment_date instanceof Date
          ? row.appointment_date.toISOString()
          : '';
    if (!phone || !iso || !doctorId) {
      logger.info({ correlationId, appointmentId }, 'public_clinic_booking_sms_skipped');
      return false;
    }

    const settings = await getDoctorSettings(doctorId);
    const practice = settings?.practice_name?.trim() || 'Your clinic';
    const when = formatVisitWhen(iso, settings?.timezone ?? 'Asia/Kolkata');
    const minutes = settings?.slot_interval_minutes ?? 15;
    const scheduledEnd = new Date(new Date(iso).getTime() + minutes * 60 * 1000);
    let prep = '';
    try {
      const url = buildHistoryFormUrl({
        id: appointmentId,
        status: row.status || 'pending',
        scheduledEnd,
      });
      prep = ` Prep: ${url}`;
    } catch {
      prep = '';
    }
    const body = `${practice}: your visit is ${when}.${prep}`;

    const sent = await sendSms(phone, body, correlationId);
    if (!sent) return false;

    await logAuditEvent({
      correlationId,
      action: 'notification_sent',
      resourceType: 'appointment',
      resourceId: appointmentId,
      status: 'success',
      metadata: { notification_type: SMS_TYPE, recipient_type: 'patient' },
    });
    return true;
  } catch {
    logger.warn({ correlationId, appointmentId }, 'public_clinic_booking_sms_failed');
    return false;
  }
}
