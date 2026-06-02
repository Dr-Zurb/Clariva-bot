/**
 * OPD mode resolution (e-task-opd-03, pdm-02, pdm-07).
 * Centralizes slot vs queue from fact → policy → doctor_settings → default.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DoctorSettingsRow,
  ModeSchedule,
  ModeScheduleWeekday,
  OpdMode,
} from '../../types/doctor-settings';
import { getDoctorSettings, getDoctorTimezone } from '../doctor-settings-service';
import { ValidationError } from '../../utils/errors';

export type OpdSessionDayModeSource =
  | 'fact'
  | 'policy'
  | 'doctor_settings'
  | 'default';

export interface ResolveSessionDayModeResult {
  mode: OpdMode;
  source: OpdSessionDayModeSource;
  /** Number of recorded flips for the date (0 if source !== 'fact'). */
  changeCount: number;
}

const WEEKDAYS: ModeScheduleWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function modeScheduleFromSettings(
  settings: DoctorSettingsRow | null | undefined
): ModeSchedule | null {
  const policies = settings?.opd_policies as Record<string, unknown> | null | undefined;
  const schedule = policies?.mode_schedule;
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    return null;
  }
  return schedule as ModeSchedule;
}

function getWeekdayInTz(date: string, tz: string): ModeScheduleWeekday {
  const dt = new Date(`${date}T12:00:00`);
  const formatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz });
  const short = formatter.format(dt).toLowerCase().slice(0, 3);
  if (WEEKDAYS.includes(short as ModeScheduleWeekday)) {
    return short as ModeScheduleWeekday;
  }
  throw new Error(`Unexpected weekday short form: ${short}`);
}

/**
 * Pure DL-9 policy resolution for one date (no DB reads).
 * Returns null when no policy rule matches.
 */
export function resolveOneDate(
  schedule: ModeSchedule | null,
  date: string,
  timezone: string
): OpdMode | null {
  if (!schedule) return null;

  if (schedule.date_overrides) {
    const matches = schedule.date_overrides.filter((o) => o.date === date);
    if (matches.length > 0) {
      return matches[matches.length - 1]!.mode;
    }
  }

  if (schedule.date_range_overrides) {
    const matches = schedule.date_range_overrides.filter(
      (r) => r.from <= date && date <= r.to
    );
    if (matches.length > 0) {
      return matches[matches.length - 1]!.mode;
    }
  }

  if (schedule.weekly_overrides) {
    const weekday = getWeekdayInTz(date, timezone);
    const weekdayMode = schedule.weekly_overrides[weekday];
    if (weekdayMode) return weekdayMode;
  }

  if (schedule.default_mode) {
    return schedule.default_mode;
  }

  return null;
}

/**
 * Resolve the mode dictated by doctor_settings.opd_policies.mode_schedule
 * for a given (doctor, date). Returns null if no rule matches; caller
 * (resolveSessionDayMode) cascades to doctor_settings.opd_mode then 'slot'.
 *
 * Order of precedence (DL-9):
 *   1. date_overrides (last-in-array wins on duplicate match)
 *   2. date_range_overrides (last-in-array wins on overlap match)
 *   3. weekly_overrides[weekday-in-doctor-TZ]
 *   4. default_mode
 *   5. null (no policy applies)
 */
export async function resolveModePolicyForDate(
  _supabase: SupabaseClient,
  doctorId: string,
  date: string
): Promise<OpdMode | null> {
  const settings = await getDoctorSettings(doctorId);
  const schedule = modeScheduleFromSettings(settings);
  if (!schedule) return null;

  const timezone = await getDoctorTimezone(doctorId);
  return resolveOneDate(schedule, date, timezone);
}

const MAX_MODE_SCHEDULE_RANGE_DAYS = 60;

/**
 * Bulk variant: map YYYY-MM-DD → resolved mode (or null) for [from, to] inclusive.
 * One settings read; iterate dates in JS (DL-16 booking widget).
 */
export async function resolveModePolicyForDateRange(
  _supabase: SupabaseClient,
  doctorId: string,
  fromDate: string,
  toDate: string
): Promise<Record<string, OpdMode | null>> {
  if (fromDate > toDate) {
    throw new Error(`resolveModePolicyForDateRange: from (${fromDate}) > to (${toDate})`);
  }

  const daySpan =
    (new Date(`${toDate}T12:00:00Z`).getTime() - new Date(`${fromDate}T12:00:00Z`).getTime()) /
    (24 * 60 * 60 * 1000);
  if (daySpan > MAX_MODE_SCHEDULE_RANGE_DAYS) {
    throw new ValidationError('mode-schedule range cannot exceed 60 days');
  }

  const settings = await getDoctorSettings(doctorId);
  const schedule = modeScheduleFromSettings(settings);
  const timezone = await getDoctorTimezone(doctorId);

  const result: Record<string, OpdMode | null> = {};
  let cursor = new Date(`${fromDate}T12:00:00Z`);
  const end = new Date(`${toDate}T12:00:00Z`);

  while (cursor <= end) {
    const ymd = cursor.toISOString().slice(0, 10);
    result[ymd] = resolveOneDate(schedule, ymd, timezone);
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return result;
}

/**
 * Resolve OPD mode from a settings row (or null = default slot).
 */
export function resolveOpdModeFromSettings(settings: DoctorSettingsRow | null | undefined): OpdMode {
  return settings?.opd_mode === 'queue' ? 'queue' : 'slot';
}

/**
 * Load doctor settings and return OPD mode (async convenience).
 */
export async function getDoctorOpdMode(doctorId: string): Promise<OpdMode> {
  const settings = await getDoctorSettings(doctorId);
  return resolveOpdModeFromSettings(settings);
}

/**
 * Resolve the operating mode for a (doctor, session_date).
 *
 * Order of precedence (DL-1, DL-9):
 *   1. doctor_opd_session_modes row (the fact)
 *   2. mode_schedule policy
 *   3. doctor_settings.opd_mode (legacy column, tertiary fallback)
 *   4. 'slot' (ultimate default)
 *
 * Pure read; never writes.
 */
export async function resolveSessionDayMode(
  supabase: SupabaseClient,
  doctorId: string,
  date: string
): Promise<ResolveSessionDayModeResult> {
  const { data: factRow, error: factError } = await supabase
    .from('doctor_opd_session_modes')
    .select('mode, change_count')
    .eq('doctor_id', doctorId)
    .eq('session_date', date)
    .maybeSingle();

  if (factError) {
    console.error('[resolveSessionDayMode] fact read failed:', factError);
  }
  if (factRow) {
    return {
      mode: factRow.mode as OpdMode,
      source: 'fact',
      changeCount: factRow.change_count ?? 0,
    };
  }

  const policyMode = await resolveModePolicyForDate(supabase, doctorId, date);
  if (policyMode) {
    return { mode: policyMode, source: 'policy', changeCount: 0 };
  }

  const settings = await getDoctorSettings(doctorId);
  if (settings?.opd_mode === 'queue' || settings?.opd_mode === 'slot') {
    return {
      mode: settings.opd_mode as OpdMode,
      source: 'doctor_settings',
      changeCount: 0,
    };
  }

  return { mode: 'slot', source: 'default', changeCount: 0 };
}

/**
 * DL-10: materialise a fact row on first booking when none exists (idempotent).
 */
export async function materializeSessionDayModeIfAbsent(
  supabase: SupabaseClient,
  doctorId: string,
  sessionDate: string,
  correlationId: string
): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from('doctor_opd_session_modes')
    .select('mode')
    .eq('doctor_id', doctorId)
    .eq('session_date', sessionDate)
    .maybeSingle();

  if (readError) {
    const { handleSupabaseError } = await import('../../utils/db-helpers');
    handleSupabaseError(readError, correlationId);
  }
  if (existing) return;

  const resolved = await resolveSessionDayMode(supabase, doctorId, sessionDate);
  const nowIso = new Date().toISOString();

  const { error: upsertError } = await supabase.from('doctor_opd_session_modes').upsert(
    {
      doctor_id: doctorId,
      session_date: sessionDate,
      mode: resolved.mode,
      source: 'policy_default',
      change_count: 0,
      changed_at: nowIso,
    },
    { onConflict: 'doctor_id,session_date', ignoreDuplicates: true }
  );

  if (upsertError) {
    const { handleSupabaseError } = await import('../../utils/db-helpers');
    handleSupabaseError(upsertError, correlationId);
  }
}
