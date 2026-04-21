/**
 * Consultation Transcript Types (Plan 05 · Task 25)
 *
 * Shapes the voice-transcription pipeline flows across module boundaries.
 * Mirror the Postgres columns in migration 061 where applicable; diverge
 * (camelCase) at the service layer.
 *
 * @see backend/migrations/061_consultation_transcripts.sql
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-25-voice-transcription-pipeline.md
 */

// ============================================================================
// Enums — mirror the CHECK constraints in 061_consultation_transcripts.sql
// ============================================================================

/**
 * Provider that produced the transcript. Kept as a narrow union so TypeScript
 * can enforce the routing map at the call site of `selectProvider`. Add new
 * values in lockstep with a migration that widens the CHECK constraint.
 */
export type TranscriptProvider = 'openai_whisper' | 'deepgram_nova_2';

/**
 * Job state machine. Worker owns all transitions:
 *   queued     → processing (worker picks up a row)
 *   processing → completed  (provider call succeeded)
 *   processing → queued     (transient 5xx / network failure, retry_count++)
 *   processing → failed     (permanent failure OR retry cap hit)
 *
 * `failed` rows are kept indefinitely for ops triage (see migration 061
 * trailing docs); no auto-cleanup.
 */
export type TranscriptStatus = 'queued' | 'processing' | 'completed' | 'failed';

// ============================================================================
// Shapes returned by provider clients + re-exposed by the service
// ============================================================================

/**
 * Result of a single transcription run. Uniform shape across Whisper and
 * Deepgram so the worker layer can stay provider-agnostic — the provider
 * clients do the JSON normalisation.
 */
export interface TranscriptResult {
  provider: TranscriptProvider;
  languageCode: string;
  /**
   * Provider's native JSON shape. Opaque to the service; persisted verbatim
   * in `consultation_transcripts.transcript_json`.
   *
   * Whisper `verbose_json`: `{ task, language, duration, text, segments[] }`.
   * Deepgram `results.channels[0].alternatives[0]`: `{ transcript, confidence,
   * words[], paragraphs? }`. Downstream AI consumers should treat this as
   * provider-specific.
   */
  transcriptJson: unknown;
  /** Denormalised plain text — concat of segments. */
  transcriptText: string;
  durationSeconds: number;
  /** Minor units (cents). Computed by the provider client from its pricing constant. */
  costUsdCents: number;
}

/**
 * The persisted row's camelCase mirror. Used by the worker when reading
 * queued jobs out of the database; not exported from the service boundary.
 */
export interface ConsultationTranscriptRow {
  id: string;
  consultationSessionId: string;
  provider: TranscriptProvider;
  languageCode: string;
  transcriptJson: unknown;
  transcriptText: string;
  durationSeconds: number;
  costUsdCents: number;
  compositionSid: string;
  status: TranscriptStatus;
  retryCount: number;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

// ============================================================================
// Error taxonomy surfaced by provider clients
// ============================================================================

/**
 * Thrown by a provider client when the upstream service returns 5xx or the
 * request fails at the network level. Transient — the worker retries up to
 * `VOICE_TRANSCRIPTION_MAX_RETRIES` with exponential backoff.
 */
export class TranscriptionTransientError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'TranscriptionTransientError';
    this.cause = cause;
  }
}

/**
 * Thrown by a provider client when the upstream service returns 4xx, the
 * audio payload is malformed, or the provider config is permanently wrong
 * (missing API key). Terminal — the worker marks the row `'failed'` and
 * does NOT retry.
 */
export class TranscriptionPermanentError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'TranscriptionPermanentError';
    this.cause = cause;
  }
}
