/**
 * Slot Selection Service (e-task-3)
 *
 * Handles external slot picker flow: save selection, send proactive message, return redirect URL.
 * No PHI in logs; slot time only in message.
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import {
  findConversationById,
  getConversationState,
  updateConversationState,
} from './conversation-service';
import { getConnectionStatus } from './instagram-connect-service';
import { getInstagramAccessTokenForDoctor } from './instagram-connect-service';
import { sendInstagramMessage } from './instagram-service';
import { getDoctorSettings } from './doctor-settings-service';
import { findPatientByIdWithAdmin } from './patient-service';
import {
  bookAppointment,
  getAppointmentByIdForWorker,
  hasAppointmentOnDate,
  updateAppointmentDateForPatient,
} from './appointment-service';
import { createPaymentLink } from './payment-service';
import { verifyBookingToken, generateBookingToken } from '../utils/booking-token';
import { sendAppointmentRescheduledToDoctor } from './notification-service';
import { logger } from '../config/logger';
import { InternalError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors';
import { resolveOpdModeFromSettings } from './opd/opd-mode-service';
import { getQueueTokenForAppointment } from './opd/opd-queue-service';
import type { OpdMode } from '../types/doctor-settings';

/**
 * Save or overwrite slot selection for a conversation.
 * Upserts by conversation_id (one draft per conversation).
 */
export async function saveSlotSelection(
  conversationId: string,
  doctorId: string,
  slotStart: string,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { error } = await admin
    .from('slot_selections')
    .upsert(
      {
        conversation_id: conversationId,
        doctor_id: doctorId,
        slot_start: slotStart,
      },
      { onConflict: 'conversation_id' }
    );

  if (error) {
    const { handleSupabaseError } = await import('../utils/db-helpers');
    handleSupabaseError(error, correlationId);
  }
}

/**
 * Get redirect URL for doctor (Instagram DM).
 * Returns https://instagram.com/{username} or fallback to instagram.com.
 */
export async function getRedirectUrlForDoctor(doctorId: string): Promise<string> {
  const status = await getConnectionStatus(doctorId);
  const username = status.username?.trim();
  if (username) {
    return `https://instagram.com/${username.replace(/^@/, '')}`;
  }
  return 'https://instagram.com';
}

/**
 * Format slot for display (e.g. "Tuesday Mar 14 at 2:00 PM").
 */
function formatSlotForDisplay(slotStart: string, timezone: string): string {
  const d = new Date(slotStart);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return formatter.format(d);
}

/**
 * Build booking page URL with token.
 */
export function buildBookingPageUrl(conversationId: string, doctorId: string): string {
  const baseUrl = env.BOOKING_PAGE_URL?.trim() || 'https://example.com/book';
  const token = generateBookingToken(conversationId, doctorId);
  return `${baseUrl.replace(/\/$/, '')}?token=${token}`;
}

/**
 * Build reschedule page URL with token including appointmentId.
 * Same base URL as booking; token encodes reschedule mode.
 */
export function buildReschedulePageUrl(
  conversationId: string,
  doctorId: string,
  appointmentId: string
): string {
  const baseUrl = env.BOOKING_PAGE_URL?.trim() || 'https://example.com/book';
  const token = generateBookingToken(conversationId, doctorId, { appointmentId });
  return `${baseUrl.replace(/\/$/, '')}?token=${token}`;
}

export interface ProcessSlotSelectionResult {
  success: boolean;
  redirectUrl: string;
}

/**
 * Process slot selection: verify token, save, update conversation state, send proactive message.
 *
 * @param token - Booking token from request
 * @param slotStart - ISO datetime string
 * @param correlationId - Request correlation ID
 * @returns { success, redirectUrl }
 */
export async function processSlotSelection(
  token: string,
  slotStart: string,
  correlationId: string
): Promise<ProcessSlotSelectionResult> {
  const { conversationId, doctorId } = verifyBookingToken(token);

  const slotDate = new Date(slotStart);
  if (isNaN(slotDate.getTime())) {
    throw new ValidationError('Invalid slotStart format (expected ISO datetime)');
  }
  if (slotDate < new Date()) {
    throw new ValidationError('Cannot select a slot in the past');
  }

  const conversation = await findConversationById(conversationId, correlationId);
  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }
  if (conversation.doctor_id !== doctorId) {
    throw new UnauthorizedError('Token does not match conversation');
  }

  const slotEnd = new Date(slotDate.getTime() + 30 * 60 * 1000);
  const doctorSettings = await getDoctorSettings(doctorId);
  const timezone = doctorSettings?.timezone ?? 'Asia/Kolkata';
  const dateStr = formatSlotForDisplay(slotStart, timezone);

  await saveSlotSelection(conversationId, doctorId, slotStart, correlationId);

  const state = await getConversationState(conversationId, correlationId);
  const newState = {
    ...state,
    step: 'confirming_slot',
    slotToConfirm: {
      start: slotDate.toISOString(),
      end: slotEnd.toISOString(),
      dateStr,
    },
    updatedAt: new Date().toISOString(),
  };
  await updateConversationState(conversationId, newState, correlationId);

  const redirectUrl = await getRedirectUrlForDoctor(doctorId);
  const bookingLink = buildBookingPageUrl(conversationId, doctorId);
  const message =
    `You selected **${dateStr}**. Reply Yes to confirm, or No to pick another time. [Change slot](${bookingLink})`;

  const recipientId = conversation.platform_conversation_id;
  if (!recipientId || conversation.platform !== 'instagram') {
    return { success: true, redirectUrl };
  }

  const accessToken = await getInstagramAccessTokenForDoctor(doctorId, correlationId);
  if (accessToken) {
    try {
      await sendInstagramMessage(recipientId, message, correlationId, accessToken);
    } catch {
      // Fail-open: selection saved, state updated; user can still confirm in chat
    }
  }

  return { success: true, redirectUrl };
}

export interface ProcessSlotSelectionAndPayResult {
  paymentUrl: string | null;
  redirectUrl: string;
  appointmentId: string;
  opdMode: OpdMode;
  tokenNumber?: number;
}

/**
 * Process slot selection and pay: create appointment + payment link in one call.
 * Unified flow: no "Reply Yes to confirm" in chat.
 *
 * @param token - Booking token from request
 * @param slotStart - ISO datetime string
 * @param correlationId - Request correlation ID
 * @returns { paymentUrl, redirectUrl, appointmentId }
 * @throws ConflictError when slot is taken
 */
export async function processSlotSelectionAndPay(
  token: string,
  slotStart: string,
  correlationId: string
): Promise<ProcessSlotSelectionAndPayResult> {
  const { conversationId, doctorId } = verifyBookingToken(token);

  const slotDate = new Date(slotStart);
  if (isNaN(slotDate.getTime())) {
    throw new ValidationError('Invalid slotStart format (expected ISO datetime)');
  }
  if (slotDate < new Date()) {
    throw new ValidationError('Cannot select a slot in the past');
  }

  const conversation = await findConversationById(conversationId, correlationId);
  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }
  if (conversation.doctor_id !== doctorId) {
    throw new UnauthorizedError('Token does not match conversation');
  }

  const state = await getConversationState(conversationId, correlationId);
  const patientIdToUse = state.bookingForPatientId ?? conversation.patient_id;
  const patient = await findPatientByIdWithAdmin(patientIdToUse, correlationId);
  if (!patient || !patient.name || !patient.phone) {
    throw new NotFoundError('Patient details not found. Please complete the booking flow in chat first.');
  }

  const doctorSettings = await getDoctorSettings(doctorId);
  const dateStr = slotStart.slice(0, 10);
  const alreadyHasAppointment = await hasAppointmentOnDate(
    doctorId,
    patient.id,
    patient.name,
    patient.phone,
    dateStr,
    correlationId
  );
  if (alreadyHasAppointment) {
    const tz = doctorSettings?.timezone ?? 'Asia/Kolkata';
    const dateDisplay = new Date(slotDate).toLocaleDateString('en-US', {
      timeZone: tz,
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    throw new ValidationError(
      `You already have an appointment on ${dateDisplay}. Please choose another date or contact us if you need multiple visits.`
    );
  }

  const reasonForVisit = state.reasonForVisit ?? 'Not provided';
  const parts: string[] = [];
  if (state.extraNotes?.trim()) parts.push(state.extraNotes.trim());
  if (doctorSettings?.default_notes?.trim()) parts.push(doctorSettings.default_notes.trim());
  const NOTES_MAX_LEN = 1000;
  const combined = parts.length > 0 ? parts.join('. ') : '';
  const notes = combined.length > NOTES_MAX_LEN ? combined.slice(0, NOTES_MAX_LEN) : (combined || undefined);

  const appointment = await bookAppointment(
    {
      doctorId,
      patientId: patient.id,
      patientName: patient.name,
      patientPhone: patient.phone,
      appointmentDate: slotDate.toISOString(),
      reasonForVisit,
      notes,
      consultationType: state.consultationType,
      conversationId: conversationId,
    },
    correlationId,
    undefined
  );

  const opdMode = resolveOpdModeFromSettings(doctorSettings);
  let tokenNumber: number | undefined;
  if (opdMode === 'queue') {
    const q = await getQueueTokenForAppointment(appointment.id, correlationId);
    if (q != null) {
      tokenNumber = q;
    }
  }

  const amountMinor = doctorSettings?.appointment_fee_minor ?? env.APPOINTMENT_FEE_MINOR ?? 0;
  const currency = doctorSettings?.appointment_fee_currency ?? env.APPOINTMENT_FEE_CURRENCY ?? 'INR';
  const doctorCountry = doctorSettings?.country ?? env.DEFAULT_DOCTOR_COUNTRY ?? 'IN';

  const redirectUrl = await getRedirectUrlForDoctor(doctorId);
  const baseUrl = env.BOOKING_PAGE_URL?.trim() || 'https://example.com/book';
  const successCallbackUrl = `${baseUrl.replace(/\/$/, '')}/success?token=${token}`;

  if (!amountMinor || amountMinor <= 0) {
    await saveSlotSelection(conversationId, doctorId, slotStart, correlationId);
    const newState = {
      ...state,
      step: 'responded',
      slotToConfirm: undefined,
      bookingForPatientId: undefined,
      lastBookingPatientId: patient.id,
      updatedAt: new Date().toISOString(),
    };
    await updateConversationState(conversationId, newState, correlationId);
    return {
      paymentUrl: null,
      redirectUrl,
      appointmentId: appointment.id,
      opdMode,
      ...(tokenNumber != null ? { tokenNumber } : {}),
    };
  }

  const tz = doctorSettings?.timezone ?? 'Asia/Kolkata';
  const slotDisplayStr = new Date(slotDate).toLocaleString('en-US', {
    timeZone: tz,
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const paymentResult = await createPaymentLink(
    {
      appointmentId: appointment.id,
      amountMinor,
      currency,
      doctorCountry,
      doctorId,
      patientId: patient.id,
      patientName: patient.name,
      patientPhone: patient.phone,
      patientEmail: patient.email ?? undefined,
      description:
        opdMode === 'queue'
          ? `Queue visit — ${slotDisplayStr}`
          : `Appointment - ${slotDisplayStr}`,
      callbackUrl: successCallbackUrl,
    },
    correlationId
  );

  await saveSlotSelection(conversationId, doctorId, slotStart, correlationId);
  const newState = {
    ...state,
    step: 'responded',
    slotToConfirm: undefined,
    bookingForPatientId: undefined,
    lastBookingPatientId: patient.id,
    updatedAt: new Date().toISOString(),
  };
  await updateConversationState(conversationId, newState, correlationId);

  return {
    paymentUrl: paymentResult.url,
    redirectUrl,
    appointmentId: appointment.id,
    opdMode,
    ...(tokenNumber != null ? { tokenNumber } : {}),
  };
}

export interface ProcessRescheduleSlotResult {
  success: boolean;
  redirectUrl: string;
  appointmentId: string;
}

/**
 * Process reschedule slot selection: update appointment date, send confirmation DM.
 *
 * @param token - Booking token with appointmentId (from buildReschedulePageUrl)
 * @param slotStart - ISO datetime string for new slot
 * @param correlationId - Request correlation ID
 * @returns { success, redirectUrl, appointmentId }
 * @throws ConflictError when slot is taken
 */
export async function processRescheduleSlotSelection(
  token: string,
  slotStart: string,
  correlationId: string
): Promise<ProcessRescheduleSlotResult> {
  const { conversationId, doctorId, appointmentId } = verifyBookingToken(token);

  if (!appointmentId) {
    throw new ValidationError('Invalid reschedule token (missing appointment)');
  }

  const slotDate = new Date(slotStart);
  if (isNaN(slotDate.getTime())) {
    throw new ValidationError('Invalid slotStart format (expected ISO datetime)');
  }
  if (slotDate < new Date()) {
    throw new ValidationError('Cannot reschedule to a slot in the past');
  }

  const conversation = await findConversationById(conversationId, correlationId);
  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }
  if (conversation.doctor_id !== doctorId) {
    throw new UnauthorizedError('Token does not match conversation');
  }

  const appointment = await getAppointmentByIdForWorker(appointmentId, correlationId);
  if (!appointment || !appointment.patient_id || appointment.doctor_id !== doctorId) {
    throw new NotFoundError('Appointment not found');
  }

  const updated = await updateAppointmentDateForPatient(
    appointmentId,
    slotDate,
    appointment.patient_id,
    doctorId,
    correlationId
  );

  const doctorSettings = await getDoctorSettings(doctorId);
  const timezone = doctorSettings?.timezone ?? 'Asia/Kolkata';
  const dateStr = formatSlotForDisplay(slotStart, timezone);

  const redirectUrl = await getRedirectUrlForDoctor(doctorId);

  const recipientId = conversation.platform_conversation_id;
  if (recipientId && conversation.platform === 'instagram') {
    const accessToken = await getInstagramAccessTokenForDoctor(doctorId, correlationId);
    if (accessToken) {
      try {
        await sendInstagramMessage(
          recipientId,
          `Your appointment has been rescheduled to **${dateStr}**.`,
          correlationId,
          accessToken
        );
      } catch (err) {
        logger.warn(
          { correlationId, appointmentId, error: err instanceof Error ? err.message : String(err) },
          'Reschedule confirmation DM failed (non-blocking)'
        );
      }
    }
  }

  const oldIso =
    typeof appointment.appointment_date === 'string'
      ? appointment.appointment_date
      : (appointment.appointment_date as Date).toISOString();
  sendAppointmentRescheduledToDoctor(doctorId, appointmentId, oldIso, slotStart, correlationId).catch(
    (err) => {
      logger.warn(
        { correlationId, appointmentId, error: err instanceof Error ? err.message : String(err) },
        'Appointment rescheduled email failed (non-blocking)'
      );
    }
  );

  return { success: true, redirectUrl, appointmentId: updated.id };
}
