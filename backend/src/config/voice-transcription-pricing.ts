/**
 * Voice Transcription Pricing Constants (Plan 05 · Task 25)
 *
 * One file, one place to edit when providers update their price lists.
 * Values are **USD per second** so the cost math is a single multiply;
 * conversion to cents happens at the call site via `Math.round(usd * 100)`.
 *
 * Current constants (verified 2026-04-19; Groq 2026-09-04):
 *   * OpenAI Whisper   — $0.006 per minute → $0.0001 per second.
 *   * Deepgram Nova-2  — $0.0043 per minute → ≈$0.00007166 per second.
 *   * Deepgram Nova-3  — $0.0052 per minute (multilingual / code-switch).
 *   * Groq Whisper Turbo — $0.04 per hour → $0.000666… per minute.
 *
 * Ops update ritual:
 *   1. Bump the constant here.
 *   2. Update `voice-transcription-service.test.ts#cost computation` to
 *      reflect the new value (the test pins the math so a silent edit here
 *      is caught in CI).
 *   3. Ship in one PR.
 *
 * @see docs/Work/Daily-plans/April 2026/19-04-2026/Tasks/task-25-voice-transcription-pipeline.md
 */

/** OpenAI Whisper pricing in USD per minute. */
export const WHISPER_USD_PER_MINUTE = 0.006;

/** Deepgram Nova-2 pricing in USD per minute. */
export const DEEPGRAM_USD_PER_MINUTE = 0.0043;

/** Deepgram Nova-3 Multilingual — quality buy vs Nova-2. */
export const DEEPGRAM_NOVA_3_USD_PER_MINUTE = 0.0052;

/** Groq Whisper Large v3 Turbo — $0.04 per hour. */
export const GROQ_WHISPER_USD_PER_HOUR = 0.04;
export const GROQ_WHISPER_USD_PER_MINUTE = GROQ_WHISPER_USD_PER_HOUR / 60;

type PricedTranscriptProvider =
  | 'openai_whisper'
  | 'deepgram_nova_2'
  | 'deepgram_nova_3'
  | 'groq_whisper';

/**
 * Compute cost in USD cents (integer) for a given duration in seconds.
 * Uses `Math.round` so 0.5-cent boundaries round up; test-pinned.
 */
export function costCentsForDuration(
  provider: PricedTranscriptProvider,
  durationSeconds: number,
): number {
  const perMinute =
    provider === 'openai_whisper'
      ? WHISPER_USD_PER_MINUTE
      : provider === 'groq_whisper'
        ? GROQ_WHISPER_USD_PER_MINUTE
        : provider === 'deepgram_nova_3'
          ? DEEPGRAM_NOVA_3_USD_PER_MINUTE
          : DEEPGRAM_USD_PER_MINUTE;
  const usd = (durationSeconds / 60) * perMinute;
  return Math.round(usd * 100);
}
