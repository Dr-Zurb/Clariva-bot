/**
 * Consultation Session Facade — `endSession` post-consult chat-history
 * DM wiring (Plan 07 · Task 31 · Decision 1 sub-decision LOCKED).
 *
 * Pins:
 *   - On a successful end (status flips from `live`/`scheduled` → `ended`),
 *     `sendPostConsultChatHistoryDm` is invoked exactly once per call,
 *     with `{ sessionId, correlationId }` lined up to the inputs the
 *     facade's caller supplied.
 *   - The DM is fired AFTER `updateSessionStatus` has flipped status (so
 *     the helper's session lookup sees `actual_ended_at` populated) and
 *     AFTER `emitConsultEnded` has dispatched the system banner.
 *   - The dispatch is **fire-and-forget**: the helper's promise is NOT
 *     awaited, so a slow / hanging notification helper does NOT block
 *     `endSession` from resolving. We assert this by deliberately making
 *     the helper return a never-resolving promise and verifying that
 *     `endSession` still resolves.
 *   - A throwing helper does NOT propagate to `endSession` — the wrapper
 *     catches and logs, leaving the session correctly marked `ended`.
 *   - Idempotency: when the session is already `ended` / `cancelled`,
 *     `endSession` short-circuits and the helper is NOT called (we
 *     don't want to re-fire the DM on a repeat end).
 *
 * Out of scope:
 *   - The helper's own internal idempotency (`post_consult_dm_sent_at`
 *     column-keyed dedup) — covered in
 *     `notification-service-post-consult-chat.test.ts`.
 *   - The DM body contents — covered in `dm-copy-post-consult-chat.test.ts`.
 *   - The status-flip + adapter wiring — covered in the other facade
 *     tests (`consultation-session-service.test.ts`).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks (registered before importing the facade).
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockVideoEndSession = jest.fn<(providerSessionId: string, cid: string) => Promise<void>>();
const mockTextEndSession  = jest.fn<(providerSessionId: string, cid: string) => Promise<void>>();
const mockVoiceEndSession = jest.fn<(providerSessionId: string, cid: string) => Promise<void>>();

jest.mock('../../../src/services/video-session-twilio', () => ({
  videoSessionTwilioAdapter: {
    modality: 'video',
    provider: 'twilio_video',
    createSession: jest.fn(),
    endSession: (...a: [string, string]) => mockVideoEndSession(...a),
    getJoinToken: jest.fn(),
  },
  isTwilioVideoConfigured: () => true,
}));
jest.mock('../../../src/services/text-session-supabase', () => ({
  textSessionSupabaseAdapter: {
    modality: 'text',
    provider: 'supabase_realtime',
    createSession: jest.fn(),
    endSession: (...a: [string, string]) => mockTextEndSession(...a),
    getJoinToken: jest.fn(),
  },
  provisionCompanionChannel: jest.fn(),
}));
jest.mock('../../../src/services/voice-session-twilio', () => ({
  voiceSessionTwilioAdapter: {
    modality: 'voice',
    provider: 'twilio_video',
    createSession: jest.fn(),
    endSession: (...a: [string, string]) => mockVoiceEndSession(...a),
    getJoinToken: jest.fn(),
  },
}));

const mockEmitConsultStarted = jest.fn<(sessionId: string) => Promise<void>>();
const mockEmitConsultEnded   = jest.fn<(sessionId: string, summary?: string) => Promise<void>>();

jest.mock('../../../src/services/consultation-message-service', () => ({
  emitConsultStarted: (...args: [string]) => mockEmitConsultStarted(...args),
  emitConsultEnded:   (...args: [string, string?]) => mockEmitConsultEnded(...args),
}));

const mockSendPostConsultChatHistoryDm = jest.fn<(input: {
  sessionId:     string;
  correlationId: string;
}) => Promise<unknown>>();

jest.mock('../../../src/services/notification-service', () => ({
  // Re-export every public symbol the facade or its transitive imports
  // touch. Currently `endSession` only invokes
  // `sendPostConsultChatHistoryDm`, but listing the others as identity
  // jest.fn()s would surface a load-time TypeError if the facade ever
  // grows another import — easier to debug than `undefined is not a
  // function` from a deep callsite.
  sendPostConsultChatHistoryDm: (
    ...args: Parameters<typeof mockSendPostConsultChatHistoryDm>
  ) => mockSendPostConsultChatHistoryDm(...args),
}));

// Imported AFTER mocks are registered.
import * as database from '../../../src/config/database';
import * as logger from '../../../src/config/logger';
import { endSession } from '../../../src/services/consultation-session-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

// ---------------------------------------------------------------------------
// Supabase mock — supports `.select(...).eq(...).maybeSingle()` (the
// `findSessionById` lookup) AND `.update(...).eq(...)` (the status flip).
// We only test the `consultation_sessions` table; nothing else is reached.
// ---------------------------------------------------------------------------

interface SessionRow {
  id:                       string;
  appointment_id:           string;
  doctor_id:                string;
  patient_id:               string | null;
  modality:                 'video' | 'voice' | 'text';
  status:                   'scheduled' | 'live' | 'ended' | 'cancelled';
  provider:                 string;
  provider_session_id:      string | null;
  scheduled_start_at:       string;
  expected_end_at:          string;
  actual_started_at:        string | null;
  actual_ended_at:          string | null;
  doctor_joined_at:         string | null;
  patient_joined_at:        string | null;
  recording_consent_at_book: boolean | null;
  recording_artifact_ref:   string | null;
  created_at:               string;
  updated_at:               string;
}

function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id:                        'sess-uuid-1',
    appointment_id:            'apt-1',
    doctor_id:                 'doc-1',
    patient_id:                'pat-1',
    modality:                  'video',
    status:                    'live',
    provider:                  'twilio_video',
    provider_session_id:       'RM_video_xyz',
    scheduled_start_at:        '2026-04-19T10:00:00.000Z',
    expected_end_at:           '2026-04-19T10:30:00.000Z',
    actual_started_at:         '2026-04-19T10:00:30.000Z',
    actual_ended_at:           null,
    doctor_joined_at:          '2026-04-19T10:00:30.000Z',
    patient_joined_at:         '2026-04-19T10:00:35.000Z',
    recording_consent_at_book: true,
    recording_artifact_ref:    null,
    created_at:                '2026-04-19T09:55:00.000Z',
    updated_at:                '2026-04-19T10:00:30.000Z',
    ...overrides,
  };
}

function buildSupabaseMock(sessionRow: SessionRow | null) {
  // Select chain: from('consultation_sessions').select('*').eq('id', x).maybeSingle()
  const maybeSingle = jest.fn().mockResolvedValue({
    data: sessionRow,
    error: null,
  } as never);
  const eqOnSelect = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq: eqOnSelect });

  // Update chain: from('consultation_sessions').update({...}).eq('id', x)
  // The status update awaits the Supabase builder directly (no .then or
  // .single() suffix in `updateSessionStatus`). The builder is awaited as
  // a thenable; we make our `eq` return a thenable resolving to the
  // standard `{ data: null, error: null }` envelope.
  const eqOnUpdate = jest.fn().mockImplementation(() =>
    Promise.resolve({ data: null, error: null }),
  );
  const update = jest.fn().mockReturnValue({ eq: eqOnUpdate });

  const from = jest.fn().mockImplementation(() => ({ select, update }));

  return { client: { from }, mocks: { from, select, update, eqOnSelect, eqOnUpdate } };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockVideoEndSession.mockResolvedValue();
  mockVoiceEndSession.mockResolvedValue();
  mockTextEndSession.mockResolvedValue();
  mockEmitConsultEnded.mockResolvedValue(undefined);
  mockSendPostConsultChatHistoryDm.mockResolvedValue({ skipped: true, reason: 'test-default' });
});

// ===========================================================================
// Happy path — fire-and-forget DM
// ===========================================================================

describe('endSession — post-consult chat-history DM wiring (happy path)', () => {
  it('invokes sendPostConsultChatHistoryDm exactly once with the call-site sessionId + correlationId', async () => {
    const sb = buildSupabaseMock(makeSession({ status: 'live' }));
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    await endSession('sess-uuid-1', 'corr-end-1');

    // Wait for the void-then microtask chain to flush.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockSendPostConsultChatHistoryDm).toHaveBeenCalledTimes(1);
    expect(mockSendPostConsultChatHistoryDm).toHaveBeenCalledWith({
      sessionId:     'sess-uuid-1',
      correlationId: 'corr-end-1',
    });
  });

  it('also fires emitConsultEnded — both system banner AND chat-history DM dispatch on the same end', async () => {
    const sb = buildSupabaseMock(makeSession({ status: 'live' }));
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    await endSession('sess-uuid-1', 'corr-end-1');
    await Promise.resolve();

    expect(mockEmitConsultEnded).toHaveBeenCalledTimes(1);
    expect(mockEmitConsultEnded).toHaveBeenCalledWith('sess-uuid-1');
    expect(mockSendPostConsultChatHistoryDm).toHaveBeenCalledTimes(1);
  });

  it('fires the DM for every modality (text, voice, video)', async () => {
    for (const modality of ['text', 'voice', 'video'] as const) {
      jest.clearAllMocks();
      mockSendPostConsultChatHistoryDm.mockResolvedValue({ skipped: true, reason: 'test-default' });
      mockEmitConsultEnded.mockResolvedValue(undefined);

      const sb = buildSupabaseMock(
        makeSession({
          status:               'live',
          modality,
          provider:             modality === 'text' ? 'supabase_realtime' : 'twilio_video',
          provider_session_id:  modality === 'text' ? 'text:apt-1' : 'RM_xyz',
        }),
      );
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      await endSession('sess-uuid-1', `corr-${modality}`);
      await Promise.resolve();

      expect(mockSendPostConsultChatHistoryDm).toHaveBeenCalledTimes(1);
      expect(mockSendPostConsultChatHistoryDm).toHaveBeenCalledWith({
        sessionId:     'sess-uuid-1',
        correlationId: `corr-${modality}`,
      });
    }
  });
});

// ===========================================================================
// Fire-and-forget contract
// ===========================================================================

describe('endSession — fire-and-forget contract', () => {
  it('does NOT await the helper — endSession resolves even when the helper hangs', async () => {
    // Helper returns a never-resolving promise. `endSession` must still
    // resolve; if it didn't, this test would hang and time out.
    mockSendPostConsultChatHistoryDm.mockReturnValueOnce(
      new Promise<unknown>(() => {
        /* never resolves — simulates a stuck IG-DM round-trip */
      }),
    );
    const sb = buildSupabaseMock(makeSession({ status: 'live' }));
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    await expect(endSession('sess-uuid-1', 'corr-hang')).resolves.toBeUndefined();

    expect(mockSendPostConsultChatHistoryDm).toHaveBeenCalledTimes(1);
  });

  it('does NOT propagate a thrown helper rejection — endSession resolves cleanly', async () => {
    mockSendPostConsultChatHistoryDm.mockRejectedValueOnce(
      new Error('contract drift: helper threw'),
    );
    const sb = buildSupabaseMock(makeSession({ status: 'live' }));
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    await expect(endSession('sess-uuid-1', 'corr-throw')).resolves.toBeUndefined();

    // Microtask flush so the .catch in the wrapper runs and the warn line
    // is emitted.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedLogger.logger.warn).toHaveBeenCalled();
  });
});

// ===========================================================================
// Idempotency — already-ended short-circuit
// ===========================================================================

describe('endSession — idempotency short-circuit', () => {
  it.each(['ended', 'cancelled'] as const)(
    'does NOT fire the DM when the session is already in terminal status=%s',
    async (terminal) => {
      const sb = buildSupabaseMock(makeSession({ status: terminal }));
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      await endSession('sess-uuid-1', 'corr-idemp');
      await Promise.resolve();

      // Critical: no DM, no banner, no provider tear-down.
      expect(mockSendPostConsultChatHistoryDm).not.toHaveBeenCalled();
      expect(mockEmitConsultEnded).not.toHaveBeenCalled();
      expect(mockVideoEndSession).not.toHaveBeenCalled();
    },
  );
});

// ===========================================================================
// Ordering — DM fires AFTER status flip + emitConsultEnded
// ===========================================================================

describe('endSession — ordering', () => {
  it('dispatches the DM AFTER updateSessionStatus + emitConsultEnded', async () => {
    const callOrder: string[] = [];
    const sb = buildSupabaseMock(makeSession({ status: 'live' }));
    // Spy on the update side to record when the status flip lands.
    const originalUpdate = sb.mocks.update.getMockImplementation();
    sb.mocks.update.mockImplementation((...args: unknown[]) => {
      callOrder.push('update');
      return originalUpdate?.(...args) as ReturnType<typeof sb.mocks.update>;
    });
    mockEmitConsultEnded.mockImplementationOnce(async () => {
      callOrder.push('emitConsultEnded');
    });
    mockSendPostConsultChatHistoryDm.mockImplementationOnce(async () => {
      callOrder.push('sendPostConsultChatHistoryDm');
      return { skipped: true, reason: 'test-ordering' };
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    await endSession('sess-uuid-1', 'corr-order');
    // Drain the void-promise chain.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const updateIdx = callOrder.indexOf('update');
    const bannerIdx = callOrder.indexOf('emitConsultEnded');
    const dmIdx     = callOrder.indexOf('sendPostConsultChatHistoryDm');

    expect(updateIdx).toBeGreaterThan(-1);
    expect(bannerIdx).toBeGreaterThan(-1);
    expect(dmIdx).toBeGreaterThan(-1);
    // Exact ordering: status flip → system banner → DM dispatch.
    expect(updateIdx).toBeLessThan(bannerIdx);
    expect(bannerIdx).toBeLessThan(dmIdx);
  });
});
