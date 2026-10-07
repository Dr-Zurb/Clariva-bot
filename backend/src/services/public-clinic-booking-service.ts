/**
 * Public clinic booking reads (clk-02).
 * Slug resolves one doctor. No conversation and no patient fields.
 */

import { getSupabaseAdminClient } from '../config/database';
import { InternalError, NotFoundError, UnauthorizedError } from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import { verifyBookingToken } from '../utils/booking-token';
import { findConversationById } from './conversation-service';
import { findVisitPageLink, isVisitPageCode } from './visit-page-link-service';
import { getDoctorSettings } from './doctor-settings-service';
import { getDaySlotsWithStatus, type DaySlotWithStatus } from './availability-service';
import { previewQueueDay } from './opd/opd-queue-service';
import type { QueueDayPreview } from './opd/opd-eta';
import { resolveModesForDates, resolveSessionDayMode } from './opd/opd-mode-service';
import { isDoctorVerified } from './doctor-verification-service';
import { getActiveServiceCatalog } from '../utils/service-catalog-helpers';
import type { DoctorSettingsRow, OpdMode } from '../types/doctor-settings';

/** Same shape as the token page catalog. Built here so this read does not load checkout. */
export type PublicClinicCatalogPayload = {
  version: 1;
  services: Array<{
    service_id: string;
    service_key: string;
    label: string;
    modalities: Partial<
      Record<'text' | 'voice' | 'video', { enabled: true; price_minor: number }>
    >;
  }>;
  feeCurrency: string;
};

export type PublicClinicPageInfo = {
  doctorId: string;
  practiceName: string;
  timezone: string;
  mode: 'book';
  opdMode: OpdMode;
  bookingAllowed: boolean;
  bookingBlockedReason?: 'doctor_not_verified';
  serviceCatalog?: PublicClinicCatalogPayload;
  /** Mode for each bookable day, keyed by YYYY-MM-DD in the practice timezone. */
  dayModes?: Record<string, OpdMode>;
  /** Work address, shown to patients as the clinic address. Omitted when blank. */
  clinicAddress?: string;
  /** Practice specialty. Omitted when blank. */
  specialty?: string;
};

type PublicSlugRow = {
  doctor_id: string;
  public_slug: string;
};

/**
 * Accept a row only when it is exactly the requested slug.
 * A mismatched row is not found — never another practice.
 */
export function doctorIdFromPublicSlugRow(slug: string, row: PublicSlugRow | null): string {
  if (!row || row.public_slug !== slug || !row.doctor_id) {
    throw new NotFoundError('Booking page not found');
  }
  return row.doctor_id;
}

export async function resolveDoctorIdByPublicSlug(
  slug: string,
  correlationId: string
): Promise<string> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for booking page lookup');
  }

  const { data, error } = await admin
    .from('doctor_settings')
    .select('doctor_id, public_slug')
    .eq('public_slug', slug)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return doctorIdFromPublicSlugRow(slug, (data as PublicSlugRow | null) ?? null);
}

function publicClinicCatalog(settings: DoctorSettingsRow | null): PublicClinicCatalogPayload | null {
  const catalog = getActiveServiceCatalog(settings);
  if (!catalog) return null;
  const rawCur = settings?.appointment_fee_currency?.trim();
  const feeCurrency = rawCur && /^[A-Z]{3}$/.test(rawCur) ? rawCur : 'INR';
  return {
    version: 1,
    services: catalog.services.map((s) => {
      const modalities: PublicClinicCatalogPayload['services'][number]['modalities'] = {};
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

const PUBLIC_CLINIC_DAY_COUNT = 14;

function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year!, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function clinicTodayYmd(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Header for /d/:slug. Conversation hints stay on the token read. */
export function buildPublicClinicPageInfo(input: {
  doctorId: string;
  settings: DoctorSettingsRow | null;
  opdMode: OpdMode;
  doctorVerified: boolean;
}): PublicClinicPageInfo {
  const practiceName = input.settings?.practice_name?.trim() || 'Halo Aid';
  const timezone = input.settings?.timezone ?? 'Asia/Kolkata';
  const serviceCatalog = publicClinicCatalog(input.settings);
  const clinicAddress = input.settings?.address_summary?.trim() || '';
  const specialty = input.settings?.specialty?.trim() || '';
  const bookingAllowed = input.doctorVerified;
  return {
    doctorId: input.doctorId,
    practiceName,
    timezone,
    mode: 'book',
    opdMode: input.opdMode,
    bookingAllowed,
    ...(bookingAllowed ? {} : { bookingBlockedReason: 'doctor_not_verified' as const }),
    ...(serviceCatalog ? { serviceCatalog } : {}),
    ...(clinicAddress ? { clinicAddress } : {}),
    ...(specialty ? { specialty } : {}),
  };
}

export async function getPublicClinicPageInfo(
  slug: string,
  correlationId: string
): Promise<PublicClinicPageInfo> {
  const doctorId = await resolveDoctorIdByPublicSlug(slug, correlationId);
  const settings = await getDoctorSettings(doctorId);
  const timezone = settings?.timezone ?? 'Asia/Kolkata';
  const todayYmd = clinicTodayYmd(timezone);
  const admin = getSupabaseAdminClient();
  const resolved =
    admin != null
      ? await resolveSessionDayMode(admin, doctorId, todayYmd)
      : { mode: settings?.opd_mode ?? ('slot' as const) };
  const doctorVerified = await isDoctorVerified(doctorId, correlationId);
  const page = buildPublicClinicPageInfo({
    doctorId,
    settings,
    opdMode: resolved.mode,
    doctorVerified,
  });
  const dayModes = await loadPublicClinicDayModes(admin, doctorId, settings, timezone, todayYmd);
  return dayModes ? { ...page, dayModes } : page;
}

/** Saved day, then the clinic schedule, for the next two weeks. Null when the read fails. */
async function loadPublicClinicDayModes(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  doctorId: string,
  settings: DoctorSettingsRow | null,
  timezone: string,
  todayYmd: string
): Promise<Record<string, OpdMode> | null> {
  if (!admin) return null;
  const dates = Array.from({ length: PUBLIC_CLINIC_DAY_COUNT }, (_, index) =>
    addCalendarDays(todayYmd, index)
  );
  const last = dates[dates.length - 1] ?? todayYmd;
  const { data, error } = await admin
    .from('doctor_opd_session_modes')
    .select('session_date, mode')
    .eq('doctor_id', doctorId)
    .gte('session_date', todayYmd)
    .lte('session_date', last);
  if (error || !data) return null;
  return resolveModesForDates({
    dates,
    facts: data as Array<{ session_date: string; mode: string }>,
    settings,
    timezone,
  });
}

export async function getPublicClinicDaySlots(
  slug: string,
  date: string,
  correlationId: string,
  visit?: 'in_clinic' | 'video' | 'voice' | 'text'
): Promise<{
  slots: DaySlotWithStatus[];
  timezone: string;
  opdMode: OpdMode;
  queue?: QueueDayPreview;
}> {
  const doctorId = await resolveDoctorIdByPublicSlug(slug, correlationId);
  const settings = await getDoctorSettings(doctorId);
  const timezone = settings?.timezone ?? 'Asia/Kolkata';
  const { slots, timezone: tz } = await getDaySlotsWithStatus(doctorId, date, correlationId, {
    timezone,
    slotIntervalMinutes: settings?.slot_interval_minutes,
    minAdvanceHours: settings?.min_advance_hours ?? 0,
    visitType: visit,
  });
  const admin = getSupabaseAdminClient();
  const resolved =
    admin != null
      ? await resolveSessionDayMode(admin, doctorId, date)
      : { mode: settings?.opd_mode ?? ('slot' as const) };
  const queue =
    resolved.mode === 'queue'
      ? await previewQueueDay({ doctorId, date, timezone: tz, correlationId })
      : null;
  return {
    slots,
    timezone: tz,
    opdMode: resolved.mode,
    ...(queue ? { queue } : {}),
  };
}

export type ChatVisitSummary = {
  /** Visit start, ISO. Not a patient field. */
  at: string;
  /** Queue token when the visit is in a queue. Null on a clock-time day. */
  token: number | null;
};

/**
 * Conversation behind a clinic-link code, when it belongs to this practice.
 * Missing, expired, or another doctor's code is null. The code is not logged.
 * Same attach rule as public checkout.
 */
async function conversationIdForChatCode(
  code: string,
  doctorId: string,
  correlationId: string
): Promise<string | null> {
  const raw = code.trim();
  if (!raw) return null;
  if (isVisitPageCode(raw)) {
    const link = await findVisitPageLink(raw, correlationId);
    if (!link || link.doctorId !== doctorId) return null;
    const conversation = await findConversationById(link.conversationId, correlationId);
    if (!conversation || conversation.doctor_id !== doctorId) return null;
    return link.conversationId;
  }
  try {
    const verified = verifyBookingToken(raw);
    if (verified.doctorId !== doctorId || verified.appointmentId) return null;
    const conversation = await findConversationById(verified.conversationId, correlationId);
    if (!conversation || conversation.doctor_id !== doctorId) return null;
    return verified.conversationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) return null;
    throw err;
  }
}

/**
 * Upcoming visits booked from this chat. Date and token only — no name, phone, or reason.
 * An unknown code returns an empty list. An unknown slug is 404.
 */
export async function listUpcomingChatVisits(
  slug: string,
  code: string,
  correlationId: string
): Promise<{ visits: ChatVisitSummary[] }> {
  const doctorId = await resolveDoctorIdByPublicSlug(slug, correlationId);
  const conversationId = await conversationIdForChatCode(code, doctorId, correlationId);
  if (!conversationId) return { visits: [] };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await admin
    .from('appointments')
    .select('id, appointment_date')
    .eq('doctor_id', doctorId)
    .eq('conversation_id', conversationId)
    .in('status', ['pending', 'confirmed'])
    .gte('appointment_date', new Date().toISOString())
    .order('appointment_date', { ascending: true })
    .limit(8);
  if (error) handleSupabaseError(error, correlationId);

  const rows = (data ?? []) as { id: string; appointment_date: string }[];
  if (rows.length === 0) return { visits: [] };

  const { data: tokenRows, error: tokenError } = await admin
    .from('opd_queue_entries')
    .select('appointment_id, token_number')
    .in('appointment_id', rows.map((row) => row.id));
  if (tokenError) handleSupabaseError(tokenError, correlationId);

  const tokenByAppointment = new Map<string, number>();
  for (const row of (tokenRows ?? []) as { appointment_id?: string; token_number?: number }[]) {
    if (row.appointment_id && typeof row.token_number === 'number') {
      tokenByAppointment.set(row.appointment_id, row.token_number);
    }
  }

  return {
    visits: rows.map((row) => ({
      at: new Date(row.appointment_date).toISOString(),
      token: tokenByAppointment.get(row.id) ?? null,
    })),
  };
}
