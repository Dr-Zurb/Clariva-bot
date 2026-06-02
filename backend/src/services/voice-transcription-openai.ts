/**
 * OpenAI Whisper transcription client (Plan 05 · Task 25)
 *
 * Narrow wrapper around Whisper's `/audio/transcriptions` endpoint. Uses the
 * URL-pass-through pattern where possible: Twilio Composition URLs are
 * signed S3 URLs with a multi-hour TTL that Whisper can fetch directly via
 * the `file` field's URL variant — saving us a hop.
 *
 * Whisper's OpenAI SDK (v6 in repo) does NOT today accept a URL for the
 * `file` field via the typed `audio.transcriptions.create` method; it
 * expects a Buffer / Uint8Array / file stream. We therefore download the
 * signed URL once and hand the bytes to the SDK — one hop from our
 * backend, same as the task note #4 contemplates as the fallback path.
 * Re-evaluate at PR-time if the SDK adds native URL support; the change
 * would be a local swap in `transcribeWithWhisper`.
 *
 * Fail-loud posture:
 *   * Missing `OPENAI_API_KEY` → TranscriptionPermanentError (worker marks
 *     the row `'failed'` — retry cannot recover from a missing credential).
 *   * 5xx / network failure     → TranscriptionTransientError (worker retries).
 *   * 4xx / malformed response  → TranscriptionPermanentError.
 *
 * No retries inside this client — backoff / retry lives in the worker layer.
 *
 * @see backend/src/services/voice-transcription-service.ts — router + DB I/O.
 * @see https://platform.openai.com/docs/api-reference/audio/createTranscription
 */

import OpenAI from 'openai';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  TranscriptionPermanentError,
  TranscriptionTransientError,
  type TranscriptResult,
} from '../types/consultation-transcript';
import { costCentsForDuration } from '../config/voice-transcription-pricing';

export interface TranscribeWithWhisperInput {
  /**
   * HTTP(S) URL to the audio file. For Twilio Compositions this is the
   * short-lived signed URL returned by the Compositions API.
   */
  audioUrl: string;
  /**
   * Language code as stored on our side (`'en-IN'`, `'en-US'`, `'en-GB'`...).
   * Whisper expects ISO-639-1 (`'en'`) — we strip the region suffix before
   * the API call. For unrecognised codes we omit the `language` param and
   * let Whisper auto-detect.
   */
  languageCode: string;
  correlationId: string;
}

/**
 * Lazy-singleton OpenAI client. We pass `apiKey` explicitly so a missing
 * env var produces our own clear error rather than the SDK's generic
 * "You didn't provide an API key" message.
 */
let openAiClient: OpenAI | null = null;
function getOpenAiClient(): OpenAI {
  if (openAiClient) return openAiClient;
  if (!env.OPENAI_API_KEY) {
    throw new TranscriptionPermanentError(
      'voice-transcription-openai: OPENAI_API_KEY is not set — Whisper cannot be reached. ' +
        'Worker will mark the transcript row as failed.',
    );
  }
  openAiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return openAiClient;
}

/**
 * Map our BCP-47-ish codes to Whisper's ISO-639-1.
 *   'en-IN' | 'en-US' | 'en-GB' | 'en' → 'en'
 *   'hi-IN' | 'hi'                     → 'hi' (Whisper does decent Hindi; only
 *                                             used if the router falls through)
 *   anything else                       → undefined (let Whisper auto-detect).
 */
function whisperLanguageParam(code: string): string | undefined {
  const lower = code.toLowerCase();
  if (lower.startsWith('en')) return 'en';
  if (lower.startsWith('hi')) return 'hi';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('es')) return 'es';
  return undefined;
}

/**
 * Fetch the audio bytes from a signed URL. 5xx → transient; 4xx → permanent
 * (URL expired, path wrong, etc.).
 */
async function downloadAudio(
  audioUrl: string,
  correlationId: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  let res: Response;
  try {
    res = await fetch(audioUrl);
  } catch (err) {
    throw new TranscriptionTransientError(
      'voice-transcription-openai: audio download network error',
      err,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '<unreadable>');
    if (res.status >= 500) {
      throw new TranscriptionTransientError(
        `voice-transcription-openai: audio download ${res.status} ${res.statusText}`,
        { body },
      );
    }
    throw new TranscriptionPermanentError(
      `voice-transcription-openai: audio download ${res.status} ${res.statusText} (signed URL probably expired)`,
      { body },
    );
  }
  logger.debug(
    { correlationId, contentType: res.headers.get('content-type') },
    'voice-transcription-openai: audio downloaded',
  );
  return {
    bytes: await res.arrayBuffer(),
    contentType: res.headers.get('content-type') ?? 'audio/mpeg',
  };
}

/**
 * Concatenate Whisper `verbose_json` segments into a plain-text transcript.
 * Defensive against missing / empty segments — we never want to surface
 * provider-shape errors as TranscriptionPermanentError when the top-level
 * `text` field is usable.
 */
function concatSegmentsToText(verboseJson: {
  text?: string;
  segments?: Array<{ text?: string }>;
}): string {
  if (Array.isArray(verboseJson.segments) && verboseJson.segments.length > 0) {
    return verboseJson.segments
      .map((s) => (s.text ?? '').trim())
      .filter((t) => t.length > 0)
      .join(' ')
      .trim();
  }
  return (verboseJson.text ?? '').trim();
}

/**
 * Run a single Whisper transcription. Returns a uniform `TranscriptResult`;
 * throws a typed error on failure. See module-level JSDoc for error taxonomy.
 */
export async function transcribeWithWhisper(
  input: TranscribeWithWhisperInput,
): Promise<TranscriptResult> {
  const client = getOpenAiClient(); // may throw TranscriptionPermanentError
  const { bytes, contentType } = await downloadAudio(
    input.audioUrl,
    input.correlationId,
  );

  // The SDK's `toFile` helper normalises any Buffer / Blob / ArrayBuffer
  // into the multipart-friendly shape Whisper expects. We pass a generic
  // `audio.mp3` name because Twilio audio Compositions land as mp3 today
  // (task note #11); the extension is advisory — Whisper detects format
  // from magic bytes.
  const file = await OpenAI.toFile(Buffer.from(bytes), 'audio.mp3', {
    type: contentType,
  });

  let verboseJson:
    | {
        text?: string;
        language?: string;
        duration?: number;
        segments?: Array<{ text?: string; start?: number; end?: number }>;
      }
    | undefined;

  try {
    const lang = whisperLanguageParam(input.languageCode);
    // `response_format: 'verbose_json'` gives us segments + duration in one
    // shot, which we need for cost math and the denormalised text.
    const response = await client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
      ...(lang ? { language: lang } : {}),
    });
    verboseJson = response as unknown as typeof verboseJson;
  } catch (err) {
    // The OpenAI SDK surfaces HTTP failures as `APIError` with a `.status`.
    const status = (err as { status?: number })?.status ?? 0;
    if (status >= 500 || status === 0) {
      throw new TranscriptionTransientError(
        'voice-transcription-openai: Whisper 5xx / network error',
        err,
      );
    }
    throw new TranscriptionPermanentError(
      `voice-transcription-openai: Whisper ${status} error`,
      err,
    );
  }

  if (!verboseJson || typeof verboseJson !== 'object') {
    throw new TranscriptionPermanentError(
      'voice-transcription-openai: Whisper returned non-object response',
    );
  }

  const durationSeconds = Math.max(0, Math.round(verboseJson.duration ?? 0));
  const transcriptText = concatSegmentsToText(verboseJson);

  return {
    provider: 'openai_whisper',
    languageCode: input.languageCode,
    transcriptJson: verboseJson,
    transcriptText,
    durationSeconds,
    costUsdCents: costCentsForDuration('openai_whisper', durationSeconds),
  };
}

/**
 * Test-only reset of the lazy singleton. Exported under `__resetForTests` so
 * production call sites never touch it.
 */
export const __resetForTests = {
  clearClient: (): void => {
    openAiClient = null;
  },
  setClient: (client: OpenAI | null): void => {
    openAiClient = client;
  },
};
