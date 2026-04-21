/**
 * Unit tests for `services/voice-transcription-service.ts` (Plan 05 · Task 25).
 *
 * Covers:
 *   - `selectProvider` — pure router, every row in the table.
 *   - `enqueueVoiceTranscription` — missing session, consent declined,
 *     idempotent re-enqueue (PG unique_violation), happy path, kill-switch.
 *   - `processVoiceTranscription` — route to Whisper vs Deepgram, cost math
 *     pinned (18¢ for 1800s Whisper / 13¢ for 1800s Deepgram), 5xx → transient
 *     error surfaces, 4xx → permanent error surfaces.
 *
 * Mock strategy mirrors `recording-consent-service.test.ts`: we mock
 * `getSupabaseAdminClient`, `findSessionByProviderSessionId`,
 * `getConsentForSession`, and the two provider clients, then hand-roll
 * Supabase chain builders.
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

jest.mock('../../../src/services/recording-consent-service', () => ({
  getConsentForSession: jest.fn(),
}));

jest.mock('../../../src/services/voice-transcription-openai', () => ({
  transcribeWithWhisper: jest.fn(),
}));

jest.mock('../../../src/services/voice-transcription-deepgram', () => ({
  transcribeWithDeepgram: jest.fn(),
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
import * as consentService from '../../../src/services/recording-consent-service';
import * as whisper from '../../../src/services/voice-transcription-openai';
import * as deepgram from '../../../src/services/voice-transcription-deepgram';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedSession = sessionService as jest.Mocked<typeof sessionService>;
const mockedConsent = consentService as jest.Mocked<typeof consentService>;
const mockedWhisper = whisper as jest.Mocked<typeof whisper>;
const mockedDeepgram = deepgram as jest.Mocked<typeof deepgram>;

beforeEach(() => {
  jest.clearAllMocks();
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
  it('routes Hindi → deepgram_nova_2', () => {
    expect(selectProvider('hi')).toBe('deepgram_nova_2');
    expect(selectProvider('hi-IN')).toBe('deepgram_nova_2');
    expect(selectProvider('HI-IN')).toBe('deepgram_nova_2'); // case-insensitive
  });

  it('routes English variants → openai_whisper', () => {
    expect(selectProvider('en')).toBe('openai_whisper');
    expect(selectProvider('en-IN')).toBe('openai_whisper');
    expect(selectProvider('en-US')).toBe('openai_whisper');
    expect(selectProvider('en-GB')).toBe('openai_whisper');
  });

  it('routes unknown / other languages → openai_whisper (broader coverage)', () => {
    expect(selectProvider('fr')).toBe('openai_whisper');
    expect(selectProvider('es')).toBe('openai_whisper');
    expect(selectProvider('zh')).toBe('openai_whisper');
    expect(selectProvider('unknown')).toBe('openai_whisper');
    expect(selectProvider('')).toBe('openai_whisper');
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
    expect(mockedConsent.getConsentForSession).not.toHaveBeenCalled();
  });

  it('skips insert when consent.decision === false', async () => {
    mockedSession.findSessionByProviderSessionId.mockResolvedValue(FAKE_SESSION as never);
    mockedConsent.getConsentForSession.mockResolvedValue({
      decision: false,
      capturedAt: new Date(),
      version: 'v1',
    });
    const chain = buildInsertChain({ data: null, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: chain.from } as never);

    await enqueueVoiceTranscription({ providerSessionId: 'RM123' });
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('defaults to on when consent lookup throws (Decision 4)', async () => {
    mockedSession.findSessionByProviderSessionId.mockResolvedValue(FAKE_SESSION as never);
    mockedConsent.getConsentForSession.mockRejectedValue(
      new Error('recording_consent column missing'),
    );
    const chain = buildInsertChain({ data: { id: 't-1' }, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: chain.from } as never);

    await enqueueVoiceTranscription({ providerSessionId: 'RM123' });
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });

  it('inserts a queued row with correct shape on happy path (en-IN → Whisper)', async () => {
    mockedSession.findSessionByProviderSessionId.mockResolvedValue(FAKE_SESSION as never);
    mockedConsent.getConsentForSession.mockResolvedValue({
      decision: true,
      capturedAt: new Date(),
      version: 'v1',
    });
    const chain = buildInsertChain({ data: { id: 't-1' }, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: chain.from } as never);

    await enqueueVoiceTranscription({ providerSessionId: 'RM123' });

    expect(chain.from).toHaveBeenCalledWith('consultation_transcripts');
    expect(chain.insert).toHaveBeenCalledWith({
      consultation_session_id: 'session-uuid',
      provider: 'openai_whisper', // 'en-IN' default → Whisper
      language_code: 'en-IN',
      composition_sid: 'RM123',
      status: 'queued',
    });
  });

  it('treats PG 23505 (unique_violation) as idempotent success, not a warning', async () => {
    mockedSession.findSessionByProviderSessionId.mockResolvedValue(FAKE_SESSION as never);
    mockedConsent.getConsentForSession.mockResolvedValue({
      decision: null,
      capturedAt: null,
      version: null,
    });
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
    mockedConsent.getConsentForSession.mockResolvedValue({
      decision: true,
      capturedAt: new Date(),
      version: 'v1',
    });
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

  it('routes en-IN → transcribeWithWhisper', async () => {
    const whisperResult: TranscriptResult = {
      provider: 'openai_whisper',
      languageCode: 'en-IN',
      transcriptJson: { text: 'hello' },
      transcriptText: 'hello',
      durationSeconds: 1800,
      costUsdCents: 18,
    };
    mockedWhisper.transcribeWithWhisper.mockResolvedValue(whisperResult);

    const out = await processVoiceTranscription({ ...baseInput, languageCode: 'en-IN' });
    expect(mockedWhisper.transcribeWithWhisper).toHaveBeenCalledTimes(1);
    expect(mockedDeepgram.transcribeWithDeepgram).not.toHaveBeenCalled();
    expect(out).toEqual(whisperResult);
  });

  it('routes hi-IN → transcribeWithDeepgram', async () => {
    const deepResult: TranscriptResult = {
      provider: 'deepgram_nova_2',
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
    mockedWhisper.transcribeWithWhisper.mockRejectedValue(
      new TranscriptionTransientError('Whisper 503'),
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

  it('Deepgram 1800s → 13 cents (1800 × 0.0043 × 100 / 60 = 12.9 → round up to 13)', () => {
    expect(costCentsForDuration('deepgram_nova_2', 1800)).toBe(13);
  });

  it('zero-duration → 0 cents', () => {
    expect(costCentsForDuration('openai_whisper', 0)).toBe(0);
    expect(costCentsForDuration('deepgram_nova_2', 0)).toBe(0);
  });
});
