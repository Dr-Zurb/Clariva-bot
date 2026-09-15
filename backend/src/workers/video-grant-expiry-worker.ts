/**
 * Video-grant expiry worker (recording-governance-v2 · rec-22).
 *
 * Sibling of `video-escalation-timeout-worker.ts`, not a second tick
 * inside it: the consent-window job only stamps a pending row; this
 * job flips Twilio back to audio-only. Mixing those failure modes in
 * one loop would hide a critical revert failure inside a timeout
 * counter. Same 5s cron shape, same atomic-UPDATE race doctrine.
 *
 * **Why DB-polling and not setTimeout:** a lost in-memory timer keeps
 * recording video. The service header already rejected that idea for
 * the 60s consent window; it applies with more force here.
 *
 * **Race with a patient stop:** Twilio-first (same order as
 * `patientRevokeVideoMidCall`), then an atomic stamp guarded on
 * `revoked_at IS NULL` AND `grant_expires_at <= cutoff`. A concurrent
 * stop that already stamped the row counts as `raced`, not an error.
 * A Twilio failure leaves the row unstamped and retries next tick.
 *
 * **Paused grants (rec-24):** `video_paused_at` is ignored. Pause does
 * not extend the grant.
 *
 * **Plan 09 anomaly:** voice→video transitions record video with no
 * `video_escalation_audit` row. This worker never selects those
 * sessions (no grant row / no `grant_expires_at`). It logs each
 * `modality_change:` ledger session once at warn and does not revert it.
 *
 * @see backend/src/workers/video-escalation-timeout-worker.ts
 * @see docs/Work/Daily-plans/August 2026/17-08-2026/recording-governance-v2/p4-video-escalation-control/Tasks/task-rec-22-grant-expiry-auto-revert.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { emitVideoRecordingStopped } from '../services/consultation-message-service';
import { findSessionById } from '../services/consultation-session-service';
import { revertToAudioOnlyRecording } from '../services/recording-track-service';

const BATCH_SIZE_CAP = 100;

const ungrantedVideoWarned = new Set<string>();

export interface VideoGrantExpiryJobResult {
  scanned:  number;
  expired:  number;
  raced:    number;
  errors:   string[];
}

interface DueGrantRow {
  id:              string;
  session_id:      string;
  correlation_id:  string | null;
  grant_expires_at: string;
}

export async function runVideoGrantExpiryJob(
  correlationId: string,
  nowMs: number = Date.now(),
): Promise<VideoGrantExpiryJobResult> {
  const result: VideoGrantExpiryJobResult = {
    scanned: 0,
    expired: 0,
    raced:   0,
    errors:  [],
  };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error(
      { correlationId },
      'video-grant-expiry-worker: no admin client — tick skipped',
    );
    return result;
  }

  const cutoffIso = new Date(nowMs).toISOString();

  const { data: scanRows, error: scanErr } = await admin
    .from('video_escalation_audit')
    .select('id, session_id, correlation_id, grant_expires_at')
    .eq('patient_response', 'allow')
    .is('revoked_at', null)
    .not('grant_expires_at', 'is', null)
    .lte('grant_expires_at', cutoffIso)
    .order('grant_expires_at', { ascending: true })
    .limit(BATCH_SIZE_CAP);

  if (scanErr) {
    logger.error(
      { correlationId, error: scanErr.message },
      'video-grant-expiry-worker: scan query failed',
    );
    result.errors.push(scanErr.message);
    await maybeLogUngrantedVideoAnomaly(admin, correlationId);
    return result;
  }

  const rows = (scanRows ?? []) as DueGrantRow[];
  if (rows.length === 0) {
    logger.debug(
      { correlationId },
      'video-grant-expiry-worker: no elapsed grants',
    );
    await maybeLogUngrantedVideoAnomaly(admin, correlationId);
    return result;
  }

  result.scanned = rows.length;
  const nowIso = new Date(nowMs).toISOString();

  for (const row of rows) {
    const requestId = row.id;
    const sessionId = row.session_id;
    const rowCorrelationId = row.correlation_id ?? correlationId;

    try {
      const session = await findSessionById(sessionId);
      if (!session || session.status !== 'live') {
        const stamped = await stampGrantExpired(
          admin,
          requestId,
          cutoffIso,
          nowIso,
        );
        if (stamped === 'raced') {
          result.raced += 1;
        } else if (stamped === 'ok') {
          result.expired += 1;
        } else {
          result.errors.push(stamped);
        }
        logger.debug(
          { correlationId: rowCorrelationId, requestId, sessionId },
          'video-grant-expiry-worker: session already ended — stamped, no Twilio',
        );
        continue;
      }

      const roomSid = session.providerSessionId?.trim();
      if (!roomSid) {
        logger.error(
          {
            correlationId: rowCorrelationId,
            requestId,
            sessionId,
            severity: 'critical',
          },
          'video-grant-expiry-worker: live session has no roomSid — leaving row unstamped',
        );
        result.errors.push('no_room_sid');
        continue;
      }

      try {
        await revertToAudioOnlyRecording({
          sessionId,
          roomSid,
          reason:        'grant_expired',
          initiatedBy:   'system',
          correlationId: rowCorrelationId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          {
            correlationId: rowCorrelationId,
            requestId,
            sessionId,
            error: message,
            severity: 'critical',
          },
          'video-grant-expiry-worker: Twilio revert failed — row left unstamped',
        );
        result.errors.push(message);
        continue;
      }

      const stamped = await stampGrantExpired(
        admin,
        requestId,
        cutoffIso,
        nowIso,
      );
      if (stamped === 'raced') {
        result.raced += 1;
        logger.debug(
          { correlationId: rowCorrelationId, requestId, sessionId },
          'video-grant-expiry-worker: stamp raced — concurrent stop won',
        );
        continue;
      }
      if (stamped !== 'ok') {
        result.errors.push(stamped);
        continue;
      }

      result.expired += 1;
      await emitVideoRecordingStopped(
        sessionId,
        rowCorrelationId,
        'system',
        'grant_expired',
      );
      logger.info(
        { correlationId: rowCorrelationId, requestId, sessionId },
        'video-grant-expiry-worker: grant auto-reverted',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { correlationId: rowCorrelationId, requestId, sessionId, error: message },
        'video-grant-expiry-worker: unexpected error processing row',
      );
      result.errors.push(message);
    }
  }

  await maybeLogUngrantedVideoAnomaly(admin, correlationId);

  logger.info(
    {
      correlationId,
      scanned: result.scanned,
      expired: result.expired,
      raced: result.raced,
      errors: result.errors.length,
    },
    'video-grant-expiry-worker: tick complete',
  );

  return result;
}

async function stampGrantExpired(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  requestId: string,
  cutoffIso: string,
  nowIso: string,
): Promise<'ok' | 'raced' | string> {
  const { data: updated, error: updErr } = await admin
    .from('video_escalation_audit')
    .update({
      revoked_at:    nowIso,
      revoke_reason: 'grant_expired',
    })
    .eq('id', requestId)
    .eq('patient_response', 'allow')
    .is('revoked_at', null)
    .lte('grant_expires_at', cutoffIso)
    .select('id')
    .maybeSingle();

  if (updErr) return updErr.message;
  if (!updated) return 'raced';
  return 'ok';
}

/**
 * Observe-only. Plan 09 writes `escalation_request_id = modality_change:…`
 * and no grant row. Log each session id once per pod. Never revert.
 */
async function maybeLogUngrantedVideoAnomaly(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  correlationId: string,
): Promise<void> {
  try {
    const { data, error } = await admin
      .from('consultation_recording_audit')
      .select('session_id, metadata')
      .eq('action', 'video_escalation_completed')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error || !data) return;

    for (const raw of data as Array<{ session_id: string; metadata: unknown }>) {
      const sessionId = raw.session_id;
      if (!sessionId || ungrantedVideoWarned.has(sessionId)) continue;
      const meta = raw.metadata as { escalation_request_id?: unknown } | null;
      const escId = typeof meta?.escalation_request_id === 'string'
        ? meta.escalation_request_id
        : '';
      if (!escId.startsWith('modality_change:')) continue;

      const { count } = await admin
        .from('video_escalation_audit')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('patient_response', 'allow');
      if ((count ?? 0) > 0) continue;

      ungrantedVideoWarned.add(sessionId);
      logger.warn(
        { correlationId, sessionId },
        'video-grant-expiry-worker: video recording with no grant row (Plan 09 voice→video) — not auto-reverted',
      );
    }
  } catch {
    // Probe must never fail the tick.
  }
}
