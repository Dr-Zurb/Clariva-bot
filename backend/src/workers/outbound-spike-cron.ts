/**
 * Outbound Meta send failure spike detector.
 *
 * Counts recent send_message audit failures that carry doctor_id.
 * Ignores window-expired / kill-switch / not-found (not a restriction signal).
 * On threshold: email DEFAULT_DOCTOR_EMAIL and optionally auto-pause that
 * doctor's Instagram receptionist.
 *
 * Mounted at POST /cron/outbound-spike. Schedule every 10 minutes.
 */

import { getSupabaseAdminClient } from '../config/database';
import { sendEmail } from '../config/email';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { pauseInstagramReceptionistForIncident } from '../services/doctor-settings-service';

export const OUTBOUND_SPIKE_WINDOW_MS = 15 * 60 * 1000;
export const OUTBOUND_SPIKE_FAILURE_THRESHOLD = 8;

const IGNORED_ERROR_TYPES = new Set([
  'MessageWindowExpiredError',
  'ServiceUnavailableError',
  'NotFoundError',
]);

export interface OutboundSpikeJobResult {
  scanned: number;
  doctorsOverThreshold: number;
  paused: number;
  alreadyPaused: number;
  emailed: number;
}

export function isSpikeErrorType(errorType: string | undefined): boolean {
  if (!errorType) return false;
  return !IGNORED_ERROR_TYPES.has(errorType);
}

function emptyResult(): OutboundSpikeJobResult {
  return {
    scanned: 0,
    doctorsOverThreshold: 0,
    paused: 0,
    alreadyPaused: 0,
    emailed: 0,
  };
}

function countByDoctor(
  rows: Array<{ metadata?: Record<string, unknown> | null }>
): Map<string, { count: number; errorTypes: Set<string> }> {
  const byDoctor = new Map<string, { count: number; errorTypes: Set<string> }>();
  for (const row of rows) {
    const meta = row.metadata ?? {};
    const doctorId = typeof meta.doctor_id === 'string' ? meta.doctor_id : '';
    const errorType = typeof meta.error_type === 'string' ? meta.error_type : undefined;
    if (!doctorId || !isSpikeErrorType(errorType)) continue;
    const current = byDoctor.get(doctorId) ?? { count: 0, errorTypes: new Set<string>() };
    current.count += 1;
    if (errorType) current.errorTypes.add(errorType);
    byDoctor.set(doctorId, current);
  }
  return byDoctor;
}

export async function runOutboundSpikeJob(correlationId: string): Promise<OutboundSpikeJobResult> {
  const result = emptyResult();
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error({ correlationId }, 'outbound-spike: no admin client — tick skipped');
    return result;
  }

  const since = new Date(Date.now() - OUTBOUND_SPIKE_WINDOW_MS).toISOString();
  const { data, error } = await admin
    .from('audit_logs')
    .select('metadata')
    .eq('action', 'send_message')
    .eq('resource_type', 'instagram_message')
    .eq('status', 'failure')
    .gte('created_at', since)
    .limit(500);

  if (error) {
    logger.error({ correlationId, message: error.message }, 'outbound-spike: scan failed');
    return result;
  }

  const rows = data ?? [];
  result.scanned = rows.length;
  const byDoctor = countByDoctor(rows);

  for (const [doctorId, stats] of byDoctor) {
    if (stats.count < OUTBOUND_SPIKE_FAILURE_THRESHOLD) continue;
    result.doctorsOverThreshold += 1;

    const types = [...stats.errorTypes].sort().join(',');
    logger.warn(
      { correlationId, doctorId, failureCount: stats.count, errorTypes: types },
      'outbound-spike: doctor over threshold'
    );

    const autoPause = env.OUTBOUND_SPIKE_AUTO_PAUSE !== false;
    if (autoPause) {
      const pauseResult = await pauseInstagramReceptionistForIncident(doctorId, correlationId);
      if (pauseResult === 'paused') result.paused += 1;
      if (pauseResult === 'already_paused') {
        result.alreadyPaused += 1;
        continue;
      }
    }

    const to = env.DEFAULT_DOCTOR_EMAIL?.trim();
    if (!to) {
      logger.warn({ correlationId, doctorId }, 'outbound-spike: no DEFAULT_DOCTOR_EMAIL');
      continue;
    }

    const pauseNote = autoPause
      ? 'Instagram receptionist auto-paused for this doctor.'
      : 'Auto-pause is off. Set instagram_receptionist_paused or OUTBOUND_MESSAGING_DISABLED.';
    const sent = await sendEmail(
      to,
      'Halo Aid: Instagram send-failure spike',
      `Doctor ${doctorId} had ${stats.count} outbound Meta send failures in 15 minutes (${types}).\n\n${pauseNote}\n\nUnpause in Settings after you confirm the account is healthy.`,
      correlationId
    );
    if (sent) result.emailed += 1;
  }

  logger.info({ correlationId, ...result }, 'outbound-spike: tick complete');
  return result;
}

export const __test = { countByDoctor, isSpikeErrorType };
