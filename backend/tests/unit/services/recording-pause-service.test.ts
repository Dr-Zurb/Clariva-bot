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
    error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionById: jest.fn(),
}));

jest.mock('../../../src/services/consultation-message-service', () => ({
  emitSystemMessage:     jest.fn().mockResolvedValue({ id: 'msg-1', createdAt: '2026-04-19T14:00:00.000Z' } as never),
  formatTimeInDoctorTz:  jest.fn().mockReturnValue('14:30'),
}));

jest.mock('../../../src/services/twilio-recording-rules', () => ({
  excludeAllParticipantsFromRecording: jest.fn().mockResolvedValue(undefined as never),
  includeAllParticipantsInRecording:   jest.fn().mockResolvedValue(undefined as never),
}));

import * as database from '../../../src/config/database';
import * as sessionSvc from '../../../src/services/consultation-session-service';
import * as messageSvc from '../../../src/services/consultation-message-service';
import * as twilioRules from '../../../src/services/twilio-recording-rules';

import {
  pauseRecording,
  resumeRecording,
  getCurrentRecordingState,
} from '../../../src/services/recording-pause-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedSessionSvc = sessionSvc as jest.Mocked<typeof sessionSvc>;
const mockedMessageSvc = messageSvc as jest.Mocked<typeof messageSvc>;
const mockedTwilio = twilioRules as jest.Mocked<typeof twilioRules>;

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
  latestRow?:
    | {
        action:      'recording_paused' | 'recording_resumed';
        reason:      string | null;
        action_by:   string;
        metadata:    { status?: 'attempted' | 'completed' | 'failed'; twilio_sid?: string };
        created_at:  string;
      }
    | null;
  priorRow?: AuditMockInit['latestRow']; // for the .range(1,1) fallback in getCurrentRecordingState
  insertError?: { message: string } | null;
}

function buildAdminMock(opts: AuditMockInit = {}): {
  client: { from: (table: string) => unknown };
  insertedRows: Array<Record<string, unknown>>;
} {
  const insertedRows: Array<Record<string, unknown>> = [];
  const latest = opts.latestRow === undefined ? null : opts.latestRow;
  const prior  = opts.priorRow  ?? null;

  function buildAuditChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.select      = (): Record<string, unknown> => chain;
    chain.eq          = (): Record<string, unknown> => chain;
    chain.in          = (): Record<string, unknown> => chain;
    chain.order       = (): Record<string, unknown> => chain;
    chain.limit       = (): Record<string, unknown> => chain;
    chain.range       = (): { maybeSingle: () => Promise<{ data: unknown; error: null }> } => ({
      maybeSingle: async () => ({ data: prior, error: null }),
    });
    chain.maybeSingle = async (): Promise<{ data: unknown; error: null }> => ({
      data: latest, error: null,
    });
    return chain;
  }

  const from = (table: string): unknown => {
    if (table === 'consultation_recording_audit') {
      const insert = (row: Record<string, unknown>): Promise<{ error: { message: string } | null }> => {
        insertedRows.push(row);
        return Promise.resolve({ error: opts.insertError ?? null });
      };
      const chain = buildAuditChain();
      return { insert, select: chain.select };
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

  return { client: { from }, insertedRows };
}

// ---------------------------------------------------------------------------
// Session fixture
// ---------------------------------------------------------------------------

type SessionRecord = Awaited<ReturnType<typeof sessionSvc.findSessionById>>;

function makeSession(overrides: Partial<NonNullable<SessionRecord>> = {}): NonNullable<SessionRecord> {
  return {
    id:               'sess-1',
    appointmentId:    'appt-1',
    doctorId:         'doc-1',
    patientId:        'pat-1',
    modality:         'voice',
    status:           'live',
    provider:         'twilio_video',
    providerSessionId: 'RM_twilio_1',
    scheduledStartAt: new Date('2026-04-19T10:00:00Z'),
    expectedEndAt:    new Date('2026-04-19T10:30:00Z'),
    ...(overrides as object),
  } as NonNullable<SessionRecord>;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockedTwilio.excludeAllParticipantsFromRecording.mockResolvedValue(undefined);
  mockedTwilio.includeAllParticipantsInRecording.mockResolvedValue(undefined);
  mockedMessageSvc.emitSystemMessage.mockResolvedValue({
    id:        'msg-1',
    createdAt: '2026-04-19T14:00:00.000Z',
  });
});

// ===========================================================================
// pauseRecording: validation
// ===========================================================================

describe('pauseRecording · validation', () => {
  it('rejects reason shorter than 5 chars (after trim)', async () => {
    await expect(
      pauseRecording({
        sessionId: 'sess-1',
        doctorId:  'doc-1',
        reason:    '   abc   ',
        correlationId: 'c1',
      }),
    ).rejects.toThrow(/at least 5 characters/);
    expect(mockedTwilio.excludeAllParticipantsFromRecording).not.toHaveBeenCalled();
  });

  it('accepts exactly 5 chars', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as unknown as ReturnType<typeof database.getSupabaseAdminClient>);

    await expect(
      pauseRecording({ sessionId: 'sess-1', doctorId: 'doc-1', reason: 'abcde', correlationId: 'c1' }),
    ).resolves.toBeUndefined();
  });

  it('rejects reason longer than 200 chars', async () => {
    await expect(
      pauseRecording({
        sessionId: 'sess-1',
        doctorId:  'doc-1',
        reason:    'a'.repeat(201),
        correlationId: 'c1',
      }),
    ).rejects.toThrow(/at most 200 characters/);
  });

  it('accepts exactly 200 chars', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as unknown as ReturnType<typeof database.getSupabaseAdminClient>);
    await expect(
      pauseRecording({
        sessionId: 'sess-1', doctorId: 'doc-1',
        reason: 'a'.repeat(200), correlationId: 'c1',
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects whitespace-only reason', async () => {
    await expect(
      pauseRecording({
        sessionId: 'sess-1', doctorId: 'doc-1',
        reason: '          ', correlationId: 'c1',
      }),
    ).rejects.toThrow(/at least 5 characters/);
  });
});

// ===========================================================================
// pauseRecording: authz & status gates
// ===========================================================================

describe('pauseRecording · authz + status gates', () => {
  it('throws NotFoundError when session missing', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(null);
    await expect(
      pauseRecording({ sessionId: 'nope', doctorId: 'doc-1', reason: 'Patient stepped away', correlationId: 'c1' }),
    ).rejects.toThrow(/not found/i);
  });

  it('throws ForbiddenError when doctorId !== session.doctorId, before any DB/Twilio call', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ doctorId: 'doc-X' }));
    const { client, insertedRows } = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as unknown as ReturnType<typeof database.getSupabaseAdminClient>);

    await expect(
      pauseRecording({
        sessionId: 'sess-1', doctorId: 'doc-1',
        reason: 'Patient stepped away', correlationId: 'c1',
      }),
    ).rejects.toThrow(/Only the session doctor/);
    expect(mockedTwilio.excludeAllParticipantsFromRecording).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
  });

  it('throws ConflictError when session.status is not live', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ status: 'ended' }));
    await expect(
      pauseRecording({
        sessionId: 'sess-1', doctorId: 'doc-1',
        reason: 'Patient stepped away', correlationId: 'c1',
      }),
    ).rejects.toThrow(/session status is 'ended'/);
    expect(mockedTwilio.excludeAllParticipantsFromRecording).not.toHaveBeenCalled();
  });

  it('throws ConflictError when no providerSessionId (no Twilio room)', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ providerSessionId: undefined }));
    await expect(
      pauseRecording({
        sessionId: 'sess-1', doctorId: 'doc-1',
        reason: 'Patient stepped away', correlationId: 'c1',
      }),
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
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as unknown as ReturnType<typeof database.getSupabaseAdminClient>);

    await pauseRecording({
      sessionId: 'sess-1', doctorId: 'doc-1',
      reason: 'Patient stepped away to fetch medication',
      correlationId: 'corr-1',
    });

    // Two audit rows: attempted, then completed.
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]).toMatchObject({
      session_id:     'sess-1',
      action:         'recording_paused',
      action_by:      'doc-1',
      action_by_role: 'doctor',
      reason:         'Patient stepped away to fetch medication',
      correlation_id: 'corr-1',
      metadata: {
        twilio_sid: 'RM_twilio_1',
        kind:       'audio',
        status:     'attempted',
      },
    });
    expect(insertedRows[1]).toMatchObject({
      metadata: {
        twilio_sid: 'RM_twilio_1',
        kind:       'audio',
        status:     'completed',
      },
    });

    // Twilio called exactly once with audio/exclude.
    expect(mockedTwilio.excludeAllParticipantsFromRecording).toHaveBeenCalledTimes(1);
    expect(mockedTwilio.excludeAllParticipantsFromRecording).toHaveBeenCalledWith(
      'RM_twilio_1', 'audio', 'corr-1',
    );

    // System message fired.
    expect(mockedMessageSvc.emitSystemMessage).toHaveBeenCalledTimes(1);
    const emitArgs = mockedMessageSvc.emitSystemMessage.mock.calls[0]?.[0];
    expect(emitArgs?.event).toBe('recording_paused');
    expect(emitArgs?.body).toMatch(/Doctor paused recording at \d{2}:\d{2}\. Reason: Patient stepped away to fetch medication/);
  });

  it('pins the audit metadata JSONB shape (drift guard)', async () => {
    // If a future refactor silently renames `twilio_sid` → `room_sid` or
    // drops `status`, this test breaks. Reconciliation worker + ops tools
    // depend on this shape; do not update this test without updating those.
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client, insertedRows } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as unknown as ReturnType<typeof database.getSupabaseAdminClient>);

    await pauseRecording({
      sessionId: 'sess-1', doctorId: 'doc-1',
      reason: 'abcde', correlationId: 'corr-1',
    });

    const attemptedMeta = insertedRows[0]?.metadata as Record<string, unknown>;
    expect(Object.keys(attemptedMeta).sort()).toEqual(['kind', 'status', 'twilio_sid']);
    expect(attemptedMeta.kind).toBe('audio');
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
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as unknown as ReturnType<typeof database.getSupabaseAdminClient>);

    mockedTwilio.excludeAllParticipantsFromRecording.mockRejectedValueOnce(
      new Error('Twilio 503'),
    );

    await expect(
      pauseRecording({
        sessionId: 'sess-1', doctorId: 'doc-1',
        reason: 'Patient left the room', correlationId: 'corr-2',
      }),
    ).rejects.toThrow(/Twilio 503/);

    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]).toMatchObject({
      correlation_id: 'corr-2',
      metadata:       { status: 'attempted' },
    });
    expect(insertedRows[1]).toMatchObject({
      correlation_id: 'corr-2',
      metadata:       { status: 'failed', error: 'Twilio 503' },
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
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as unknown as ReturnType<typeof database.getSupabaseAdminClient>);

    mockedMessageSvc.emitSystemMessage.mockRejectedValueOnce(new Error('realtime down'));

    await expect(
      pauseRecording({
        sessionId: 'sess-1', doctorId: 'doc-1',
        reason: 'Patient stepped away', correlationId: 'corr-3',
      }),
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
        action:    'recording_paused',
        reason:    'Patient stepped away',
        action_by: 'doc-1',
        metadata:  { status: 'completed', twilio_sid: 'RM_twilio_1' },
        created_at: '2026-04-19T10:10:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as unknown as ReturnType<typeof database.getSupabaseAdminClient>);

    await pauseRecording({
      sessionId: 'sess-1', doctorId: 'doc-1',
      reason: 'Patient stepped away (retry)', correlationId: 'corr-retry',
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
        action:    'recording_paused',
        reason:    'Patient stepped away',
        action_by: 'doc-1',
        metadata:  { status: 'completed', twilio_sid: 'RM_twilio_1' },
        created_at: '2026-04-19T10:10:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as unknown as ReturnType<typeof database.getSupabaseAdminClient>);

    await resumeRecording({ sessionId: 'sess-1', doctorId: 'doc-1', correlationId: 'corr-r1' });

    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]).toMatchObject({
      action:         'recording_resumed',
      action_by_role: 'doctor',
      reason:         null,
      metadata:       { status: 'attempted', twilio_sid: 'RM_twilio_1', kind: 'audio' },
    });
    expect(insertedRows[1]).toMatchObject({
      action:   'recording_resumed',
      metadata: { status: 'completed' },
    });

    expect(mockedTwilio.includeAllParticipantsInRecording).toHaveBeenCalledWith(
      'RM_twilio_1', 'audio', 'corr-r1',
    );

    expect(mockedMessageSvc.emitSystemMessage).toHaveBeenCalledTimes(1);
    const emitArgs = mockedMessageSvc.emitSystemMessage.mock.calls[0]?.[0];
    expect(emitArgs?.event).toBe('recording_resumed');
    expect(emitArgs?.body).toMatch(/Doctor resumed recording at \d{2}:\d{2}\./);
  });

  it('idempotent: no-op when not currently paused', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const { client, insertedRows } = buildAdminMock({ latestRow: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as unknown as ReturnType<typeof database.getSupabaseAdminClient>);

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
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as unknown as ReturnType<typeof database.getSupabaseAdminClient>);
    const state = await getCurrentRecordingState('sess-1');
    expect(state).toEqual({ sessionId: 'sess-1', paused: false });
  });

  it('returns paused=true when latest is recording_paused + completed', async () => {
    const { client } = buildAdminMock({
      latestRow: {
        action: 'recording_paused', reason: 'Phone call',
        action_by: 'doc-1',
        metadata: { status: 'completed' },
        created_at: '2026-04-19T10:10:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as unknown as ReturnType<typeof database.getSupabaseAdminClient>);
    const state = await getCurrentRecordingState('sess-1');
    expect(state.paused).toBe(true);
    expect(state.pauseReason).toBe('Phone call');
    expect(state.pausedBy).toBe('doc-1');
    expect(state.pausedAt).toBeInstanceOf(Date);
  });

  it('returns paused=false with resumedAt when latest is recording_resumed', async () => {
    const { client } = buildAdminMock({
      latestRow: {
        action: 'recording_resumed', reason: null, action_by: 'doc-1',
        metadata: { status: 'completed' },
        created_at: '2026-04-19T10:15:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as unknown as ReturnType<typeof database.getSupabaseAdminClient>);
    const state = await getCurrentRecordingState('sess-1');
    expect(state.paused).toBe(false);
    expect(state.resumedAt).toBeInstanceOf(Date);
  });

  it('prefers intent when latest row is attempted (mid-flight)', async () => {
    const { client } = buildAdminMock({
      latestRow: {
        action: 'recording_paused', reason: 'In-flight',
        action_by: 'doc-1',
        metadata: { status: 'attempted' },
        created_at: '2026-04-19T10:20:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as unknown as ReturnType<typeof database.getSupabaseAdminClient>);
    const state = await getCurrentRecordingState('sess-1');
    expect(state.paused).toBe(true);
    expect(state.pauseReason).toBe('In-flight');
  });

  it('falls back to prior row when latest is failed', async () => {
    const { client } = buildAdminMock({
      latestRow: {
        action: 'recording_paused', reason: 'Patient away',
        action_by: 'doc-1',
        metadata: { status: 'failed' },
        created_at: '2026-04-19T10:20:00Z',
      },
      priorRow: {
        action: 'recording_resumed', reason: null, action_by: 'doc-1',
        metadata: { status: 'completed' },
        created_at: '2026-04-19T10:15:00Z',
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as unknown as ReturnType<typeof database.getSupabaseAdminClient>);
    const state = await getCurrentRecordingState('sess-1');
    expect(state.paused).toBe(false);
  });
});
