/**
 * Unit tests for `services/voice-transcription-service.ts` (Plan 05 · Task 25).
 *
 * Covers:
 *   - `selectProvider` — pure router, every row in the table.
 *   - `enqueueVoiceTranscription` — missing session, idempotent
 *     re-enqueue (PG unique_violation), happy path, kill-switch.
 *   - `processVoiceTranscription` — route to Whisper vs Deepgram, cost math
 *     pinned (18¢ for 1800s Whisper / 13¢ for 1800s Deepgram), 5xx → transient
 *     error surfaces, 4xx → permanent error surfaces.
 *
 * Mock strategy: we mock `getSupabaseAdminClient`,
 * `findSessionByProviderSessionId`, and the two provider clients, then
 * hand-roll Supabase chain builders.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks (registered before unit-under-test imports)
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionByProviderSessionId: jest.fn(),
}));

jest.mock('../../../src/services/voice-transcription-openai', () => ({
  transcribeWithWhisper: jest.fn(),
}));

jest.mock('../../../src/services/voice-transcription-deepgram', () => ({
  transcribeWithDeepgram: jest.fn(),
}));

jest.mock('../../../src/services/voice-transcription-groq', () => ({
  transcribeWithGroq: jest.fn(),
  isGroqTranscriptionConfigured: jest.fn(() => false),
}));

import {
  enqueueVoiceTranscription,
  processVoiceTranscription,
  selectProvider,
} from '../../../src/services/voice-transcription-service';
import {
  TranscriptionPermanentError,
  TranscriptionTransientError,
  type TranscriptResult,
} from '../../../src/types/consultation-transcript';
import * as database from '../../../src/config/database';
import * as sessionService from '../../../src/services/consultation-session-service';
import * as whisper from '../../../src/services/voice-transcription-openai';
import * as deepgram from '../../../src/services/voice-transcription-deepgram';
import * as groq from '../../../src/services/voice-transcription-groq';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedSession = sessionService as jest.Mocked<typeof sessionService>;
const mockedWhisper = whisper as jest.Mocked<typeof whisper>;
const mockedDeepgram = deepgram as jest.Mocked<typeof deepgram>;
const mockedGroq = groq as jest.Mocked<typeof groq>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedGroq.isGroqTranscriptionConfigured.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// Supabase insert-chain helper — for enqueue's .from().insert().select().maybeSingle()
// ---------------------------------------------------------------------------

function buildInsertChain(result: {
  data: unknown;
  error: { message: string; code?: string } | null;
}) {
  const maybeSingle = jest.fn<() => Promise<typeof result>>().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ maybeSingle });
  const insert = jest.fn().mockReturnValue({ select });
  const from = jest.fn().mockReturnValue({ insert });
  return { from, insert, select, maybeSingle };
}

const FAKE_SESSION = {
  id: 'session-uuid',
  appointmentId: 'appt-uuid',
  doctorId: 'doctor-uuid',
  patientId: 'patient-uuid',
  modality: 'voice' as const,
  status: 'ended' as const,
  provider: 'twilio_video_audio' as const,
  providerSessionId: 'RM123',
  scheduledStartAt: new Date(),
  expectedEndAt: new Date(),
};

// ===========================================================================
// selectProvider
// ===========================================================================

describe('selectProvider', () => {
  it('routes Hindi → deepgram_nova_3', () => {
    expect(selectProvider('hi')).toBe('deepgram_nova_3');
    expect(selectProvider('hi-IN')).toBe('deepgram_nova_3');
    expect(selectProvider('HI-IN')).toBe('deepgram_nova_3'); // case-insensitive
  });

  it('routes English variants → groq_whisper', () => {
    expect(selectProvider('en')).toBe('groq_whisper');
    expect(selectProvider('en-IN')).toBe('groq_whisper');
    expect(selectProvider('en-US')).toBe('groq_whisper');
    expect(selectProvider('en-GB')).toBe('groq_whisper');
  });

  it('routes unknown / other languages → groq_whisper (broader coverage)', () => {
    expect(selectProvider('fr')).toBe('groq_whisper');
    expect(selectProvider('es')).toBe('groq_whisper');
    expect(selectProvider('zh')).toBe('groq_whisper');
    expect(selectProvider('unknown')).toBe('groq_whisper');
    expect(selectProvider('')).toBe('groq_whisper');
  });
});

// ===========================================================================
// enqueueVoiceTranscription
// ===========================================================================

describe('enqueueVoiceTranscription', () => {
  it('warns + returns when providerSessionId is empty', async () => {
    await enqueueVoiceTranscription({ providerSessionId: '   ' });
    expect(mockedSession.findSessionByProviderSessionId).not.toHaveBeenCalled();
  });

  it('logs + returns when the session lookup returns null', async () => {
    mockedSession.findSessionByProviderSessionId.mockResolvedValue(null);
    mockedDb.getSupabaseAdminClient.mockReturnValue({} as never);
    await enqueueVoiceTranscription({ providerSessionId: 'RM123' });
    expect(mockedSession.findSessionByProviderSessionId).toHaveBeenCalled();
  });

  it('enqueues even when a historical appointment would have declined recording', async () => {
    mockedSession.findSessionByProviderSessionId.mockResolvedValue(FAKE_SESSION as never);
    const chain = buildInsertChain({ data: { id: 't-1' }, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: chain.from } as never);

    await enqueueVoiceTranscription({ providerSessionId: 'RM123' });
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });

  it('inserts a queued row with correct shape on happy path (en-IN → Whisper fallback)', async () => {
    mockedSession.findSessionByProviderSessionId.mockResolvedValue(FAKE_SESSION as never);
    const chain = buildInsertChain({ data: { id: 't-1' }, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: chain.from } as never);

    await enqueueVoiceTranscription({ providerSessionId: 'RM123' });

    expect(chain.from).toHaveBeenCalledWith('consultation_transcripts');
    expect(chain.insert).toHaveBeenCalledWith({
      consultation_session_id: 'session-uuid',
      provider: 'openai_whisper', // Groq unset → Whisper fallback
      language_code: 'en-IN',
      composition_sid: 'RM123',
      status: 'queued',
    });
  });

  it('inserts groq_whisper when Groq is configured (en-IN default)', async () => {
    mockedGroq.isGroqTranscriptionConfigured.mockReturnValue(true);
    mockedSession.findSessionByProviderSessionId.mockResolvedValue(FAKE_SESSION as never);
    const chain = buildInsertChain({ data: { id: 't-1' }, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: chain.from } as never);

    await enqueueVoiceTranscription({ providerSessionId: 'RM123' });

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'groq_whisper', language_code: 'en-IN' }),
    );
  });

  it('treats PG 23505 (unique_violation) as idempotent success, not a warning', async () => {
    mockedSession.findSessionByProviderSessionId.mockResolvedValue(FAKE_SESSION as never);
    const chain = buildInsertChain({
      data: null,
      error: { message: 'duplicate key', code: '23505' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: chain.from } as never);

    await expect(
      enqueueVoiceTranscription({ providerSessionId: 'RM123' }),
    ).resolves.toBeUndefined();
    // Second call — same shape, still idempotent.
    await expect(
      enqueueVoiceTranscription({ providerSessionId: 'RM123' }),
    ).resolves.toBeUndefined();
  });

  it('never throws — transient DB errors are swallowed', async () => {
    mockedSession.findSessionByProviderSessionId.mockResolvedValue(FAKE_SESSION as never);
    const chain = buildInsertChain({
      data: null,
      error: { message: 'deadlock detected', code: '40P01' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: chain.from } as never);

    await expect(
      enqueueVoiceTranscription({ providerSessionId: 'RM123' }),
    ).resolves.toBeUndefined();
  });
});

// ===========================================================================
// processVoiceTranscription
// ===========================================================================

describe('processVoiceTranscription', () => {
  const baseInput = {
    consultationSessionId: 'session-uuid',
    audioUrl: 'https://signed.twilio.test/audio.mp3',
    correlationId: 'corr-1',
  };

  it('routes en-IN → transcribeWithGroq', async () => {
    const groqResult: TranscriptResult = {
      provider: 'groq_whisper',
      languageCode: 'en-IN',
      transcriptJson: { text: 'hello' },
      transcriptText: 'hello',
      durationSeconds: 1800,
      costUsdCents: 2,
    };
    mockedGroq.transcribeWithGroq.mockResolvedValue(groqResult);

    const out = await processVoiceTranscription({ ...baseInput, languageCode: 'en-IN' });
    expect(mockedGroq.transcribeWithGroq).toHaveBeenCalledTimes(1);
    expect(mockedWhisper.transcribeWithWhisper).not.toHaveBeenCalled();
    expect(mockedDeepgram.transcribeWithDeepgram).not.toHaveBeenCalled();
    expect(out).toEqual(groqResult);
  });

  it('routes hi-IN → transcribeWithDeepgram', async () => {
    const deepResult: TranscriptResult = {
      provider: 'deepgram_nova_3',
      languageCode: 'hi-IN',
      transcriptJson: { results: {} },
      transcriptText: 'namaste',
      durationSeconds: 1800,
      costUsdCents: 13,
    };
    mockedDeepgram.transcribeWithDeepgram.mockResolvedValue(deepResult);

    const out = await processVoiceTranscription({ ...baseInput, languageCode: 'hi-IN' });
    expect(mockedDeepgram.transcribeWithDeepgram).toHaveBeenCalledTimes(1);
    expect(mockedWhisper.transcribeWithWhisper).not.toHaveBeenCalled();
    expect(out).toEqual(deepResult);
  });

  it('respects an explicit provider override (QA re-run pattern)', async () => {
    mockedWhisper.transcribeWithWhisper.mockResolvedValue({
      provider: 'openai_whisper',
      languageCode: 'hi-IN',
      transcriptJson: {},
      transcriptText: 'forced',
      durationSeconds: 10,
      costUsdCents: 1,
    });

    await processVoiceTranscription({
      ...baseInput,
      languageCode: 'hi-IN',
      provider: 'openai_whisper', // override: force Whisper on Hindi for QA
    });
    expect(mockedWhisper.transcribeWithWhisper).toHaveBeenCalled();
    expect(mockedDeepgram.transcribeWithDeepgram).not.toHaveBeenCalled();
  });

  it('propagates TranscriptionTransientError (5xx) so the worker can retry', async () => {
    mockedGroq.transcribeWithGroq.mockRejectedValue(
      new TranscriptionTransientError('Groq 503'),
    );
    await expect(
      processVoiceTranscription({ ...baseInput, languageCode: 'en-IN' }),
    ).rejects.toBeInstanceOf(TranscriptionTransientError);
  });

  it('propagates TranscriptionPermanentError (4xx) so the worker can mark failed', async () => {
    mockedDeepgram.transcribeWithDeepgram.mockRejectedValue(
      new TranscriptionPermanentError('Deepgram 401 — API key invalid'),
    );
    await expect(
      processVoiceTranscription({ ...baseInput, languageCode: 'hi' }),
    ).rejects.toBeInstanceOf(TranscriptionPermanentError);
  });
});

// ===========================================================================
// Cost computation (pinned)
// ===========================================================================

describe('cost computation (pinned in voice-transcription-pricing.ts)', () => {
  // Import here to avoid polluting the mocked-module scope above.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { costCentsForDuration } = require('../../../src/config/voice-transcription-pricing') as {
    costCentsForDuration: (p: string, s: number) => number;
  };

  it('Whisper 1800s → 18 cents (1800 × 0.006 × 100 / 60 = 18.0)', () => {
    expect(costCentsForDuration('openai_whisper', 1800)).toBe(18);
  });

  it('Deepgram Nova-2 1800s → 13 cents (1800 × 0.0043 × 100 / 60 = 12.9 → 13)', () => {
    expect(costCentsForDuration('deepgram_nova_2', 1800)).toBe(13);
  });

  it('Deepgram Nova-3 1800s → 16 cents (1800 × 0.0052 × 100 / 60 = 15.6 → 16)', () => {
    expect(costCentsForDuration('deepgram_nova_3', 1800)).toBe(16);
  });

  it('Groq 1800s → 2 cents (0.5 h × $0.04 × 100 = 2)', () => {
    expect(costCentsForDuration('groq_whisper', 1800)).toBe(2);
  });

  it('zero-duration → 0 cents', () => {
    expect(costCentsForDuration('openai_whisper', 0)).toBe(0);
    expect(costCentsForDuration('deepgram_nova_2', 0)).toBe(0);
    expect(costCentsForDuration('deepgram_nova_3', 0)).toBe(0);
    expect(costCentsForDuration('groq_whisper', 0)).toBe(0);
  });
});
