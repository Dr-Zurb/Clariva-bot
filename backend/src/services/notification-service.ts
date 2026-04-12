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
    .select('id, patient_id, doctor_id, conversation_id')
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
