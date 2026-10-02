/**
 * Public clinic checkout (clk-03).
 * Creates a patient and appointment with no conversation.
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { DoctorNotVerifiedError, InternalError, UnauthorizedError, ValidationError } from '../utils/errors';
import { verifyBookingToken } from '../utils/booking-token';
import { findVisitPageLink, isVisitPageCode } from './visit-page-link-service';
import { handleSupabaseError } from '../utils/db-helpers';
import { getDoctorSettings } from './doctor-settings-service';
import { isSlotOpenForVisit } from './availability-service';
import { resolveSessionDayMode } from './opd/opd-mode-service';
import { isDoctorVerified } from './doctor-verification-service';
import { bookAppointment } from './appointment-service';
import { getQueueTokenForAppointment } from './opd/opd-queue-service';
import { createPaymentLink } from './payment-service';
import { getDoctorGatewayPublicStatus } from './doctor-gateway-credentials-service';
import { resolvePayableAmountMinor } from '../utils/prepaid-bookings';
import { buildDuplicateBookingOnDateMessage } from '../utils/dm-copy';
import {
  createPatientForPublicClinic,
  ensurePatientMrnIfEligible,
  type PublicClinicSex,
} from './patient-service';
import {
  applyPublicBookingSelectionsToState,
  computeSlotBookingQuote,
  recordTokenCheckoutOnConversation,
} from './slot-selection-service';
import { findConversationById, getConversationState } from './conversation-service';
import type { ConversationState } from '../types/conversation';
import type { OpdMode } from '../types/doctor-settings';
import { resolveDoctorIdByPublicSlug } from './public-clinic-booking-service';
import { sendPublicClinicBookingSms } from './public-clinic-booking-sms';
import { buildHistoryFormPath } from '../utils/booking-page-url';

export type PublicClinicCheckoutInput = {
  slug: string;
  slotStart: string;
  patientName: string;
  patientPhone: string;
  patientAge: number;
  patientSex: PublicClinicSex;
  reasonForVisit: string;
  consentGranted: boolean;
  catalogServiceKey?: string;
  catalogServiceId?: string;
  consultationModality?: 'text' | 'voice' | 'video';
  /** Optional booking token from `?c=`. Ignored when it does not match this practice. */
  conversationToken?: string;
};

export type PublicClinicCheckoutResult = {
  paymentUrl: string | null;
  redirectUrl: string;
  appointmentId: string;
  opdMode: OpdMode;
  tokenNumber?: number;
  prepPath?: string;
};

type OptionalConversation =
  | { kind: 'none' }
  | { kind: 'reschedule' }
  | { kind: 'attach'; conversationId: string };

/** Missing, expired, or other-doctor tokens book unattached. A matching reschedule token is not a new visit. */
async function resolveOptionalConversation(
  token: string | undefined,
  doctorId: string,
  correlationId: string
): Promise<OptionalConversation> {
  const raw = token?.trim();
  if (!raw) return { kind: 'none' };
  if (isVisitPageCode(raw)) {
    const link = await findVisitPageLink(raw, correlationId);
    if (!link || link.doctorId !== doctorId) return { kind: 'none' };
    const conversation = await findConversationById(link.conversationId, correlationId);
    if (!conversation || conversation.doctor_id !== doctorId) return { kind: 'none' };
    return { kind: 'attach', conversationId: link.conversationId };
  }
  let verified: ReturnType<typeof verifyBookingToken>;
  try {
    verified = verifyBookingToken(raw);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { kind: 'none' };
    throw err;
  }
  if (verified.doctorId !== doctorId) return { kind: 'none' };
  if (verified.appointmentId) return { kind: 'reschedule' };
  const conversation = await findConversationById(verified.conversationId, correlationId);
  if (!conversation || conversation.doctor_id !== doctorId) return { kind: 'none' };
  return { kind: 'attach', conversationId: verified.conversationId };
}

function publicClinicSuccessUrl(): string {
  const baseUrl = env.BOOKING_PAGE_URL?.trim() || 'https://example.com/book';
  return `${baseUrl.replace(/\/$/, '')}/success`;
}

/** Same day window as token checkout. Matches any row for this phone, including ones that already have a patient. */
async function publicClinicHasVisitOnDate(
  doctorId: string,
  phone: string,
  dateStr: string,
  correlationId: string
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for booking');
  }
  const rangeStart = `${dateStr}T00:00:00.000Z`;
  const [y, m, d] = dateStr.split('-').map(Number);
  const nextDay = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + 1));
  const { data, error } = await admin
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_phone', phone)
    .in('status', ['pending', 'confirmed'])
    .gte('appointment_date', rangeStart)
    .lt('appointment_date', nextDay.toISOString())
    .limit(1);
  if (error) {
    handleSupabaseError(error, correlationId);
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Book from /d/:slug. No conversation. Success URL is the booking success page.
 */
export async function processPublicClinicCheckout(
  input: PublicClinicCheckoutInput,
  correlationId: string
): Promise<PublicClinicCheckoutResult> {
  if (input.consentGranted !== true) {
    throw new ValidationError('Consent is required');
  }
  const reason = input.reasonForVisit.trim();
  if (!reason) {
    throw new ValidationError('Reason is required');
  }

  const slotDate = new Date(input.slotStart);
  if (isNaN(slotDate.getTime())) {
    throw new ValidationError('Invalid slotStart format (expected ISO datetime)');
  }
  if (slotDate < new Date()) {
    throw new ValidationError('Cannot select a slot in the past');
  }

  const doctorId = await resolveDoctorIdByPublicSlug(input.slug, correlationId);
  const settings = await getDoctorSettings(doctorId);
  const doctorVerified = await isDoctorVerified(doctorId, correlationId);
  if (!doctorVerified) {
    throw new DoctorNotVerifiedError();
  }

  const optionalConversation = await resolveOptionalConversation(
    input.conversationToken,
    doctorId,
    correlationId
  );
  if (optionalConversation.kind === 'reschedule') {
    throw new ValidationError('This link changes an existing visit. Open it from the chat.');
  }

  const dateStr = input.slotStart.slice(0, 10);
  if (await publicClinicHasVisitOnDate(doctorId, input.patientPhone.trim(), dateStr, correlationId)) {
    const tz = settings?.timezone ?? 'Asia/Kolkata';
    const dateDisplay = slotDate.toLocaleDateString('en-US', {
      timeZone: tz,
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    throw new ValidationError(
      buildDuplicateBookingOnDateMessage({ language: 'en', dateDisplay })
    );
  }

  const patient = await createPatientForPublicClinic(
    doctorId,
    {
      name: input.patientName,
      phone: input.patientPhone,
      age: input.patientAge,
      sex: input.patientSex,
    },
    correlationId
  );

  const baseState: ConversationState =
    optionalConversation.kind === 'attach'
      ? await getConversationState(optionalConversation.conversationId, correlationId)
      : { updatedAt: new Date().toISOString() };
  const effectiveState = applyPublicBookingSelectionsToState(
    baseState,
    settings,
    {
      catalogServiceKey: input.catalogServiceKey,
      catalogServiceId: input.catalogServiceId,
      consultationModality: input.consultationModality,
    },
    false
  );

  const quotePreview = await computeSlotBookingQuote(
    doctorId,
    patient.id,
    effectiveState,
    settings,
    correlationId
  );

  const notesRaw = settings?.default_notes?.trim() ?? '';
  const notes = notesRaw.length > 1000 ? notesRaw.slice(0, 1000) : notesRaw || undefined;
  const modality = effectiveState.serviceMatch?.consultationModality;
  if (modality === 'text' || modality === 'voice' || modality === 'video') {
    const open = await isSlotOpenForVisit({
      doctorId,
      slotStartIso: slotDate.toISOString(),
      visit: modality,
      timezone: settings?.timezone ?? 'Asia/Kolkata',
      correlationId,
      slotIntervalMinutes: settings?.slot_interval_minutes,
    });
    if (!open) {
      throw new ValidationError('That time is not open for this visit.');
    }
  }

  const appointment = await bookAppointment(
    {
      doctorId,
      patientId: patient.id,
      patientName: patient.name,
      patientPhone: patient.phone,
      appointmentDate: slotDate.toISOString(),
      reasonForVisit: reason,
      notes,
      bookingOrigin: 'booked',
      ...(optionalConversation.kind === 'attach'
        ? { conversationId: optionalConversation.conversationId }
        : {}),
      ...(modality ? { consultationType: modality } : {}),
      ...(quotePreview.pricingSource === 'catalog_quote' && quotePreview.catalogServiceKey
        ? { catalogServiceKey: quotePreview.catalogServiceKey }
        : {}),
      ...(quotePreview.pricingSource === 'catalog_quote' && quotePreview.catalogServiceId
        ? { catalogServiceId: quotePreview.catalogServiceId }
        : {}),
      ...(quotePreview.episodeId ? { episodeId: quotePreview.episodeId } : {}),
    },
    correlationId
  );

  const adminClient = getSupabaseAdminClient();
  const sessionResolved =
    adminClient != null
      ? await resolveSessionDayMode(adminClient, doctorId, dateStr)
      : { mode: settings?.opd_mode === 'queue' ? ('queue' as const) : ('slot' as const) };
  const opdMode = sessionResolved.mode;
  let tokenNumber: number | undefined;
  if (opdMode === 'queue') {
    const q = await getQueueTokenForAppointment(appointment.id, correlationId);
    if (q != null) tokenNumber = q;
  }

  const collectionMode = settings?.payment_collection_mode ?? 'bookings_only';
  const prepaidEnabled = collectionMode === 'prepaid';
  if (prepaidEnabled) {
    const gateway = await getDoctorGatewayPublicStatus(doctorId, correlationId);
    if (!gateway.connected) {
      throw new ValidationError('Prepaid bookings require a connected Razorpay account');
    }
    if (!gateway.webhookConfigured) {
      throw new ValidationError('Prepaid bookings require a Razorpay webhook secret');
    }
  }

  const amountMinor = resolvePayableAmountMinor(quotePreview.amountMinor, prepaidEnabled);
  const redirectUrl = publicClinicSuccessUrl();
  let prepPath: string | undefined;
  try {
    prepPath = buildHistoryFormPath({
      id: appointment.id,
      status: appointment.status,
      scheduledEnd: new Date(
        slotDate.getTime() + (settings?.slot_interval_minutes ?? 15) * 60 * 1000
      ),
    });
  } catch {
    prepPath = undefined;
  }

  async function confirmAttachedConversation(): Promise<void> {
    if (optionalConversation.kind !== 'attach') return;
    await recordTokenCheckoutOnConversation({
      conversationId: optionalConversation.conversationId,
      doctorId,
      patientId: patient.id,
      slotStart: input.slotStart,
      state: baseState,
      effectiveState,
      correlationId,
    });
  }

  async function notifyBooked(): Promise<void> {
    await confirmAttachedConversation();
    try {
      await sendPublicClinicBookingSms(appointment.id, correlationId);
    } catch {
      logger.info({ correlationId, appointmentId: appointment.id }, 'public_clinic_booking_sms_failed');
    }
  }

  if (!amountMinor || amountMinor <= 0) {
    await ensurePatientMrnIfEligible(patient.id, correlationId);
    await notifyBooked();
    return {
      paymentUrl: null,
      redirectUrl,
      appointmentId: appointment.id,
      opdMode,
      ...(tokenNumber != null ? { tokenNumber } : {}),
      ...(prepPath ? { prepPath } : {}),
    };
  }

  const tz = settings?.timezone ?? 'Asia/Kolkata';
  const slotDisplayStr = slotDate.toLocaleString('en-US', {
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
      currency: quotePreview.currency,
      doctorCountry: quotePreview.doctorCountry,
      doctorId,
      patientId: patient.id,
      patientName: patient.name,
      patientPhone: patient.phone,
      description:
        opdMode === 'queue' ? `Queue visit - ${slotDisplayStr}` : `Appointment - ${slotDisplayStr}`,
      callbackUrl: redirectUrl,
      ...(quotePreview.quoteMetadata ? { quoteMetadata: quotePreview.quoteMetadata } : {}),
    },
    correlationId
  );
  await notifyBooked();

  return {
    paymentUrl: paymentResult.url,
    redirectUrl,
    appointmentId: appointment.id,
    opdMode,
    ...(tokenNumber != null ? { tokenNumber } : {}),
    ...(prepPath ? { prepPath } : {}),
  };
}
