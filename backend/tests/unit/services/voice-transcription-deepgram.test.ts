/**
 * Unit tests for `services/voice-transcription-deepgram.ts` (Plan 05 · Task 25).
 *
 * We mock `global.fetch` — Deepgram uses the URL-pass-through pattern so
 * there's no SDK to mock. Coverage:
 *   - Missing DEEPGRAM_API_KEY → TranscriptionPermanentError.
 *   - Request shape: model=nova-2, language=multi for Hindi, Authorization
 *     header = 'Token <key>', body = `{ url: '<audioUrl>' }`.
 *   - Happy path: duration + transcript parsed from Deepgram's
 *     `results.channels[0].alternatives[0].transcript`.
 *   - 5xx → TranscriptionTransientError.
 *   - 4xx → TranscriptionPermanentError.
 *   - Malformed JSON → TranscriptionPermanentError.
 */

import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

process.env.DEEPGRAM_API_KEY = 'dg-test-key';

import { transcribeWithDeepgram } from '../../../src/services/voice-transcription-deepgram';
import {
  TranscriptionPermanentError,
  TranscriptionTransientError,
} from '../../../src/types/consultation-transcript';

// ---------------------------------------------------------------------------
// fetch fixture helpers
// ---------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: { get: () => null } as unknown as Headers,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function badJsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: { get: () => null } as unknown as Headers,
    text: async () => 'not-json',
    json: async () => {
      throw new SyntaxError('bad JSON');
    },
  } as unknown as Response;
}

const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ===========================================================================
// Missing key
// ===========================================================================

describe('transcribeWithDeepgram — config errors', () => {
  it('throws TranscriptionPermanentError when DEEPGRAM_API_KEY is empty', async () => {
    const prev = process.env.DEEPGRAM_API_KEY;
    process.env.DEEPGRAM_API_KEY = '';
    jest.resetModules();
    const reloaded = await import('../../../src/services/voice-transcription-deepgram');
    // Re-import the types module so the thrown error's constructor matches
    // (resetModules gives each module a fresh copy).
    const reloadedTypes = await import('../../../src/types/consultation-transcript');
    await expect(
      reloaded.transcribeWithDeepgram({
        audioUrl: 'https://signed.test/audio.mp3',
        languageCode: 'hi-IN',
        correlationId: 'c-1',
      }),
    ).rejects.toBeInstanceOf(reloadedTypes.TranscriptionPermanentError);
    process.env.DEEPGRAM_API_KEY = prev;
  });
});

// ===========================================================================
// Request shape
// ===========================================================================

describe('transcribeWithDeepgram — request shape', () => {
  it('posts to /v1/listen with model=nova-2, language=multi for hi-IN, bearer token, url body', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        metadata: { duration: 60 },
        results: {
          channels: [{ alternatives: [{ transcript: 'namaste' }] }],
        },
      }),
    );
    global.fetch = fetchMock;

    await transcribeWithDeepgram({
      audioUrl: 'https://signed.test/audio.mp3',
      languageCode: 'hi-IN',
      correlationId: 'c-1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [urlArg, initArg] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(urlArg).toContain('https://api.deepgram.com/v1/listen');
    expect(urlArg).toContain('model=nova-2');
    expect(urlArg).toContain('language=multi'); // Hindi → 'multi' for Hinglish
    expect(initArg.method).toBe('POST');
    expect(
      (initArg.headers as Record<string, string>).Authorization,
    ).toBe('Token dg-test-key');
    expect(JSON.parse(initArg.body as string)).toEqual({
      url: 'https://signed.test/audio.mp3',
    });
  });

  it('passes non-Hindi language codes through verbatim (e.g. en-US)', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        metadata: { duration: 0 },
        results: { channels: [{ alternatives: [{ transcript: '' }] }] },
      }),
    );
    global.fetch = fetchMock;

    await transcribeWithDeepgram({
      audioUrl: 'https://signed.test/audio.mp3',
      languageCode: 'en-US',
      correlationId: 'c-2',
    });
    const [urlArg] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(urlArg).toContain('language=en-US');
  });
});

// ===========================================================================
// Happy path
// ===========================================================================

describe('transcribeWithDeepgram — happy path', () => {
  it('extracts duration + transcript + computes cost', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        metadata: { duration: 1800 },
        results: {
          channels: [{ alternatives: [{ transcript: 'doctor speaking' }] }],
        },
      }),
    );

    const out = await transcribeWithDeepgram({
      audioUrl: 'https://signed.test/audio.mp3',
      languageCode: 'hi-IN',
      correlationId: 'c-3',
    });

    expect(out.provider).toBe('deepgram_nova_2');
    expect(out.languageCode).toBe('hi-IN');
    expect(out.durationSeconds).toBe(1800);
    expect(out.costUsdCents).toBe(13); // pinned: 1800s × $0.0043/min = 12.9¢ → 13
    expect(out.transcriptText).toBe('doctor speaking');
  });
});

// ===========================================================================
// Error paths
// ===========================================================================

describe('transcribeWithDeepgram — error paths', () => {
  it('maps 5xx → TranscriptionTransientError', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(503, { error: 'service unavailable' }));
    await expect(
      transcribeWithDeepgram({
        audioUrl: 'https://signed.test/audio.mp3',
        languageCode: 'hi-IN',
        correlationId: 'c-4',
      }),
    ).rejects.toBeInstanceOf(TranscriptionTransientError);
  });

  it('maps 4xx → TranscriptionPermanentError', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(401, { error: 'invalid auth' }));
    await expect(
      transcribeWithDeepgram({
        audioUrl: 'https://signed.test/audio.mp3',
        languageCode: 'hi-IN',
        correlationId: 'c-5',
      }),
    ).rejects.toBeInstanceOf(TranscriptionPermanentError);
  });

  it('maps network failure → TranscriptionTransientError', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      transcribeWithDeepgram({
        audioUrl: 'https://signed.test/audio.mp3',
        languageCode: 'hi-IN',
        correlationId: 'c-6',
      }),
    ).rejects.toBeInstanceOf(TranscriptionTransientError);
  });

  it('maps malformed JSON response → TranscriptionPermanentError', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(badJsonResponse(200));
    await expect(
      transcribeWithDeepgram({
        audioUrl: 'https://signed.test/audio.mp3',
        languageCode: 'hi-IN',
        correlationId: 'c-7',
      }),
    ).rejects.toBeInstanceOf(TranscriptionPermanentError);
  });
});
