/**
 * Consultation Session Facade Unit Tests (Plan 01 · Task 15)
 *
 * Covers:
 *  - Adapter routing: video → real adapter; voice/text → throw documented error
 *  - `createSession` lazy-write: inserts a `consultation_sessions` row AND
 *    delegates room provisioning to the video adapter
 *  - `createSession` idempotency: returns existing row without re-provisioning
 *  - `getJoinToken`: looks up by sessionId, calls adapter with right inputs
 *  - `getJoinTokenForAppointment`: bridges the lazy-write window (works with
 *    OR without an existing session row)
 *  - `findSessionByProviderSessionId`: provider lookup happy path + null
 *  - `endSession`: tears down provider then marks status=ended
 *
 * The video adapter (`videoSessionTwilioAdapter`) is mocked at the module
 * boundary — these tests verify only the facade's routing + persistence
 * behavior, not the Twilio primitives (those live in the
 * `video-session-twilio.test.ts` suite).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as database from '../../../src/config/database';
import { InternalError, NotFoundError } from '../../../src/utils/errors';

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

const mockAdapterCreateSession = jest.fn<
  (input: unknown, correlationId: string) => Promise<{ providerSessionId?: string }>
>();
const mockAdapterEndSession = jest.fn<
  (providerSessionId: string, correlationId: string) => Promise<void>
>();
const mockAdapterGetJoinToken = jest.fn<
  (input: unknown, correlationId: string) => Promise<{ token: string; expiresAt: Date }>
>();
const mockIsTwilioVideoConfigured = jest.fn().mockReturnValue(true);

jest.mock('../../../src/services/video-session-twilio', () => ({
  videoSessionTwilioAdapter: {
    modality: 'video',
    provider: 'twilio_video',
    createSession: (...args: [unknown, string]) => mockAdapterCreateSession(...args),
    endSession: (...args: [string, string]) => mockAdapterEndSession(...args),
    getJoinToken: (...args: [unknown, string]) => mockAdapterGetJoinToken(...args),
  },
  isTwilioVideoConfigured: () => mockIsTwilioVideoConfigured(),
}));

// Plan 05 · Task 23 wired up the voice adapter. The adapter's full
// behavior (recording rules, transcription enqueue) is pinned by the
// voice-session-twilio.test.ts suite; here we only care that the facade
// routes voice calls to it.
const mockVoiceAdapterCreateSession = jest.fn<
  (input: unknown, correlationId: string) => Promise<{ providerSessionId?: string }>
>();

jest.mock('../../../src/services/voice-session-twilio', () => ({
  voiceSessionTwilioAdapter: {
    modality: 'voice',
    provider: 'twilio_video',
    createSession: (...args: [unknown, string]) => mockVoiceAdapterCreateSession(...args),
    endSession: jest.fn(async () => {}),
    getJoinToken: jest.fn(async () => ({ token: 'voice-mock-jwt', expiresAt: new Date() })),
  },
}));

// Plan 06 · Task 37: the facade's `endSession` now fires an
// `emitConsultEnded` banner after the status flip, and `createSession`
// fires `emitConsultStarted` post-provisioning. Mock both at the module
// boundary so the facade test doesn't need the full writer chain (that's
// pinned by `consultation-message-service-system-emitter.test.ts`).
const mockEmitConsultEnded = jest.fn<(sessionId: string, summary?: string) => Promise<void>>();
const mockEmitConsultStarted = jest.fn<(sessionId: string) => Promise<void>>();

jest.mock('../../../src/services/consultation-message-service', () => ({
  emitConsultEnded: (...args: [string, string?]) => mockEmitConsultEnded(...args),
  emitConsultStarted: (...args: [string]) => mockEmitConsultStarted(...args),
}));

// Plan 06 · Task 36: the facade's `createSession` now runs a companion-
// channel provisioning hook for voice + video sessions AND needs to know
// about the text adapter for routing. Mock the text-session module at
// the boundary — the text adapter's real behaviour is pinned by
// `text-session-supabase.test.ts` and the companion helper by the new
// `text-session-supabase-companion.test.ts` suite. Here we only care
// that the facade CALLS them with the right args.
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
    createSession: jest.fn(async (input: { appointmentId: string }) => ({
      providerSessionId: `text:${input.appointmentId}`,
    })),
    endSession: jest.fn(async () => {}),
    getJoinToken: jest.fn(async () => ({
      token: 'text-mock-jwt',
      expiresAt: new Date('2026-04-19T14:00:00.000Z'),
    })),
  },
  provisionCompanionChannel: (
    ...args: Parameters<typeof mockProvisionCompanionChannel>
  ) => mockProvisionCompanionChannel(...args),
}));

// Imported after the mocks are registered.
import {
  createSession,
  endSession,
  findSessionByProviderSessionId,
  getJoinToken,
  getJoinTokenForAppointment,
  isVideoModalityConfigured,
} from '../../../src/services/consultation-session-service';

const mockedDb = database as jest.Mocked<typeof database>;
const correlationId = 'corr-facade-001';

// ---------------------------------------------------------------------------
// Tiny Supabase mock builder — minimum surface the facade touches.
// ---------------------------------------------------------------------------
type RowState = {
  /** Set by `select(...).eq(...).maybeSingle()` and `select(...).<chain>.maybeSingle()` */
  selectMaybeSingleResult: { data: unknown; error: { message: string } | null };
  /** Set by `insert(...).select(...).single()` */
  insertSingleResult: { data: unknown; error: { message: string } | null };
  /** Set by `update(...)...eq()...is()/eq()` */
  updateResult: { error: { message: string } | null };
};

function buildSupabaseMock(state: RowState) {
  const maybeSingleSelect = jest.fn().mockResolvedValue(state.selectMaybeSingleResult as never);
  const singleInsert = jest.fn().mockResolvedValue(state.insertSingleResult as never);

  // SELECT chain: from(t).select(*).eq(...)... .maybeSingle()
  // All filter/sort steps just return `this`; `.maybeSingle()` is the
  // terminal Promise.
  const selectChain: Record<string, unknown> = {};
  for (const m of ['eq', 'not', 'order', 'limit']) {
    selectChain[m] = jest.fn().mockReturnValue(selectChain);
  }
  selectChain.maybeSingle = maybeSingleSelect;

  const select = jest.fn().mockReturnValue(selectChain);

  // INSERT chain: from(t).insert(row).select('*').single()
  const insertSelect = jest.fn().mockReturnValue({ single: singleInsert });
  const insert = jest.fn().mockReturnValue({ select: insertSelect });

  // UPDATE chain: must support both
  //   await update(p).eq(c, v)              ← terminal at .eq()
  //   await update(p).eq(c, v).is(c, null)  ← terminal at .is()
  // We build a thenable that's also chainable.
  const updateResult = state.updateResult;
  const buildEqReturn = (): Record<string, unknown> => {
    const obj: Record<string, unknown> = {
      is: jest.fn().mockResolvedValue(updateResult as never),
      eq: jest.fn().mockImplementation(buildEqReturn),
      then: (
        onFulfilled?: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown
      ) => Promise.resolve(updateResult).then(onFulfilled, onRejected),
    };
    return obj;
  };
  const update = jest.fn().mockImplementation(() => ({
    eq: jest.fn().mockImplementation(buildEqReturn),
  }));

  const from = jest.fn().mockImplementation(() => ({ select, insert, update }));
  return {
    client: { from },
    mocks: { from, select, insert, update, maybeSingleSelect, singleInsert },
  };
}

const fixedSession = {
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
};

describe('consultation-session-service facade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdapterCreateSession.mockResolvedValue({ providerSessionId: 'RM_abc' });
    mockAdapterEndSession.mockResolvedValue();
    mockAdapterGetJoinToken.mockResolvedValue({
      token: 'mock-jwt-token',
      expiresAt: new Date('2026-04-19T14:00:00.000Z'),
    });
    mockIsTwilioVideoConfigured.mockReturnValue(true);
    // Plan 06 · Task 36: companion provisioning returns a happy shape
    // by default so the existing video/voice tests keep passing. Tests
    // that care about the hook override this per-case.
    mockProvisionCompanionChannel.mockResolvedValue({
      sessionId: 'sess-uuid-1',
      patientJoinUrl: 'https://app.example.com/c/text/sess-uuid-1?t=mock-hmac',
      patientToken: 'mock-hmac',
      expiresAt: '2026-04-19T11:00:00.000Z',
    });
    mockEmitConsultStarted.mockResolvedValue(undefined);
  });

  describe('isVideoModalityConfigured', () => {
    it('proxies to the underlying adapter check', () => {
      expect(isVideoModalityConfigured()).toBe(true);
      expect(mockIsTwilioVideoConfigured).toHaveBeenCalled();
    });
  });

  describe('createSession adapter routing', () => {
    it('voice modality routes through voiceSessionTwilioAdapter (wired in Plan 05 task-23)', async () => {
      // Plan 05 · Task 23 lights up the voice adapter (Twilio Video
      // audio-only wrapper). The facade's sole responsibility here is to
      // route the call and persist the row with provider='twilio_video'
      // and modality='voice'. The adapter's own behaviour (recording
      // rules, transcription enqueue) is covered by
      // voice-session-twilio.test.ts.
      mockVoiceAdapterCreateSession.mockResolvedValueOnce({
        providerSessionId: 'RM_voice_abc',
      });
      const sb = buildSupabaseMock({
        selectMaybeSingleResult: { data: null, error: null },
        insertSingleResult: {
          data: {
            ...fixedSession,
            modality: 'voice',
            provider: 'twilio_video',
            provider_session_id: 'RM_voice_abc',
          },
          error: null,
        },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      const result = await createSession(
        {
          appointmentId: 'apt-1',
          doctorId: 'doc-1',
          patientId: 'pat-1',
          modality: 'voice',
          scheduledStartAt: new Date('2026-04-19T10:00:00.000Z'),
          expectedEndAt: new Date('2026-04-19T10:30:00.000Z'),
        },
        correlationId
      );

      expect(mockVoiceAdapterCreateSession).toHaveBeenCalledTimes(1);
      // The video adapter must NOT be called when modality is 'voice' —
      // the voice adapter owns that delegation internally. This pins the
      // facade's routing, not the voice adapter's internal wrapping.
      expect(mockAdapterCreateSession).not.toHaveBeenCalled();
      expect(result.modality).toBe('voice');
      expect(result.provider).toBe('twilio_video');
      expect(result.providerSessionId).toBe('RM_voice_abc');
    });

    it('text modality routes through the supabase_realtime adapter (wired in Plan 04 task-18)', async () => {
      // Plan 04 task-18 lights up the text adapter. The adapter does NO
      // remote provisioning (Supabase Realtime channels are virtual), so
      // createSession only needs the in-memory adapter call to succeed —
      // no Supabase admin client is used by the adapter itself, but the
      // facade still tries to lazy-write the row downstream. We isolate
      // that by leaving the admin client null and asserting only the
      // adapter shape on the rejected error.
      //
      // Easier path: stub admin client with an "insert→single returns the
      // row" mock, then assert provider/providerSessionId on the result.
      const sb = buildSupabaseMock({
        selectMaybeSingleResult: { data: null, error: null },
        insertSingleResult: {
          data: {
            ...fixedSession,
            modality: 'text',
            provider: 'supabase_realtime',
            provider_session_id: 'text:apt-1',
          },
          error: null,
        },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      const result = await createSession(
        {
          appointmentId: 'apt-1',
          doctorId: 'doc-1',
          patientId: 'pat-1',
          modality: 'text',
          scheduledStartAt: new Date('2026-04-19T10:00:00.000Z'),
          expectedEndAt: new Date('2026-04-19T10:30:00.000Z'),
        },
        correlationId,
      );

      expect(result.modality).toBe('text');
      expect(result.provider).toBe('supabase_realtime');
      expect(result.providerSessionId).toBe('text:apt-1');
    });
  });

  describe('createSession lazy-write', () => {
    it('calls video adapter then inserts consultation_sessions row', async () => {
      const sb = buildSupabaseMock({
        // First call: idempotency lookup returns no row
        selectMaybeSingleResult: { data: null, error: null },
        insertSingleResult: { data: fixedSession, error: null },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      const result = await createSession(
        {
          appointmentId: 'apt-1',
          doctorId: 'doc-1',
          patientId: 'pat-1',
          modality: 'video',
          scheduledStartAt: new Date('2026-04-19T10:00:00.000Z'),
          expectedEndAt: new Date('2026-04-19T10:30:00.000Z'),
        },
        correlationId
      );

      expect(mockAdapterCreateSession).toHaveBeenCalledTimes(1);
      expect(sb.mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          appointment_id: 'apt-1',
          doctor_id: 'doc-1',
          patient_id: 'pat-1',
          modality: 'video',
          provider: 'twilio_video',
          provider_session_id: 'RM_abc',
          status: 'scheduled',
        })
      );
      expect(result.id).toBe('sess-uuid-1');
      expect(result.providerSessionId).toBe('RM_abc');
    });

    it('returns existing session without re-provisioning when one is active', async () => {
      const sb = buildSupabaseMock({
        // Idempotency lookup returns the existing session row
        selectMaybeSingleResult: { data: fixedSession, error: null },
        insertSingleResult: { data: null, error: null },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      const result = await createSession(
        {
          appointmentId: 'apt-1',
          doctorId: 'doc-1',
          patientId: 'pat-1',
          modality: 'video',
          scheduledStartAt: new Date('2026-04-19T10:00:00.000Z'),
          expectedEndAt: new Date('2026-04-19T10:30:00.000Z'),
        },
        correlationId
      );

      expect(mockAdapterCreateSession).not.toHaveBeenCalled();
      expect(sb.mocks.insert).not.toHaveBeenCalled();
      expect(result.id).toBe('sess-uuid-1');
    });
  });

  describe('getJoinToken', () => {
    it('looks up session and forwards adapter inputs', async () => {
      const sb = buildSupabaseMock({
        selectMaybeSingleResult: { data: fixedSession, error: null },
        insertSingleResult: { data: null, error: null },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      const tok = await getJoinToken('sess-uuid-1', 'doctor', correlationId);

      expect(tok.token).toBe('mock-jwt-token');
      expect(mockAdapterGetJoinToken).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: 'apt-1',
          doctorId: 'doc-1',
          role: 'doctor',
          providerSessionId: 'RM_abc',
        }),
        correlationId
      );
    });

    it('throws NotFoundError when session does not exist', async () => {
      const sb = buildSupabaseMock({
        selectMaybeSingleResult: { data: null, error: null },
        insertSingleResult: { data: null, error: null },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      await expect(getJoinToken('missing', 'doctor', correlationId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getJoinTokenForAppointment (lazy-write bridge)', () => {
    it('forwards providerSessionId when a session exists', async () => {
      const sb = buildSupabaseMock({
        selectMaybeSingleResult: { data: fixedSession, error: null },
        insertSingleResult: { data: null, error: null },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      await getJoinTokenForAppointment(
        {
          appointmentId: 'apt-1',
          doctorId: 'doc-1',
          modality: 'video',
          role: 'patient',
        },
        correlationId
      );

      expect(mockAdapterGetJoinToken).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: 'apt-1',
          doctorId: 'doc-1',
          role: 'patient',
          providerSessionId: 'RM_abc',
        }),
        correlationId
      );
    });

    it('still mints token (legacy path) when no session row exists', async () => {
      const sb = buildSupabaseMock({
        selectMaybeSingleResult: { data: null, error: null },
        insertSingleResult: { data: null, error: null },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      await getJoinTokenForAppointment(
        {
          appointmentId: 'apt-1',
          doctorId: 'doc-1',
          modality: 'video',
          role: 'doctor',
        },
        correlationId
      );

      expect(mockAdapterGetJoinToken).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: 'apt-1',
          doctorId: 'doc-1',
          role: 'doctor',
          providerSessionId: undefined,
        }),
        correlationId
      );
    });
  });

  describe('findSessionByProviderSessionId', () => {
    it('returns the session for a known Twilio room SID', async () => {
      const sb = buildSupabaseMock({
        selectMaybeSingleResult: { data: fixedSession, error: null },
        insertSingleResult: { data: null, error: null },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      const result = await findSessionByProviderSessionId('twilio_video', 'RM_abc');
      expect(result?.id).toBe('sess-uuid-1');
    });

    it('returns null when no session matches', async () => {
      const sb = buildSupabaseMock({
        selectMaybeSingleResult: { data: null, error: null },
        insertSingleResult: { data: null, error: null },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      const result = await findSessionByProviderSessionId('twilio_video', 'unknown');
      expect(result).toBeNull();
    });
  });

  describe('endSession', () => {
    it('throws NotFoundError when session does not exist', async () => {
      const sb = buildSupabaseMock({
        selectMaybeSingleResult: { data: null, error: null },
        insertSingleResult: { data: null, error: null },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      await expect(endSession('missing', correlationId)).rejects.toThrow(NotFoundError);
    });

    it('tears down provider then marks status ended', async () => {
      const sb = buildSupabaseMock({
        selectMaybeSingleResult: { data: fixedSession, error: null },
        insertSingleResult: { data: null, error: null },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);
      mockEmitConsultEnded.mockResolvedValue(undefined);

      await endSession('sess-uuid-1', correlationId);

      expect(mockAdapterEndSession).toHaveBeenCalledWith('RM_abc', correlationId);
      expect(sb.mocks.update).toHaveBeenCalled();
    });

    it('is a no-op when session already ended', async () => {
      const sb = buildSupabaseMock({
        selectMaybeSingleResult: {
          data: { ...fixedSession, status: 'ended' },
          error: null,
        },
        insertSingleResult: { data: null, error: null },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      await endSession('sess-uuid-1', correlationId);

      expect(mockAdapterEndSession).not.toHaveBeenCalled();
    });

    // Plan 06 · Task 37: emitConsultEnded wire-up.
    it('fires emitConsultEnded exactly once after the status flip', async () => {
      const sb = buildSupabaseMock({
        selectMaybeSingleResult: { data: fixedSession, error: null },
        insertSingleResult: { data: null, error: null },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);
      mockEmitConsultEnded.mockResolvedValue(undefined);

      await endSession('sess-uuid-1', correlationId);

      expect(mockEmitConsultEnded).toHaveBeenCalledTimes(1);
      expect(mockEmitConsultEnded).toHaveBeenCalledWith('sess-uuid-1');
    });

    it('does NOT fire emitConsultEnded on the already-ended idempotent path', async () => {
      const sb = buildSupabaseMock({
        selectMaybeSingleResult: {
          data: { ...fixedSession, status: 'ended' },
          error: null,
        },
        insertSingleResult: { data: null, error: null },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

      await endSession('sess-uuid-1', correlationId);

      expect(mockEmitConsultEnded).not.toHaveBeenCalled();
    });

    it('swallows a failure from emitConsultEnded — endSession still resolves', async () => {
      const sb = buildSupabaseMock({
        selectMaybeSingleResult: { data: fixedSession, error: null },
        insertSingleResult: { data: null, error: null },
        updateResult: { error: null },
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);
      mockEmitConsultEnded.mockRejectedValue(new Error('banner write failed'));

      await expect(endSession('sess-uuid-1', correlationId)).resolves.toBeUndefined();
      expect(sb.mocks.update).toHaveBeenCalled(); // status flip still succeeded
    });
  });
});

describe('InternalError export sanity', () => {
  it('is a real Error subclass (smoke check for jest module wiring)', () => {
    expect(new InternalError('x')).toBeInstanceOf(Error);
  });
});
