/**
 * Voice Transcription Worker (Plan 05 · Task 25)
 * -----------------------------------------------
 *
 * Post-consult polling worker. Every tick:
 *
 *   1. SELECT the next batch of `status='queued'` rows whose backoff
 *      window has elapsed. Oldest first (FIFO).
 *   2. For each row:
 *      a. Resolve the Twilio audio Composition — lookup via the
 *         Compositions API, keyed by the room SID we stored at enqueue
 *         time.
 *      b. If the Composition is not yet `'completed'` → leave the row
 *         queued, move on. **Not a failure**: Twilio finalises 5-30s
 *         after `endSession`, and a 30s poll cadence catches it on the
 *         next tick.
 *      c. Flip the row to `'processing'`, stamp `started_at = now()`.
 *      d. Call `processVoiceTranscription` (transcribes + computes cost).
 *      e. On success → flip to `'completed'`, persist the transcript
 *         fields, emit the structured cost-telemetry log line.
 *      f. On `TranscriptionTransientError` → bump `retry_count`. If cap
 *         hit, flip to `'failed'` with the error message. Otherwise
 *         flip back to `'queued'` (next tick will re-pick it up once
 *         the backoff window elapses).
 *      g. On `TranscriptionPermanentError` → flip straight to `'failed'`.
 *
 * Failure posture: the worker never throws out of its main loop. A
 * per-row error is counted and logged; the tick as a whole reports its
 * `{ polled, processed, failed, stillQueued }` totals so the cron HTTP
 * handler can return a 200 even when individual rows blew up (consistent
 * with `recording-archival-cron.ts`).
 *
 * Backoff table (indexed by `retry_count` pre-increment):
 *   [1m, 5m, 15m, 1h, 6h]
 *
 * A row with `retry_count === 0` is always eligible (never attempted).
 * A row with `retry_count === 1` becomes eligible `1 minute` after
 * `started_at`. And so on.
 *
 * Twilio Composition resolution:
 *
 *   Plan 02's `recording_artifact_index` is the long-term home for the
 *   mapping (`session_id` → `composition_sid` + `storage_uri`). Until
 *   Plan 05's Twilio Composition webhook handler lands and populates
 *   that table, we fall back to calling Twilio's Compositions API
 *   directly keyed on `room_sid` (the field the voice adapter already
 *   stores). When the artifact row lands, swap the helper below to
 *   prefer it and keep the Twilio API call as a fallback. Strategy
 *   documented on the task doc as well.
 *
 * @see backend/src/services/voice-transcription-service.ts
 * @see backend/migrations/061_consultation_transcripts.sql
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-25-voice-transcription-pipeline.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  processVoiceTranscription,
  type ProcessVoiceTranscriptionInput,
} from '../services/voice-transcription-service';
import {
  TranscriptionPermanentError,
  TranscriptionTransientError,
  type TranscriptProvider,
} from '../types/consultation-transcript';

// ============================================================================
// Backoff table
// ============================================================================

/**
 * Elapsed time (ms) required since `started_at` before a row with this
 * `retry_count` becomes eligible again. Index `0` is effectively unused
 * (a retry_count of 0 means no prior attempt).
 */
const BACKOFF_MS_BY_RETRY_COUNT = [
  0,           // retry_count = 0 → no prior attempt → always eligible
  60_000,      // retry_count = 1 → 1m
  5 * 60_000,  // retry_count = 2 → 5m
  15 * 60_000, // retry_count = 3 → 15m
  60 * 60_000, // retry_count = 4 → 1h
  6 * 60 * 60_000, // retry_count = 5 → 6h (last attempt before cap)
] as const;

function isBackoffReady(
  retryCount: number,
  startedAtIso: string | null,
  now: Date,
): boolean {
  if (retryCount <= 0) return true;
  if (!startedAtIso) return true;
  const started = new Date(startedAtIso).getTime();
  const idx = Math.min(retryCount, BACKOFF_MS_BY_RETRY_COUNT.length - 1);
  const waitMs = BACKOFF_MS_BY_RETRY_COUNT[idx];
  return now.getTime() - started >= waitMs;
}

// ============================================================================
// Composition resolution (Twilio)
// ============================================================================

/**
 * Resolved Composition info the worker needs to call the provider. `null`
 * when Twilio hasn't finalised the Composition yet — the worker leaves the
 * row queued in that case.
 */
export interface ResolvedComposition {
  compositionSid: string;
  audioUrl: string;
  /**
   * Duration reported by Twilio. When available, it's a tiebreaker for
   * the cost math — the provider clients also return their own duration,
   * but Twilio's is authoritative for what we actually paid to record.
   */
  twilioDurationSeconds?: number;
}

/**
 * Resolve the Composition for a given room SID. Overridable via the
 * `resolveCompositionOverride` export below so tests can stub without
 * mocking the Twilio SDK.
 *
 * In production this function fetches `client.video.v1.compositions.list(
 * { roomSid, limit: 1 })`, picks the one in `'completed'` state, and
 * constructs the media URL. When the Twilio SDK is not configured
 * (missing `TWILIO_ACCOUNT_SID`), returns `null` with a warn log — the
 * worker treats that as "composition not yet ready" and the row stays
 * queued (same failure mode as the real Twilio path).
 *
 * TODO(Task 25 v2): once Plan 02 / Plan 05 ship a Composition-finalized
 * webhook that writes to `recording_artifact_index`, prefer reading from
 * that table here and keep the Twilio SDK path as the fallback.
 */
let resolveCompositionImpl: (
  roomSid: string,
  correlationId: string,
) => Promise<ResolvedComposition | null> = defaultResolveComposition;

async function defaultResolveComposition(
  roomSid: string,
  correlationId: string,
): Promise<ResolvedComposition | null> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    logger.warn(
      { correlationId, roomSid },
      'voice-transcription-worker: Twilio not configured — treating Composition as not-yet-ready',
    );
    return null;
  }
  // Lazy-import the SDK to avoid paying the module cost on every tick
  // (the polling cadence is 30s; module import is ~ms but it's tidier
  // to keep Twilio out of the hot path when unused).
  const { default: TwilioLib } = await import('twilio');
  const client = TwilioLib(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  const compositions = await client.video.v1.compositions.list({
    roomSid,
    limit: 5,
  });
  const ready = compositions.find((c) => c.status === 'completed');
  if (!ready) {
    logger.debug(
      {
        correlationId,
        roomSid,
        candidateStates: compositions.map((c) => c.status),
      },
      'voice-transcription-worker: no completed Composition yet',
    );
    return null;
  }
  // Twilio returns a `url` on the composition resource; the media URL is
  // a separate signed endpoint constructed via the SDK's helper. The
  // `.media()` method returns metadata with a `redirect_to` signed URL.
  // We compute the API path directly so the SDK's v2 shape doesn't
  // surprise us here — if this breaks in a future SDK upgrade, the
  // worker tests pin the shape the service receives.
  const audioUrl = `https://video.twilio.com/v1/Compositions/${ready.sid}/Media`;
  return {
    compositionSid: ready.sid,
    audioUrl,
    twilioDurationSeconds:
      typeof ready.duration === 'number' ? ready.duration : undefined,
  };
}

/** Test hook. */
export function __setResolveCompositionForTests(
  fn:
    | ((roomSid: string, correlationId: string) => Promise<ResolvedComposition | null>)
    | null,
): void {
  resolveCompositionImpl = fn ?? defaultResolveComposition;
}

export async function resolveComposition(
  roomSid: string,
  correlationId: string,
): Promise<ResolvedComposition | null> {
  return resolveCompositionImpl(roomSid, correlationId);
}

// ============================================================================
// Public worker API
// ============================================================================

export interface VoiceTranscriptionJobResult {
  polled: number;
  processed: number;
  failed: number;
  stillQueued: number;
  notYetReady: number;
  errors: string[];
}

/**
 * Run one worker tick. Safe under concurrent invocations — the status
 * flip to `'processing'` is conditional (`.eq('status', 'queued')`) so a
 * double-run only lets one worker claim each row. Returns totals for
 * ops-dashboard visibility.
 */
export async function runVoiceTranscriptionJob(
  correlationId: string,
): Promise<VoiceTranscriptionJobResult> {
  const result: VoiceTranscriptionJobResult = {
    polled: 0,
    processed: 0,
    failed: 0,
    stillQueued: 0,
    notYetReady: 0,
    errors: [],
  };

  if (!env.VOICE_TRANSCRIPTION_ENABLED) {
    logger.info({ correlationId }, 'voice-transcription-worker: disabled via env, skipping tick');
    return result;
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error({ correlationId }, 'voice-transcription-worker: no admin client');
    return result;
  }

  const batchSize = env.VOICE_TRANSCRIPTION_WORKER_BATCH_SIZE;
  const { data: rows, error } = await admin
    .from('consultation_transcripts')
    .select(
      'id, consultation_session_id, provider, language_code, composition_sid, retry_count, started_at',
    )
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    logger.error(
      { correlationId, error: error.message },
      'voice-transcription-worker: scan query failed',
    );
    return result;
  }

  if (!rows || rows.length === 0) {
    logger.debug({ correlationId }, 'voice-transcription-worker: no queued rows');
    return result;
  }

  result.polled = rows.length;
  const now = new Date();

  for (const row of rows) {
    try {
      await processOneRow(admin, row, now, correlationId, result);
    } catch (err) {
      // processOneRow is expected to catch its own errors and classify
      // them — anything reaching here is a bug. We log and keep going;
      // the row stays `'processing'` (or whatever it was last set to)
      // and the next tick will pick it up again if it reverts.
      const msg = err instanceof Error ? err.message : String(err);
      result.failed += 1;
      result.errors.push(msg);
      logger.error(
        {
          correlationId,
          rowId: row.id,
          error: msg,
        },
        'voice-transcription-worker: unexpected error in processOneRow',
      );
    }
  }

  logger.info(
    {
      correlationId,
      polled: result.polled,
      processed: result.processed,
      failed: result.failed,
      stillQueued: result.stillQueued,
      notYetReady: result.notYetReady,
    },
    'voice-transcription-worker: tick complete',
  );

  return result;
}

// ============================================================================
// Per-row processing
// ============================================================================

interface QueuedRow {
  id: string;
  consultation_session_id: string;
  provider: TranscriptProvider;
  language_code: string;
  composition_sid: string;
  retry_count: number;
  started_at: string | null;
}

async function processOneRow(
  admin: SupabaseClient,
  row: QueuedRow,
  now: Date,
  correlationId: string,
  result: VoiceTranscriptionJobResult,
): Promise<void> {
  const rowCtx = {
    correlationId,
    rowId: row.id,
    consultationSessionId: row.consultation_session_id,
    provider: row.provider,
  };

  // 1. Backoff — skip if the retry window hasn't elapsed.
  if (!isBackoffReady(row.retry_count, row.started_at, now)) {
    result.stillQueued += 1;
    logger.debug(rowCtx, 'voice-transcription-worker: backoff not elapsed, skipping');
    return;
  }

  // 2. Resolve the audio Composition. `composition_sid` on the row is
  //    the room SID placeholder until the Composition is finalised.
  const resolved = await resolveComposition(row.composition_sid, correlationId).catch(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { ...rowCtx, error: msg },
        'voice-transcription-worker: composition lookup threw, treating as not-ready',
      );
      return null;
    },
  );

  if (!resolved) {
    result.notYetReady += 1;
    return;
  }

  // 3. Flip to `'processing'` atomically on the `queued` predicate.
  //    Concurrent worker runs only let one actually claim the row.
  const { data: claimed, error: claimErr } = await admin
    .from('consultation_transcripts')
    .update({
      status: 'processing',
      started_at: now.toISOString(),
      composition_sid: resolved.compositionSid,
    })
    .eq('id', row.id)
    .eq('status', 'queued')
    .select('id')
    .maybeSingle();

  if (claimErr) {
    logger.error(
      { ...rowCtx, error: claimErr.message },
      'voice-transcription-worker: claim update failed',
    );
    result.failed += 1;
    result.errors.push(claimErr.message);
    return;
  }
  if (!claimed) {
    // Another worker won the race. Count as still-queued for dashboard.
    result.stillQueued += 1;
    return;
  }

  // 4. Run the transcription.
  const processInput: ProcessVoiceTranscriptionInput = {
    consultationSessionId: row.consultation_session_id,
    audioUrl: resolved.audioUrl,
    languageCode: row.language_code,
    provider: row.provider,
    correlationId,
  };

  try {
    const out = await processVoiceTranscription(processInput);

    // 5a. Success — persist transcript fields, flip to 'completed',
    //     emit the structured cost-telemetry log line.
    const { error: updErr } = await admin
      .from('consultation_transcripts')
      .update({
        status: 'completed',
        transcript_json: out.transcriptJson,
        transcript_text: out.transcriptText,
        duration_seconds: out.durationSeconds,
        cost_usd_cents: out.costUsdCents,
        completed_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (updErr) {
      // We have the transcript but failed to persist it. Treat as
      // transient — the provider will be called again on next tick (the
      // unique index prevents a duplicate; worst-case we eat the cost of
      // one extra provider call). Log loudly.
      logger.error(
        { ...rowCtx, error: updErr.message },
        'voice-transcription-worker: completed-row update failed, will retry',
      );
      await markTransientFailure(admin, row, updErr.message, correlationId, result);
      return;
    }

    logger.info(
      {
        consultation_session_id: row.consultation_session_id,
        provider: out.provider,
        duration_seconds: out.durationSeconds,
        cost_usd_cents: out.costUsdCents,
        language_code: out.languageCode,
      },
      'voice-transcription: completed',
    );
    result.processed += 1;
    return;
  } catch (err) {
    if (err instanceof TranscriptionTransientError) {
      await markTransientFailure(admin, row, err.message, correlationId, result);
      return;
    }
    if (err instanceof TranscriptionPermanentError) {
      await markPermanentFailure(admin, row, err.message, correlationId, result);
      return;
    }
    // Unknown error — treat as permanent to avoid infinite retry on a
    // bug we don't understand. The original error message is preserved
    // in `error_message` so ops can investigate.
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { ...rowCtx, error: msg },
      'voice-transcription-worker: unclassified error, marking permanent',
    );
    await markPermanentFailure(admin, row, msg, correlationId, result);
  }
}

async function markTransientFailure(
  admin: SupabaseClient,
  row: QueuedRow,
  errorMessage: string,
  correlationId: string,
  result: VoiceTranscriptionJobResult,
): Promise<void> {
  const nextRetryCount = row.retry_count + 1;
  const cap = env.VOICE_TRANSCRIPTION_MAX_RETRIES;

  if (nextRetryCount > cap) {
    logger.warn(
      {
        correlationId,
        rowId: row.id,
        retryCount: nextRetryCount,
        cap,
      },
      'voice-transcription-worker: retry cap hit, marking failed',
    );
    await admin
      .from('consultation_transcripts')
      .update({
        status: 'failed',
        retry_count: nextRetryCount,
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    result.failed += 1;
    return;
  }

  await admin
    .from('consultation_transcripts')
    .update({
      status: 'queued',
      retry_count: nextRetryCount,
      error_message: errorMessage,
    })
    .eq('id', row.id);
  result.stillQueued += 1;
  logger.info(
    {
      correlationId,
      rowId: row.id,
      retryCount: nextRetryCount,
      cap,
    },
    'voice-transcription-worker: transient failure, re-queued',
  );
}

async function markPermanentFailure(
  admin: SupabaseClient,
  row: QueuedRow,
  errorMessage: string,
  correlationId: string,
  result: VoiceTranscriptionJobResult,
): Promise<void> {
  await admin
    .from('consultation_transcripts')
    .update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  result.failed += 1;
  logger.warn(
    {
      correlationId,
      rowId: row.id,
      error: errorMessage,
    },
    'voice-transcription-worker: permanent failure, marked failed',
  );
}

// ============================================================================
// Exports for tests
// ============================================================================

export const __testInternals = {
  BACKOFF_MS_BY_RETRY_COUNT,
  isBackoffReady,
};
