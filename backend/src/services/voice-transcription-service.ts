/**
 * Voice Transcription Service (Plan 05 · Task 25)
 *
 * Post-consult transcription pipeline. Three public functions:
 *
 *   - `selectProvider(languageCode)`        — pure router, no I/O.
 *   - `enqueueVoiceTranscription({ ... })`  — called by the voice adapter's
 *                                             endSession (Task 23) to insert
 *                                             a `queued` row. Best-effort;
 *                                             never throws on transient
 *                                             failures (the consult is
 *                                             already over).
 *   - `processVoiceTranscription({ ... })`  — called by the worker after the
 *                                             audio Composition is ready.
 *                                             Runs the selected provider
 *                                             client; returns a uniform
 *                                             `TranscriptResult`. Throws a
 *                                             typed transient / permanent
 *                                             error on failure so the
 *                                             worker can decide whether to
 *                                             retry.
 *
 * Routing table (pinned in `voice-transcription-service.test.ts`):
 *
 *   'hi' | 'hi-IN'                                       → deepgram_nova_3
 *   'en' | 'en-IN' | 'en-US' | 'en-GB' | any 'en-*'      → groq_whisper
 *   anything else (incl. 'fr', 'es', 'zh', 'unknown')    → groq_whisper
 *                                                          (broader coverage)
 *   Enqueue falls back to openai_whisper when GROQ_API_KEY is unset.
 *
 * rec-10: audio is a disclosed mandate. Enqueue is not gated on a
 * patient consent decision.
 *
 * Composition SID fallback: on enqueue, Twilio's Composition-finalized
 * webhook may not have fired yet. We insert with `composition_sid = the
 * Twilio room SID` (the `providerSessionId`) as a placeholder; the worker
 * resolves the real Composition SID on first poll by querying
 * `recording_artifact_index` for `artifact_kind='audio_composition'`
 * anchored to the session. See `voice-transcription-worker.ts`.
 *
 * Cost telemetry contract: every `'completed'` transition emits a
 * structured log line:
 *
 *   logger.info(
 *     { consultation_session_id, provider, duration_seconds,
 *       cost_usd_cents, language_code },
 *     'voice-transcription: completed',
 *   );
 *
 * The worker owns this log line (it's where the DB transition happens),
 * but the shape is pinned in the worker test so ops can rely on it.
 *
 * @see backend/migrations/061_consultation_transcripts.sql
 * @see docs/Work/Daily-plans/April 2026/19-04-2026/Tasks/task-25-voice-transcription-pipeline.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { findSessionByProviderSessionId } from './consultation-session-service';
import { transcribeWithWhisper } from './voice-transcription-openai';
import { transcribeWithDeepgram } from './voice-transcription-deepgram';
import {
  isGroqTranscriptionConfigured,
  transcribeWithGroq,
} from './voice-transcription-groq';
import type {
  TranscriptionAudioBytes,
  TranscriptProvider,
  TranscriptResult,
} from '../types/consultation-transcript';

// ============================================================================
// Pure router
// ============================================================================

/**
 * Select the provider to use for a given language code. Pure, no I/O —
 * unit-tested in isolation. See module JSDoc for the table.
 */
export function selectProvider(languageCode: string): TranscriptProvider {
  const lower = (languageCode ?? '').trim().toLowerCase();
  if (lower === 'hi' || lower.startsWith('hi-')) {
    return 'deepgram_nova_3';
  }
  // Everything else → Groq Whisper (English + unknown/other).
  return 'groq_whisper';
}

/**
 * Provider written on enqueue. Same map as `selectProvider`, except
 * English/other falls back to OpenAI Whisper when Groq is not configured
 * so existing deploys keep transcribing.
 */
export function resolveEnqueueProvider(languageCode: string): TranscriptProvider {
  const chosen = selectProvider(languageCode);
  if (chosen === 'groq_whisper' && !isGroqTranscriptionConfigured()) {
    return 'openai_whisper';
  }
  return chosen;
}

// ============================================================================
// enqueueVoiceTranscription — called by voice adapter's endSession
// ============================================================================

export interface EnqueueVoiceTranscriptionInput {
  /**
   * Twilio Video room SID for the voice session. We look up the
   * `consultation_sessions` row by this + `provider = 'twilio_video_audio'`.
   */
  providerSessionId: string;
}

/**
 * Resolve the doctor's preferred language for the session. In v1 the
 * `doctors` table does NOT carry a `profile_language` column (see task
 * doc — v2 candidate). Returns `'en-IN'` as the safe default until that
 * column lands.
 *
 * This is a pure helper on top of the session row — it reads nothing
 * extra from the DB. When the column is added, widen this to JOIN through
 * `doctor_id` and read it; unit tests already stub the whole path so the
 * widen will be a local change.
 */
function resolveLanguageCodeForSession(_doctorId: string): string {
  // TODO(Task 25 v2): once `doctors.profile_language` exists, read it here.
  // Explicit default documented so a future reader can ctrl-F.
  return 'en-IN';
}

/**
 * Insert a `queued` transcription row. Idempotent via the unique
 * `(consultation_session_id, provider)` index — a retried endSession
 * collapses to ON CONFLICT DO NOTHING.
 *
 * Never throws. All failure modes log at `warn` or `info` and return,
 * because the consult is already over — transcription is best-effort.
 */
export async function enqueueVoiceTranscription(input: {
  providerSessionId: string;
}): Promise<void> {
  const providerSessionId = input.providerSessionId?.trim();
  if (!providerSessionId) {
    logger.warn(
      'voice-transcription: enqueue called with empty providerSessionId — ignored',
    );
    return;
  }

  if (!env.VOICE_TRANSCRIPTION_ENABLED) {
    logger.info(
      { providerSessionId },
      'voice-transcription: VOICE_TRANSCRIPTION_ENABLED=false — enqueue no-op',
    );
    return;
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn(
      { providerSessionId },
      'voice-transcription: no admin client — cannot enqueue',
    );
    return;
  }

  // 1. Resolve the consultation_sessions row. The voice adapter's
  //    provider is 'twilio_video_audio' (see types/consultation-session.ts).
  const session = await findSessionByProviderSessionId(
    'twilio_video_audio',
    providerSessionId,
  ).catch((err: unknown) => {
    logger.warn(
      {
        providerSessionId,
        error: err instanceof Error ? err.message : String(err),
      },
      'voice-transcription: session lookup failed — skipping enqueue',
    );
    return null;
  });

  if (!session) {
    logger.warn(
      { providerSessionId },
      'voice-transcription: no session found for providerSessionId — skipping enqueue',
    );
    return;
  }

  // 2. Resolve language + provider.
  const languageCode = resolveLanguageCodeForSession(session.doctorId);
  const provider = resolveEnqueueProvider(languageCode);

  // 3. Insert the queued row. composition_sid starts as the room SID; the
  //    worker resolves the real Composition SID on first poll.
  const { error } = await admin
    .from('consultation_transcripts')
    .insert({
      consultation_session_id: session.id,
      provider,
      language_code: languageCode,
      composition_sid: providerSessionId,
      status: 'queued',
    })
    .select('id')
    .maybeSingle();

  if (error) {
    // `23505` = unique_violation → second enqueue for the same (session,
    // provider). Expected on retried endSession; info, not warn.
    const code = (error as { code?: string }).code ?? '';
    if (code === '23505') {
      logger.info(
        {
          consultationSessionId: session.id,
          provider,
        },
        'voice-transcription: enqueue collapsed to existing row (idempotent)',
      );
      return;
    }
    logger.warn(
      {
        consultationSessionId: session.id,
        provider,
        error: error.message,
      },
      'voice-transcription: enqueue insert failed — worker will not pick this up',
    );
    return;
  }

  logger.info(
    {
      consultationSessionId: session.id,
      provider,
      languageCode,
    },
    'voice-transcription: enqueued',
  );
}

// ============================================================================
// processVoiceTranscription — called by worker for each queued row
// ============================================================================

export interface ProcessVoiceTranscriptionInput {
  consultationSessionId: string;
  /**
   * HTTP(S) URL to the audio. For Twilio Compositions this is the signed
   * S3 URL returned by `compositions(sid).fetch().media_url` (or
   * equivalent). The worker resolves this BEFORE calling — this function
   * is HTTP-only and doesn't touch Twilio or the DB.
   *
   * Supply exactly one of `audioUrl` or `audioBytes`.
   */
  audioUrl?: string;
  /**
   * Audio the worker already has in memory. Cost-cut step 7's raw-track
   * route mixes Twilio's Matroska tracks locally, so there is no URL to
   * hand a vendor.
   */
  audioBytes?: TranscriptionAudioBytes;
  languageCode: string;
  /** Optional override; defaults to `selectProvider(languageCode)`. */
  provider?: TranscriptProvider;
  correlationId: string;
}

/**
 * Run a single transcription. Returns on success, throws `TranscriptionTransientError`
 * or `TranscriptionPermanentError` on failure (the worker inspects the
 * error class to decide retry behaviour).
 *
 * This is a pure orchestration function: route → provider call → return
 * the uniform `TranscriptResult`. The worker owns all DB I/O.
 */
export async function processVoiceTranscription(
  input: ProcessVoiceTranscriptionInput,
): Promise<TranscriptResult> {
  const provider = input.provider ?? selectProvider(input.languageCode);
  logger.debug(
    {
      correlationId: input.correlationId,
      consultationSessionId: input.consultationSessionId,
      provider,
      languageCode: input.languageCode,
    },
    'voice-transcription: process starting',
  );

  const audio = {
    ...(input.audioBytes ? { audioBytes: input.audioBytes } : {}),
    ...(input.audioUrl ? { audioUrl: input.audioUrl } : {}),
  };

  if (provider === 'deepgram_nova_3' || provider === 'deepgram_nova_2') {
    return transcribeWithDeepgram({
      ...audio,
      languageCode: input.languageCode,
      correlationId: input.correlationId,
      model: provider === 'deepgram_nova_2' ? 'nova-2' : 'nova-3',
    });
  }

  if (provider === 'groq_whisper') {
    return transcribeWithGroq({
      ...audio,
      languageCode: input.languageCode,
      correlationId: input.correlationId,
    });
  }

  return transcribeWithWhisper({
    ...audio,
    languageCode: input.languageCode,
    correlationId: input.correlationId,
  });
}
