import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const createMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const toFileMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const ctorOpts: Array<{ apiKey?: string; baseURL?: string }> = [];

jest.mock('openai', () => {
  class FakeOpenAI {
    audio = { transcriptions: { create: createMock } };
    constructor(opts: { apiKey?: string; baseURL?: string }) {
      ctorOpts.push(opts);
    }
  }
  (FakeOpenAI as unknown as { toFile: typeof toFileMock }).toFile = toFileMock;
  return { __esModule: true, default: FakeOpenAI };
});

jest.mock('../../../src/config/env', () => ({
  env: { GROQ_API_KEY: 'test-groq-key' as string | undefined },
}));

import { env } from '../../../src/config/env';
import {
  __resetForTests,
  isGroqTranscriptionConfigured,
  transcribeWithGroq,
} from '../../../src/services/voice-transcription-groq';
import {
  TranscriptionPermanentError,
  TranscriptionTransientError,
} from '../../../src/types/consultation-transcript';

const mockedEnv = env as { GROQ_API_KEY?: string };

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

describe('voice-transcription-groq', () => {
  beforeEach(() => {
    mockedEnv.GROQ_API_KEY = 'test-groq-key';
    __resetForTests.clearClient();
    createMock.mockReset();
    toFileMock.mockReset();
    ctorOpts.length = 0;
    toFileMock.mockResolvedValue({ name: 'audio.mp3' });
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('is configured only when GROQ_API_KEY is set', () => {
    expect(isGroqTranscriptionConfigured()).toBe(true);
    mockedEnv.GROQ_API_KEY = undefined;
    expect(isGroqTranscriptionConfigured()).toBe(false);
  });

  it('throws permanent when the key is missing', async () => {
    mockedEnv.GROQ_API_KEY = undefined;
    await expect(
      transcribeWithGroq({
        audioUrl: 'https://signed.example/audio.mp3',
        languageCode: 'en-IN',
        correlationId: 'c1',
      }),
    ).rejects.toBeInstanceOf(TranscriptionPermanentError);
  });

  it('posts whisper-large-v3-turbo on the Groq base URL', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
      makeFetchResponse({ status: 200 }),
    );
    createMock.mockResolvedValue({
      text: 'hello',
      duration: 12,
      segments: [{ text: 'hello', start: 0, end: 12 }],
    });

    const out = await transcribeWithGroq({
      audioUrl: 'https://signed.example/audio.mp3',
      languageCode: 'en-IN',
      correlationId: 'c1',
    });

    expect(out.provider).toBe('groq_whisper');
    expect(out.transcriptText).toBe('hello');
    expect(ctorOpts[0]?.baseURL).toBe('https://api.groq.com/openai/v1');
    expect(createMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        model: 'whisper-large-v3-turbo',
        language: 'en',
        response_format: 'verbose_json',
      }),
    );
  });

  it('maps Groq 5xx to transient', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
      makeFetchResponse({ status: 200 }),
    );
    createMock.mockRejectedValue({ status: 503 });

    await expect(
      transcribeWithGroq({
        audioUrl: 'https://signed.example/audio.mp3',
        languageCode: 'en',
        correlationId: 'c1',
      }),
    ).rejects.toBeInstanceOf(TranscriptionTransientError);
  });
});
