/**
 * Notification Service (e-task-5)
 *
 * Sends doctor emails (new appointment, payment received) and patient payment
 * confirmation DM. Audit logs all notification events (metadata only, no PII).
 * Failures are logged and do not block booking or payment flow.
 *
 * @see COMPLIANCE.md - No PII in logs; audit all notification events
 * @see ERROR_CATALOG.md - Notification failures must not block booking/payment
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { sendEmail } from '../config/email';
import { sendInstagramMessage } from './instagram-service';
import { getInstagramAccessTokenForDoctor } from './instagram-connect-service';
import { logAuditEvent } from '../utils/audit-logger';
import { logger } from '../config/logger';

// ============================================================================
// Types
// ============================================================================

export type NotificationRecipientType = 'doctor' | 'patient';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve doctor email: Supabase auth.users (admin) or env DEFAULT_DOCTOR_EMAIL.
 */
async function getDoctorEmail(doctorId: string, _correlationId: string): Promise<string | null> {
  const fallback = env.DEFAULT_DOCTOR_EMAIL?.trim();
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return fallback ?? null;
  }
  try {
    const { data, error } = await admin.auth.admin.getUserById(doctorId);
    if (error || !data?.user?.email) {
      return fallback ?? null;
    }
    return data.user.email;
  } catch {
    return fallback ?? null;
  }
}

/**
 * Format appointment date for display in messages.
 */
function formatAppointmentDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Audit log for notification_sent (metadata only: type, recipient_type, resource_id).
 */
async function auditNotificationSent(
  correlationId: string,
  type: string,
  recipientType: NotificationRecipientType,
  resourceType: string,
  resourceId: string
): Promise<void> {
  await logAuditEvent({
    correlationId,
    action: 'notification_sent',
    resourceType,
    resourceId,
    status: 'success',
    metadata: { notification_type: type, recipient_type: recipientType },
  });
}

// ============================================================================
// Patient: Payment confirmation DM
// ============================================================================

/**
 * Send payment confirmation DM to patient after payment webhook.
 * Resolves patient via appointment.patient_id -> patients.platform_external_id;
 * only sends Instagram DM when platform is instagram.
 *
 * @param appointmentId - Appointment ID (confirmed after payment)
 * @param appointmentDateIso - Appointment date (ISO string) for message
 * @param correlationId - Request correlation ID
 * @returns true if sent or skipped (no patient/platform); false on send failure (logged)
 */
export async function sendPaymentConfirmationToPatient(
  appointmentId: string,
  appointmentDateIso: string,
  correlationId: string
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn({ correlationId, appointmentId }, 'Notification skipped (admin client unavailable)');
    return false;
  }

  const { data: appointment, error: appError } = await admin
    .from('appointments')
    .select('id, patient_id, doctor_id')
    .eq('id', appointmentId)
    .single();

  if (appError || !appointment?.patient_id) {
    logger.info(
      { correlationId, appointmentId },
      'Payment confirmation DM skipped (no patient_id on appointment)'
    );
    return true; // not a failure, just no recipient
  }

  // Resolve recipient: patient.platform_external_id or conversation.platform_conversation_id
  let recipientId: string | null = null;
  const { data: patient } = await admin
    .from('patients')
    .select('id, platform, platform_external_id')
    .eq('id', appointment.patient_id)
    .single();

  if (patient?.platform === 'instagram' && patient.platform_external_id) {
    recipientId = patient.platform_external_id;
  }
  if (!recipientId) {
    const { data: conv } = await admin
      .from('conversations')
      .select('platform_conversation_id')
      .eq('patient_id', appointment.patient_id)
      .eq('doctor_id', appointment.doctor_id)
      .eq('platform', 'instagram')
      .limit(1)
      .maybeSingle();
    recipientId = conv?.platform_conversation_id ?? null;
  }
  if (!recipientId) {
    logger.info(
      { correlationId, appointmentId },
      'Payment confirmation DM skipped (no Instagram recipient for patient)'
    );
    return true;
  }

  const dateStr = formatAppointmentDate(appointmentDateIso);
  const message = `Payment received. Your appointment on ${dateStr} is confirmed. We'll send a reminder before your visit.`;

  const doctorToken = appointment.doctor_id
    ? await getInstagramAccessTokenForDoctor(appointment.doctor_id, correlationId)
    : null;

  try {
    await sendInstagramMessage(recipientId, message, correlationId, doctorToken ?? undefined);
    await auditNotificationSent(
      correlationId,
      'payment_confirmation_dm',
      'patient',
      'appointment',
      appointmentId
    );
    return true;
  } catch (err) {
    logger.warn(
      { correlationId, appointmentId, error: err instanceof Error ? err.message : String(err) },
      'Payment confirmation DM failed'
    );
    return false;
  }
}

// ============================================================================
// Doctor: New appointment email
// ============================================================================

/**
 * Send new appointment email to doctor when appointment is booked.
 *
 * @param doctorId - Doctor user ID
 * @param appointmentId - Appointment ID
 * @param appointmentDateIso - Appointment date (ISO string)
 * @param correlationId - Request correlation ID
 * @returns true if sent or email not configured; false on failure (logged)
 */
export async function sendNewAppointmentToDoctor(
  doctorId: string,
  appointmentId: string,
  appointmentDateIso: string,
  correlationId: string
): Promise<boolean> {
  const to = await getDoctorEmail(doctorId, correlationId);
  if (!to) {
    logger.info({ correlationId, appointmentId }, 'New appointment email skipped (no doctor email)');
    return true;
  }

  const dateStr = formatAppointmentDate(appointmentDateIso);
  const subject = 'New appointment booked';
  const text = `A new appointment has been booked for ${dateStr}. Appointment ID: ${appointmentId}.`;

  const sent = await sendEmail(to, subject, text, correlationId);
  if (sent) {
    await auditNotificationSent(
      correlationId,
      'new_appointment_email',
      'doctor',
      'appointment',
      appointmentId
    );
  }
  return sent;
}

// ============================================================================
// Doctor: Payment received email
// ============================================================================

/**
 * Send payment received email to doctor when payment webhook succeeds.
 *
 * @param doctorId - Doctor user ID
 * @param appointmentId - Appointment ID
 * @param appointmentDateIso - Appointment date (ISO string)
 * @param correlationId - Request correlation ID
 * @returns true if sent or email not configured; false on failure (logged)
 */
export async function sendPaymentReceivedToDoctor(
  doctorId: string,
  appointmentId: string,
  appointmentDateIso: string,
  correlationId: string
): Promise<boolean> {
  const to = await getDoctorEmail(doctorId, correlationId);
  if (!to) {
    logger.info({ correlationId, appointmentId }, 'Payment received email skipped (no doctor email)');
    return true;
  }

  const dateStr = formatAppointmentDate(appointmentDateIso);
  const subject = 'Payment received for appointment';
  const text = `Payment has been received for the appointment on ${dateStr}. Appointment ID: ${appointmentId}.`;

  const sent = await sendEmail(to, subject, text, correlationId);
  if (sent) {
    await auditNotificationSent(
      correlationId,
      'payment_received_email',
      'doctor',
      'appointment',
      appointmentId
    );
  }
  return sent;
}
