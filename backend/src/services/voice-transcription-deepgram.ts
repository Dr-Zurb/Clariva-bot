/**
 * Deepgram Nova-2 transcription client (Plan 05 · Task 25)
 *
 * Narrow wrapper around Deepgram's `/v1/listen` endpoint using the
 * URL-pass-through pattern (preferred per task note #4 — saves our backend
 * from downloading + re-uploading the audio when the provider accepts a
 * signed URL). Deepgram natively supports `{ url: "<signed>" }` in the
 * request body.
 *
 * Language handling (task note #9): our table stores the doctor-profile
 * language (e.g. `'hi-IN'`) but we pass `'multi'` to Deepgram for Hindi-
 * flagged consults so the Nova-2 model can code-switch between Hindi and
 * English on Hinglish speech. `selectProvider` only ever routes Hindi /
 * Hinglish here, so the mapping is:
 *   'hi' | 'hi-IN' → model param 'nova-3' (default), language param 'multi'
 *   anything else  → should never reach this client (router bug if it did);
 *                    we still send it with language passed through verbatim
 *                    and let Deepgram's own validation fail.
 *
 * Fail-loud posture mirrors `voice-transcription-openai.ts`:
 *   * Missing `DEEPGRAM_API_KEY` → TranscriptionPermanentError.
 *   * 5xx / network failure      → TranscriptionTransientError.
 *   * 4xx / malformed response   → TranscriptionPermanentError.
 *
 * No retries inside this client — worker owns retry policy.
 *
 * @see backend/src/services/voice-transcription-service.ts
 * @see https://developers.deepgram.com/docs/pre-recorded-audio
 */

import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  TranscriptionPermanentError,
  TranscriptionTransientError,
  type TranscriptionAudioBytes,
  type TranscriptResult,
} from '../types/consultation-transcript';
import { costCentsForDuration } from '../config/voice-transcription-pricing';

const DEEPGRAM_ENDPOINT = 'https://api.deepgram.com/v1/listen';

export type DeepgramListenModel = 'nova-2' | 'nova-3';

export interface TranscribeWithDeepgramInput {
  /** Supply exactly one of `audioUrl` or `audioBytes`. */
  audioUrl?: string;
  /** Locally transcoded audio (cost-cut step 7's raw-track path). */
  audioBytes?: TranscriptionAudioBytes;
  /** See module JSDoc for the mapping. */
  languageCode: string;
  correlationId: string;
  /** Default nova-3 (cost-cut step 6). nova-2 is for in-flight / QA rows. */
  model?: DeepgramListenModel;
}

/**
 * Map our language codes to Deepgram's `language` query param. Hindi /
 * Hinglish route to `'multi'` for the best code-switching behaviour;
 * everything else passes through (Deepgram accepts `en`, `en-US`, etc.).
 */
function deepgramLanguageParam(code: string): string {
  const lower = code.toLowerCase();
  if (lower.startsWith('hi')) return 'multi';
  return code;
}

/**
 * Shape of the Deepgram response we care about. The SDK returns a much
 * larger object; we narrow via TypeScript rather than at runtime so a
 * provider-side JSON shape change surfaces as a permanent error on the
 * FIRST affected row (fail loud, fail fast) rather than silently producing
 * empty-string transcripts.
 */
interface DeepgramResponse {
  metadata?: {
    duration?: number;
  };
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
      }>;
    }>;
  };
}

function extractDurationSeconds(r: DeepgramResponse): number {
  const d = r.metadata?.duration;
  if (typeof d === 'number' && Number.isFinite(d) && d >= 0) {
    return Math.round(d);
  }
  return 0;
}

function extractTranscriptText(r: DeepgramResponse): string {
  const t = r.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  return typeof t === 'string' ? t.trim() : '';
}

/**
 * Run a single Deepgram transcription. Uniform `TranscriptResult` shape;
 * typed error taxonomy per module JSDoc.
 */
export async function transcribeWithDeepgram(
  input: TranscribeWithDeepgramInput,
): Promise<TranscriptResult> {
  if (!env.DEEPGRAM_API_KEY) {
    throw new TranscriptionPermanentError(
      'voice-transcription-deepgram: DEEPGRAM_API_KEY is not set — Deepgram cannot be reached. ' +
        'Worker will mark the transcript row as failed.',
    );
  }

  const model: DeepgramListenModel = input.model ?? 'nova-3';
  const provider = model === 'nova-2' ? 'deepgram_nova_2' : 'deepgram_nova_3';
  const languageParam = deepgramLanguageParam(input.languageCode);
  const qs = new URLSearchParams({
    model,
    language: languageParam,
    punctuate: 'true',
    smart_format: 'true',
  });
  const url = `${DEEPGRAM_ENDPOINT}?${qs.toString()}`;

  // Deepgram takes either a JSON body naming a fetchable URL, or the raw
  // media as the body with its own content type. Step 7's mixed tracks
  // only exist as local bytes, so they use the latter.
  let contentType: string;
  let body: RequestInit['body'];
  if (input.audioBytes) {
    contentType = input.audioBytes.contentType;
    body = input.audioBytes.bytes;
  } else if (input.audioUrl) {
    contentType = 'application/json';
    body = JSON.stringify({ url: input.audioUrl });
  } else {
    throw new TranscriptionPermanentError(
      'voice-transcription-deepgram: neither audioUrl nor audioBytes supplied',
    );
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        'Content-Type': contentType,
      },
      body,
    });
  } catch (err) {
    throw new TranscriptionTransientError(
      'voice-transcription-deepgram: network error reaching Deepgram',
      err,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '<unreadable>');
    if (res.status >= 500) {
      throw new TranscriptionTransientError(
        `voice-transcription-deepgram: ${res.status} ${res.statusText}`,
        { body },
      );
    }
    throw new TranscriptionPermanentError(
      `voice-transcription-deepgram: ${res.status} ${res.statusText}`,
      { body },
    );
  }

  let json: DeepgramResponse;
  try {
    json = (await res.json()) as DeepgramResponse;
  } catch (err) {
    throw new TranscriptionPermanentError(
      'voice-transcription-deepgram: malformed JSON response',
      err,
    );
  }

  const durationSeconds = extractDurationSeconds(json);
  const transcriptText = extractTranscriptText(json);

  if (transcriptText.length === 0 && durationSeconds > 0) {
    // Defensive: a non-zero-duration audio that yields no transcript is
    // rare but has been seen when the audio is silent. Not an error — we
    // still persist the completed row so ops know the pipeline worked.
    logger.warn(
      { correlationId: input.correlationId, durationSeconds },
      'voice-transcription-deepgram: non-empty audio produced empty transcript (silent consult?)',
    );
  }

  return {
    provider,
    languageCode: input.languageCode,
    transcriptJson: json,
    transcriptText,
    durationSeconds,
    costUsdCents: costCentsForDuration(provider, durationSeconds),
  };
}
