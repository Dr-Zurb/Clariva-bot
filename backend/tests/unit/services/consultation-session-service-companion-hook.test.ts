/**
 * Consultation Session Facade — Companion-Channel Lifecycle Hook Tests
 * (Plan 06 · Task 36 · Decision 9 LOCKED)
 *
 * Pins the behaviour of the new lifecycle hook in
 * `consultation-session-service.createSession`:
 *
 *   1. Voice + video sessions auto-provision the companion text channel
 *      via `text-session-supabase.provisionCompanionChannel`.
 *   2. Text sessions do NOT run the companion hook (the text adapter
 *      owns the chat surface end-to-end).
 *   3. Companion-provisioning failure is non-fatal — the session row is
 *      still returned, `companion` is undefined, and the error is logged.
 *   4. Companion data lands on the returned `SessionRecord`.
 *   5. `emitConsultStarted` fires exactly once per successful create
 *      (every modality — text, voice, video).
 *   6. The idempotent `findActiveSessionByAppointment` early-return path
 *      does NOT re-provision and does NOT re-emit `consult_started`.
 *   7. Voice / video with `patientId === null` still runs the helper
 *      and carries the partial shape (URL + token null, expiresAt set)
 *      on the returned record.
 *
 * The text / voice / video / companion / emitter modules are mocked at
 * the module boundary — this suite verifies only the facade's hook wiring,
 * NOT the adapter or helper internals (those live in their own suites:
 * `text-session-supabase.test.ts`, `text-session-supabase-companion.test.ts`,
 * `voice-session-twilio.test.ts`, `consultation-message-service-system-emitter.test.ts`).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks (must come before importing the unit under test)
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockVideoCreateSession = jest.fn<
  (input: unknown, correlationId: string) => Promise<{ providerSessionId?: string }>
>();

jest.mock('../../../src/services/video-session-twilio', () => ({
  videoSessionTwilioAdapter: {
    modality: 'video',
    provider: 'twilio_video',
    createSession: (...args: [unknown, string]) => mockVideoCreateSession(...args),
    endSession: jest.fn(async () => {}),
    getJoinToken: jest.fn(async () => ({
      token: 'mock-video-jwt',
      expiresAt: new Date('2026-04-19T14:00:00.000Z'),
    })),
  },
  isTwilioVideoConfigured: () => true,
}));

const mockVoiceCreateSession = jest.fn<
  (input: unknown, correlationId: string) => Promise<{ providerSessionId?: string }>
>();

jest.mock('../../../src/services/voice-session-twilio', () => ({
  voiceSessionTwilioAdapter: {
    modality: 'voice',
    provider: 'twilio_video',
    createSession: (...args: [unknown, string]) => mockVoiceCreateSession(...args),
    endSession: jest.fn(async () => {}),
    getJoinToken: jest.fn(async () => ({
      token: 'mock-voice-jwt',
      expiresAt: new Date('2026-04-19T14:00:00.000Z'),
    })),
  },
}));

const mockTextCreateSession = jest.fn<
  (input: { appointmentId: string }, correlationId: string) => Promise<{ providerSessionId?: string }>
>();
const mockProvisionCompanionChannel = jest.fn<
  (input: {
    sessionId: string;
    doctorId: string;
    patientId: string | null;
    appointmentId: string;
    correlationId: string;
  }) => Promise<{
    sessionId: string;
    patientJoinUrl: string | null;
    patientToken: string | null;
    expiresAt: string;
  } | null>
>();

jest.mock('../../../src/services/text-session-supabase', () => ({
  textSessionSupabaseAdapter: {
    modality: 'text',
    provider: 'supabase_realtime',
    createSession: (...args: [{ appointmentId: string }, string]) =>
      mockTextCreateSession(...args),
    endSession: jest.fn(async () => {}),
    getJoinToken: jest.fn(async () => ({
      token: 'mock-text-jwt',
      expiresAt: new Date('2026-04-19T14:00:00.000Z'),
    })),
  },
  provisionCompanionChannel: (
    ...args: Parameters<typeof mockProvisionCompanionChannel>
  ) => mockProvisionCompanionChannel(...args),
}));

const mockEmitConsultStarted = jest.fn<(sessionId: string) => Promise<void>>();
const mockEmitConsultEnded = jest.fn<
  (sessionId: string, summary?: string) => Promise<void>
>();

jest.mock('../../../src/services/consultation-message-service', () => ({
  emitConsultStarted: (...args: [string]) => mockEmitConsultStarted(...args),
  emitConsultEnded: (...args: [string, string?]) => mockEmitConsultEnded(...args),
}));

// Imported after the mocks are registered.
import * as database from '../../../src/config/database';
import { createSession } from '../../../src/services/consultation-session-service';

const mockedDb = database as jest.Mocked<typeof database>;
const correlationId = 'corr-hook-001';

// ---------------------------------------------------------------------------
// Supabase mock (same shape as the sibling facade test, trimmed)
// ---------------------------------------------------------------------------

interface RowState {
  selectMaybeSingleResult: { data: unknown; error: { message: string } | null };
  insertSingleResult: { data: unknown; error: { message: string } | null };
}

function buildSupabaseMock(state: RowState) {
  const maybeSingleSelect = jest.fn().mockResolvedValue(
    state.selectMaybeSingleResult as never,
  );
  const singleInsert = jest.fn().mockResolvedValue(
    state.insertSingleResult as never,
  );

  const selectChain: Record<string, unknown> = {};
  for (const m of ['eq', 'not', 'order', 'limit']) {
    selectChain[m] = jest.fn().mockReturnValue(selectChain);
  }
  selectChain.maybeSingle = maybeSingleSelect;

  const select = jest.fn().mockReturnValue(selectChain);
  const insertSelect = jest.fn().mockReturnValue({ single: singleInsert });
  const insert = jest.fn().mockReturnValue({ select: insertSelect });
  const from = jest.fn().mockImplementation(() => ({ select, insert }));

  return { client: { from }, mocks: { from, select, insert } };
}

function buildFixedSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-uuid-1',
    appointment_id: 'apt-1',
    doctor_id: 'doc-1',
    patient_id: 'pat-1',
    modality: 'video',
    status: 'scheduled',
    provider: 'twilio_video',
    provider_session_id: 'RM_abc',
    scheduled_start_at: '2026-04-19T10:00:00.000Z',
    expected_end_at: '2026-04-19T10:30:00.000Z',
    actual_started_at: null,
    actual_ended_at: null,
    doctor_joined_at: null,
    patient_joined_at: null,
    recording_consent_at_book: null,
    recording_artifact_ref: null,
    created_at: '2026-04-19T09:55:00.000Z',
    updated_at: '2026-04-19T09:55:00.000Z',
    ...overrides,
  };
}

const happyCompanion = {
  sessionId: 'sess-uuid-1',
  patientJoinUrl: 'https://app.example.com/c/text/sess-uuid-1?t=hmac',
  patientToken: 'hmac',
  expiresAt: '2026-04-19T11:00:00.000Z',
};

const baseInput = {
  appointmentId: 'apt-1',
  doctorId: 'doc-1',
  patientId: 'pat-1' as string | null,
  modality: 'voice' as const,
  scheduledStartAt: new Date('2026-04-19T10:00:00.000Z'),
  expectedEndAt: new Date('2026-04-19T10:30:00.000Z'),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVideoCreateSession.mockResolvedValue({ providerSessionId: 'RM_vid_1' });
  mockVoiceCreateSession.mockResolvedValue({ providerSessionId: 'RM_voi_1' });
  mockTextCreateSession.mockResolvedValue({ providerSessionId: 'text:apt-1' });
  mockProvisionCompanionChannel.mockResolvedValue(happyCompanion);
  mockEmitConsultStarted.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Happy-path routing
// ---------------------------------------------------------------------------

describe('createSession lifecycle hook — happy path (voice + video)', () => {
  it('voice session triggers companion provisioning exactly once with the persisted row context', async () => {
    const sb = buildSupabaseMock({
      selectMaybeSingleResult: { data: null, error: null },
      insertSingleResult: {
        data: buildFixedSession({
          modality: 'voice',
          provider: 'twilio_video',
          provider_session_id: 'RM_voi_1',
        }),
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    const result = await createSession(
      { ...baseInput, modality: 'voice' },
      correlationId,
    );

    expect(mockProvisionCompanionChannel).toHaveBeenCalledTimes(1);
    expect(mockProvisionCompanionChannel).toHaveBeenCalledWith({
      sessionId: 'sess-uuid-1',
      doctorId: 'doc-1',
      patientId: 'pat-1',
      appointmentId: 'apt-1',
      correlationId,
    });
    expect(result.companion).toEqual(happyCompanion);
  });

  it('video session triggers companion provisioning exactly once with the persisted row context', async () => {
    const sb = buildSupabaseMock({
      selectMaybeSingleResult: { data: null, error: null },
      insertSingleResult: {
        data: buildFixedSession({ provider_session_id: 'RM_vid_1' }),
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    const result = await createSession(
      { ...baseInput, modality: 'video' },
      correlationId,
    );

    expect(mockProvisionCompanionChannel).toHaveBeenCalledTimes(1);
    expect(mockProvisionCompanionChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-uuid-1',
        doctorId: 'doc-1',
        patientId: 'pat-1',
        appointmentId: 'apt-1',
        correlationId,
      }),
    );
    expect(result.companion).toEqual(happyCompanion);
    expect(result.modality).toBe('video');
  });

  it('companion data lands on the returned SessionRecord (exhaustive shape)', async () => {
    const sb = buildSupabaseMock({
      selectMaybeSingleResult: { data: null, error: null },
      insertSingleResult: { data: buildFixedSession(), error: null },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    const result = await createSession(
      { ...baseInput, modality: 'video' },
      correlationId,
    );

    expect(result.companion).toEqual({
      sessionId: 'sess-uuid-1',
      patientJoinUrl: 'https://app.example.com/c/text/sess-uuid-1?t=hmac',
      patientToken: 'hmac',
      expiresAt: '2026-04-19T11:00:00.000Z',
    });
  });
});

// ---------------------------------------------------------------------------
// Text short-circuit
// ---------------------------------------------------------------------------

describe('createSession lifecycle hook — text skip', () => {
  it('text session does NOT call provisionCompanionChannel (text adapter owns the chat surface)', async () => {
    const sb = buildSupabaseMock({
      selectMaybeSingleResult: { data: null, error: null },
      insertSingleResult: {
        data: buildFixedSession({
          modality: 'text',
          provider: 'supabase_realtime',
          provider_session_id: 'text:apt-1',
        }),
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    const result = await createSession(
      { ...baseInput, modality: 'text' },
      correlationId,
    );

    expect(mockProvisionCompanionChannel).not.toHaveBeenCalled();
    expect(result.companion).toBeUndefined();
    // emitConsultStarted still fires for text — canonical cross-modality banner.
    expect(mockEmitConsultStarted).toHaveBeenCalledTimes(1);
    expect(mockEmitConsultStarted).toHaveBeenCalledWith('sess-uuid-1');
  });
});

// ---------------------------------------------------------------------------
// Failure isolation (best-effort contract)
// ---------------------------------------------------------------------------

describe('createSession lifecycle hook — best-effort failure isolation', () => {
  it('companion-provisioning throwing does NOT block session creation — row returns with companion undefined', async () => {
    const sb = buildSupabaseMock({
      selectMaybeSingleResult: { data: null, error: null },
      insertSingleResult: { data: buildFixedSession(), error: null },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);
    mockProvisionCompanionChannel.mockRejectedValueOnce(
      new Error('supabase jwt mint failed'),
    );

    const result = await createSession(
      { ...baseInput, modality: 'video' },
      correlationId,
    );

    expect(result.id).toBe('sess-uuid-1');
    expect(result.companion).toBeUndefined();
    // emitConsultStarted must still fire — the helper's own contract is
    // no-throw, and the facade's call site is unwrapped. The failed
    // companion provisioning doesn't short-circuit the banner.
    expect(mockEmitConsultStarted).toHaveBeenCalledTimes(1);
  });

  it('companion-provisioning returning null leaves companion undefined on the returned row', async () => {
    const sb = buildSupabaseMock({
      selectMaybeSingleResult: { data: null, error: null },
      insertSingleResult: { data: buildFixedSession(), error: null },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);
    mockProvisionCompanionChannel.mockResolvedValueOnce(null);

    const result = await createSession(
      { ...baseInput, modality: 'video' },
      correlationId,
    );

    expect(result.companion).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// emitConsultStarted wiring
// ---------------------------------------------------------------------------

describe('createSession lifecycle hook — emitConsultStarted wiring', () => {
  it.each(['text', 'voice', 'video'] as const)(
    'fires emitConsultStarted exactly once for modality=%s',
    async (modality) => {
      const sb = buildSupabaseMock({
        selectMaybeSingleResult: { data: null, error: null },
        insertSingleResult: {
          data: buildFixedSession({
            modality,
            provider: modality === 'text' ? 'supabase_realtime' : 'twilio_video',
            provider_session_id:
              modality === 'text'
                ? 'text:apt-1'
                : modality === 'voice'
                  ? 'RM_voi_1'
                  : 'RM_vid_1',
          }),
          error: null,
        },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      await createSession({ ...baseInput, modality }, correlationId);

      expect(mockEmitConsultStarted).toHaveBeenCalledTimes(1);
      expect(mockEmitConsultStarted).toHaveBeenCalledWith('sess-uuid-1');
    },
  );
});

// ---------------------------------------------------------------------------
// Idempotency: existing session short-circuit
// ---------------------------------------------------------------------------

describe('createSession lifecycle hook — idempotency short-circuit', () => {
  it('existing active session returns early WITHOUT re-provisioning or re-emitting', async () => {
    const sb = buildSupabaseMock({
      // Idempotency lookup returns the existing session row
      selectMaybeSingleResult: { data: buildFixedSession(), error: null },
      insertSingleResult: { data: null, error: null },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    const result = await createSession(
      { ...baseInput, modality: 'video' },
      correlationId,
    );

    expect(mockVideoCreateSession).not.toHaveBeenCalled();
    expect(mockProvisionCompanionChannel).not.toHaveBeenCalled();
    expect(mockEmitConsultStarted).not.toHaveBeenCalled();
    expect(sb.mocks.insert).not.toHaveBeenCalled();
    expect(result.id).toBe('sess-uuid-1');
    // Early-return path carries no companion; the first create already
    // surfaced it to the original caller. Task 36 Notes #2 documents
    // this trade-off.
    expect(result.companion).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// patientId === null
// ---------------------------------------------------------------------------

describe('createSession lifecycle hook — patientId null passthrough', () => {
  it('voice session with patientId=null still runs the helper; partial companion shape lands on the row', async () => {
    const sb = buildSupabaseMock({
      selectMaybeSingleResult: { data: null, error: null },
      insertSingleResult: {
        data: buildFixedSession({ patient_id: null, modality: 'voice' }),
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);
    mockProvisionCompanionChannel.mockResolvedValueOnce({
      sessionId: 'sess-uuid-1',
      patientJoinUrl: null,
      patientToken: null,
      expiresAt: '2026-04-19T11:00:00.000Z',
    });

    const result = await createSession(
      { ...baseInput, modality: 'voice', patientId: null },
      correlationId,
    );

    expect(mockProvisionCompanionChannel).toHaveBeenCalledTimes(1);
    expect(mockProvisionCompanionChannel).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: null }),
    );
    expect(result.companion).toEqual({
      sessionId: 'sess-uuid-1',
      patientJoinUrl: null,
      patientToken: null,
      expiresAt: '2026-04-19T11:00:00.000Z',
    });
  });
});
