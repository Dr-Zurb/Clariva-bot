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
import { sendInstagramMessage, sendInstagramImage } from './instagram-service';
import { sendSms } from './twilio-sms-service';
import { getInstagramAccessTokenForDoctor } from './instagram-connect-service';
import { getDoctorSettings } from './doctor-settings-service';
import { logAuditEvent } from '../utils/audit-logger';
import {
  buildConsultationReadyDm,
  buildPaymentConfirmationMessage,
  buildPostConsultChatLinkDm,
  buildPrescriptionReadyPingDm,
  buildRecordingReplayedNotificationDm,
  buildTranscriptDownloadedNotificationDm,
  type ConsultationModality,
  type PaymentConfirmationModality,
  type RecordingReplayedArtifactType,
} from '../utils/dm-copy';
import { generateConsultationToken } from '../utils/consultation-token';
import { insertDashboardEvent } from './dashboard-events-service';
import { getJoinTokenForAppointment } from './consultation-session-service';
import type {
  FanOutChannelOutcome,
  FanOutResult,
} from '../types/notification';
import { logger } from '../config/logger';
import { redactPhiForAI } from './ai-service';
import { createAttachmentSignedUrlForDelivery } from './prescription-attachment-service';

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
export async function getDoctorEmail(doctorId: string, _correlationId: string): Promise<string | null> {
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
 * Format appointment date for display in messages (DM, email).
 * Uses doctor timezone so displayed time matches payment page (e.g. 12 PM not 6:30 AM UTC).
 */
function formatAppointmentDate(isoDate: string, timezone: string = 'Asia/Kolkata'): string {
  const d = new Date(isoDate);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
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
 * Includes newly assigned Patient ID (P-xxxxx) when provided (migration 046).
 *
 * @param appointmentId - Appointment ID (confirmed after payment)
 * @param appointmentDateIso - Appointment date (ISO string) for message
 * @param correlationId - Request correlation ID
 * @param patientMrn - Newly assigned or existing MRN to include in message (optional)
 * @returns true if sent or skipped (no patient/platform); false on send failure (logged)
 */
export async function sendPaymentConfirmationToPatient(
  appointmentId: string,
  appointmentDateIso: string,
  correlationId: string,
  patientMrn?: string | null
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn({ correlationId, appointmentId }, 'Notification skipped (admin client unavailable)');
    return false;
  }

  const { data: appointment, error: appError } = await admin
    .from('appointments')
    .select('id, patient_id, doctor_id, conversation_id, consultation_type')
    .eq('id', appointmentId)
    .single();

  if (appError || !appointment) {
    logger.info({ correlationId, appointmentId }, 'Payment confirmation DM skipped (appointment not found)');
    return true;
  }

  // Resolve recipient: patient.platform_external_id, conversation by patient_id, or appointment.conversation_id (booking for someone else)
  let recipientId: string | null = null;
  if (appointment.patient_id) {
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
  }
  if (!recipientId && appointment.conversation_id) {
    const { data: conv } = await admin
      .from('conversations')
      .select('platform_conversation_id')
      .eq('id', appointment.conversation_id)
      .eq('platform', 'instagram')
      .single();
    recipientId = conv?.platform_conversation_id ?? null;
  }
  if (!recipientId) {
    logger.info(
      { correlationId, appointmentId },
      'Payment confirmation DM skipped (no Instagram recipient for patient)'
    );
    return true;
  }

  const doctorSettings = appointment.doctor_id
    ? await getDoctorSettings(appointment.doctor_id)
    : null;
  const timezone = doctorSettings?.timezone ?? 'Asia/Kolkata';
  const dateStr = formatAppointmentDate(appointmentDateIso, timezone);
  // Principle 8 LOCKED (Plan 05 · Task 26): only 'voice' triggers a copy
  // variant today; narrow the raw DB string to the typed union so the
  // helper's exhaustiveness contract stays intact (unknown values → undefined).
  const rawConsultationType = appointment.consultation_type;
  const modality: PaymentConfirmationModality | undefined =
    rawConsultationType === 'text' ||
    rawConsultationType === 'voice' ||
    rawConsultationType === 'video' ||
    rawConsultationType === 'in_clinic'
      ? rawConsultationType
      : undefined;
  const message = buildPaymentConfirmationMessage({
    appointmentDateDisplay: dateStr,
    patientMrn: patientMrn?.trim() || undefined,
    modality,
  });

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
// Patient: Consultation link (e-task-8 - Teleconsultation)
// ============================================================================

/**
 * Send consultation join link to patient via best available channel.
 * Priority: SMS (if phone) > email (if email) > Instagram DM (if conversation).
 * Non-blocking: logs on failure, does not throw.
 *
 * @param appointmentId - Appointment ID
 * @param patientJoinUrl - Full URL with token (e.g. https://app.example.com/consult/join?token=xxx)
 * @param correlationId - Request correlation ID
 * @returns true if sent via any channel, false if skipped or all attempts failed
 */
export async function sendConsultationLinkToPatient(
  appointmentId: string,
  patientJoinUrl: string,
  correlationId: string
): Promise<boolean> {
  if (!patientJoinUrl?.trim()) {
    logger.info({ correlationId, appointmentId }, 'Consultation link skipped (no URL)');
    return false;
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn({ correlationId, appointmentId }, 'Consultation link skipped (admin client unavailable)');
    return false;
  }

  const { data: appointment, error: appError } = await admin
    .from('appointments')
    .select('id, patient_id, patient_phone, doctor_id, conversation_id')
    .eq('id', appointmentId)
    .single();

  if (appError || !appointment) {
    logger.info({ correlationId, appointmentId }, 'Consultation link skipped (appointment not found)');
    return false;
  }

  let phone: string | null = appointment.patient_phone?.trim() ?? null;
  let email: string | null = null;
  let igRecipientId: string | null = null;

  if (appointment.patient_id) {
    const { data: patient } = await admin
      .from('patients')
      .select('phone, email, platform, platform_external_id')
      .eq('id', appointment.patient_id)
      .single();

    if (patient) {
      if (!phone && patient.phone?.trim()) phone = patient.phone.trim();
      if (patient.email?.trim()) email = patient.email.trim();
      if (patient.platform === 'instagram' && patient.platform_external_id?.trim()) {
        igRecipientId = patient.platform_external_id.trim();
      }
    }
    if (!igRecipientId && appointment.patient_id) {
      const { data: conv } = await admin
        .from('conversations')
        .select('platform_conversation_id')
        .eq('patient_id', appointment.patient_id)
        .eq('doctor_id', appointment.doctor_id)
        .eq('platform', 'instagram')
        .limit(1)
        .maybeSingle();
      igRecipientId = conv?.platform_conversation_id?.trim() ?? null;
    }
  }
  if (!igRecipientId && appointment.conversation_id) {
    const { data: conv } = await admin
      .from('conversations')
      .select('platform_conversation_id')
      .eq('id', appointment.conversation_id)
      .eq('platform', 'instagram')
      .single();
    igRecipientId = conv?.platform_conversation_id?.trim() ?? null;
  }

  const doctorSettings = appointment.doctor_id
    ? await getDoctorSettings(appointment.doctor_id)
    : null;
  const practiceName = doctorSettings?.practice_name?.trim() || 'your doctor';
  const message = `Your video consultation with ${practiceName} is ready. Join here: ${patientJoinUrl}`;

  if (phone) {
    const sent = await sendSms(phone, message, correlationId);
    if (sent) {
      await auditNotificationSent(
        correlationId,
        'consultation_link',
        'patient',
        'appointment',
        appointmentId
      );
      return true;
    }
  }

  if (email) {
    const sent = await sendEmail(email, 'Your video consultation is ready', message, correlationId);
    if (sent) {
      await auditNotificationSent(
        correlationId,
        'consultation_link',
        'patient',
        'appointment',
        appointmentId
      );
      return true;
    }
  }

  if (igRecipientId) {
    const doctorToken = appointment.doctor_id
      ? await getInstagramAccessTokenForDoctor(appointment.doctor_id, correlationId)
      : null;
    try {
      await sendInstagramMessage(igRecipientId, message, correlationId, doctorToken ?? undefined);
      await auditNotificationSent(
        correlationId,
        'consultation_link',
        'patient',
        'appointment',
        appointmentId
      );
      return true;
    } catch (err) {
      logger.warn(
        { correlationId, appointmentId, error: err instanceof Error ? err.message : String(err) },
        'Consultation link DM failed'
      );
    }
  }

  if (!phone && !email && !igRecipientId) {
    logger.info(
      { correlationId, appointmentId },
      'Consultation link skipped (no patient contact channel)'
    );
  }
  return false;
}

// ============================================================================
// Patient: Prescription send (Prescription V1 - e-task-5)
// ============================================================================

export interface SendPrescriptionResult {
  sent: boolean;
  channels?: { instagram?: boolean; email?: boolean };
  reason?: string;
}

const PRESCRIPTION_DELIVERY_URL_EXPIRY = 3600; // 1 hr for Meta fetch
const INSTAGRAM_IMAGE_TYPES = ['image/jpeg', 'image/png'];

/**
 * Resolve Instagram recipient for patient (reuse payment confirmation pattern).
 */
async function resolvePrescriptionRecipient(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  appointment: { patient_id: string | null; doctor_id: string; conversation_id: string | null }
): Promise<string | null> {
  let recipientId: string | null = null;
  if (appointment.patient_id) {
    const { data: patient } = await admin
      .from('patients')
      .select('platform, platform_external_id')
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
  }
  if (!recipientId && appointment.conversation_id) {
    const { data: conv } = await admin
      .from('conversations')
      .select('platform_conversation_id')
      .eq('id', appointment.conversation_id)
      .eq('platform', 'instagram')
      .single();
    recipientId = conv?.platform_conversation_id ?? null;
  }
  return recipientId;
}

/**
 * Build text summary for structured prescription.
 */
function buildPrescriptionTextSummary(rx: {
  provisional_diagnosis?: string | null;
  investigations?: string | null;
  follow_up?: string | null;
  prescription_medicines?: Array<{
    medicine_name: string;
    dosage?: string | null;
    route?: string | null;
    frequency?: string | null;
    duration?: string | null;
    instructions?: string | null;
  }>;
}, practiceName: string): string {
  const lines: string[] = [`Your prescription from ${practiceName}:`];
  if (rx.provisional_diagnosis) {
    lines.push(`\n**Diagnosis:** ${rx.provisional_diagnosis}`);
  }
  const meds = rx.prescription_medicines ?? [];
  if (meds.length > 0) {
    lines.push('\n**Medications:**');
    for (const m of meds) {
      const parts = [m.medicine_name];
      if (m.dosage) parts.push(m.dosage);
      if (m.route) parts.push(m.route);
      if (m.frequency) parts.push(m.frequency);
      if (m.duration) parts.push(m.duration);
      if (m.instructions) parts.push(` (${m.instructions})`);
      lines.push(parts.join(' '));
    }
  }
  if (rx.investigations) {
    lines.push(`\n**Investigations:** ${rx.investigations}`);
  }
  if (rx.follow_up) {
    lines.push(`\n**Follow-up:** ${rx.follow_up}`);
  }
  return lines.join('\n').slice(0, 1000);
}

/**
 * Send prescription to patient via Instagram DM and/or email.
 * Sets sent_to_patient_at on success.
 *
 * @param prescriptionId - Prescription ID
 * @param correlationId - Request correlation ID
 * @param userId - Doctor user ID (owner verified by controller)
 */
export async function sendPrescriptionToPatient(
  prescriptionId: string,
  correlationId: string,
  userId: string
): Promise<SendPrescriptionResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn({ correlationId, prescriptionId }, 'Prescription send skipped (admin client unavailable)');
    return { sent: false, reason: 'service_unavailable' };
  }

  const { data: prescription, error: rxError } = await admin
    .from('prescriptions')
    .select('*')
    .eq('id', prescriptionId)
    .eq('doctor_id', userId)
    .single();

  if (rxError || !prescription) {
    return { sent: false, reason: 'prescription_not_found' };
  }

  const { data: appointment, error: appError } = await admin
    .from('appointments')
    .select('id, patient_id, doctor_id, conversation_id')
    .eq('id', prescription.appointment_id)
    .single();

  if (appError || !appointment) {
    return { sent: false, reason: 'appointment_not_found' };
  }

  const [medResult, attResult] = await Promise.all([
    admin.from('prescription_medicines').select('*').eq('prescription_id', prescriptionId).order('sort_order'),
    admin.from('prescription_attachments').select('*').eq('prescription_id', prescriptionId),
  ]);
  const medicines = (medResult.data ?? []) as Array<{
    medicine_name: string;
    dosage?: string | null;
    route?: string | null;
    frequency?: string | null;
    duration?: string | null;
    instructions?: string | null;
  }>;
  const attachments = (attResult.data ?? []) as Array<{ file_path: string; file_type: string | null }>;

  const doctorSettings = await getDoctorSettings(appointment.doctor_id);
  const practiceName = doctorSettings?.practice_name?.trim() || 'your doctor';

  let patientEmail: string | null = null;
  if (appointment.patient_id) {
    const { data: patient } = await admin
      .from('patients')
      .select('email')
      .eq('id', appointment.patient_id)
      .single();
    if (patient?.email?.trim()) patientEmail = patient.email.trim();
  }

  const igRecipientId = await resolvePrescriptionRecipient(admin, appointment);
  const doctorToken = await getInstagramAccessTokenForDoctor(appointment.doctor_id, correlationId);

  let instagramSent = false;
  let emailSent = false;

  // Build text summary (always used for structured, fallback for photo)
  const textSummary = buildPrescriptionTextSummary(
    { ...prescription, prescription_medicines: medicines },
    practiceName
  );

  // Instagram: try images first for photo attachments (JPEG/PNG only), then text
  if (igRecipientId && doctorToken) {
    const imageAttachments = attachments.filter(
      (a) => a.file_type && INSTAGRAM_IMAGE_TYPES.includes(a.file_type)
    );
    for (const att of imageAttachments) {
      try {
        const url = await createAttachmentSignedUrlForDelivery(
          att.file_path,
          PRESCRIPTION_DELIVERY_URL_EXPIRY
        );
        await sendInstagramImage(igRecipientId, url, correlationId, doctorToken);
        instagramSent = true;
      } catch (err) {
        logger.warn(
          { correlationId, prescriptionId, error: err instanceof Error ? err.message : String(err) },
          'Prescription image DM failed (fallback to text)'
        );
      }
    }
    if (!instagramSent && (prescription.type === 'structured' || prescription.type === 'both' || medicines.length > 0)) {
      try {
        await sendInstagramMessage(igRecipientId, textSummary, correlationId, doctorToken);
        instagramSent = true;
      } catch (err) {
        logger.warn(
          { correlationId, prescriptionId, error: err instanceof Error ? err.message : String(err) },
          'Prescription text DM failed'
        );
      }
    }
    if (!instagramSent && prescription.type === 'photo' && imageAttachments.length === 0) {
      try {
        await sendInstagramMessage(
          igRecipientId,
          `Your prescription from ${practiceName} has been saved.`,
          correlationId,
          doctorToken
        );
        instagramSent = true;
      } catch (err) {
        logger.warn(
          { correlationId, prescriptionId, error: err instanceof Error ? err.message : String(err) },
          'Prescription DM failed'
        );
      }
    }
  }

  // Email
  if (patientEmail) {
    const subject = `Your prescription from ${practiceName}`;
    const sent = await sendEmail(patientEmail, subject, textSummary, correlationId);
    if (sent) emailSent = true;
  }

  const anySent = instagramSent || emailSent;
  if (anySent) {
    await admin
      .from('prescriptions')
      .update({ sent_to_patient_at: new Date().toISOString() })
      .eq('id', prescriptionId);
    await auditNotificationSent(
      correlationId,
      'prescription_sent',
      'patient',
      'prescription',
      prescriptionId
    );
  }

  if (!igRecipientId && !patientEmail) {
    return { sent: false, reason: 'no_patient_link', channels: { instagram: false, email: false } };
  }

  return {
    sent: anySent,
    channels: { instagram: instagramSent, email: emailSent },
    reason: anySent ? undefined : 'send_failed',
  };
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

  const doctorSettings = await getDoctorSettings(doctorId);
  const timezone = doctorSettings?.timezone ?? 'Asia/Kolkata';
  const dateStr = formatAppointmentDate(appointmentDateIso, timezone);
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

  const doctorSettings = await getDoctorSettings(doctorId);
  const timezone = doctorSettings?.timezone ?? 'Asia/Kolkata';
  const dateStr = formatAppointmentDate(appointmentDateIso, timezone);
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

// ============================================================================
// Doctor: Appointment rescheduled email
// ============================================================================

/**
 * Send appointment rescheduled email to doctor when patient reschedules via bot.
 *
 * @param doctorId - Doctor user ID
 * @param appointmentId - Appointment ID
 * @param oldDateIso - Old appointment date (ISO string)
 * @param newDateIso - New appointment date (ISO string)
 * @param correlationId - Request correlation ID
 * @returns true if sent or email not configured; false on failure (logged)
 */
export async function sendAppointmentRescheduledToDoctor(
  doctorId: string,
  appointmentId: string,
  oldDateIso: string,
  newDateIso: string,
  correlationId: string
): Promise<boolean> {
  const to = await getDoctorEmail(doctorId, correlationId);
  if (!to) {
    logger.info({ correlationId, appointmentId }, 'Appointment rescheduled email skipped (no doctor email)');
    return true;
  }

  const doctorSettings = await getDoctorSettings(doctorId);
  const timezone = doctorSettings?.timezone ?? 'Asia/Kolkata';
  const oldStr = formatAppointmentDate(oldDateIso, timezone);
  const newStr = formatAppointmentDate(newDateIso, timezone);
  const subject = 'Appointment rescheduled';
  const text = `An appointment has been rescheduled from ${oldStr} to ${newStr}. Appointment ID: ${appointmentId}.`;

  const sent = await sendEmail(to, subject, text, correlationId);
  if (sent) {
    await auditNotificationSent(
      correlationId,
      'appointment_rescheduled_email',
      'doctor',
      'appointment',
      appointmentId
    );
  }
  return sent;
}

// ============================================================================
// Doctor: Appointment cancelled email
// ============================================================================

/**
 * Send appointment cancelled email to doctor when patient cancels via bot.
 *
 * @param doctorId - Doctor user ID
 * @param appointmentId - Appointment ID
 * @param appointmentDateIso - Appointment date (ISO string)
 * @param correlationId - Request correlation ID
 * @returns true if sent or email not configured; false on failure (logged)
 */
export async function sendAppointmentCancelledToDoctor(
  doctorId: string,
  appointmentId: string,
  appointmentDateIso: string,
  correlationId: string
): Promise<boolean> {
  const to = await getDoctorEmail(doctorId, correlationId);
  if (!to) {
    logger.info({ correlationId, appointmentId }, 'Appointment cancelled email skipped (no doctor email)');
    return true;
  }

  const doctorSettings = await getDoctorSettings(doctorId);
  const timezone = doctorSettings?.timezone ?? 'Asia/Kolkata';
  const dateStr = formatAppointmentDate(appointmentDateIso, timezone);
  const subject = 'Appointment cancelled';
  const text = `An appointment has been cancelled: ${dateStr}. Appointment ID: ${appointmentId}.`;

  const sent = await sendEmail(to, subject, text, correlationId);
  if (sent) {
    await auditNotificationSent(
      correlationId,
      'appointment_cancelled_email',
      'doctor',
      'appointment',
      appointmentId
    );
  }
  return sent;
}

// ============================================================================
// Doctor: Comment lead email (e-task-7)
// ============================================================================

/**
 * Send comment lead notification to doctor.
 * Uses redacted comment preview (no PHI in email).
 *
 * @param doctorId - Doctor user ID
 * @param leadSummary - Intent and redacted comment preview
 * @param correlationId - Request correlation ID
 */
export async function sendCommentLeadToDoctor(
  doctorId: string,
  leadSummary: { intent: string; commentPreview: string },
  correlationId: string
): Promise<boolean> {
  const to = await getDoctorEmail(doctorId, correlationId);
  if (!to) {
    logger.info({ correlationId, doctorId }, 'Comment lead email skipped (no doctor email)');
    return true;
  }

  const preview = redactPhiForAI(leadSummary.commentPreview).trim().slice(0, 80);
  const previewText = preview ? ` Comment: "${preview}${preview.length >= 80 ? '...' : ''}"` : '';
  const subject = 'New lead from Instagram comment';
  const text = `New lead from Instagram comment. Intent: ${leadSummary.intent}.${previewText} Check your dashboard for details.`;

  const sent = await sendEmail(to, subject, text, correlationId);
  if (sent) {
    await auditNotificationSent(
      correlationId,
      'comment_lead_email',
      'doctor',
      'comment_lead',
      doctorId
    );
  }
  return sent;
}

// ============================================================================
// Patient: Urgent-moment fan-out helpers (Plan 01 · Task 16)
// ----------------------------------------------------------------------------
// `sendConsultationReadyToPatient` and `sendPrescriptionReadyToPatient` are
// the parallel-not-cascade siblings of `sendConsultationLinkToPatient` /
// `sendPrescriptionToPatient`. They are intentionally additive — both legacy
// helpers stay untouched and continue to serve their existing call sites
// (booking confirmation + prescription content delivery respectively).
//
// Doctrine (master plan, Decision 4 LOCKED): for clinical-urgent moments we
// fire SMS + email + IG DM **in parallel** via `Promise.allSettled`. SMS
// failure does not block email; IG rate-limit does not block SMS. Redundancy
// is the point — patients miss DMs in busy IG inboxes, miss SMS on flight
// mode, miss email if it lands in promotions. We send to all three at once
// and report per-channel outcomes via `FanOutResult` so dashboards can
// catch patterns (e.g. "SMS failing 30% in region X").
// ============================================================================

/**
 * Recipient channel triplet resolved from `appointments` + `patients` +
 * `conversations`. Mirrors the resolution pattern in
 * `sendConsultationLinkToPatient` (lines ~247–285) but extracted so both
 * fan-out helpers stay readable. Any channel can be `null` — the fan-out
 * helpers map nulls to a `'skipped'` outcome with `reason: 'no_recipient'`.
 */
interface ResolvedPatientChannels {
  phone:           string | null;
  email:           string | null;
  igRecipientId:   string | null;
  igDoctorToken:   string | null;
  practiceName:    string;
  patientId:       string | null;
  doctorId:        string;
}

/**
 * Resolve all three channels (SMS / email / IG DM) for an appointment in
 * one round trip. Kept private — Plans 04/05 should call the public fan-out
 * helpers, not this resolver, so the lookup logic stays consistent.
 */
async function resolvePatientNotificationChannels(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  appointmentId: string,
  correlationId: string
): Promise<ResolvedPatientChannels | null> {
  const { data: appointment, error: appError } = await admin
    .from('appointments')
    .select('id, patient_id, patient_phone, doctor_id, conversation_id')
    .eq('id', appointmentId)
    .single();

  if (appError || !appointment) {
    return null;
  }

  let phone: string | null = appointment.patient_phone?.trim() || null;
  let email: string | null = null;
  let igRecipientId: string | null = null;

  if (appointment.patient_id) {
    const { data: patient } = await admin
      .from('patients')
      .select('phone, email, platform, platform_external_id')
      .eq('id', appointment.patient_id)
      .single();

    if (patient) {
      if (!phone && patient.phone?.trim()) phone = patient.phone.trim();
      if (patient.email?.trim()) email = patient.email.trim();
      if (patient.platform === 'instagram' && patient.platform_external_id?.trim()) {
        igRecipientId = patient.platform_external_id.trim();
      }
    }
    if (!igRecipientId) {
      const { data: conv } = await admin
        .from('conversations')
        .select('platform_conversation_id')
        .eq('patient_id', appointment.patient_id)
        .eq('doctor_id', appointment.doctor_id)
        .eq('platform', 'instagram')
        .limit(1)
        .maybeSingle();
      igRecipientId = conv?.platform_conversation_id?.trim() ?? null;
    }
  }
  if (!igRecipientId && appointment.conversation_id) {
    const { data: conv } = await admin
      .from('conversations')
      .select('platform_conversation_id')
      .eq('id', appointment.conversation_id)
      .eq('platform', 'instagram')
      .single();
    igRecipientId = conv?.platform_conversation_id?.trim() ?? null;
  }

  const doctorSettings = appointment.doctor_id
    ? await getDoctorSettings(appointment.doctor_id)
    : null;
  const practiceName = doctorSettings?.practice_name?.trim() || 'your doctor';

  const igDoctorToken = igRecipientId && appointment.doctor_id
    ? await getInstagramAccessTokenForDoctor(appointment.doctor_id, correlationId)
    : null;

  return {
    phone,
    email,
    igRecipientId,
    igDoctorToken,
    practiceName,
    patientId:    appointment.patient_id ?? null,
    doctorId:     appointment.doctor_id,
  };
}

/**
 * Dispatch the rendered message across all three channels in parallel.
 * Returns one `FanOutChannelOutcome` per channel (always 3 entries when
 * called via this helper — caller decides which to drop).
 *
 * `Promise.allSettled` is deliberate: we want every channel to attempt
 * independently. Any channel that errors becomes a `'failed'` outcome; the
 * other two still ship.
 */
async function dispatchFanOut(params: {
  channels:      ResolvedPatientChannels;
  message:       string;
  emailSubject:  string;
  correlationId: string;
}): Promise<FanOutChannelOutcome[]> {
  const { channels, message, emailSubject, correlationId } = params;

  const smsTask = (async (): Promise<FanOutChannelOutcome> => {
    if (!channels.phone) {
      return { channel: 'sms', status: 'skipped', reason: 'no_recipient' };
    }
    try {
      const sent = await sendSms(channels.phone, message, correlationId);
      return sent
        ? { channel: 'sms', status: 'sent' }
        : { channel: 'sms', status: 'failed', error: 'sms_send_returned_false' };
    } catch (err) {
      return {
        channel: 'sms',
        status:  'failed',
        error:   err instanceof Error ? err.message : String(err),
      };
    }
  })();

  const emailTask = (async (): Promise<FanOutChannelOutcome> => {
    if (!channels.email) {
      return { channel: 'email', status: 'skipped', reason: 'no_recipient' };
    }
    try {
      const sent = await sendEmail(
        channels.email,
        emailSubject,
        message,
        correlationId
      );
      return sent
        ? { channel: 'email', status: 'sent' }
        : { channel: 'email', status: 'failed', error: 'email_send_returned_false' };
    } catch (err) {
      return {
        channel: 'email',
        status:  'failed',
        error:   err instanceof Error ? err.message : String(err),
      };
    }
  })();

  const igTask = (async (): Promise<FanOutChannelOutcome> => {
    if (!channels.igRecipientId) {
      return { channel: 'instagram_dm', status: 'skipped', reason: 'no_recipient' };
    }
    try {
      const resp = await sendInstagramMessage(
        channels.igRecipientId,
        message,
        correlationId,
        channels.igDoctorToken ?? undefined
      );
      return {
        channel:           'instagram_dm',
        status:            'sent',
        providerMessageId: resp?.message_id,
      };
    } catch (err) {
      return {
        channel: 'instagram_dm',
        status:  'failed',
        error:   err instanceof Error ? err.message : String(err),
      };
    }
  })();

  // `Promise.allSettled` is technically belt-and-suspenders here since each
  // task above already swallows its own errors and returns a typed outcome —
  // but we keep it explicit so any future change that lets a task throw
  // doesn't take down the whole fan-out.
  const settled = await Promise.allSettled([smsTask, emailTask, igTask]);
  return settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    const channel: FanOutChannelOutcome['channel'] =
      i === 0 ? 'sms' : i === 1 ? 'email' : 'instagram_dm';
    return {
      channel,
      status: 'failed',
      error:  s.reason instanceof Error ? s.reason.message : String(s.reason),
    };
  });
}

function logFanOutResult(
  kind: 'consultation_ready' | 'prescription_ready',
  resourceId: string,
  patientId: string | null,
  modality: ConsultationModality | undefined,
  result: FanOutResult,
  correlationId: string
): void {
  logger.info(
    {
      correlationId,
      fanout_kind:  kind,
      resource_id:  resourceId,
      patient_id:   patientId ?? undefined,
      modality:     modality ?? undefined,
      attempted_at: result.attemptedAt,
      any_sent:     result.anySent,
      reason:       result.reason,
      channels: result.channels.map((c) =>
        c.status === 'sent'
          ? { channel: c.channel, status: c.status }
          : c.status === 'skipped'
            ? { channel: c.channel, status: c.status, reason: c.reason }
            : { channel: c.channel, status: c.status, error: c.error }
      ),
    },
    'Notification fan-out attempted'
  );
}

/**
 * Fan out a "your consult is ready, here's the link" notification to the
 * patient across SMS + email + IG DM **in parallel**. Modality-aware copy:
 * delegates to `buildConsultationReadyDm` so Plans 04 (text) and 05 (voice)
 * can plug in their own variants without forking this helper.
 *
 * Reads the `consultation_sessions` row by `sessionId` to get the
 * `(appointmentId, doctorId, modality)` tuple, then mints a fresh patient
 * join token via `getJoinTokenForAppointment` and constructs the URL using
 * `env.CONSULTATION_JOIN_BASE_URL`.
 *
 * Dedup: short-circuits if `consultation_sessions.last_ready_notification_at`
 * is within `env.CONSULTATION_READY_NOTIFY_DEDUP_SECONDS` (default 60s) of
 * `now()`. Useful when the post-session worker double-fires or a doctor
 * mashes the launcher.
 *
 * Never throws. Per-channel failures surface in the returned `FanOutResult`.
 *
 * **Task 24 — resend-link endpoint:** The `force` option bypasses the
 * `last_ready_notification_at` dedup window. Used by the doctor-facing
 * `POST /:sessionId/resend-link` endpoint so the doctor can re-send the
 * join URL on demand (Principle 8 / Plan 05 — the resend surface that
 * the `<VoiceConsultRoom>` "patient hasn't joined" pill wires into).
 */
export async function sendConsultationReadyToPatient(input: {
  sessionId:     string;
  correlationId: string;
  force?:        boolean;
}): Promise<FanOutResult> {
  const { sessionId, correlationId, force } = input;
  const attemptedAt = new Date().toISOString();

  const baseEmpty = (
    overrides: Partial<FanOutResult> = {}
  ): FanOutResult => ({
    sessionOrPrescriptionId: sessionId,
    attemptedAt,
    channels: [],
    anySent: false,
    ...overrides,
  });

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn(
      { correlationId, sessionId },
      'Consultation-ready fan-out skipped (admin client unavailable)'
    );
    return baseEmpty();
  }

  const { data: session, error: sessionError } = await admin
    .from('consultation_sessions')
    .select(
      'id, appointment_id, doctor_id, patient_id, modality, last_ready_notification_at'
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    logger.warn(
      { correlationId, sessionId, error: sessionError?.message },
      'Consultation-ready fan-out skipped (session not found)'
    );
    return baseEmpty();
  }

  // Dedup window. `0` disables dedup entirely (test override / debug).
  // `force=true` also bypasses — the doctor's explicit "resend link"
  // action is Authoritative Intent that overrides the automatic dedup.
  const dedupSeconds = force ? 0 : env.CONSULTATION_READY_NOTIFY_DEDUP_SECONDS;
  if (dedupSeconds > 0 && session.last_ready_notification_at) {
    const lastMs = new Date(session.last_ready_notification_at).getTime();
    if (Number.isFinite(lastMs) && Date.now() - lastMs < dedupSeconds * 1000) {
      const result = baseEmpty({ reason: 'recent_duplicate' });
      logFanOutResult(
        'consultation_ready',
        sessionId,
        session.patient_id,
        session.modality as ConsultationModality,
        result,
        correlationId
      );
      return result;
    }
  }

  const channels = await resolvePatientNotificationChannels(
    admin,
    session.appointment_id,
    correlationId
  );
  if (!channels) {
    logger.warn(
      { correlationId, sessionId, appointmentId: session.appointment_id },
      'Consultation-ready fan-out skipped (appointment not found)'
    );
    return baseEmpty();
  }

  // Mint patient join token via the modality-blind facade. Video + text
  // adapters are registered today; voice throws "ships in Plan 05" — that
  // throw is the contract until Plan 05 wires its adapter.
  //
  // URL resolution precedence:
  //   1. Adapter-supplied `joinToken.url` (Plan 04 text adapter populates
  //      this — the route shape `/c/text/{sessionId}?token=...` embeds
  //      the session id, which the fan-out helper doesn't have).
  //   2. Fall back to `${CONSULTATION_JOIN_BASE_URL}?token=${token}` for
  //      adapters (video) that leave URL composition to the caller.
  let patientJoinUrl: string;
  try {
    const joinToken = await getJoinTokenForAppointment(
      {
        appointmentId: session.appointment_id,
        doctorId:      session.doctor_id,
        modality:      session.modality as ConsultationModality,
        role:          'patient',
      },
      correlationId
    );
    if (joinToken.url) {
      patientJoinUrl = joinToken.url;
    } else {
      const baseUrl = env.CONSULTATION_JOIN_BASE_URL?.trim();
      if (!baseUrl) {
        logger.warn(
          { correlationId, sessionId, modality: session.modality },
          'Consultation-ready fan-out skipped (no adapter URL and CONSULTATION_JOIN_BASE_URL unset)'
        );
        return baseEmpty();
      }
      patientJoinUrl = `${baseUrl}?token=${joinToken.token}`;
    }
  } catch (err) {
    logger.warn(
      {
        correlationId,
        sessionId,
        modality: session.modality,
        error:    err instanceof Error ? err.message : String(err),
      },
      'Consultation-ready fan-out skipped (join-token mint failed)'
    );
    return baseEmpty();
  }

  let message: string;
  try {
    message = buildConsultationReadyDm({
      modality:     session.modality as ConsultationModality,
      practiceName: channels.practiceName,
      joinUrl:      patientJoinUrl,
    });
  } catch (err) {
    logger.warn(
      {
        correlationId,
        sessionId,
        modality: session.modality,
        error:    err instanceof Error ? err.message : String(err),
      },
      'Consultation-ready fan-out skipped (copy builder threw)'
    );
    return baseEmpty();
  }

  const channelOutcomes = await dispatchFanOut({
    channels,
    message,
    emailSubject:  'Your consult is starting',
    correlationId,
  });

  const anySent = channelOutcomes.some((c) => c.status === 'sent');

  // Stamp dedup column whenever we attempted (even if every channel failed)
  // so a tight retry loop doesn't hammer providers. Best-effort — failure
  // here doesn't affect the returned result.
  await admin
    .from('consultation_sessions')
    .update({ last_ready_notification_at: attemptedAt })
    .eq('id', sessionId)
    .then(({ error }) => {
      if (error) {
        logger.warn(
          { correlationId, sessionId, error: error.message },
          'consultation_sessions.last_ready_notification_at update failed (non-fatal)'
        );
      }
    });

  if (anySent) {
    await auditNotificationSent(
      correlationId,
      'consultation_ready_fanout',
      'patient',
      'consultation_session',
      sessionId
    );
  }

  const result: FanOutResult = {
    sessionOrPrescriptionId: sessionId,
    attemptedAt,
    channels:                channelOutcomes,
    anySent,
  };
  logFanOutResult(
    'consultation_ready',
    sessionId,
    channels.patientId,
    session.modality as ConsultationModality,
    result,
    correlationId
  );
  return result;
}

/**
 * Fan out a short "your prescription is ready" urgent ping to the patient
 * across SMS + email + IG DM in parallel.
 *
 * This is the **redundant urgent ping** that complements the existing
 * `sendPrescriptionToPatient` (which delivers the actual content). Run by
 * the post-prescription worker ~30s after content delivery so the patient
 * notices the message in a busy inbox.
 *
 * URL handling: includes a deep link when `env.PRESCRIPTION_VIEW_BASE_URL`
 * is configured; otherwise sends a URL-less ping (the patient already has
 * the content from the cascade helper).
 *
 * Never throws.
 */
export async function sendPrescriptionReadyToPatient(input: {
  prescriptionId: string;
  correlationId:  string;
}): Promise<FanOutResult> {
  const { prescriptionId, correlationId } = input;
  const attemptedAt = new Date().toISOString();

  const baseEmpty = (
    overrides: Partial<FanOutResult> = {}
  ): FanOutResult => ({
    sessionOrPrescriptionId: prescriptionId,
    attemptedAt,
    channels: [],
    anySent: false,
    ...overrides,
  });

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn(
      { correlationId, prescriptionId },
      'Prescription-ready fan-out skipped (admin client unavailable)'
    );
    return baseEmpty();
  }

  const { data: prescription, error: rxError } = await admin
    .from('prescriptions')
    .select('id, appointment_id')
    .eq('id', prescriptionId)
    .single();

  if (rxError || !prescription) {
    logger.warn(
      { correlationId, prescriptionId, error: rxError?.message },
      'Prescription-ready fan-out skipped (prescription not found)'
    );
    return baseEmpty();
  }

  const channels = await resolvePatientNotificationChannels(
    admin,
    prescription.appointment_id,
    correlationId
  );
  if (!channels) {
    logger.warn(
      {
        correlationId,
        prescriptionId,
        appointmentId: prescription.appointment_id,
      },
      'Prescription-ready fan-out skipped (appointment not found)'
    );
    return baseEmpty();
  }

  const viewBase = env.PRESCRIPTION_VIEW_BASE_URL?.trim();
  const viewUrl = viewBase ? `${viewBase.replace(/\/$/, '')}/${prescriptionId}` : undefined;

  const message = buildPrescriptionReadyPingDm({
    practiceName: channels.practiceName,
    viewUrl,
  });

  const channelOutcomes = await dispatchFanOut({
    channels,
    message,
    emailSubject:  'Your prescription is ready',
    correlationId,
  });

  const anySent = channelOutcomes.some((c) => c.status === 'sent');
  if (anySent) {
    await auditNotificationSent(
      correlationId,
      'prescription_ready_fanout',
      'patient',
      'prescription',
      prescriptionId
    );
  }

  const result: FanOutResult = {
    sessionOrPrescriptionId: prescriptionId,
    attemptedAt,
    channels:                channelOutcomes,
    anySent,
  };
  logFanOutResult(
    'prescription_ready',
    prescriptionId,
    channels.patientId,
    undefined,
    result,
    correlationId
  );
  return result;
}

// ============================================================================
// Mutual replay notifications — Plan 07 · Task 30 · Decision 4 LOCKED
// ============================================================================
//
// Two parallel-shape helpers that recording-access-service.mintReplayUrl()
// fires at step 8 of its policy pipeline:
//
//   - `notifyPatientOfDoctorReplay` — IG-DM → SMS fan-out telling the
//     patient that the doctor (or support-staff acting on the doctor's
//     behalf — see Decision 4 principle 8) replayed their consult.
//
//   - `notifyDoctorOfPatientReplay` — writes a dashboard-feed row so the
//     doctor sees "your patient replayed this consult" on their next
//     dashboard load. Decision 4 carves out doctor-facing replay
//     notifications as dashboard-only; NO DM / SMS / email to the doctor
//     to avoid notification fatigue.
//
// Both helpers are fire-and-forget at the call site:
//   - Per-channel failures are logged but do NOT throw. A transient
//     IG-DM outage must not break a legitimate replay (the audit row is
//     already written; the recording still plays).
//   - Idempotency keyed on `recordingAccessAuditId` (the id of the row
//     written by recording-access-service). Retries from a Twilio 5xx
//     don't re-spam.
// ============================================================================

/**
 * Format `actual_ended_at` into the patient-facing "19 Apr 2026" label
 * used in the replayed-recording DM. Defaults to Asia/Kolkata to match
 * the rest of the patient-facing notification surface (see
 * `formatAppointmentDate` upstream); future i18n / per-patient timezone
 * is captured in the patient-DM-copy inbox.
 */
function formatConsultDateLabel(iso: string, timezone = 'Asia/Kolkata'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // Defensive — the call site validates this upstream, but a bad ISO
    // here would surface as `'Invalid Date'` in the DM, which is worse
    // than an empty fallback.
    return '';
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  }).format(d);
}

interface ReplayNotificationContext {
  doctorId:           string;
  patientId:          string;
  patientDisplayName: string;
  practiceName:       string;
  consultEndedAtIso:  string | null;
}

async function loadReplayNotificationContext(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  sessionId: string,
  correlationId: string,
): Promise<ReplayNotificationContext | null> {
  const { data: session, error: sessionErr } = await admin
    .from('consultation_sessions')
    .select('doctor_id, patient_id, actual_ended_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionErr || !session) {
    logger.warn(
      { correlationId, sessionId, error: sessionErr?.message },
      'replay-notification: session lookup failed',
    );
    return null;
  }
  const sess = session as {
    doctor_id: string;
    patient_id: string | null;
    actual_ended_at: string | null;
  };

  let patientDisplayName = '';
  if (sess.patient_id) {
    const { data: patient } = await admin
      .from('patients')
      .select('name')
      .eq('id', sess.patient_id)
      .maybeSingle();
    patientDisplayName = ((patient as { name: string | null } | null)?.name ?? '').trim();
  }

  const doctorSettings = await getDoctorSettings(sess.doctor_id);
  const practiceName = doctorSettings?.practice_name?.trim() || '';

  return {
    doctorId:           sess.doctor_id,
    patientId:          sess.patient_id ?? '',
    patientDisplayName,
    practiceName,
    consultEndedAtIso:  sess.actual_ended_at,
  };
}

/**
 * Resolve the patient's IG / SMS reachability for the replay-notification
 * fan-out. Reuses the same patient + conversation lookups as
 * `resolvePatientNotificationChannels` but keyed by `patientId` directly
 * (the replay path doesn't have an appointmentId — the audit row points
 * at the session, not the appointment, and the session may belong to a
 * series of appointments under the same care episode).
 *
 * Email is intentionally NOT resolved here — Decision 4's "non-alarming
 * framing" doctrine pairs poorly with email's "this might be important"
 * default treatment in patient inboxes. The replay DM is informational,
 * not urgent; SMS + IG-DM cover the patient-facing reach without spilling
 * into the email channel that carries booking confirmations + payment
 * receipts (and would dilute their signal). If telemetry shows we miss
 * the patient on both rails frequently, we add email in a follow-up with
 * a softer subject line.
 */
async function resolveReplayDmChannels(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  doctorId: string,
  patientId: string,
  correlationId: string,
): Promise<{
  phone:         string | null;
  igRecipientId: string | null;
  igDoctorToken: string | null;
}> {
  let phone:         string | null = null;
  let igRecipientId: string | null = null;

  const { data: patient } = await admin
    .from('patients')
    .select('phone, platform, platform_external_id')
    .eq('id', patientId)
    .maybeSingle();
  if (patient) {
    const p = patient as {
      phone: string | null;
      platform: string | null;
      platform_external_id: string | null;
    };
    if (p.phone?.trim()) phone = p.phone.trim();
    if (p.platform === 'instagram' && p.platform_external_id?.trim()) {
      igRecipientId = p.platform_external_id.trim();
    }
  }

  if (!igRecipientId) {
    const { data: conv } = await admin
      .from('conversations')
      .select('platform_conversation_id')
      .eq('patient_id', patientId)
      .eq('doctor_id', doctorId)
      .eq('platform', 'instagram')
      .limit(1)
      .maybeSingle();
    igRecipientId = (conv as { platform_conversation_id: string | null } | null)
      ?.platform_conversation_id?.trim() ?? null;
  }

  const igDoctorToken = igRecipientId
    ? await getInstagramAccessTokenForDoctor(doctorId, correlationId)
    : null;

  return { phone, igRecipientId, igDoctorToken };
}

export type NotifyPatientOfDoctorReplayResult =
  | FanOutResult
  | { skipped: true; reason: string };

/**
 * Fan out the doctor-replayed-recording DM to the patient. IG-DM + SMS
 * in parallel via `Promise.allSettled` (same `dispatchFanOut` pattern as
 * `sendConsultationReadyToPatient`, minus the email channel — see
 * `resolveReplayDmChannels` for rationale).
 *
 * Fire-and-forget at the call site — errors are logged but never
 * thrown. Per Decision 4 principle 8 ("this is a normal part of care"),
 * a missed DM is UX-bad but not safety-critical. A thrown error would
 * incorrectly bubble into `mintReplayUrl()` and break a legitimate
 * replay on a transient IG-DM outage.
 *
 * Idempotency: keyed on `recordingAccessAuditId` (the id of the row
 * written by `recording-access-service.mintReplayUrl()`). The helper
 * pre-checks the existing fan-out audit log before dispatching; a
 * second call with the same id returns `{ skipped: true, reason:
 * 'already_notified' }` without re-fanning out.
 *
 * @returns FanOutResult on dispatch (one or more channels attempted),
 *          or `{ skipped: true, reason }` when the helper short-circuits
 *          (already-notified, no-patient, no-channels, etc.).
 */
export async function notifyPatientOfDoctorReplay(input: {
  sessionId:              string;
  artifactType:           RecordingReplayedArtifactType;
  recordingAccessAuditId: string;
  correlationId:          string;
  /**
   * Distinguishes a transcript *download* (a PDF leaves the platform
   * and is offline-legible — Plan 07 Task 32) from an in-UI replay
   * (the doctor scrubbed the audio / read the transcript on-screen —
   * Plan 07 Task 29 + 30). Defaults to `'reviewed'` so every existing
   * call site keeps its current DM body (Task 29's audio-replay fan-
   * out). Task 32's `transcript-pdf-service` passes `'downloaded'` to
   * route the DM through `buildTranscriptDownloadedNotificationDm`.
   *
   * Meaningful only when `artifactType === 'transcript'` — a
   * `'downloaded'` action against an audio artifact still renders
   * the replay-variant body (audio downloads aren't a v1 surface;
   * if they were, a follow-up would add a parallel "downloaded the
   * audio" builder).
   */
  actionKind?:            'reviewed' | 'downloaded';
}): Promise<NotifyPatientOfDoctorReplayResult> {
  const { sessionId, artifactType, recordingAccessAuditId, correlationId } = input;
  const actionKind = input.actionKind ?? 'reviewed';
  const attemptedAt = new Date().toISOString();

  const skipped = (reason: string): { skipped: true; reason: string } => {
    logger.info(
      { correlationId, sessionId, recordingAccessAuditId, reason },
      'notifyPatientOfDoctorReplay: skipped',
    );
    return { skipped: true, reason };
  };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return skipped('admin_client_unavailable');
  }

  // Idempotency pre-check via audit_logs (the codebase's canonical audit
  // surface — there is no separate `notification_audit_log` table). We
  // scope to action='patient_recording_replay_notification' AND
  // metadata->>'recording_access_audit_id' = <id>. A row with status
  // 'success' OR 'failure' both count: status='failure' means we already
  // tried and the channels rejected; we don't retry automatically (a
  // future Plan 2.x can introduce a reconciliation cron if needed).
  try {
    const { data: existing } = await admin
      .from('audit_logs')
      .select('id')
      .eq('action', 'patient_recording_replay_notification')
      .eq('metadata->>recording_access_audit_id', recordingAccessAuditId)
      .limit(1);
    if (existing && existing.length > 0) {
      return skipped('already_notified');
    }
  } catch (err) {
    // Non-fatal — proceed with dispatch. A duplicate DM in the failure
    // window is annoying but better than silently dropping the first.
    logger.warn(
      { correlationId, recordingAccessAuditId, error: err instanceof Error ? err.message : String(err) },
      'notifyPatientOfDoctorReplay: idempotency pre-check failed; proceeding with dispatch',
    );
  }

  const ctx = await loadReplayNotificationContext(admin, sessionId, correlationId);
  if (!ctx) {
    return skipped('session_not_found');
  }
  if (!ctx.patientId) {
    return skipped('no_patient_on_session');
  }
  if (!ctx.consultEndedAtIso) {
    // The consult never ended — there's nothing the patient should be
    // notified about replaying. Defensive; mintReplayUrl already gates
    // on actual_ended_at for patient-window checks.
    return skipped('session_not_ended');
  }

  const channels = await resolveReplayDmChannels(
    admin,
    ctx.doctorId,
    ctx.patientId,
    correlationId,
  );
  if (!channels.phone && !channels.igRecipientId) {
    return skipped('no_channels');
  }

  const consultDateLabel = formatConsultDateLabel(ctx.consultEndedAtIso);
  // Task 32 carve-out: a transcript *download* gets its own DM body.
  // Every other combination (audio replay / audio download / transcript
  // review) stays on the single `buildRecordingReplayedNotificationDm`.
  // Keeping the routing here (vs pushing it into the builder) means the
  // two builders stay independently snapshot-pinned — a future copy edit
  // to the "reviewed" body can't leak into the "downloaded" body.
  const messageBody =
    artifactType === 'transcript' && actionKind === 'downloaded'
      ? buildTranscriptDownloadedNotificationDm({
          practiceName: ctx.practiceName,
          consultDateLabel,
        })
      : buildRecordingReplayedNotificationDm({
          practiceName: ctx.practiceName,
          consultDateLabel,
          artifactType,
        });

  // Dispatch IG-DM + SMS in parallel. We don't reuse `dispatchFanOut`
  // because that helper hard-codes the three-channel SMS+email+IG shape
  // and we deliberately omit email here (see resolveReplayDmChannels).
  const smsTask = (async (): Promise<FanOutChannelOutcome> => {
    if (!channels.phone) {
      return { channel: 'sms', status: 'skipped', reason: 'no_recipient' };
    }
    try {
      const sent = await sendSms(channels.phone, messageBody, correlationId);
      return sent
        ? { channel: 'sms', status: 'sent' }
        : { channel: 'sms', status: 'failed', error: 'sms_send_returned_false' };
    } catch (err) {
      return {
        channel: 'sms',
        status:  'failed',
        error:   err instanceof Error ? err.message : String(err),
      };
    }
  })();

  const igTask = (async (): Promise<FanOutChannelOutcome> => {
    if (!channels.igRecipientId) {
      return { channel: 'instagram_dm', status: 'skipped', reason: 'no_recipient' };
    }
    try {
      const resp = await sendInstagramMessage(
        channels.igRecipientId,
        messageBody,
        correlationId,
        channels.igDoctorToken ?? undefined,
      );
      return {
        channel:           'instagram_dm',
        status:            'sent',
        providerMessageId: resp?.message_id,
      };
    } catch (err) {
      return {
        channel: 'instagram_dm',
        status:  'failed',
        error:   err instanceof Error ? err.message : String(err),
      };
    }
  })();

  const settled = await Promise.allSettled([smsTask, igTask]);
  const channelOutcomes: FanOutChannelOutcome[] = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    const channel: FanOutChannelOutcome['channel'] = i === 0 ? 'sms' : 'instagram_dm';
    return {
      channel,
      status: 'failed',
      error:  s.reason instanceof Error ? s.reason.message : String(s.reason),
    };
  });
  const anySent = channelOutcomes.some((c) => c.status === 'sent');

  const result: FanOutResult = {
    sessionOrPrescriptionId: sessionId,
    attemptedAt,
    channels:                channelOutcomes,
    anySent,
  };

  // Audit the fan-out attempt — keyed by recording_access_audit_id for
  // dedup on the next call. We log success EVEN IF anySent === false so
  // the dedup key is set; a future reconciliation cron can sweep for
  // anySent=false rows and decide whether to retry.
  try {
    await logAuditEvent({
      correlationId,
      action: 'patient_recording_replay_notification',
      resourceType: 'consultation_session',
      resourceId: sessionId,
      status: anySent ? 'success' : 'failure',
      errorMessage: anySent
        ? undefined
        : 'no channel succeeded for patient replay notification',
      metadata: {
        recording_access_audit_id: recordingAccessAuditId,
        artifact_type:             artifactType,
        action_kind:               actionKind,
        any_sent:                  anySent,
        channels: channelOutcomes.map((c) =>
          c.status === 'sent'
            ? { channel: c.channel, status: c.status }
            : c.status === 'skipped'
              ? { channel: c.channel, status: c.status, reason: c.reason }
              : { channel: c.channel, status: c.status, error: c.error },
        ),
      },
    });
  } catch (err) {
    logger.error(
      { correlationId, recordingAccessAuditId, error: err instanceof Error ? err.message : String(err) },
      'notifyPatientOfDoctorReplay: audit log write failed',
    );
  }

  logger.info(
    {
      correlationId,
      sessionId,
      recording_access_audit_id: recordingAccessAuditId,
      artifact_type: artifactType,
      any_sent: anySent,
      channels: channelOutcomes.map((c) => ({ channel: c.channel, status: c.status })),
    },
    'notifyPatientOfDoctorReplay: fan-out complete',
  );

  return result;
}

export type NotifyDoctorOfPatientReplayResult =
  | { ok: true; eventId: string; inserted: boolean }
  | { skipped: true; reason: string };

/**
 * Insert a `doctor_dashboard_events` row so the doctor sees "your
 * patient replayed this consult" on their next dashboard load. NO DM /
 * SMS / email — Decision 4 carves out doctor-facing replay notifications
 * as dashboard-only.
 *
 * Same idempotency pattern as the patient-side helper: deduped on
 * `recordingAccessAuditId` via the dashboard-events service's
 * pre-insert check.
 *
 * Fire-and-forget at the call site. The helper swallows insert failures
 * (logs at error) and returns a structured result — never throws.
 *
 * `accessedByRole` covers both `'patient'` (patient self-serve replay)
 * and `'support_staff'` (Decision 4 escalation; the doctor is the
 * consent holder per Task 29 Notes #11). The payload tags the role so
 * the dashboard UI can render distinct copy for the two cases.
 */
export async function notifyDoctorOfPatientReplay(input: {
  sessionId:              string;
  artifactType:           RecordingReplayedArtifactType;
  recordingAccessAuditId: string;
  accessedByRole:         'patient' | 'support_staff';
  accessedByUserId:       string;
  escalationReason?:      string;
  correlationId:          string;
  /**
   * Plan 07 Task 32: tags the dashboard-event payload so the feed UI can
   * distinguish "downloaded the transcript" from "replayed the audio".
   * Defaults to `'reviewed'` to keep every existing call site's payload
   * shape. See `notifyPatientOfDoctorReplay` for the full semantics.
   */
  actionKind?:            'reviewed' | 'downloaded';
}): Promise<NotifyDoctorOfPatientReplayResult> {
  const {
    sessionId,
    artifactType,
    recordingAccessAuditId,
    accessedByRole,
    accessedByUserId,
    escalationReason,
    correlationId,
  } = input;
  const actionKind = input.actionKind ?? 'reviewed';

  const skipped = (reason: string): { skipped: true; reason: string } => {
    logger.info(
      { correlationId, sessionId, recordingAccessAuditId, reason },
      'notifyDoctorOfPatientReplay: skipped',
    );
    return { skipped: true, reason };
  };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return skipped('admin_client_unavailable');
  }

  const ctx = await loadReplayNotificationContext(admin, sessionId, correlationId);
  if (!ctx) {
    return skipped('session_not_found');
  }

  const replayedAtIso = new Date().toISOString();

  // Plan 08 Task 44: split the doctor-dashboard feed kind on artifact
  // type. `'video'` replays surface as `patient_replayed_video` so the
  // UI can fork on `event_kind` (and render a 🎥 indicator) without
  // parsing the payload. Audio + transcript stay on the baseline
  // `patient_replayed_recording` kind — Task 30 + Task 32 call sites
  // are unchanged.
  const eventKind: 'patient_replayed_recording' | 'patient_replayed_video' =
    artifactType === 'video' ? 'patient_replayed_video' : 'patient_replayed_recording';

  try {
    const result = await insertDashboardEvent({
      doctorId:    ctx.doctorId,
      eventKind,
      sessionId,
      payload: {
        artifact_type:             artifactType,
        action_kind:               actionKind,
        recording_access_audit_id: recordingAccessAuditId,
        patient_display_name:      ctx.patientDisplayName,
        replayed_at:               replayedAtIso,
        consult_date:              ctx.consultEndedAtIso,
        accessed_by_role:          accessedByRole,
        accessed_by_user_id:       accessedByUserId,
        ...(escalationReason ? { escalation_reason: escalationReason } : {}),
      },
      recordingAccessAuditId,
    });

    logger.info(
      {
        correlationId,
        sessionId,
        doctorId: ctx.doctorId,
        eventId:  result.eventId,
        inserted: result.inserted,
        artifactType,
        eventKind,
      },
      'notifyDoctorOfPatientReplay: dashboard event ' +
        (result.inserted ? 'inserted' : 'deduped'),
    );

    return { ok: true, eventId: result.eventId, inserted: result.inserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, sessionId, doctorId: ctx.doctorId, error: message },
      'notifyDoctorOfPatientReplay: insert failed',
    );
    return { skipped: true, reason: 'insert_failed' };
  }
}

// ============================================================================
// Plan 07 · Task 31 — post-consult chat-history DM
// ============================================================================

/** TTL of the patient self-serve chat-history HMAC link. See Notes #1 in
 * `task-31-post-consult-chat-history-surface.md` for the 90-day choice
 * (matches the recording-replay TTL from Decision 4). The underlying
 * RLS / data is indefinite per Decision 1 sub-decision LOCKED — only the
 * URL is bounded so a leaked link doesn't grant multi-year access. */
const POST_CONSULT_CHAT_HISTORY_HMAC_TTL_SECONDS = 90 * 24 * 60 * 60;

export type SendPostConsultChatHistoryDmResult =
  | FanOutResult
  | { skipped: true; reason: string };

/**
 * Fan out the post-consult chat-history DM to the patient. Fires from
 * `consultation-session-service.ts#endSession` after the status flip
 * (fire-and-forget — see Notes #4 in task-31).
 *
 * **Channels:** IG-DM + SMS in parallel (same shape as
 * `notifyPatientOfDoctorReplay`). Email is intentionally omitted —
 * the booking confirmation + payment receipt + prescription delivery
 * already saturate the patient's email channel; one more "your consult
 * is complete" email would dilute those signals. The IG-DM + SMS
 * combination is high-reach for the bot-booked patient cohort.
 *
 * **Doctor receives no DM** — they access the history from the
 * dashboard's "View conversation" link. Mirrors the doctor-side carve-
 * out from Decision 4 / Plan 07 Task 30.
 *
 * **Idempotency:** keyed on `consultation_sessions.post_consult_dm_sent_at`
 * (column added in migration 067). A second call after the first dispatch
 * returns `{ skipped: true, reason: 'already_sent' }` without re-fanning.
 * The column is set even when every channel fails so a tight retry loop
 * doesn't hammer providers — the failure is recorded in the audit log
 * for a future reconciliation cron.
 *
 * **Never throws.** Per-channel failures surface in the returned
 * `FanOutResult.channels`. Pre-check failures + missing-context paths
 * return `{ skipped: true, reason }`. The call site uses fire-and-forget
 * semantics — a thrown error here would bubble into `endSession` and
 * incorrectly fail the session-end transaction on a transient IG-DM
 * outage.
 */
export async function sendPostConsultChatHistoryDm(input: {
  sessionId:     string;
  correlationId: string;
}): Promise<SendPostConsultChatHistoryDmResult> {
  const { sessionId, correlationId } = input;
  const attemptedAt = new Date().toISOString();

  const skipped = (reason: string): { skipped: true; reason: string } => {
    logger.info(
      { correlationId, sessionId, reason },
      'sendPostConsultChatHistoryDm: skipped',
    );
    return { skipped: true, reason };
  };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return skipped('admin_client_unavailable');
  }

  // Load session + dedup column. Selecting only the columns we need so
  // the PHI surface stays minimal.
  const { data: sessionRow, error: sessionErr } = await admin
    .from('consultation_sessions')
    .select(
      'id, appointment_id, doctor_id, patient_id, actual_ended_at, post_consult_dm_sent_at',
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionErr || !sessionRow) {
    logger.warn(
      { correlationId, sessionId, error: sessionErr?.message },
      'sendPostConsultChatHistoryDm: session lookup failed',
    );
    return skipped('session_not_found');
  }

  const session = sessionRow as {
    id: string;
    appointment_id: string;
    doctor_id: string;
    patient_id: string | null;
    actual_ended_at: string | null;
    post_consult_dm_sent_at: string | null;
  };

  // Idempotency guard.
  if (session.post_consult_dm_sent_at) {
    return skipped('already_sent');
  }

  // Patient-less sessions (rare — guest bookings without a `patients`
  // row) get a no-op skip; there's nobody to DM.
  if (!session.patient_id) {
    return skipped('no_patient_on_session');
  }

  // The DM is meaningless without a date anchor and a base URL.
  if (!session.actual_ended_at) {
    // endSession sets actual_ended_at before this helper fires; an empty
    // value here means an upstream wiring bug or the helper was called
    // outside the endSession path.
    return skipped('session_not_ended');
  }

  const baseUrl = env.APP_BASE_URL?.trim();
  if (!baseUrl) {
    logger.warn(
      { correlationId, sessionId },
      'sendPostConsultChatHistoryDm: APP_BASE_URL unset; cannot compose patient link',
    );
    return skipped('app_base_url_unset');
  }

  // Mint the 90-day HMAC consultation-token. The HMAC payload key is
  // `appointmentId` (existing primitive shape) — the patient-side
  // `/c/history/[sessionId]?t=...` route exchanges this for a JWT via
  // the new `/chat-history-token` endpoint, which verifies the HMAC
  // matches the session's appointment.
  let hmacToken: string;
  try {
    hmacToken = generateConsultationToken(session.appointment_id, {
      expiresInSeconds: POST_CONSULT_CHAT_HISTORY_HMAC_TTL_SECONDS,
    });
  } catch (err) {
    logger.warn(
      {
        correlationId,
        sessionId,
        appointmentId: session.appointment_id,
        error: err instanceof Error ? err.message : String(err),
      },
      'sendPostConsultChatHistoryDm: HMAC mint failed (CONSULTATION_TOKEN_SECRET missing?)',
    );
    return skipped('hmac_mint_failed');
  }

  const joinUrl = `${baseUrl.replace(/\/$/, '')}/c/history/${session.id}?t=${hmacToken}`;

  // Resolve the patient's reachable channels + practice name. Reuses
  // the same helper as `sendConsultationReadyToPatient` — pivoting on
  // the appointment id (the helper joins `patients` + `conversations`
  // + `doctor_settings`).
  const channels = await resolvePatientNotificationChannels(
    admin,
    session.appointment_id,
    correlationId,
  );
  if (!channels) {
    return skipped('appointment_not_found');
  }
  if (!channels.phone && !channels.igRecipientId) {
    return skipped('no_channels');
  }

  const consultDateLabel = formatConsultDateLabel(session.actual_ended_at);
  let messageBody: string;
  try {
    messageBody = buildPostConsultChatLinkDm({
      practiceName: channels.practiceName,
      joinUrl,
      consultDateLabel,
    });
  } catch (err) {
    logger.warn(
      {
        correlationId,
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      },
      'sendPostConsultChatHistoryDm: copy builder threw',
    );
    return skipped('copy_builder_failed');
  }

  // Dispatch IG-DM + SMS in parallel. Same Promise.allSettled pattern
  // as `notifyPatientOfDoctorReplay` — email deliberately omitted
  // (rationale at the top of this function).
  const smsTask = (async (): Promise<FanOutChannelOutcome> => {
    if (!channels.phone) {
      return { channel: 'sms', status: 'skipped', reason: 'no_recipient' };
    }
    try {
      const sent = await sendSms(channels.phone, messageBody, correlationId);
      return sent
        ? { channel: 'sms', status: 'sent' }
        : { channel: 'sms', status: 'failed', error: 'sms_send_returned_false' };
    } catch (err) {
      return {
        channel: 'sms',
        status:  'failed',
        error:   err instanceof Error ? err.message : String(err),
      };
    }
  })();

  const igTask = (async (): Promise<FanOutChannelOutcome> => {
    if (!channels.igRecipientId) {
      return { channel: 'instagram_dm', status: 'skipped', reason: 'no_recipient' };
    }
    try {
      const resp = await sendInstagramMessage(
        channels.igRecipientId,
        messageBody,
        correlationId,
        channels.igDoctorToken ?? undefined,
      );
      return {
        channel:           'instagram_dm',
        status:            'sent',
        providerMessageId: resp?.message_id,
      };
    } catch (err) {
      return {
        channel: 'instagram_dm',
        status:  'failed',
        error:   err instanceof Error ? err.message : String(err),
      };
    }
  })();

  const settled = await Promise.allSettled([smsTask, igTask]);
  const channelOutcomes: FanOutChannelOutcome[] = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    const channel: FanOutChannelOutcome['channel'] = i === 0 ? 'sms' : 'instagram_dm';
    return {
      channel,
      status: 'failed',
      error:  s.reason instanceof Error ? s.reason.message : String(s.reason),
    };
  });
  const anySent = channelOutcomes.some((c) => c.status === 'sent');

  // Stamp the dedup column whenever we attempted (even on full failure)
  // so a tight retry loop doesn't hammer providers. A future
  // reconciliation cron can scan for `post_consult_dm_sent_at IS NOT
  // NULL AND audit_log.any_sent = false` rows to decide on retries.
  // Best-effort — failure here doesn't affect the returned result.
  await admin
    .from('consultation_sessions')
    .update({ post_consult_dm_sent_at: attemptedAt })
    .eq('id', sessionId)
    .then(({ error }) => {
      if (error) {
        logger.warn(
          { correlationId, sessionId, error: error.message },
          'consultation_sessions.post_consult_dm_sent_at update failed (non-fatal)',
        );
      }
    });

  // Audit the fan-out attempt. Status mirrors `anySent` so a future
  // retry cron can sweep failures without re-querying provider responses.
  try {
    await logAuditEvent({
      correlationId,
      action: 'post_consult_chat_history_notification',
      resourceType: 'consultation_session',
      resourceId: sessionId,
      status: anySent ? 'success' : 'failure',
      errorMessage: anySent
        ? undefined
        : 'no channel succeeded for post-consult chat-history DM',
      metadata: {
        any_sent: anySent,
        channels: channelOutcomes.map((c) =>
          c.status === 'sent'
            ? { channel: c.channel, status: c.status }
            : c.status === 'skipped'
              ? { channel: c.channel, status: c.status, reason: c.reason }
              : { channel: c.channel, status: c.status, error: c.error },
        ),
      },
    });
  } catch (err) {
    logger.error(
      { correlationId, sessionId, error: err instanceof Error ? err.message : String(err) },
      'sendPostConsultChatHistoryDm: audit log write failed',
    );
  }

  const result: FanOutResult = {
    sessionOrPrescriptionId: sessionId,
    attemptedAt,
    channels:                channelOutcomes,
    anySent,
  };

  logger.info(
    {
      correlationId,
      sessionId,
      any_sent: anySent,
      channels: channelOutcomes.map((c) => ({ channel: c.channel, status: c.status })),
    },
    'sendPostConsultChatHistoryDm: fan-out complete',
  );

  return result;
}
