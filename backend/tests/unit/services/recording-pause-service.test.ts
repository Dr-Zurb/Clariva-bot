/**
 * Unit tests for `services/recording-pause-service.ts` (Plan 07 · Task 28).
 *
 * Pins:
 *   - Reason-length validation (5..200, trimmed).
 *   - AuthZ (doctor-of-record gate).
 *   - Session-status ConflictError.
 *   - Ledger ordering (attempted → Twilio → completed/failed).
 *   - Idempotency (already paused / not paused).
 *   - System-message failure is non-fatal.
 *   - `getCurrentRecordingState` branches.
 *   - Audit metadata JSONB shape (drift pin).
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/env', () => ({
  env: { TWILIO_ACCOUNT_SID: 'AC_test', TWILIO_AUTH_TOKEN: 'tok_test' },
}));

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
  findSessionById: jest.fn(),
  findSessionByProviderSessionId: jest.fn(),
}));

jest.mock('../../../src/services/supabase-jwt-mint', () => ({
  verifyScopedConsultationJwt: jest.fn(),
}));

jest.mock('../../../src/services/consultation-message-service', () => ({
  emitSystemMessage: jest
    .fn()
    .mockResolvedValue({ id: 'msg-1', createdAt: '2026-04-19T14:00:00.000Z' } as never),
  formatTimeInDoctorTz: jest.fn().mockReturnValue('14:30'),
}));

jest.mock('../../../src/services/twilio-recording-rules', () => {
  class TwilioRoomNotFoundError extends Error {
    readonly roomSid: string;
    constructor(roomSid: string, cause?: string) {
      super(
        cause ? `Twilio room ${roomSid} not found: ${cause}` : `Twilio room ${roomSid} not found`
      );
      this.name = 'TwilioRoomNotFoundError';
      this.roomSid = roomSid;
    }
  }
  return {
    excludeAllParticipantsFromRecording: jest.fn().mockResolvedValue(undefined as never),
    includeAllParticipantsInRecording: jest.fn().mockResolvedValue(undefined as never),
    getIncludedRecordingKinds: jest.fn().mockResolvedValue(['audio'] as never),
    TwilioRoomNotFoundError,
  };
});

import * as database from '../../../src/config/database';
import * as sessionSvc from '../../../src/services/consultation-session-service';
import * as messageSvc from '../../../src/services/consultation-message-service';
import * as twilioRules from '../../../src/services/twilio-recording-rules';
import * as jwtMint from '../../../src/services/supabase-jwt-mint';
import { RECORDING_SYSTEM_ACTOR_UUID } from '../../../src/types/consultation-recording-audit';

import {
  pauseRecording,
  resumeRecording,
  resumeRecordingAsSystem,
  extendRecordingPause,
  stampDanglingPausesForEndedSession,
  getCurrentRecordingState,
  resolveRecordingCaller,
  isSessionRecordingPaused,
  isRoomRecordingPaused,
  __setVideoGrantValidReaderForTests,
  __resetVideoGrantValidReaderForTests,
} from '../../../src/services/recording-pause-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedSessionSvc = sessionSvc as jest.Mocked<typeof sessionSvc>;
const mockedMessageSvc = messageSvc as jest.Mocked<typeof messageSvc>;
const mockedTwilio = twilioRules as jest.Mocked<typeof twilioRules>;
const mockedJwtMint = jwtMint as jest.Mocked<typeof jwtMint>;

// ---------------------------------------------------------------------------
// Mock builder for the supabase admin client.
//
// Touched chains:
//   - insert into consultation_recording_audit:
//       from('consultation_recording_audit').insert(row) → { error }
//   - read latest pause/resume row:
//       from('consultation_recording_audit').select(...).eq(...).in(...)
//         .order(...).limit(1).maybeSingle() → { data, error }
//   - read second row (failed-row fallback path):
//       .range(1,1).maybeSingle() → { data }
//   - consultation_sessions / doctor_settings for tz lookup (not asserted)
// ---------------------------------------------------------------------------

interface AuditMockInit {
  latestRow?: {
    id?: string;
    action: 'recording_paused' | 'recording_resumed';
    reason: string | null;
    pause_reason_code?: string | null;
    pause_closed_as?: string | null;
    auto_resume_at?: string | null;
    auto_resume_extensions_used?: number | null;
    action_by: string;
    action_by_role?: 'doctor' | 'patient' | 'system' | 'support_staff';
    metadata: {
      status?: 'attempted' | 'completed' | 'failed';
      twilio_sid?: string;
      kind?: 'audio' | 'video';
      paused_kinds?: Array<'audio' | 'video'>;
    };
    created_at: string;
  } | null;
  priorRow?: AuditMockInit['latestRow']; // for the .range(1,1) fallback in getCurrentRecordingState
  insertError?: { message: string } | null;
  authUser?: { id: string } | null;
}

function buildAdminMock(opts: AuditMockInit = {}): {
  client: {
    from: (table: string) => unknown;
    auth: {
      getUser: () => Promise<{
        data: { user: { id: string } | null };
        error: { message: string } | null;
      }>;
    };
  };
  insertedRows: Array<Record<string, unknown>>;
  updatedRows: Array<Record<string, unknown>>;
} {
  const insertedRows: Array<Record<string, unknown>> = [];
  const updatedRows: Array<Record<string, unknown>> = [];
  const latest = opts.latestRow === undefined ? null : opts.latestRow;
  const prior = opts.priorRow ?? null;

  function buildAuditChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.select = (): Record<string, unknown> => chain;
    chain.eq = (): Record<string, unknown> => chain;
    chain.in = (): Record<string, unknown> => chain;
    chain.is = (): Record<string, unknown> => chain;
    chain.not = (): Record<string, unknown> => chain;
    chain.lt = (): Record<string, unknown> => chain;
    chain.lte = (): Record<string, unknown> => chain;
    chain.filter = (): Record<string, unknown> => chain;
    chain.order = (): Record<string, unknown> => chain;
    chain.limit = (): Record<string, unknown> => chain;
    chain.range = (): { maybeSingle: () => Promise<{ data: unknown; error: null }> } => ({
      maybeSingle: async () => ({ data: prior, error: null }),
    });
    chain.maybeSingle = async (): Promise<{ data: unknown; error: null }> => ({
      data: latest,
      error: null,
    });
    return chain;
  }

  const from = (table: string): unknown => {
    if (table === 'consultation_recording_audit') {
      const insert = (
        row: Record<string, unknown>
      ): Promise<{ error: { message: string } | null }> => {
        insertedRows.push(row);
        return Promise.resolve({ error: opts.insertError ?? null });
      };
      const chain = buildAuditChain();
      const update = (payload: Record<string, unknown>): Record<string, unknown> => {
        updatedRows.push(payload);
        const updateChain: Record<string, unknown> = {};
        updateChain.eq = (): Record<string, unknown> => updateChain;
        updateChain.is = (): Record<string, unknown> => updateChain;
        updateChain.filter = (): Record<string, unknown> => updateChain;
        updateChain.lte = (): Record<string, unknown> => updateChain;
        updateChain.select = (): Record<string, unknown> => {
          const selectable = updateChain;
          selectable.maybeSingle = async () => ({ data: { id: 'row-1' }, error: null });
          selectable.then = (
            resolve: (value: { data: Array<{ id: string }>; error: null }) => unknown
          ) => Promise.resolve({ data: [{ id: 'row-1' }], error: null }).then(resolve);
          return selectable;
        };
        updateChain.maybeSingle = async () => ({ data: { id: 'row-1' }, error: null });
        return updateChain;
      };
      return { insert, select: chain.select, update };
    }
    if (table === 'consultation_sessions' || table === 'doctor_settings') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    }
    throw new Error(`buildAdminMock: unexpected table ${table}`);
  };

  return {
    client: {
      from,
      auth: {
        getUser: async () =>
          opts.authUser
            ? { data: { user: opts.authUser }, error: null }
            : { data: { user: null }, error: { message: 'invalid' } },
      },
    },
    insertedRows,
    updatedRows,
  };
}

// ---------------------------------------------------------------------------
// Session fixture
// ---------------------------------------------------------------------------

type SessionRecord = Awaited<ReturnType<typeof sessionSvc.findSessionById>>;

function makeSession(
  overrides: Partial<NonNullable<SessionRecord>> = {}
): NonNullable<SessionRecord> {
  return {
    id: 'sess-1',
    appointmentId: 'appt-1',
    doctorId: 'doc-1',
    patientId: 'pat-1',
    modality: 'voice',
    status: 'live',
    provider: 'twilio_video',
    providerSessionId: 'RM_twilio_1',
    scheduledStartAt: new Date('2026-04-19T10:00:00Z'),
    expectedEndAt: new Date('2026-04-19T10:30:00Z'),
    ...(overrides as object),
  } as NonNullable<SessionRecord>;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  __resetVideoGrantValidReaderForTests();
  mockedTwilio.excludeAllParticipantsFromRecording.mockResolvedValue(undefined);
  mockedTwilio.includeAllParticipantsInRecording.mockResolvedValue(undefined);
  mockedTwilio.getIncludedRecordingKinds.mockResolvedValue(['audio']);
  mockedMessageSvc.emitSystemMessage.mockResolvedValue({
    id: 'msg-1',
    createdAt: '2026-04-19T14:00:00.000Z',
  });
});

// ===========================================================================
// pauseRecording: validation
// ===========================================================================

describe('pauseRecording · validation', () => {
  const codes = [
    'patient_request',
    'sensitive_disclosure',
    'third_party_present',
    'administrative',
    'technical',
  ] as const;

  it.each(codes)('accepts preset code %s', async (reasonCode) => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    await expect(
      pauseRecording({
        sessionId: 'sess-1',
        doctorId: 'doc-1',
        reasonCode,
        correlationId: 'c1',
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects an unknown code without echoing it', async () => {
    await expect(
      pauseRecording({
        sessionId: 'sess-1',
        doctorId: 'doc-1',
        reasonCode: 'other' as never,
        correlationId: 'c1',
      }),
    ).rejects.toThrow(/five preset pause reasons/);
    expect(mockedTwilio.excludeAllParticipantsFromRecording).not.toHaveBeenCalled();
  });

  it('rejects a free-text string without echoing it', async () => {
    const typed = 'Patient disclosed a sensitive diagnosis';
    await expect(
      pauseRecording({
        sessionId: 'sess-1',
        doctorId: 'doc-1',
        reasonCode: typed as never,
        correlationId: 'c1',
      }),
    ).rejects.toThrow(/five preset pause reasons/);
    try {
      await pauseRecording({
        sessionId: 'sess-1',
        doctorId: 'doc-1',
        reasonCode: typed as never,
        correlationId: 'c1',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(typed);
    }
  });
});

// ===========================================================================
// pauseRecording: authz & status gates
// ===========================================================================

describe('pauseRecording · authz + status gates', () => {
  it('throws NotFoundError when session missing', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(null);
    await expect(
      pauseRecording({
        sessionId: 'nope',
        doctorId: 'doc-1',
        reasonCode: 'administrative',
        correlationId: 'c1',
      })
    ).rejects.toThrow(/not found/i);
  });

  it('throws ForbiddenError when doctorId !== session.doctorId, before any DB/Twilio call', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ doctorId: 'doc-X' }));
    const { client, insertedRows } = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await expect(
      pauseRecording({
        sessionId: 'sess-1',
        doctorId: 'doc-1',
        reasonCode: 'administrative',
        correlationId: 'c1',
      })
    ).rejects.toThrow(/Only the session doctor/);
    expect(mockedTwilio.excludeAllParticipantsFromRecording).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
  });

  it('throws ConflictError when session.status is not live', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ status: 'ended' }));
    await expect(
      pauseRecording({
        sessionId: 'sess-1',
        doctorId: 'doc-1',
        reasonCode: 'administrative',
        correlationId: 'c1',
      })
    ).rejects.toThrow(/session status is 'ended'/);
    expect(mockedTwilio.excludeAllParticipantsFromRecording).not.toHaveBeenCalled();
  });

  it('throws ConflictError when no providerSessionId (no Twilio room)', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(
      makeSession({ providerSessionId: undefined })
    );
    await expect(
      pauseRecording({
        sessionId: 'sess-1',
        doctorId: 'doc-1',
        reasonCode: 'administrative',
        correlationId: 'c1',
      })
    ).rejects.toThrow(/no Twilio room/);
  });
});

// ===========================================================================
// pauseRecording: happy path + ledger + metadata pin
// ===========================================================================

describe('pauseRecording · happy path', () => {
  it('writes attempted row, calls Twilio once, writes completed row, emits system message', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client, insertedRows } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await pauseRecording({
      sessionId: 'sess-1',
      doctorId: 'doc-1',
      reasonCode: 'administrative',
      correlationId: 'corr-1',
    });

    // Two audit rows: attempted, then completed.
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]).toMatchObject({
      session_id: 'sess-1',
      action: 'recording_paused',
      action_by: 'doc-1',
      action_by_role: 'doctor',
      reason: 'administrative',
      pause_reason_code: 'administrative',
      correlation_id: 'corr-1',
      metadata: {
        twilio_sid: 'RM_twilio_1',
        kind: 'audio',
        paused_kinds: ['audio'],
        status: 'attempted',
      },
    });
    expect(insertedRows[1]).toMatchObject({
      metadata: {
        twilio_sid: 'RM_twilio_1',
        kind: 'audio',
        paused_kinds: ['audio'],
        status: 'completed',
      },
    });

    // Twilio called exactly once with audio/exclude.
    expect(mockedTwilio.excludeAllParticipantsFromRecording).toHaveBeenCalledTimes(1);
    expect(mockedTwilio.excludeAllParticipantsFromRecording).toHaveBeenCalledWith(
      'RM_twilio_1',
      'audio',
      'corr-1'
    );

    // System message fired.
    expect(mockedMessageSvc.emitSystemMessage).toHaveBeenCalledTimes(1);
    const emitArgs = mockedMessageSvc.emitSystemMessage.mock.calls[0]?.[0];
    expect(emitArgs?.event).toBe('recording_paused');
    expect(emitArgs?.body).toMatch(/Doctor paused recording at \d{2}:\d{2}\.$/);
    expect(emitArgs?.body).not.toMatch(/Reason:/);
    expect(emitArgs?.body).not.toMatch(/administrative/);
  });

  it('pins the audit metadata JSONB shape (drift guard)', async () => {
    // If a future refactor silently renames `twilio_sid` → `room_sid` or
    // drops `status`, this test breaks. Reconciliation worker + ops tools
    // depend on this shape; do not update this test without updating those.
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client, insertedRows } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await pauseRecording({
      sessionId: 'sess-1',
      doctorId: 'doc-1',
      reasonCode: 'technical',
      correlationId: 'corr-1',
    });

    const attemptedMeta = insertedRows[0]?.metadata as Record<string, unknown>;
    expect(Object.keys(attemptedMeta).sort()).toEqual([
      'kind',
      'paused_kinds',
      'status',
      'twilio_sid',
    ]);
    expect(attemptedMeta.kind).toBe('audio');
    expect(attemptedMeta.paused_kinds).toEqual(['audio']);
    expect(attemptedMeta.status).toBe('attempted');
    expect(attemptedMeta.twilio_sid).toBe('RM_twilio_1');
  });
});

// ===========================================================================
// pauseRecording: ledger on Twilio failure
// ===========================================================================

describe('pauseRecording · Twilio failure path', () => {
  it('writes attempted AND failed rows (same correlation_id), then throws', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client, insertedRows } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    mockedTwilio.excludeAllParticipantsFromRecording.mockRejectedValueOnce(new Error('Twilio 503'));

    await expect(
      pauseRecording({
        sessionId: 'sess-1',
        doctorId: 'doc-1',
        reasonCode: 'administrative',
        correlationId: 'corr-2',
      })
    ).rejects.toThrow(/Twilio 503/);

    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]).toMatchObject({
      correlation_id: 'corr-2',
      metadata: { status: 'attempted' },
    });
    expect(insertedRows[1]).toMatchObject({
      correlation_id: 'corr-2',
      metadata: { status: 'failed', error: 'Twilio 503' },
    });

    // emitSystemMessage NOT called on failure (Decision 4: the pause
    // didn't actually happen; no banner).
    expect(mockedMessageSvc.emitSystemMessage).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// pauseRecording: system-message failure is non-fatal
// ===========================================================================

describe('pauseRecording · system-message failure is non-fatal', () => {
  it('still completes the pause (audit + Twilio) when emitSystemMessage throws', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client, insertedRows } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    mockedMessageSvc.emitSystemMessage.mockRejectedValueOnce(new Error('realtime down'));

    await expect(
      pauseRecording({
        sessionId: 'sess-1',
        doctorId: 'doc-1',
        reasonCode: 'administrative',
        correlationId: 'corr-3',
      })
    ).resolves.toBeUndefined();

    expect(mockedTwilio.excludeAllParticipantsFromRecording).toHaveBeenCalled();
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[1]).toMatchObject({ metadata: { status: 'completed' } });
  });
});

// ===========================================================================
// pauseRecording: idempotency
// ===========================================================================

describe('pauseRecording · idempotency', () => {
  it('returns without writing or calling Twilio when already paused', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client, insertedRows } = buildAdminMock({
      latestRow: {
        action: 'recording_paused',
        reason: 'Patient stepped away',
        action_by: 'doc-1',
        metadata: { status: 'completed', twilio_sid: 'RM_twilio_1' },
        created_at: '2026-04-19T10:10:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await pauseRecording({
      sessionId: 'sess-1',
      doctorId: 'doc-1',
      reasonCode: 'administrative',
      correlationId: 'corr-retry',
    });

    expect(insertedRows).toHaveLength(0);
    expect(mockedTwilio.excludeAllParticipantsFromRecording).not.toHaveBeenCalled();
    expect(mockedMessageSvc.emitSystemMessage).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// resumeRecording: mirror shape
// ===========================================================================

describe('resumeRecording', () => {
  it('writes attempted + completed rows with action=recording_resumed and reason=null', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client, insertedRows } = buildAdminMock({
      latestRow: {
        action: 'recording_paused',
        reason: 'Patient stepped away',
        action_by: 'doc-1',
        metadata: { status: 'completed', twilio_sid: 'RM_twilio_1' },
        created_at: '2026-04-19T10:10:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await resumeRecording({ sessionId: 'sess-1', doctorId: 'doc-1', correlationId: 'corr-r1' });

    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]).toMatchObject({
      action: 'recording_resumed',
      action_by_role: 'doctor',
      reason: null,
      metadata: { status: 'attempted', twilio_sid: 'RM_twilio_1', kind: 'audio' },
    });
    expect(insertedRows[1]).toMatchObject({
      action: 'recording_resumed',
      metadata: { status: 'completed' },
    });

    expect(mockedTwilio.includeAllParticipantsInRecording).toHaveBeenCalledWith(
      'RM_twilio_1',
      'audio',
      'corr-r1'
    );

    expect(mockedMessageSvc.emitSystemMessage).toHaveBeenCalledTimes(1);
    const emitArgs = mockedMessageSvc.emitSystemMessage.mock.calls[0]?.[0];
    expect(emitArgs?.event).toBe('recording_resumed');
    expect(emitArgs?.body).toMatch(/Doctor resumed recording at \d{2}:\d{2}\./);
  });

  it('idempotent: no-op when not currently paused', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client, insertedRows } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await resumeRecording({ sessionId: 'sess-1', doctorId: 'doc-1', correlationId: 'corr-r2' });
    expect(insertedRows).toHaveLength(0);
    expect(mockedTwilio.includeAllParticipantsInRecording).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// getCurrentRecordingState: branches
// ===========================================================================

describe('getCurrentRecordingState', () => {
  it('returns paused=false when no rows', async () => {
    const { client } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    const state = await getCurrentRecordingState('sess-1');
    expect(state).toEqual({ sessionId: 'sess-1', paused: false });
  });

  it('returns paused=true when latest is recording_paused + completed', async () => {
    const { client } = buildAdminMock({
      latestRow: {
        action: 'recording_paused',
        reason: 'Phone call',
        action_by: 'doc-1',
        metadata: { status: 'completed' },
        created_at: '2026-04-19T10:10:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    const state = await getCurrentRecordingState('sess-1');
    expect(state.paused).toBe(true);
    expect(state.pauseReason).toBe('not_recorded_in_preset_form');
    expect(state.pausedBy).toBe('doc-1');
    expect(state.pausedByRole).toBe('doctor');
    expect(state.pausedAt).toBeInstanceOf(Date);
  });

  it('returns the preset code when pause_reason_code is set', async () => {
    const { client } = buildAdminMock({
      latestRow: {
        action: 'recording_paused',
        reason: 'sensitive_disclosure',
        pause_reason_code: 'sensitive_disclosure',
        action_by: 'doc-1',
        metadata: { status: 'completed' },
        created_at: '2026-04-19T10:10:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    const state = await getCurrentRecordingState('sess-1');
    expect(state.pauseReason).toBe('sensitive_disclosure');
  });

  it('returns paused=false with resumedAt when latest is recording_resumed', async () => {
    const { client } = buildAdminMock({
      latestRow: {
        action: 'recording_resumed',
        reason: null,
        action_by: 'doc-1',
        metadata: { status: 'completed' },
        created_at: '2026-04-19T10:15:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    const state = await getCurrentRecordingState('sess-1');
    expect(state.paused).toBe(false);
    expect(state.resumedAt).toBeInstanceOf(Date);
  });

  it('prefers intent when latest row is attempted (mid-flight)', async () => {
    const { client } = buildAdminMock({
      latestRow: {
        action: 'recording_paused',
        reason: 'In-flight',
        action_by: 'doc-1',
        metadata: { status: 'attempted' },
        created_at: '2026-04-19T10:20:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    const state = await getCurrentRecordingState('sess-1');
    expect(state.paused).toBe(true);
    expect(state.pauseReason).toBe('not_recorded_in_preset_form');
  });

  it('falls back to prior row when latest is failed', async () => {
    const { client } = buildAdminMock({
      latestRow: {
        action: 'recording_paused',
        reason: 'Patient away',
        action_by: 'doc-1',
        metadata: { status: 'failed' },
        created_at: '2026-04-19T10:20:00Z',
      },
      priorRow: {
        action: 'recording_resumed',
        reason: null,
        action_by: 'doc-1',
        metadata: { status: 'completed' },
        created_at: '2026-04-19T10:15:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    const state = await getCurrentRecordingState('sess-1');
    expect(state.paused).toBe(false);
  });

  it('reports pausedKinds from the open pause row', async () => {
    const { client } = buildAdminMock({
      latestRow: {
        action: 'recording_paused',
        reason: 'Exam',
        action_by: 'doc-1',
        metadata: { status: 'completed', paused_kinds: ['audio', 'video'] },
        created_at: '2026-04-19T10:10:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    const state = await getCurrentRecordingState('sess-1');
    expect(state.paused).toBe(true);
    expect(state.pausedKinds).toEqual(['audio', 'video']);
  });
});

// ===========================================================================
// rec-14: kind-scoped pause / resume
// ===========================================================================

describe('pauseRecording · rec-14 kinds', () => {
  it('audio+video pause excludes both kinds and records paused_kinds', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ modality: 'video' }));
    mockedTwilio.getIncludedRecordingKinds.mockResolvedValue(['audio', 'video']);
    const { client, insertedRows } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await pauseRecording({
      sessionId: 'sess-1',
      doctorId: 'doc-1',
      reasonCode: 'sensitive_disclosure',
      correlationId: 'corr-av',
    });

    expect(mockedTwilio.excludeAllParticipantsFromRecording).toHaveBeenCalledTimes(2);
    expect(mockedTwilio.excludeAllParticipantsFromRecording).toHaveBeenNthCalledWith(
      1,
      'RM_twilio_1',
      'audio',
      'corr-av'
    );
    expect(mockedTwilio.excludeAllParticipantsFromRecording).toHaveBeenNthCalledWith(
      2,
      'RM_twilio_1',
      'video',
      'corr-av'
    );
    expect(insertedRows[1]).toMatchObject({
      metadata: { status: 'completed', paused_kinds: ['audio', 'video'] },
    });
    const emitArgs = mockedMessageSvc.emitSystemMessage.mock.calls[0]?.[0];
    expect(emitArgs?.body).toMatch(/paused audio and video recording/);
  });

  it('does not exclude video when Twilio is capturing audio only', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ modality: 'video' }));
    mockedTwilio.getIncludedRecordingKinds.mockResolvedValue(['audio']);
    const { client } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await pauseRecording({
      sessionId: 'sess-1',
      doctorId: 'doc-1',
      reasonCode: 'administrative',
      correlationId: 'corr-ao',
    });

    expect(mockedTwilio.excludeAllParticipantsFromRecording).toHaveBeenCalledTimes(1);
    expect(mockedTwilio.excludeAllParticipantsFromRecording).toHaveBeenCalledWith(
      'RM_twilio_1',
      'audio',
      'corr-ao'
    );
  });

  it('partial exclude writes failed (not completed) and throws', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ modality: 'video' }));
    mockedTwilio.getIncludedRecordingKinds.mockResolvedValue(['audio', 'video']);
    mockedTwilio.excludeAllParticipantsFromRecording
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Twilio 503 on video'));
    const { client, insertedRows } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await expect(
      pauseRecording({
        sessionId: 'sess-1',
        doctorId: 'doc-1',
        reasonCode: 'administrative',
        correlationId: 'corr-partial',
      })
    ).rejects.toThrow(/Twilio 503 on video/);

    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[1]).toMatchObject({
      metadata: { status: 'failed', paused_kinds: ['audio', 'video'] },
    });
    expect(
      insertedRows.some((r) => (r.metadata as { status?: string }).status === 'completed')
    ).toBe(false);
    expect(mockedMessageSvc.emitSystemMessage).not.toHaveBeenCalled();
  });

  it('treats TwilioRoomNotFoundError as its own failed-row case', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    mockedTwilio.getIncludedRecordingKinds.mockRejectedValue(
      new mockedTwilio.TwilioRoomNotFoundError('RM_twilio_1', '404')
    );
    const { client, insertedRows } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await expect(
      pauseRecording({
        sessionId: 'sess-1',
        doctorId: 'doc-1',
        reasonCode: 'administrative',
        correlationId: 'corr-404',
      })
    ).rejects.toBeInstanceOf(mockedTwilio.TwilioRoomNotFoundError);

    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[1]).toMatchObject({ metadata: { status: 'failed' } });
    expect(mockedTwilio.excludeAllParticipantsFromRecording).not.toHaveBeenCalled();
  });
});

describe('resumeRecording · rec-14 restore', () => {
  function pausedBothKinds(): NonNullable<AuditMockInit['latestRow']> {
    return {
      action: 'recording_paused',
      reason: 'Exam',
      action_by: 'doc-1',
      metadata: {
        status: 'completed',
        twilio_sid: 'RM_twilio_1',
        paused_kinds: ['audio', 'video'],
      },
      created_at: '2026-04-19T10:10:00Z',
    };
  }

  it('restores audio and video when p4 says the grant is still valid', async () => {
    __setVideoGrantValidReaderForTests(async () => true);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ modality: 'video' }));
    const { client, insertedRows } = buildAdminMock({ latestRow: pausedBothKinds() });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await resumeRecording({ sessionId: 'sess-1', doctorId: 'doc-1', correlationId: 'corr-rv' });

    expect(mockedTwilio.includeAllParticipantsInRecording).toHaveBeenCalledTimes(2);
    expect(mockedTwilio.includeAllParticipantsInRecording).toHaveBeenNthCalledWith(
      1,
      'RM_twilio_1',
      'audio',
      'corr-rv'
    );
    expect(mockedTwilio.includeAllParticipantsInRecording).toHaveBeenNthCalledWith(
      2,
      'RM_twilio_1',
      'video',
      'corr-rv'
    );
    expect(insertedRows[1]).toMatchObject({
      metadata: {
        status: 'completed',
        restored_kinds: ['audio', 'video'],
        video_restore: 'restored',
      },
    });
  });

  it('restores audio only and stamps grant_unknown when p4 has no answer', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ modality: 'video' }));
    const { client, insertedRows } = buildAdminMock({ latestRow: pausedBothKinds() });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await resumeRecording({ sessionId: 'sess-1', doctorId: 'doc-1', correlationId: 'corr-unk' });

    expect(mockedTwilio.includeAllParticipantsInRecording).toHaveBeenCalledTimes(1);
    expect(mockedTwilio.includeAllParticipantsInRecording).toHaveBeenCalledWith(
      'RM_twilio_1',
      'audio',
      'corr-unk'
    );
    expect(insertedRows[1]).toMatchObject({
      metadata: {
        status: 'completed',
        restored_kinds: ['audio'],
        video_restore: 'grant_unknown',
      },
    });
    const emitArgs = mockedMessageSvc.emitSystemMessage.mock.calls[0]?.[0];
    expect(emitArgs?.body).toMatch(/resumed audio recording/);
  });

  it('restores audio only and stamps grant_lapsed when p4 says the grant lapsed', async () => {
    __setVideoGrantValidReaderForTests(async () => false);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ modality: 'video' }));
    const { client, insertedRows } = buildAdminMock({ latestRow: pausedBothKinds() });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await resumeRecording({ sessionId: 'sess-1', doctorId: 'doc-1', correlationId: 'corr-lapse' });

    expect(mockedTwilio.includeAllParticipantsInRecording).toHaveBeenCalledTimes(1);
    expect(insertedRows[1]).toMatchObject({
      metadata: { video_restore: 'grant_lapsed', restored_kinds: ['audio'] },
    });
  });
});

describe('isSessionRecordingPaused / isRoomRecordingPaused', () => {
  it('is true only for a completed pause row', async () => {
    const { client } = buildAdminMock({
      latestRow: {
        action: 'recording_paused',
        reason: 'Exam',
        action_by: 'doc-1',
        metadata: { status: 'completed' },
        created_at: '2026-04-19T10:10:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    await expect(isSessionRecordingPaused('sess-1')).resolves.toBe(true);
  });

  it('is false when never paused', async () => {
    const { client } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    await expect(isSessionRecordingPaused('sess-1')).resolves.toBe(false);
  });

  it('resolves a room SID through the session lookup', async () => {
    mockedSessionSvc.findSessionByProviderSessionId
      .mockResolvedValueOnce(makeSession())
      .mockResolvedValueOnce(null);
    const { client } = buildAdminMock({
      latestRow: {
        action: 'recording_paused',
        reason: 'Exam',
        action_by: 'doc-1',
        metadata: { status: 'completed' },
        created_at: '2026-04-19T10:10:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    await expect(isRoomRecordingPaused('RM_twilio_1')).resolves.toBe(true);
    expect(mockedSessionSvc.findSessionByProviderSessionId).toHaveBeenCalledWith(
      'twilio_video',
      'RM_twilio_1'
    );
  });
});

// ===========================================================================
// rec-16 — deadline, extend, system resume, dangling stamp
// ===========================================================================

describe('rec-16 auto-resume stamps', () => {
  it('writes auto_resume_at on the completed pause row from the server clock', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client, insertedRows } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    const before = Date.now();
    await pauseRecording({
      sessionId: 'sess-1',
      doctorId: 'doc-1',
      reasonCode: 'administrative',
      correlationId: 'c-deadline',
    });
    const completed = insertedRows.find(
      (row) => (row.metadata as { status?: string })?.status === 'completed'
    );
    expect(completed?.auto_resume_extensions_used).toBe(0);
    const at = Date.parse(completed?.auto_resume_at as string);
    expect(at).toBeGreaterThanOrEqual(before + 5 * 60 * 1000 - 50);
    expect(at).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000 + 50);
  });

  it('getCurrentRecordingState exposes the server deadline', async () => {
    const { client } = buildAdminMock({
      latestRow: {
        action: 'recording_paused',
        reason: 'administrative',
        pause_reason_code: 'administrative',
        auto_resume_at: '2026-08-18T10:15:00.000Z',
        auto_resume_extensions_used: 0,
        action_by: 'doc-1',
        metadata: { status: 'completed' },
        created_at: '2026-08-18T10:10:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    const state = await getCurrentRecordingState('sess-1');
    expect(state.autoResumeAt?.toISOString()).toBe('2026-08-18T10:15:00.000Z');
    expect(state.autoResumeExtensionsUsed).toBe(0);
    expect(state.autoResumeBoundMs).toBe(5 * 60 * 1000);
  });

  it('extend moves the deadline once and refuses the second time', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const open = {
      id: 'pause-row-1',
      action: 'recording_paused' as const,
      reason: 'administrative',
      pause_reason_code: 'administrative',
      auto_resume_at: '2026-08-18T10:15:00.000Z',
      auto_resume_extensions_used: 0,
      action_by: 'doc-1',
      metadata: { status: 'completed' as const },
      created_at: '2026-08-18T10:10:00Z',
    };
    const { client, updatedRows } = buildAdminMock({ latestRow: open });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    const first = await extendRecordingPause({
      sessionId: 'sess-1',
      doctorId: 'doc-1',
      correlationId: 'c-ext',
    });
    expect(first.autoResumeExtensionsUsed).toBe(1);
    expect(updatedRows[0]).toMatchObject({ auto_resume_extensions_used: 1 });
    expect((updatedRows[0]?.metadata as { extension?: { by?: string } })?.extension?.by).toBe(
      'doc-1'
    );

    const { client: client2 } = buildAdminMock({
      latestRow: { ...open, auto_resume_extensions_used: 1 },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client2 as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    await expect(
      extendRecordingPause({
        sessionId: 'sess-1',
        doctorId: 'doc-1',
        correlationId: 'c-ext-2',
      })
    ).rejects.toThrow(/already been extended once/);
  });

  it('system auto-resume attributes the ledger to the all-zeros actor', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client, insertedRows } = buildAdminMock({
      latestRow: {
        action: 'recording_paused',
        reason: 'administrative',
        pause_reason_code: 'administrative',
        action_by: 'doc-1',
        metadata: { status: 'completed', paused_kinds: ['audio'] },
        created_at: '2026-08-18T10:10:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    await resumeRecordingAsSystem({ sessionId: 'sess-1', correlationId: 'c-sys' });
    const completed = insertedRows.find(
      (row) =>
        row.action === 'recording_resumed' &&
        (row.metadata as { status?: string })?.status === 'completed'
    );
    expect(completed).toMatchObject({
      action_by: '00000000-0000-0000-0000-000000000000',
      action_by_role: 'system',
    });
    expect(mockedMessageSvc.emitSystemMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'recording_resumed',
        body: expect.stringMatching(/resumed automatically/),
      })
    );
  });

  it('Twilio failure on auto-resume leaves the pause open (no pause_closed_as)', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    mockedTwilio.includeAllParticipantsInRecording.mockRejectedValueOnce(new Error('Twilio 503'));
    const { client, updatedRows } = buildAdminMock({
      latestRow: {
        action: 'recording_paused',
        reason: 'administrative',
        action_by: 'doc-1',
        metadata: { status: 'completed', paused_kinds: ['audio'] },
        created_at: '2026-08-18T10:10:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    await expect(
      resumeRecordingAsSystem({ sessionId: 'sess-1', correlationId: 'c-fail' })
    ).rejects.toThrow(/Twilio 503/);
    expect(updatedRows.some((row) => row.pause_closed_as === 'auto_resume')).toBe(false);
  });

  it('stampDanglingPausesForEndedSession writes session_ended_while_paused', async () => {
    const { client, updatedRows } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    await stampDanglingPausesForEndedSession('sess-1', 'c-end');
    expect(updatedRows).toContainEqual({ pause_closed_as: 'session_ended_while_paused' });
  });

  it('a closed pause is not treated as currently paused', async () => {
    const { client } = buildAdminMock({
      latestRow: {
        action: 'recording_paused',
        reason: 'administrative',
        pause_closed_as: 'session_ended_while_paused',
        action_by: 'doc-1',
        metadata: { status: 'completed' },
        created_at: '2026-08-18T10:10:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    await expect(isSessionRecordingPaused('sess-1')).resolves.toBe(false);
    const state = await getCurrentRecordingState('sess-1');
    expect(state.paused).toBe(false);
  });
});

// ===========================================================================
// rec-17 · patient-initiated pause
// ===========================================================================

const PATIENT_CALLER = { role: 'patient' as const, actorId: 'sess-1' };

function openPatientPauseRow(): NonNullable<AuditMockInit['latestRow']> {
  return {
    action: 'recording_paused',
    reason: 'patient_request',
    pause_reason_code: 'patient_request',
    action_by: 'sess-1',
    action_by_role: 'patient',
    metadata: { status: 'completed', paused_kinds: ['audio'] },
    created_at: '2026-08-19T10:10:00Z',
  };
}

function openDoctorPauseRow(): NonNullable<AuditMockInit['latestRow']> {
  return {
    action: 'recording_paused',
    reason: 'administrative',
    pause_reason_code: 'administrative',
    action_by: 'doc-1',
    action_by_role: 'doctor',
    metadata: { status: 'completed', paused_kinds: ['audio'] },
    created_at: '2026-08-19T10:10:00Z',
  };
}

describe('rec-17 · patient pause', () => {
  it('accepts a patient pause, attributes role patient, and is not the system actor', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ patientId: null }));
    const { client, insertedRows } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await pauseRecording({
      sessionId: 'sess-1',
      caller: PATIENT_CALLER,
      correlationId: 'c-pat',
    });

    const completed = insertedRows.find(
      (row) => (row.metadata as { status?: string } | undefined)?.status === 'completed'
    );
    expect(completed).toMatchObject({
      action: 'recording_paused',
      action_by: 'sess-1',
      action_by_role: 'patient',
      reason: 'patient_request',
      pause_reason_code: 'patient_request',
    });
    expect(completed?.action_by).not.toBe(RECORDING_SYSTEM_ACTOR_UUID);
    expect(mockedMessageSvc.emitSystemMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'recording_paused',
        body: expect.stringMatching(/Patient paused recording at /),
      })
    );
  });

  it('ignores a client reason and records patient_request', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ patientId: null }));
    const { client, insertedRows } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await pauseRecording({
      sessionId: 'sess-1',
      caller: PATIENT_CALLER,
      reasonCode: 'sensitive_disclosure',
      correlationId: 'c-pat-reason',
    });

    expect(insertedRows[0]).toMatchObject({
      reason: 'patient_request',
      pause_reason_code: 'patient_request',
    });
  });

  it('refuses a non-participant', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client, insertedRows } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await expect(
      pauseRecording({
        sessionId: 'sess-1',
        caller: { role: 'patient', actorId: 'stranger' },
        correlationId: 'c-stranger',
      })
    ).rejects.toThrow(/Not a participant/);
    expect(mockedTwilio.excludeAllParticipantsFromRecording).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
  });

  it('covers the same live kinds as a doctor pause', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ patientId: null }));
    mockedTwilio.getIncludedRecordingKinds.mockResolvedValue(['audio', 'video']);
    const { client } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await pauseRecording({
      sessionId: 'sess-1',
      caller: PATIENT_CALLER,
      correlationId: 'c-kinds',
    });

    expect(mockedTwilio.excludeAllParticipantsFromRecording).toHaveBeenCalledTimes(2);
    expect(mockedTwilio.excludeAllParticipantsFromRecording).toHaveBeenCalledWith(
      'RM_twilio_1',
      'audio',
      'c-kinds'
    );
    expect(mockedTwilio.excludeAllParticipantsFromRecording).toHaveBeenCalledWith(
      'RM_twilio_1',
      'video',
      'c-kinds'
    );
  });

  it('double-tap writes one completed pause', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ patientId: null }));
    const { client, insertedRows } = buildAdminMock({ latestRow: openPatientPauseRow() });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await pauseRecording({
      sessionId: 'sess-1',
      caller: PATIENT_CALLER,
      correlationId: 'c-dup',
    });

    expect(insertedRows).toHaveLength(0);
    expect(mockedTwilio.excludeAllParticipantsFromRecording).not.toHaveBeenCalled();
  });
});

describe('rec-17 · resume rule', () => {
  it('lets the patient resume their own pause', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ patientId: null }));
    const { client } = buildAdminMock({ latestRow: openPatientPauseRow() });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await expect(
      resumeRecording({
        sessionId: 'sess-1',
        caller: PATIENT_CALLER,
        correlationId: 'c-pat-res',
      })
    ).resolves.toBeUndefined();
    expect(mockedTwilio.includeAllParticipantsInRecording).toHaveBeenCalled();
  });

  it('refuses a doctor resume of a patient pause with who-can-lift copy', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ patientId: null }));
    const { client } = buildAdminMock({ latestRow: openPatientPauseRow() });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await expect(
      resumeRecording({
        sessionId: 'sess-1',
        doctorId: 'doc-1',
        correlationId: 'c-doc-res',
      })
    ).rejects.toThrow(/Only the patient who paused/);
    expect(mockedTwilio.includeAllParticipantsInRecording).not.toHaveBeenCalled();
  });

  it('refuses a patient resume of a doctor pause with who-can-lift copy', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ patientId: null }));
    const { client } = buildAdminMock({ latestRow: openDoctorPauseRow() });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await expect(
      resumeRecording({
        sessionId: 'sess-1',
        caller: PATIENT_CALLER,
        correlationId: 'c-pat-lift-doc',
      })
    ).rejects.toThrow(/Only your doctor can resume/);
    expect(mockedTwilio.includeAllParticipantsInRecording).not.toHaveBeenCalled();
  });

  it('still lets the doctor resume a doctor pause', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client } = buildAdminMock({ latestRow: openDoctorPauseRow() });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await expect(
      resumeRecording({
        sessionId: 'sess-1',
        doctorId: 'doc-1',
        correlationId: 'c-doc-own',
      })
    ).resolves.toBeUndefined();
  });
});

describe('rec-17 · resolveRecordingCaller', () => {
  it('accepts a scoped patient JWT for this session', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ patientId: null }));
    mockedJwtMint.verifyScopedConsultationJwt.mockReturnValue({
      aud: 'authenticated',
      role: 'authenticated',
      sub: 'patient:appt-1',
      exp: 9_999_999_999,
      iat: 1,
      session_id: 'sess-1',
      consult_role: 'patient',
    });
    const { client } = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await expect(resolveRecordingCaller('sess-1', 'scoped.jwt')).resolves.toEqual({
      role: 'patient',
      actorId: 'sess-1',
    });
  });

  it('rejects a scoped JWT for a different session', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    mockedJwtMint.verifyScopedConsultationJwt.mockReturnValue({
      aud: 'authenticated',
      role: 'authenticated',
      sub: 'patient:appt-1',
      exp: 9_999_999_999,
      iat: 1,
      session_id: 'sess-OTHER',
      consult_role: 'patient',
    });

    await expect(resolveRecordingCaller('sess-1', 'scoped.jwt')).rejects.toThrow(
      /not scoped to this session/
    );
  });

  it('rejects a forged token that is not a scoped JWT and fails getUser', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    mockedJwtMint.verifyScopedConsultationJwt.mockImplementation(() => {
      throw new Error('bad signature');
    });
    const { client } = buildAdminMock({ authUser: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      client as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    await expect(resolveRecordingCaller('sess-1', 'forged.token')).rejects.toThrow(
      /Invalid or expired token/
    );
  });
});
