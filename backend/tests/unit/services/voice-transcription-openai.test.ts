/**
 * Unit tests for `services/voice-transcription-openai.ts` (Plan 05 · Task 25).
 *
 * We mock the `openai` SDK + `global.fetch` (for the audio download) so the
 * tests are hermetic. Coverage:
 *   - Missing `OPENAI_API_KEY` → TranscriptionPermanentError.
 *   - Audio download 404 → TranscriptionPermanentError (URL expired).
 *   - Audio download 503 → TranscriptionTransientError.
 *   - Happy path: verbose_json response is parsed, segments concatenated,
 *     duration + cost computed.
 *   - Language-code translation: 'en-IN' → Whisper `language: 'en'`.
 *   - 5xx from Whisper → transient; 4xx → permanent.
 *   - Malformed response → permanent.
 */

import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createMock = jest.fn<(...args: any[]) => Promise<any>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toFileMock = jest.fn<(...args: any[]) => Promise<any>>();

jest.mock('openai', () => {
  class FakeOpenAI {
    audio = { transcriptions: { create: createMock } };
    constructor(_opts: unknown) {}
  }
  // Attach the static `toFile` helper expected by the module.
  (FakeOpenAI as unknown as { toFile: typeof toFileMock }).toFile = toFileMock;
  return {
    __esModule: true,
    default: FakeOpenAI,
  };
});

// Env var: must be set BEFORE the SUT is imported because env.ts is parsed
// at import time. We also re-import the env-dependent module fresh each
// test where needed.
process.env.OPENAI_API_KEY = 'test-key';

import {
  transcribeWithWhisper,
  __resetForTests,
} from '../../../src/services/voice-transcription-openai';
import {
  TranscriptionPermanentError,
  TranscriptionTransientError,
} from '../../../src/types/consultation-transcript';

// ---------------------------------------------------------------------------
// fetch + toFile fixtures
// ---------------------------------------------------------------------------

function makeFetchResponse(
  init: { status: number; body?: string; contentType?: string } = { status: 200 },
): Response {
  return {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    statusText: `HTTP ${init.status}`,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? init.contentType ?? 'audio/mpeg' : null,
    } as unknown as Headers,
    text: async () => init.body ?? '',
    arrayBuffer: async () => new ArrayBuffer(8),
    json: async () => JSON.parse(init.body ?? '{}'),
  } as unknown as Response;
}

const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  __resetForTests.clearClient();
  toFileMock.mockResolvedValue({ __marker: 'file' });
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ===========================================================================
// Happy path
// ===========================================================================

describe('transcribeWithWhisper — happy path', () => {
  it('downloads audio, calls Whisper, returns normalised TranscriptResult', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(makeFetchResponse({ status: 200 }));
    createMock.mockResolvedValue({
      text: 'hello there',
      language: 'en',
      duration: 1800,
      segments: [
        { text: 'hello ', start: 0, end: 1 },
        { text: 'there', start: 1, end: 2 },
      ],
    });

    const out = await transcribeWithWhisper({
      audioUrl: 'https://signed.test/audio.mp3',
      languageCode: 'en-IN',
      correlationId: 'c-1',
    });

    expect(out.provider).toBe('openai_whisper');
    expect(out.languageCode).toBe('en-IN');
    expect(out.durationSeconds).toBe(1800);
    expect(out.costUsdCents).toBe(18); // pinned: 1800s × $0.006/min = 18¢
    expect(out.transcriptText).toBe('hello there');
    // `language: 'en'` stripped from 'en-IN' must be passed to the SDK.
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'whisper-1',
        response_format: 'verbose_json',
        language: 'en',
      }),
    );
  });

  it('falls back to response.text when segments are absent', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(makeFetchResponse({ status: 200 }));
    createMock.mockResolvedValue({ text: 'short', duration: 5 });

    const out = await transcribeWithWhisper({
      audioUrl: 'https://signed.test/audio.mp3',
      languageCode: 'en-US',
      correlationId: 'c-2',
    });
    expect(out.transcriptText).toBe('short');
    expect(out.durationSeconds).toBe(5);
  });

  it('omits language param for unrecognised codes (lets Whisper auto-detect)', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(makeFetchResponse({ status: 200 }));
    createMock.mockResolvedValue({ text: '', duration: 0, segments: [] });

    await transcribeWithWhisper({
      audioUrl: 'https://signed.test/audio.mp3',
      languageCode: 'zz-ZZ',
      correlationId: 'c-3',
    });
    const call = createMock.mock.calls[0][0] as Record<string, unknown>;
    expect(call).not.toHaveProperty('language');
  });
});

// ===========================================================================
// Error paths
// ===========================================================================

describe('transcribeWithWhisper — error paths', () => {
  it('throws TranscriptionPermanentError when OPENAI_API_KEY is empty', async () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = '';
    jest.resetModules();
    // Re-import both modules so the error class matches across reloads —
    // `jest.resetModules` gives each module a fresh copy, which means the
    // statically-imported `TranscriptionPermanentError` above is a
    // different class from the one thrown by the reloaded SUT.
    const reloaded = await import('../../../src/services/voice-transcription-openai');
    const reloadedTypes = await import('../../../src/types/consultation-transcript');
    reloaded.__resetForTests.clearClient();
    await expect(
      reloaded.transcribeWithWhisper({
        audioUrl: 'https://signed.test/audio.mp3',
        languageCode: 'en-IN',
        correlationId: 'c-1',
      }),
    ).rejects.toBeInstanceOf(reloadedTypes.TranscriptionPermanentError);
    process.env.OPENAI_API_KEY = prev;
  });

  it('maps audio-download 503 → TranscriptionTransientError', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(makeFetchResponse({ status: 503 }));
    await expect(
      transcribeWithWhisper({
        audioUrl: 'https://signed.test/audio.mp3',
        languageCode: 'en-IN',
        correlationId: 'c-4',
      }),
    ).rejects.toBeInstanceOf(TranscriptionTransientError);
  });

  it('maps audio-download 404 → TranscriptionPermanentError (expired URL)', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(makeFetchResponse({ status: 404, body: 'Signature expired' }));
    await expect(
      transcribeWithWhisper({
        audioUrl: 'https://signed.test/audio.mp3',
        languageCode: 'en-IN',
        correlationId: 'c-5',
      }),
    ).rejects.toBeInstanceOf(TranscriptionPermanentError);
  });

  it('maps Whisper 5xx → TranscriptionTransientError', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(makeFetchResponse({ status: 200 }));
    const sdkErr = Object.assign(new Error('server blew up'), { status: 502 });
    createMock.mockRejectedValue(sdkErr);
    await expect(
      transcribeWithWhisper({
        audioUrl: 'https://signed.test/audio.mp3',
        languageCode: 'en-IN',
        correlationId: 'c-6',
      }),
    ).rejects.toBeInstanceOf(TranscriptionTransientError);
  });

  it('maps Whisper 4xx → TranscriptionPermanentError', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(makeFetchResponse({ status: 200 }));
    const sdkErr = Object.assign(new Error('bad request'), { status: 400 });
    createMock.mockRejectedValue(sdkErr);
    await expect(
      transcribeWithWhisper({
        audioUrl: 'https://signed.test/audio.mp3',
        languageCode: 'en-IN',
        correlationId: 'c-7',
      }),
    ).rejects.toBeInstanceOf(TranscriptionPermanentError);
  });

  it('maps non-object Whisper response → TranscriptionPermanentError', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(makeFetchResponse({ status: 200 }));
    createMock.mockResolvedValue(null);
    await expect(
      transcribeWithWhisper({
        audioUrl: 'https://signed.test/audio.mp3',
        languageCode: 'en-IN',
        correlationId: 'c-8',
      }),
    ).rejects.toBeInstanceOf(TranscriptionPermanentError);
  });
});
