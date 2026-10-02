/**
 * Public clinic booking reads (clk-02).
 * Slug resolves one doctor. No conversation and no patient fields.
 */

import { getSupabaseAdminClient } from '../config/database';
import { InternalError, NotFoundError } from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import { getDoctorSettings } from './doctor-settings-service';
import { getDaySlotsWithStatus, type DaySlotWithStatus } from './availability-service';
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
): Promise<{ slots: DaySlotWithStatus[]; timezone: string; opdMode: OpdMode }> {
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
  return { slots, timezone: tz, opdMode: resolved.mode };
}
