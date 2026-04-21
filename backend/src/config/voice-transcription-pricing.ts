/**
 * Voice Transcription Pricing Constants (Plan 05 · Task 25)
 *
 * One file, one place to edit when providers update their price lists.
 * Values are **USD per second** so the cost math is a single multiply;
 * conversion to cents happens at the call site via `Math.round(usd * 100)`.
 *
 * Current constants (verified 2026-04-19):
 *   * OpenAI Whisper   — $0.006 per minute → $0.0001 per second.
 *   * Deepgram Nova-2  — $0.0043 per minute → ≈$0.00007166 per second.
 *
 * Ops update ritual:
 *   1. Bump the constant here.
 *   2. Update `voice-transcription-service.test.ts#cost computation` to
 *      reflect the new value (the test pins the math so a silent edit here
 *      is caught in CI).
 *   3. Ship in one PR.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-25-voice-transcription-pipeline.md
 */

/** OpenAI Whisper pricing in USD per minute. */
export const WHISPER_USD_PER_MINUTE = 0.006;

/** Deepgram Nova-2 pricing in USD per minute. */
export const DEEPGRAM_USD_PER_MINUTE = 0.0043;

/**
 * Compute cost in USD cents (integer) for a given duration in seconds.
 * Uses `Math.round` so 0.5-cent boundaries round up; test-pinned.
 */
export function costCentsForDuration(
  provider: 'openai_whisper' | 'deepgram_nova_2',
  durationSeconds: number,
): number {
  const perMinute =
    provider === 'openai_whisper'
      ? WHISPER_USD_PER_MINUTE
      : DEEPGRAM_USD_PER_MINUTE;
  const usd = (durationSeconds / 60) * perMinute;
  return Math.round(usd * 100);
}
