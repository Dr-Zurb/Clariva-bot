/**
 * Groq Whisper Large v3 Turbo transcription client (cost-cut step 5).
 *
 * OpenAI-compatible `/audio/transcriptions` at api.groq.com. Same
 * download-then-toFile hop as the OpenAI Whisper client. Hindi / Hinglish
 * does not use this path (Deepgram).
 *
 * Fail-loud: missing GROQ_API_KEY → permanent; 5xx / network → transient;
 * 4xx → permanent. No retries here — the worker owns backoff.
 */

import OpenAI from 'openai';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  TranscriptionPermanentError,
  TranscriptionTransientError,
  type TranscriptionAudioBytes,
  type TranscriptResult,
} from '../types/consultation-transcript';
import { costCentsForDuration } from '../config/voice-transcription-pricing';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_WHISPER_MODEL = 'whisper-large-v3-turbo';

export interface TranscribeWithGroqInput {
  /** Supply exactly one of `audioUrl` or `audioBytes`. */
  audioUrl?: string;
  /** Locally transcoded audio (cost-cut step 7's raw-track path). */
  audioBytes?: TranscriptionAudioBytes;
  languageCode: string;
  correlationId: string;
}

export function isGroqTranscriptionConfigured(): boolean {
  return Boolean(env.GROQ_API_KEY?.trim());
}

let groqClient: OpenAI | null = null;
function getGroqClient(): OpenAI {
  if (groqClient) return groqClient;
  const apiKey = env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new TranscriptionPermanentError(
      'voice-transcription-groq: GROQ_API_KEY is not set — Groq cannot be reached. ' +
        'Worker will mark the transcript row as failed.',
    );
  }
  groqClient = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  return groqClient;
}

function whisperLanguageParam(code: string): string | undefined {
  const lower = code.toLowerCase();
  if (lower.startsWith('en')) return 'en';
  if (lower.startsWith('hi')) return 'hi';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('es')) return 'es';
  return undefined;
}

async function downloadAudio(
  audioUrl: string,
  correlationId: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  let res: Response;
  try {
    res = await fetch(audioUrl);
  } catch (err) {
    throw new TranscriptionTransientError(
      'voice-transcription-groq: audio download network error',
      err,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '<unreadable>');
    if (res.status >= 500) {
      throw new TranscriptionTransientError(
        `voice-transcription-groq: audio download ${res.status} ${res.statusText}`,
        { body },
      );
    }
    throw new TranscriptionPermanentError(
      `voice-transcription-groq: audio download ${res.status} ${res.statusText} (signed URL probably expired)`,
      { body },
    );
  }
  logger.debug(
    { correlationId, contentType: res.headers.get('content-type') },
    'voice-transcription-groq: audio downloaded',
  );
  return {
    bytes: await res.arrayBuffer(),
    contentType: res.headers.get('content-type') ?? 'audio/mpeg',
  };
}

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

export async function transcribeWithGroq(
  input: TranscribeWithGroqInput,
): Promise<TranscriptResult> {
  const client = getGroqClient();

  let payload: Buffer;
  let contentType: string;
  let filename: string;

  if (input.audioBytes) {
    payload = input.audioBytes.bytes;
    contentType = input.audioBytes.contentType;
    filename = input.audioBytes.filename;
  } else if (input.audioUrl) {
    const downloaded = await downloadAudio(input.audioUrl, input.correlationId);
    payload = Buffer.from(downloaded.bytes);
    contentType = downloaded.contentType;
    filename = 'audio.mp3';
  } else {
    throw new TranscriptionPermanentError(
      'voice-transcription-groq: neither audioUrl nor audioBytes supplied',
    );
  }

  const file = await OpenAI.toFile(payload, filename, {
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
    const response = await client.audio.transcriptions.create({
      file,
      model: GROQ_WHISPER_MODEL,
      response_format: 'verbose_json',
      ...(lang ? { language: lang } : {}),
    });
    verboseJson = response as unknown as typeof verboseJson;
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 0;
    if (status >= 500 || status === 0) {
      throw new TranscriptionTransientError(
        'voice-transcription-groq: Groq 5xx / network error',
        err,
      );
    }
    throw new TranscriptionPermanentError(
      `voice-transcription-groq: Groq ${status} error`,
      err,
    );
  }

  if (!verboseJson || typeof verboseJson !== 'object') {
    throw new TranscriptionPermanentError(
      'voice-transcription-groq: Groq returned non-object response',
    );
  }

  const durationSeconds = Math.max(0, Math.round(verboseJson.duration ?? 0));
  const transcriptText = concatSegmentsToText(verboseJson);

  return {
    provider: 'groq_whisper',
    languageCode: input.languageCode,
    transcriptJson: verboseJson,
    transcriptText,
    durationSeconds,
    costUsdCents: costCentsForDuration('groq_whisper', durationSeconds),
  };
}

export const __resetForTests = {
  clearClient: (): void => {
    groqClient = null;
  },
  setClient: (client: OpenAI | null): void => {
    groqClient = client;
  },
};
