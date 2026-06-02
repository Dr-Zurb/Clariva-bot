/**
 * Unit tests for `workers/voice-transcription-worker.ts` (Plan 05 · Task 25).
 *
 * Covers:
 *   - Composition-not-ready → row stays queued, no provider call, worker
 *     counts it as `notYetReady`.
 *   - Composition-ready → row flips to `'processing'` then `'completed'`
 *     with the transcript fields + cost telemetry log.
 *   - Transient failure → `retry_count + 1`, status stays `'queued'`.
 *   - Retry cap hit → status flips to `'failed'`.
 *   - Permanent failure → status flips to `'failed'` immediately.
 *   - Backoff math (pinned table) — first few entries verified against the
 *     worker's internal helper.
 *
 * Mock strategy:
 *   - `getSupabaseAdminClient` returns a hand-rolled mock whose
 *     `.from('consultation_transcripts').select(...).eq(...)...` chain is
 *     programmed per test.
 *   - `processVoiceTranscription` is mocked — we don't need to re-test
 *     the provider-client path here.
 *   - `resolveComposition` is overridden via
 *     `__setResolveCompositionForTests` to avoid the Twilio SDK.
 */

import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/services/voice-transcription-service', () => ({
  processVoiceTranscription: jest.fn(),
}));

import {
  runVoiceTranscriptionJob,
  __setResolveCompositionForTests,
  __testInternals,
} from '../../../src/workers/voice-transcription-worker';
import {
  TranscriptionPermanentError,
  TranscriptionTransientError,
} from '../../../src/types/consultation-transcript';
import * as database from '../../../src/config/database';
import * as service from '../../../src/services/voice-transcription-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedService = service as jest.Mocked<typeof service>;

// ---------------------------------------------------------------------------
// Supabase mock — the worker uses two chain shapes:
//   (1) .from(t).select(...).eq(...).order(...).limit(n) → promise
//   (2) .from(t).update({...}).eq('id', id).eq('status', 'queued').select('id').maybeSingle()
//   (3) .from(t).update({...}).eq('id', id) → promise (no select)
// We build a small DSL that records updates and returns programmed data.
// ---------------------------------------------------------------------------

interface MockRow {
  id: string;
  consultation_session_id: string;
  provider: string;
  language_code: string;
  composition_sid: string;
  retry_count: number;
  started_at: string | null;
}

interface AdminSpec {
  selectRows: MockRow[];
  selectError?: { message: string };
  /** If provided, the first claim UPDATE resolves to this result. */
  claimResult?: { data: unknown; error: { message: string } | null };
}

function buildAdminMock(spec: AdminSpec) {
  const updates: Array<{ patch: Record<string, unknown>; id: string }> = [];

  const from = jest.fn((_table: string) => {
    return {
      select: (_cols: string) => ({
        eq: (_c: string, _v: string) => ({
          order: (_c2: string, _opts: unknown) => ({
            limit: async (_n: number) => ({
              data: spec.selectError ? null : spec.selectRows,
              error: spec.selectError ?? null,
            }),
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        return {
          eq: (col: string, val: string) => {
            if (col === 'id') {
              updates.push({ patch, id: val });
            }
            // Support the two-step `.eq('id', ..).eq('status', 'queued')...`
            // chain for the claim path by returning another chain.
            return {
              eq: (_c2: string, _v2: string) => ({
                select: (_cols: string) => ({
                  maybeSingle: async () =>
                    spec.claimResult ?? { data: { id: val }, error: null },
                }),
              }),
              // And support the terminal `.eq('id', id)` → awaited path.
              then: (resolve: (v: unknown) => void) => resolve({ error: null }),
            } as unknown as { eq: unknown; then: unknown };
          },
        };
      },
    };
  });

  return { from, updates };
}

function makeRow(overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: 't-1',
    consultation_session_id: 's-1',
    provider: 'openai_whisper',
    language_code: 'en-IN',
    composition_sid: 'RM123',
    retry_count: 0,
    started_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  __setResolveCompositionForTests(null); // reset to default (requires Twilio)
});

afterEach(() => {
  __setResolveCompositionForTests(null);
});

// ===========================================================================
// Backoff math (pinned)
// ===========================================================================

describe('backoff math', () => {
  const { isBackoffReady, BACKOFF_MS_BY_RETRY_COUNT } = __testInternals;

  it('retry_count=0 is always eligible', () => {
    expect(isBackoffReady(0, null, new Date())).toBe(true);
    expect(isBackoffReady(0, new Date().toISOString(), new Date())).toBe(true);
  });

  it('retry_count=1 requires 60_000ms since started_at', () => {
    const now = new Date('2026-04-19T12:00:00Z');
    const justNow = new Date('2026-04-19T11:59:30Z').toISOString(); // 30s ago
    const oneMinuteAgo = new Date('2026-04-19T11:59:00Z').toISOString();
    expect(isBackoffReady(1, justNow, now)).toBe(false);
    expect(isBackoffReady(1, oneMinuteAgo, now)).toBe(true);
  });

  it('pins the full backoff table as [0, 1m, 5m, 15m, 1h, 6h]', () => {
    expect([...BACKOFF_MS_BY_RETRY_COUNT]).toEqual([
      0,
      60_000,
      5 * 60_000,
      15 * 60_000,
      60 * 60_000,
      6 * 60 * 60_000,
    ]);
  });
});

// ===========================================================================
// Composition-not-ready
// ===========================================================================

describe('composition-not-ready', () => {
  it('leaves the row queued and counts it as notYetReady when resolveComposition returns null', async () => {
    const row = makeRow();
    const { from } = buildAdminMock({ selectRows: [row] });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    __setResolveCompositionForTests(async () => null);

    const result = await runVoiceTranscriptionJob('corr-1');
    expect(result.polled).toBe(1);
    expect(result.notYetReady).toBe(1);
    expect(result.processed).toBe(0);
    expect(mockedService.processVoiceTranscription).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Happy path (composition ready + provider success)
// ===========================================================================

describe('composition-ready happy path', () => {
  it('flips the row to processing, calls processVoiceTranscription, flips to completed', async () => {
    const row = makeRow();
    const mock = buildAdminMock({ selectRows: [row] });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mock.from } as never);

    __setResolveCompositionForTests(async () => ({
      compositionSid: 'CJ-composition-sid',
      audioUrl: 'https://twilio.test/audio.mp3',
      twilioDurationSeconds: 1800,
    }));

    mockedService.processVoiceTranscription.mockResolvedValue({
      provider: 'openai_whisper',
      languageCode: 'en-IN',
      transcriptJson: { text: 'hello' },
      transcriptText: 'hello',
      durationSeconds: 1800,
      costUsdCents: 18,
    });

    const result = await runVoiceTranscriptionJob('corr-1');
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockedService.processVoiceTranscription).toHaveBeenCalledWith(
      expect.objectContaining({
        consultationSessionId: 's-1',
        audioUrl: 'https://twilio.test/audio.mp3',
        languageCode: 'en-IN',
        provider: 'openai_whisper',
      }),
    );

    // Claim update (processing) + completion update (completed) should
    // both have been issued against the same row id.
    const statuses = mock.updates.map((u) => u.patch.status);
    expect(statuses).toContain('processing');
    expect(statuses).toContain('completed');
  });
});

// ===========================================================================
// Transient failure — retry
// ===========================================================================

describe('transient failure', () => {
  it('increments retry_count and keeps status queued when the retry cap is not hit', async () => {
    const row = makeRow({ retry_count: 1 });
    const mock = buildAdminMock({ selectRows: [row] });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mock.from } as never);

    __setResolveCompositionForTests(async () => ({
      compositionSid: 'CJ',
      audioUrl: 'https://twilio.test/audio.mp3',
    }));
    mockedService.processVoiceTranscription.mockRejectedValue(
      new TranscriptionTransientError('whisper 503'),
    );

    const result = await runVoiceTranscriptionJob('corr-transient');
    expect(result.stillQueued).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);

    const finalUpdate = mock.updates[mock.updates.length - 1];
    expect(finalUpdate.patch.status).toBe('queued');
    expect(finalUpdate.patch.retry_count).toBe(2);
  });
});

// ===========================================================================
// Retry cap hit → failed
// ===========================================================================

describe('retry cap hit', () => {
  it('flips to failed once retry_count exceeds VOICE_TRANSCRIPTION_MAX_RETRIES (default 5)', async () => {
    const row = makeRow({ retry_count: 5 });
    const mock = buildAdminMock({ selectRows: [row] });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mock.from } as never);

    __setResolveCompositionForTests(async () => ({
      compositionSid: 'CJ',
      audioUrl: 'https://twilio.test/audio.mp3',
    }));
    mockedService.processVoiceTranscription.mockRejectedValue(
      new TranscriptionTransientError('whisper 503 again'),
    );

    const result = await runVoiceTranscriptionJob('corr-cap');
    expect(result.failed).toBe(1);
    const finalUpdate = mock.updates[mock.updates.length - 1];
    expect(finalUpdate.patch.status).toBe('failed');
    expect(finalUpdate.patch.retry_count).toBe(6);
  });
});

// ===========================================================================
// Permanent failure
// ===========================================================================

describe('permanent failure', () => {
  it('flips straight to failed on TranscriptionPermanentError', async () => {
    const row = makeRow();
    const mock = buildAdminMock({ selectRows: [row] });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mock.from } as never);

    __setResolveCompositionForTests(async () => ({
      compositionSid: 'CJ',
      audioUrl: 'https://twilio.test/audio.mp3',
    }));
    mockedService.processVoiceTranscription.mockRejectedValue(
      new TranscriptionPermanentError('Whisper 400'),
    );

    const result = await runVoiceTranscriptionJob('corr-perm');
    expect(result.failed).toBe(1);
    const finalUpdate = mock.updates[mock.updates.length - 1];
    expect(finalUpdate.patch.status).toBe('failed');
    expect(finalUpdate.patch.error_message).toContain('Whisper 400');
  });
});

// ===========================================================================
// Backoff skip
// ===========================================================================

describe('backoff skip', () => {
  it('skips rows whose backoff window has not elapsed', async () => {
    const row = makeRow({
      retry_count: 1,
      started_at: new Date().toISOString(), // started just now → 1m not elapsed
    });
    const mock = buildAdminMock({ selectRows: [row] });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mock.from } as never);

    // resolveComposition should NOT be called — prove it via mock fn.
    const resolveMock = jest
      .fn<(roomSid: string, correlationId: string) => Promise<null>>()
      .mockResolvedValue(null);
    __setResolveCompositionForTests(resolveMock);

    const result = await runVoiceTranscriptionJob('corr-backoff');
    expect(result.stillQueued).toBe(1);
    expect(resolveMock).not.toHaveBeenCalled();
    expect(mockedService.processVoiceTranscription).not.toHaveBeenCalled();
  });
});
