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
import type { DoctorSettingsRow } from '../types/doctor-settings';
import type { ConversationState } from '../types/conversation';
import type { ServiceCatalogV1 } from '../utils/service-catalog-schema';
import { findPatientByIdWithAdmin } from './patient-service';
import { getActiveEpisodeForPatientDoctorService } from './care-episode-service';
import {
  findServiceOfferingByKey,
  findServiceOfferingByServiceId,
  getActiveServiceCatalog,
} from '../utils/service-catalog-helpers';
import {
  quoteConsultationVisit,
  type ConsultationModality,
} from './consultation-quote-service';
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
import {
  InternalError,
  NotFoundError,
  ServiceSelectionNotFinalizedPaymentError,
  StaffServiceReviewPendingPaymentError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors';
import { evaluatePublicBookingPaymentGate } from '../utils/public-booking-payment-gate';
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

/** SFU-05: amount resolution for booking-page checkout (catalog quote vs legacy fee). */
export type SlotBookingPricingSource = 'catalog_quote' | 'legacy_fee';

export interface SlotBookingQuoteResult {
  amountMinor: number;
  currency: string;
  doctorCountry: string;
  pricingSource: SlotBookingPricingSource;
  catalogServiceKey?: string;
  catalogServiceId?: string;
  episodeId?: string;
  quoteMetadata?: {
    visit_kind: string;
    service_key: string;
    service_id?: string;
    modality: string;
    episode_id?: string;
  };
}

/** ARM-11: observability when catalog quote cannot resolve (no PHI). */
export type SlotBookingCatalogQuoteBlockReason =
  | 'missing_catalog_service_selection'
  | 'invalid_catalog_service_key'
  | 'invalid_catalog_service_id';

function inferSlotBookingCatalogQuoteBlockReason(
  state: ConversationState,
  catalog: ServiceCatalogV1
): SlotBookingCatalogQuoteBlockReason {
  const idRaw = state.catalogServiceId?.trim();
  if (idRaw && !findServiceOfferingByServiceId(catalog, idRaw)) {
    return 'invalid_catalog_service_id';
  }
  const raw = state.catalogServiceKey?.trim().toLowerCase();
  if (raw && !findServiceOfferingByKey(catalog, raw)) {
    return 'invalid_catalog_service_key';
  }
  return 'missing_catalog_service_selection';
}

function catalogQuoteBlockUserMessage(reason: SlotBookingCatalogQuoteBlockReason): string {
  switch (reason) {
    case 'invalid_catalog_service_id':
    case 'invalid_catalog_service_key':
      return 'Your visit type does not match an active service for this practice. Please return to chat or choose a valid consultation type on the booking page.';
    case 'missing_catalog_service_selection':
    default:
      return 'Please select a consultation service before completing booking.';
  }
}

/**
 * Resolve catalog service_key: explicit state, else single-service default.
 * Multi-service without a resolvable key/id → null (ARM-11: caller must not use legacy fee when catalog exists).
 */
export function resolveCatalogServiceKeyForSlotBooking(
  state: ConversationState,
  catalog: ServiceCatalogV1,
  correlationId: string
): string | null {
  const idRaw = state.catalogServiceId?.trim();
  if (idRaw) {
    const byId = findServiceOfferingByServiceId(catalog, idRaw);
    if (byId) {
      return byId.service_key;
    }
    logger.warn({ correlationId, catalogServiceId: idRaw }, 'slot_booking_catalog_id_not_in_catalog');
    return null;
  }
  const raw = state.catalogServiceKey?.trim().toLowerCase();
  if (raw) {
    if (findServiceOfferingByKey(catalog, raw)) {
      return raw;
    }
    logger.warn({ correlationId, catalogServiceKey: raw }, 'slot_booking_catalog_key_not_in_catalog');
    return null;
  }
  if (catalog.services.length === 1) {
    return catalog.services[0]!.service_key;
  }
  return null;
}

/** Map conversation to teleconsult modality for quoting. */
export function resolveModalityForSlotBooking(
  state: ConversationState,
  consultationType?: ConversationState['consultationType']
): ConsultationModality {
  const m = state.consultationModality;
  if (m === 'text' || m === 'voice' || m === 'video') {
    return m;
  }
  const ct = consultationType ?? state.consultationType;
  if (ct === 'text' || ct === 'voice' || ct === 'video') {
    return ct;
  }
  return 'video';
}

/** SFU-07: Catalog snippet for /book page (single doctor, token-scoped). */
export interface BookingPageCatalogServiceRow {
  service_id: string;
  service_key: string;
  label: string;
  modalities: Partial<
    Record<'text' | 'voice' | 'video', { enabled: true; price_minor: number }>
  >;
}

export interface BookingPageCatalogPayload {
  version: 1;
  services: BookingPageCatalogServiceRow[];
  feeCurrency: string;
}

/**
 * Public booking: offerings for the token’s doctor only (no PHI). `null` when no catalog or reschedule mode.
 */
export function getBookingPageCatalogPayload(
  doctorSettings: DoctorSettingsRow | null,
  mode: 'book' | 'reschedule'
): BookingPageCatalogPayload | null {
  if (mode === 'reschedule') {
    return null;
  }
  const catalog = getActiveServiceCatalog(doctorSettings);
  if (!catalog) {
    return null;
  }
  const rawCur = doctorSettings?.appointment_fee_currency?.trim();
  const feeCurrency =
    rawCur && /^[A-Z]{3}$/.test(rawCur) ? rawCur : 'INR';
  return {
    version: 1,
    services: catalog.services.map((s) => {
      const modalities: BookingPageCatalogServiceRow['modalities'] = {};
      for (const mod of ['text', 'voice', 'video'] as const) {
        const sl = s.modalities[mod];
        if (sl?.enabled === true) {
          modalities[mod] = { enabled: true, price_minor: sl.price_minor };
        }
      }
      return {
        service_id: s.service_id,
        service_key: s.service_key,
        label: s.label,
        modalities,
      };
    }),
    feeCurrency,
  };
}

export interface PublicBookingSelectionInput {
  catalogServiceKey?: string;
  catalogServiceId?: string;
  consultationModality?: ConsultationModality;
}

/**
 * SFU-07: Merge /book POST body + defaults into conversation state for quote + appointment.
 */
export function applyPublicBookingSelectionsToState(
  state: ConversationState,
  doctorSettings: DoctorSettingsRow | null,
  input: PublicBookingSelectionInput,
  isReschedule: boolean
): ConversationState {
  if (isReschedule) {
    return state;
  }
  if (state.consultationType === 'in_clinic') {
    return state;
  }
  const catalog = getActiveServiceCatalog(doctorSettings);
  if (!catalog) {
    return state;
  }

  let serviceKey =
    input.catalogServiceKey?.trim().toLowerCase() ??
    state.catalogServiceKey?.trim().toLowerCase() ??
    undefined;
  const idIn = input.catalogServiceId?.trim() ?? state.catalogServiceId?.trim();
  if (idIn) {
    const byId = findServiceOfferingByServiceId(catalog, idIn);
    if (!byId) {
      throw new ValidationError('Invalid service selection.');
    }
    serviceKey = byId.service_key;
  }
  if (!serviceKey && catalog.services.length === 1) {
    serviceKey = catalog.services[0]!.service_key;
  }
  if (!serviceKey) {
    throw new ValidationError('Please select a consultation service.');
  }

  const offering = findServiceOfferingByKey(catalog, serviceKey);
  if (!offering) {
    throw new ValidationError('Invalid service selection.');
  }
  const catalogServiceId = offering.service_id;

  const enabledModalities: ConsultationModality[] = [];
  for (const mod of ['text', 'voice', 'video'] as const) {
    const slot = offering.modalities[mod];
    if (slot?.enabled === true) {
      enabledModalities.push(mod);
    }
  }
  if (enabledModalities.length === 0) {
    throw new ValidationError('This service has no consultation modes enabled.');
  }

  let modality: ConsultationModality | undefined =
    input.consultationModality ?? state.consultationModality;
  if (modality && !enabledModalities.includes(modality)) {
    throw new ValidationError('Selected consultation mode is not available for this service.');
  }
  if (!modality) {
    if (enabledModalities.length === 1) {
      modality = enabledModalities[0]!;
    } else {
      throw new ValidationError(
        'Please select how you would like to consult: text, voice, or video.'
      );
    }
  }

  return {
    ...state,
    catalogServiceKey: serviceKey,
    catalogServiceId,
    consultationModality: modality,
  };
}

function appointmentConsultationTypeFromState(
  state: ConversationState
): 'in_clinic' | 'text' | 'voice' | 'video' {
  if (state.consultationType === 'in_clinic') {
    return 'in_clinic';
  }
  return resolveModalityForSlotBooking(state, state.consultationType);
}

/**
 * Compute payment amount + SFU metadata for slot booking (before `bookAppointment`).
 * In-clinic visits use legacy flat fee (catalog modalities are teleconsult-only).
 */
export async function computeSlotBookingQuote(
  doctorId: string,
  patientId: string,
  state: ConversationState,
  doctorSettings: DoctorSettingsRow | null,
  correlationId: string
): Promise<SlotBookingQuoteResult> {
  const doctorCountry = doctorSettings?.country ?? env.DEFAULT_DOCTOR_COUNTRY ?? 'IN';
  const legacyAmount = doctorSettings?.appointment_fee_minor ?? env.APPOINTMENT_FEE_MINOR ?? 0;
  const legacyCurrency =
    doctorSettings?.appointment_fee_currency ?? env.APPOINTMENT_FEE_CURRENCY ?? 'INR';

  if (state.consultationType === 'in_clinic') {
    return {
      amountMinor: legacyAmount,
      currency: legacyCurrency,
      doctorCountry,
      pricingSource: 'legacy_fee',
    };
  }

  const catalog = getActiveServiceCatalog(doctorSettings);
  if (!catalog) {
    return {
      amountMinor: legacyAmount,
      currency: legacyCurrency,
      doctorCountry,
      pricingSource: 'legacy_fee',
    };
  }

  const serviceKeyNorm = resolveCatalogServiceKeyForSlotBooking(state, catalog, correlationId);
  if (!serviceKeyNorm) {
    const blockReason = inferSlotBookingCatalogQuoteBlockReason(state, catalog);
    logger.warn(
      { correlationId, doctorId, slot_booking_quote_block_reason: blockReason },
      'slot_booking_quote_blocked'
    );
    throw new ValidationError(catalogQuoteBlockUserMessage(blockReason));
  }

  const modality = resolveModalityForSlotBooking(state, state.consultationType);
  const offeringForQuote = findServiceOfferingByKey(catalog, serviceKeyNorm);
  const catalogServiceIdForQuote = offeringForQuote?.service_id ?? null;
  const activeEpisode = await getActiveEpisodeForPatientDoctorService(
    doctorId,
    patientId,
    serviceKeyNorm,
    catalogServiceIdForQuote
  );

  const quote = quoteConsultationVisit({
    settings: doctorSettings,
    catalogServiceKey: serviceKeyNorm,
    catalogServiceId: catalogServiceIdForQuote,
    modality,
    at: new Date(),
    activeEpisode,
  });

  return {
    amountMinor: quote.amount_minor,
    currency: quote.currency,
    doctorCountry,
    pricingSource: 'catalog_quote',
    catalogServiceKey: quote.service_key,
    catalogServiceId: quote.service_id,
    episodeId: quote.episode_id,
    quoteMetadata: {
      visit_kind: quote.visit_kind,
      service_key: quote.service_key,
      ...(quote.service_id ? { service_id: quote.service_id } : {}),
      modality: quote.modality,
      ...(quote.episode_id ? { episode_id: quote.episode_id } : {}),
    },
  };
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
    step: 'awaiting_slot_selection' as const,
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
    `You selected **${dateStr}**. Continue in chat if you need help, or pick another time here: [Change slot](${bookingLink})`;

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
  correlationId: string,
  options?: PublicBookingSelectionInput & { isReschedule?: boolean }
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
  const doctorSettings = await getDoctorSettings(doctorId);

  const payGate = evaluatePublicBookingPaymentGate(state, doctorSettings);
  if (!payGate.allowed) {
    logger.info(
      { correlationId, conversationId, booking_payment_gate_denied: payGate.reason },
      'booking_payment_gate_denied'
    );
    if (payGate.reason === 'staff_review_pending') {
      throw new StaffServiceReviewPendingPaymentError();
    }
    throw new ServiceSelectionNotFinalizedPaymentError();
  }

  const patientIdToUse = state.bookingForPatientId ?? conversation.patient_id;
  const patient = await findPatientByIdWithAdmin(patientIdToUse, correlationId);
  if (!patient || !patient.name || !patient.phone) {
    throw new NotFoundError('Patient details not found. Please complete the booking flow in chat first.');
  }
  const effectiveState = applyPublicBookingSelectionsToState(
    state,
    doctorSettings,
    {
      catalogServiceKey: options?.catalogServiceKey,
      catalogServiceId: options?.catalogServiceId,
      consultationModality: options?.consultationModality,
    },
    options?.isReschedule === true
  );

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

  const quotePreview = await computeSlotBookingQuote(
    doctorId,
    patient.id,
    effectiveState,
    doctorSettings,
    correlationId
  );

  const appointment = await bookAppointment(
    {
      doctorId,
      patientId: patient.id,
      patientName: patient.name,
      patientPhone: patient.phone,
      appointmentDate: slotDate.toISOString(),
      reasonForVisit,
      notes,
      consultationType: appointmentConsultationTypeFromState(effectiveState),
      conversationId: conversationId,
      ...(quotePreview.pricingSource === 'catalog_quote' && quotePreview.catalogServiceKey
        ? { catalogServiceKey: quotePreview.catalogServiceKey }
        : {}),
      ...(quotePreview.pricingSource === 'catalog_quote' && quotePreview.catalogServiceId
        ? { catalogServiceId: quotePreview.catalogServiceId }
        : {}),
      ...(quotePreview.episodeId ? { episodeId: quotePreview.episodeId } : {}),
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

  const amountMinor = quotePreview.amountMinor;
  const currency = quotePreview.currency;
  const doctorCountry = quotePreview.doctorCountry;

  const redirectUrl = await getRedirectUrlForDoctor(doctorId);
  const baseUrl = env.BOOKING_PAGE_URL?.trim() || 'https://example.com/book';
  const successCallbackUrl = `${baseUrl.replace(/\/$/, '')}/success?token=${token}`;

  if (!amountMinor || amountMinor <= 0) {
    await saveSlotSelection(conversationId, doctorId, slotStart, correlationId);
    const newState = {
      ...state,
      catalogServiceKey: effectiveState.catalogServiceKey,
      catalogServiceId: effectiveState.catalogServiceId,
      consultationModality: effectiveState.consultationModality,
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
          ? `Queue visit - ${slotDisplayStr}`
          : `Appointment - ${slotDisplayStr}`,
      callbackUrl: successCallbackUrl,
      ...(quotePreview.quoteMetadata ? { quoteMetadata: quotePreview.quoteMetadata } : {}),
    },
    correlationId
  );

  await saveSlotSelection(conversationId, doctorId, slotStart, correlationId);
  const newState = {
    ...state,
    catalogServiceKey: effectiveState.catalogServiceKey,
    catalogServiceId: effectiveState.catalogServiceId,
    consultationModality: effectiveState.consultationModality,
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
