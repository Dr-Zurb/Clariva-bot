/**
 * OPD session overrun flagging + 24h fallback workers (pdm-09 · DL-7 / DL-8).
 *
 * Mirrors `opd-mode-notifications-cron` lifecycle: `startOpdOverrunWorker` returns
 * `{ stop, runFlaggingOnce, runFallbackOnce }`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { getDoctorSettings } from '../services/doctor-settings-service';
import { computeSlotGridForDate } from '../services/opd/opd-mode-conversion-service';
import { bulkResolveSessionOverrun } from '../services/opd/opd-overrun-service';
import { sessionDateFromAppointmentDate } from '../services/opd/opd-queue-service';

const FLAGGING_INTERVAL_MS = 5 * 60 * 1000;
const FALLBACK_INTERVAL_MS = 60 * 60 * 1000;
const OVERRUN_GRACE_MS = 30 * 60 * 1000;

export interface OverrunFlaggingCronResult {
  candidatesScanned: number;
  flagged: number;
  errors: number;
}

export interface OverrunFallbackCronResult {
  candidatesScanned: number;
  rescheduled: number;
  errors: number;
}

export interface OpdOverrunWorkerHandle {
  stop: () => void;
  runFlaggingOnce: () => Promise<OverrunFlaggingCronResult>;
  runFallbackOnce: () => Promise<OverrunFallbackCronResult>;
}

function isWorkerEnabled(): boolean {
  if (env.OPD_OVERRUN_WORKER_ENABLED === true) return true;
  if (env.OPD_OVERRUN_WORKER_ENABLED === false) return false;
  return env.NODE_ENV === 'production';
}

async function resolveSessionEndForDate(
  supabase: SupabaseClient,
  doctorId: string,
  date: string
): Promise<Date | null> {
  const grid = await computeSlotGridForDate(supabase, doctorId, date);
  if (!grid.sessionEndIso) return null;
  const end = new Date(grid.sessionEndIso);
  return Number.isNaN(end.getTime()) ? null : end;
}

async function flagRows(
  supabase: SupabaseClient,
  aptIds: string[],
  result: OverrunFlaggingCronResult
): Promise<void> {
  if (aptIds.length === 0) return;

  const { error } = await supabase
    .from('appointments')
    .update({ session_overrun_at: new Date().toISOString() })
    .in('id', aptIds)
    .is('session_overrun_at', null);

  if (error) {
    logger.error({ err: error, aptIds }, 'overrun-flagging-cron: flag failed');
    result.errors += 1;
    return;
  }

  result.flagged += aptIds.length;
  for (const id of aptIds) {
    logger.info({ event: 'opd_overrun.flagged', appointment_id: id }, 'opd_overrun.flagged');
  }
}

/**
 * Every 5 min: stamp `session_overrun_at` on pending|confirmed rows past session_end + 30 min.
 */
export async function runOpdOverrunFlaggingCron(
  supabase: SupabaseClient
): Promise<OverrunFlaggingCronResult> {
  const startedAt = Date.now();
  const result: OverrunFlaggingCronResult = {
    candidatesScanned: 0,
    flagged: 0,
    errors: 0,
  };

  const todayUtc = DateTime.utc().toISODate()!;

  const { data: candidates, error: candidatesErr } = await supabase
    .from('appointments')
    .select('id, doctor_id, appointment_date')
    .in('status', ['pending', 'confirmed'])
    .is('session_overrun_at', null)
    .lt('appointment_date', `${todayUtc}T00:00:00.000Z`);

  if (candidatesErr) {
    logger.error({ err: candidatesErr }, 'overrun-flagging-cron: candidate query failed');
    result.errors += 1;
    return result;
  }

  result.candidatesScanned = candidates?.length ?? 0;
  if (!candidates || candidates.length === 0) {
    logger.info(
      { elapsed_ms: Date.now() - startedAt, ...result },
      'overrun-flagging-cron: done (no candidates)'
    );
    return result;
  }

  const grouped = new Map<string, { doctorId: string; date: string; aptIds: string[] }>();
  const timezoneByDoctor = new Map<string, string>();

  for (const apt of candidates) {
    const doctorId = apt.doctor_id as string;
    let timezone = timezoneByDoctor.get(doctorId);
    if (!timezone) {
      const settings = await getDoctorSettings(doctorId);
      timezone = settings?.timezone ?? 'Asia/Kolkata';
      timezoneByDoctor.set(doctorId, timezone);
    }
    const date = sessionDateFromAppointmentDate(new Date(apt.appointment_date as string), timezone);
    const key = `${apt.doctor_id}::${date}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        doctorId: apt.doctor_id as string,
        date,
        aptIds: [],
      });
    }
    grouped.get(key)!.aptIds.push(apt.id as string);
  }

  for (const group of grouped.values()) {
    const sessionEnd = await resolveSessionEndForDate(supabase, group.doctorId, group.date);
    if (!sessionEnd) {
      await flagRows(supabase, group.aptIds, result);
      continue;
    }

    const thirtyMinAfterEnd = sessionEnd.getTime() + OVERRUN_GRACE_MS;
    if (Date.now() > thirtyMinAfterEnd) {
      await flagRows(supabase, group.aptIds, result);
    }
  }

  logger.info({ elapsed_ms: Date.now() - startedAt, ...result }, 'overrun-flagging-cron: done');
  if (result.flagged > 0) {
    logger.info(
      { event: 'opd_overrun.flagged_batch', count: result.flagged },
      'opd_overrun.flagged_batch'
    );
  }

  return result;
}

/**
 * Hourly: auto-reschedule overrun rows untouched for 24h (DL-8).
 */
export async function runOpdOverrunFallbackCron(
  supabase: SupabaseClient
): Promise<OverrunFallbackCronResult> {
  const startedAt = Date.now();
  const result: OverrunFallbackCronResult = {
    candidatesScanned: 0,
    rescheduled: 0,
    errors: 0,
  };

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error } = await supabase
    .from('appointments')
    .select('doctor_id, appointment_date')
    .in('status', ['pending', 'confirmed'])
    .not('session_overrun_at', 'is', null)
    .lt('session_overrun_at', twentyFourHoursAgo);

  if (error) {
    logger.error({ err: error }, 'overrun-fallback-cron: query failed');
    result.errors += 1;
    return result;
  }

  result.candidatesScanned = candidates?.length ?? 0;
  if (!candidates || candidates.length === 0) {
    logger.info(
      { elapsed_ms: Date.now() - startedAt, ...result },
      'overrun-fallback-cron: done (no candidates)'
    );
    return result;
  }

  const grouped = new Set<string>();
  const timezoneByDoctor = new Map<string, string>();
  for (const c of candidates) {
    const doctorId = c.doctor_id as string;
    let timezone = timezoneByDoctor.get(doctorId);
    if (!timezone) {
      const settings = await getDoctorSettings(doctorId);
      timezone = settings?.timezone ?? 'Asia/Kolkata';
      timezoneByDoctor.set(doctorId, timezone);
    }
    const date = sessionDateFromAppointmentDate(
      new Date(c.appointment_date as string),
      timezone
    );
    grouped.add(`${doctorId}::${date}`);
  }

  for (const key of grouped) {
    const [doctorId, date] = key.split('::');
    if (!doctorId || !date) continue;

    try {
      const bulkResult = await bulkResolveSessionOverrun(
        supabase,
        doctorId,
        date,
        'reschedule_all',
        undefined,
        {
          triggeredBy: 'system_overrun_fallback',
          correlationId: `fallback-${key}-${Date.now()}`,
        }
      );
      result.rescheduled += bulkResult.resolved;
      logger.info(
        {
          event: 'opd_overrun.fallback_rescheduled',
          doctor_id: doctorId,
          date,
          count: bulkResult.resolved,
        },
        'opd_overrun.fallback_rescheduled'
      );
    } catch (err) {
      result.errors += 1;
      logger.error({ err, doctorId, date }, 'overrun-fallback-cron: bulk-resolve failed');
    }
  }

  logger.info({ elapsed_ms: Date.now() - startedAt, ...result }, 'overrun-fallback-cron: done');
  return result;
}

export function startOpdOverrunWorker(opts?: {
  flaggingIntervalMs?: number;
  fallbackIntervalMs?: number;
}): OpdOverrunWorkerHandle {
  const flaggingIntervalMs = Math.max(60_000, opts?.flaggingIntervalMs ?? FLAGGING_INTERVAL_MS);
  const fallbackIntervalMs = Math.max(60_000, opts?.fallbackIntervalMs ?? FALLBACK_INTERVAL_MS);

  if (!isWorkerEnabled()) {
    logger.info('opd-overrun-worker: disabled by env');
    return {
      stop: () => undefined,
      runFlaggingOnce: async () => ({ candidatesScanned: 0, flagged: 0, errors: 0 }),
      runFallbackOnce: async () => ({ candidatesScanned: 0, rescheduled: 0, errors: 0 }),
    };
  }

  let stopped = false;
  let flaggingInFlight = false;
  let fallbackInFlight = false;
  let flaggingTimer: ReturnType<typeof setInterval> | null = null;
  let fallbackTimer: ReturnType<typeof setInterval> | null = null;

  const runFlagging = async (): Promise<OverrunFlaggingCronResult> => {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      logger.warn('opd-overrun-worker: flagging skipped (no admin client)');
      return { candidatesScanned: 0, flagged: 0, errors: 0 };
    }
    if (flaggingInFlight) {
      logger.warn('opd-overrun-worker: flagging tick skipped (in flight)');
      return { candidatesScanned: 0, flagged: 0, errors: 0 };
    }
    flaggingInFlight = true;
    try {
      return await runOpdOverrunFlaggingCron(supabase);
    } finally {
      flaggingInFlight = false;
    }
  };

  const runFallback = async (): Promise<OverrunFallbackCronResult> => {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      logger.warn('opd-overrun-worker: fallback skipped (no admin client)');
      return { candidatesScanned: 0, rescheduled: 0, errors: 0 };
    }
    if (fallbackInFlight) {
      logger.warn('opd-overrun-worker: fallback tick skipped (in flight)');
      return { candidatesScanned: 0, rescheduled: 0, errors: 0 };
    }
    fallbackInFlight = true;
    try {
      return await runOpdOverrunFallbackCron(supabase);
    } finally {
      fallbackInFlight = false;
    }
  };

  const scheduleFlagging = (): void => {
    if (stopped) return;
    void runFlagging().catch((err) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'opd-overrun-worker: flagging tick threw'
      );
    });
  };

  const scheduleFallback = (): void => {
    if (stopped) return;
    void runFallback().catch((err) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'opd-overrun-worker: fallback tick threw'
      );
    });
  };

  logger.info({ flaggingIntervalMs, fallbackIntervalMs }, 'opd-overrun-worker: started');
  flaggingTimer = setInterval(scheduleFlagging, flaggingIntervalMs);
  fallbackTimer = setInterval(scheduleFallback, fallbackIntervalMs);
  if (typeof flaggingTimer.unref === 'function') flaggingTimer.unref();
  if (typeof fallbackTimer.unref === 'function') fallbackTimer.unref();

  return {
    stop: (): void => {
      if (stopped) return;
      stopped = true;
      if (flaggingTimer) {
        clearInterval(flaggingTimer);
        flaggingTimer = null;
      }
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
      logger.info('opd-overrun-worker: stopped');
    },
    runFlaggingOnce: runFlagging,
    runFallbackOnce: runFallback,
  };
}
