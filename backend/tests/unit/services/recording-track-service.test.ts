/**
 * Unit tests for `services/recording-track-service.ts` — Plan 08 · Task 43
 * · Decision 10 LOCKED · the Video Recording Rules wrapper service that
 * flips a consult between the three runtime states (audio-only /
 * audio+video / reverted audio-only) and lists the resulting
 * Compositions.
 *
 * Coverage pins:
 *   · State-machine: each rule-flip writes a double-row ledger
 *     (attempted → completed), includes the expected metadata fields,
 *     and passes the correlation id through.
 *   · Adapter failure: a `failed` row is written, the original error
 *     bubbles up, the completed row is NOT written.
 *   · Actor resolution: `initiatedBy='system'` → all-zeros UUID /
 *     `action_by_role='system'`. `doctor_revert` → session.doctorId /
 *     `doctor`. `patient_revoke` → session.patientId / `patient`.
 *   · Action mapping: `recording_started` (system start),
 *     `video_recording_started` (escalate), `video_recording_reverted`
 *     (revert and reason-driven starts).
 *   · `getRecordingArtifactsForSession`: splits by includeVideo,
 *     sorts by `startedAt` ASC, empty for sessions with no room,
 *     caches for 60 s, cache-busts after a rule-flip.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn:  jest.fn(),
    info:  jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionById: jest.fn(),
}));

jest.mock('../../../src/services/twilio-recording-rules', () => ({
  setRecordingRulesToAudioOnly:     jest.fn().mockResolvedValue(undefined as never),
  setRecordingRulesToAudioAndVideo: jest.fn().mockResolvedValue(undefined as never),
  TwilioRoomNotFoundError: class TwilioRoomNotFoundError extends Error {
    readonly roomSid: string;
    constructor(roomSid: string, cause?: string) {
      super(cause ? `Twilio room ${roomSid} not found: ${cause}` : `Twilio room ${roomSid} not found`);
      this.name = 'TwilioRoomNotFoundError';
      this.roomSid = roomSid;
    }
  },
}));

jest.mock('../../../src/services/twilio-compositions', () => ({
  listCompositionsForRoom: jest.fn(),
}));

import * as database from '../../../src/config/database';
import * as sessionSvc from '../../../src/services/consultation-session-service';
import * as twilioRules from '../../../src/services/twilio-recording-rules';
import * as twilioCompositions from '../../../src/services/twilio-compositions';

import {
  __resetArtifactCacheForTests,
  escalateToFullVideoRecording,
  getRecordingArtifactsForSession,
  revertToAudioOnlyRecording,
  startAudioOnlyRecording,
} from '../../../src/services/recording-track-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedSessionSvc = sessionSvc as jest.Mocked<typeof sessionSvc>;
const mockedTwilio = twilioRules as jest.Mocked<typeof twilioRules>;
const mockedCompositions = twilioCompositions as jest.Mocked<typeof twilioCompositions>;

const SYSTEM_UUID = '00000000-0000-0000-0000-000000000000';

// ---------------------------------------------------------------------------
// Supabase admin mock — only the `insert` path into
// `consultation_recording_audit` is exercised by this service.
// ---------------------------------------------------------------------------

interface AdminMockHandle {
  client: { from: (table: string) => unknown };
  insertedRows: Array<Record<string, unknown>>;
}

function buildAdminMock(opts: { insertError?: { message: string } | null } = {}): AdminMockHandle {
  const insertedRows: Array<Record<string, unknown>> = [];
  const from = (table: string): unknown => {
    if (table !== 'consultation_recording_audit') {
      throw new Error(`buildAdminMock: unexpected table ${table}`);
    }
    return {
      insert: (row: Record<string, unknown>): Promise<{ error: { message: string } | null }> => {
        insertedRows.push(row);
        return Promise.resolve({ error: opts.insertError ?? null });
      },
    };
  };
  return { client: { from }, insertedRows };
}

// ---------------------------------------------------------------------------
// Session fixture
// ---------------------------------------------------------------------------

type SessionRecord = Awaited<ReturnType<typeof sessionSvc.findSessionById>>;

function makeSession(
  overrides: Partial<NonNullable<SessionRecord>> = {},
): NonNullable<SessionRecord> {
  return {
    id:                'sess-1',
    appointmentId:     'appt-1',
    doctorId:          'doc-1',
    patientId:         'pat-1',
    modality:          'video',
    status:            'live',
    provider:          'twilio_video',
    providerSessionId: 'RM_t43',
    scheduledStartAt:  new Date('2026-04-19T10:00:00Z'),
    expectedEndAt:     new Date('2026-04-19T10:30:00Z'),
    ...(overrides as object),
  } as NonNullable<SessionRecord>;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  __resetArtifactCacheForTests();
  mockedTwilio.setRecordingRulesToAudioOnly.mockResolvedValue(undefined);
  mockedTwilio.setRecordingRulesToAudioAndVideo.mockResolvedValue(undefined);
});

// ===========================================================================
// startAudioOnlyRecording — action mapping + actor resolution
// ===========================================================================

describe('startAudioOnlyRecording · system baseline', () => {
  it('writes recording_started attempted + completed with the all-zeros system actor and no session lookup', async () => {
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    const result = await startAudioOnlyRecording({
      sessionId:     'sess-1',
      roomSid:       'RM_t43',
      initiatedBy:   'system',
      correlationId: 'corr-sys',
    });

    expect(result.correlationId).toBe('corr-sys');
    expect(mockedSessionSvc.findSessionById).not.toHaveBeenCalled();
    expect(mockedTwilio.setRecordingRulesToAudioOnly).toHaveBeenCalledWith('RM_t43', 'corr-sys');
    expect(admin.insertedRows).toHaveLength(2);
    expect(admin.insertedRows[0]).toMatchObject({
      session_id:     'sess-1',
      action:         'recording_started',
      action_by:      SYSTEM_UUID,
      action_by_role: 'system',
      correlation_id: 'corr-sys',
      metadata:       {
        status:     'attempted',
        twilio_sid: 'RM_t43',
        kind:       'audio',
        initiated_by: 'system',
      },
    });
    expect(admin.insertedRows[1]).toMatchObject({
      action:   'recording_started',
      metadata: { status: 'completed', initiated_by: 'system' },
    });
  });

  it('auto-generates a correlation id when caller omits one, and uses it for both ledger rows', async () => {
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    const result = await startAudioOnlyRecording({
      sessionId:   'sess-1',
      roomSid:     'RM_t43',
      initiatedBy: 'system',
    });

    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(admin.insertedRows).toHaveLength(2);
    expect(admin.insertedRows[0]?.correlation_id).toBe(result.correlationId);
    expect(admin.insertedRows[1]?.correlation_id).toBe(result.correlationId);
  });
});

describe('startAudioOnlyRecording · doctor_revert / patient_revoke', () => {
  it('writes video_recording_reverted with the session doctor as actor for doctor_revert', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    await startAudioOnlyRecording({
      sessionId:     'sess-1',
      roomSid:       'RM_t43',
      initiatedBy:   'doctor_revert',
      correlationId: 'corr-doc',
    });

    expect(admin.insertedRows).toHaveLength(2);
    expect(admin.insertedRows[0]).toMatchObject({
      action:         'video_recording_reverted',
      action_by:      'doc-1',
      action_by_role: 'doctor',
      metadata:       { status: 'attempted', initiated_by: 'doctor_revert' },
    });
    expect(admin.insertedRows[1]).toMatchObject({
      metadata: { status: 'completed' },
    });
  });

  it('writes video_recording_reverted with the session patient as actor for patient_revoke', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    await startAudioOnlyRecording({
      sessionId:     'sess-1',
      roomSid:       'RM_t43',
      initiatedBy:   'patient_revoke',
      correlationId: 'corr-pat',
    });

    expect(admin.insertedRows[0]).toMatchObject({
      action_by:      'pat-1',
      action_by_role: 'patient',
      metadata:       { initiated_by: 'patient_revoke' },
    });
  });

  it('falls back to system actor when patient_revoke arrives on a session with null patientId', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ patientId: null }));
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    await startAudioOnlyRecording({
      sessionId:   'sess-1',
      roomSid:     'RM_t43',
      initiatedBy: 'patient_revoke',
    });

    expect(admin.insertedRows[0]).toMatchObject({
      action_by:      SYSTEM_UUID,
      action_by_role: 'system',
    });
  });
});

describe('startAudioOnlyRecording · failure path', () => {
  it('writes a failed row and rethrows when the adapter fails; completed row is NOT written', async () => {
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
    );
    const twilioErr = new Error('Twilio 503');
    mockedTwilio.setRecordingRulesToAudioOnly.mockRejectedValueOnce(twilioErr);

    await expect(
      startAudioOnlyRecording({
        sessionId:   'sess-1',
        roomSid:     'RM_t43',
        initiatedBy: 'system',
        correlationId: 'corr-sys-fail',
      }),
    ).rejects.toThrow('Twilio 503');

    expect(admin.insertedRows).toHaveLength(2);
    expect(admin.insertedRows[0]).toMatchObject({
      metadata: { status: 'attempted' },
    });
    expect(admin.insertedRows[1]).toMatchObject({
      metadata: { status: 'failed', error: 'Twilio 503' },
    });
  });

  it('rejects missing sessionId / roomSid with ValidationError BEFORE any ledger row is written', async () => {
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    await expect(
      startAudioOnlyRecording({ sessionId: '', roomSid: 'RM', initiatedBy: 'system' }),
    ).rejects.toThrow('sessionId is required');
    await expect(
      startAudioOnlyRecording({ sessionId: 'sess-1', roomSid: '  ', initiatedBy: 'system' }),
    ).rejects.toThrow('roomSid is required');
    expect(admin.insertedRows).toHaveLength(0);
  });
});

// ===========================================================================
// escalateToFullVideoRecording
// ===========================================================================

describe('escalateToFullVideoRecording', () => {
  it('writes video_recording_started attempted + completed with escalation metadata and returns escalationStartedAt', async () => {
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    const before = Date.now();
    const result = await escalateToFullVideoRecording({
      sessionId:           'sess-1',
      roomSid:             'RM_t43',
      doctorId:            'doc-1',
      escalationRequestId: 'esc-req-1',
      correlationId:       'corr-esc',
    });
    const after = Date.now();

    expect(result.correlationId).toBe('corr-esc');
    expect(result.escalationStartedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.escalationStartedAt.getTime()).toBeLessThanOrEqual(after);

    expect(mockedTwilio.setRecordingRulesToAudioAndVideo).toHaveBeenCalledWith('RM_t43', 'corr-esc');
    expect(admin.insertedRows).toHaveLength(2);
    expect(admin.insertedRows[0]).toMatchObject({
      action:         'video_recording_started',
      action_by:      'doc-1',
      action_by_role: 'doctor',
      correlation_id: 'corr-esc',
      metadata:       {
        status:                'attempted',
        kind:                  'video',
        escalation_request_id: 'esc-req-1',
        doctor_id:             'doc-1',
        initiated_by:          'doctor',
      },
    });
    expect(admin.insertedRows[1]).toMatchObject({
      action:   'video_recording_started',
      metadata: { status: 'completed', escalation_request_id: 'esc-req-1' },
    });
  });

  it('rejects missing required inputs BEFORE ledger writes', async () => {
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    await expect(
      escalateToFullVideoRecording({
        sessionId:           'sess-1',
        roomSid:             'RM',
        doctorId:            '',
        escalationRequestId: 'req',
      }),
    ).rejects.toThrow('doctorId is required');
    await expect(
      escalateToFullVideoRecording({
        sessionId:           'sess-1',
        roomSid:             'RM',
        doctorId:            'doc-1',
        escalationRequestId: '',
      }),
    ).rejects.toThrow('escalationRequestId is required');
    expect(admin.insertedRows).toHaveLength(0);
  });

  it('writes a failed row and rethrows when the adapter fails', async () => {
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
    );
    mockedTwilio.setRecordingRulesToAudioAndVideo.mockRejectedValueOnce(
      new Error('Twilio rate limit'),
    );

    await expect(
      escalateToFullVideoRecording({
        sessionId:           'sess-1',
        roomSid:             'RM_t43',
        doctorId:            'doc-1',
        escalationRequestId: 'esc-req-2',
      }),
    ).rejects.toThrow('Twilio rate limit');

    expect(admin.insertedRows).toHaveLength(2);
    expect(admin.insertedRows[1]).toMatchObject({
      metadata: { status: 'failed', error: 'Twilio rate limit' },
    });
  });
});

// ===========================================================================
// revertToAudioOnlyRecording
// ===========================================================================

describe('revertToAudioOnlyRecording', () => {
  it('writes video_recording_reverted with the reason + initiatedBy captured in metadata (patient_revoked)', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    await revertToAudioOnlyRecording({
      sessionId:     'sess-1',
      roomSid:       'RM_t43',
      reason:        'patient_revoked',
      initiatedBy:   'patient',
      correlationId: 'corr-revert',
    });

    expect(mockedTwilio.setRecordingRulesToAudioOnly).toHaveBeenCalledWith('RM_t43', 'corr-revert');
    expect(admin.insertedRows[0]).toMatchObject({
      action:         'video_recording_reverted',
      action_by:      'pat-1',
      action_by_role: 'patient',
      correlation_id: 'corr-revert',
      metadata:       {
        status:       'attempted',
        kind:         'video',
        reason:       'patient_revoked',
        initiated_by: 'patient',
      },
    });
  });

  it('routes doctor_paused revert to the session doctor', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    await revertToAudioOnlyRecording({
      sessionId:   'sess-1',
      roomSid:     'RM_t43',
      reason:      'doctor_paused',
      initiatedBy: 'doctor',
    });

    expect(admin.insertedRows[0]).toMatchObject({
      action_by:      'doc-1',
      action_by_role: 'doctor',
      metadata:       { reason: 'doctor_paused', initiated_by: 'doctor' },
    });
  });

  it('routes system_error_fallback revert to the system actor', async () => {
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    await revertToAudioOnlyRecording({
      sessionId:   'sess-1',
      roomSid:     'RM_t43',
      reason:      'system_error_fallback',
      initiatedBy: 'system',
    });

    expect(mockedSessionSvc.findSessionById).not.toHaveBeenCalled();
    expect(admin.insertedRows[0]).toMatchObject({
      action_by:      SYSTEM_UUID,
      action_by_role: 'system',
    });
  });

  it('rejects unknown reason / initiatedBy with ValidationError', async () => {
    await expect(
      revertToAudioOnlyRecording({
        sessionId:   'sess-1',
        roomSid:     'RM_t43',
        // @ts-expect-error exercising runtime validation
        reason:      'doctor_wants_lunch',
        initiatedBy: 'doctor',
      }),
    ).rejects.toThrow(/Unknown revert reason/);
    await expect(
      revertToAudioOnlyRecording({
        sessionId:   'sess-1',
        roomSid:     'RM_t43',
        reason:      'doctor_paused',
        // @ts-expect-error exercising runtime validation
        initiatedBy: 'bystander',
      }),
    ).rejects.toThrow(/Unknown revert initiatedBy/);
  });
});

// ===========================================================================
// getRecordingArtifactsForSession
// ===========================================================================

describe('getRecordingArtifactsForSession', () => {
  function compositionRow(overrides: Partial<{
    sid: string;
    includeAudio: boolean;
    includeVideo: boolean;
    startedAt: Date;
    endedAt: Date | null;
    durationSeconds: number | null;
    status: 'enqueued' | 'processing' | 'completed' | 'failed' | 'deleted';
  }> = {}): {
    compositionSid: string;
    includeAudio: boolean;
    includeVideo: boolean;
    startedAt: Date;
    endedAt: Date | null;
    durationSeconds: number | null;
    status: 'enqueued' | 'processing' | 'completed' | 'failed' | 'deleted';
  } {
    return {
      compositionSid:  overrides.sid ?? 'CMx',
      includeAudio:    overrides.includeAudio ?? true,
      includeVideo:    overrides.includeVideo ?? false,
      startedAt:       overrides.startedAt ?? new Date('2026-04-19T10:00:00Z'),
      endedAt:         overrides.endedAt === undefined ? new Date('2026-04-19T10:05:00Z') : overrides.endedAt,
      durationSeconds: overrides.durationSeconds ?? 300,
      status:          overrides.status ?? 'completed',
    };
  }

  it('returns empty lists for a session with no providerSessionId', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ providerSessionId: undefined }));
    const result = await getRecordingArtifactsForSession({ sessionId: 'sess-1' });
    expect(result).toEqual({ audioCompositions: [], videoCompositions: [] });
    expect(mockedCompositions.listCompositionsForRoom).not.toHaveBeenCalled();
  });

  it('returns empty lists when the session is not found (warn log; no throw)', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(null);
    const result = await getRecordingArtifactsForSession({ sessionId: 'sess-missing' });
    expect(result).toEqual({ audioCompositions: [], videoCompositions: [] });
  });

  it('splits compositions by includeVideo flag and sorts each bucket by startedAt ASC', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    mockedCompositions.listCompositionsForRoom.mockResolvedValueOnce([
      compositionRow({
        sid: 'CMa2',
        includeAudio: true, includeVideo: false,
        startedAt: new Date('2026-04-19T10:20:00Z'),
      }),
      compositionRow({
        sid: 'CMv1',
        includeAudio: true, includeVideo: true,
        startedAt: new Date('2026-04-19T10:10:00Z'),
      }),
      compositionRow({
        sid: 'CMa1',
        includeAudio: true, includeVideo: false,
        startedAt: new Date('2026-04-19T10:00:00Z'),
      }),
    ]);

    const result = await getRecordingArtifactsForSession({ sessionId: 'sess-1' });

    expect(result.audioCompositions.map((a) => a.compositionSid)).toEqual(['CMa1', 'CMa2']);
    expect(result.videoCompositions.map((v) => v.compositionSid)).toEqual(['CMv1']);
    expect(result.videoCompositions[0]?.kind).toBe('video');
    expect(result.audioCompositions[0]?.kind).toBe('audio');
  });

  it('drops compositions that include neither audio nor video (defensive)', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    mockedCompositions.listCompositionsForRoom.mockResolvedValueOnce([
      compositionRow({ sid: 'CMghost', includeAudio: false, includeVideo: false }),
      compositionRow({ sid: 'CMa', includeAudio: true, includeVideo: false }),
    ]);

    const result = await getRecordingArtifactsForSession({ sessionId: 'sess-1' });
    expect(result.audioCompositions).toHaveLength(1);
    expect(result.audioCompositions[0]?.compositionSid).toBe('CMa');
    expect(result.videoCompositions).toHaveLength(0);
  });

  it('caches per-session (listCompositionsForRoom called once across two back-to-back calls)', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    mockedCompositions.listCompositionsForRoom.mockResolvedValue([
      compositionRow({ sid: 'CMa', includeAudio: true, includeVideo: false }),
    ]);

    await getRecordingArtifactsForSession({ sessionId: 'sess-1' });
    await getRecordingArtifactsForSession({ sessionId: 'sess-1' });

    expect(mockedCompositions.listCompositionsForRoom).toHaveBeenCalledTimes(1);
  });

  it('busts the cache after escalateToFullVideoRecording — next call re-fetches from Twilio', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    mockedCompositions.listCompositionsForRoom.mockResolvedValue([
      compositionRow({ sid: 'CMa', includeAudio: true, includeVideo: false }),
    ]);
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    await getRecordingArtifactsForSession({ sessionId: 'sess-1' });
    await escalateToFullVideoRecording({
      sessionId:           'sess-1',
      roomSid:             'RM_t43',
      doctorId:            'doc-1',
      escalationRequestId: 'esc-req-3',
    });
    await getRecordingArtifactsForSession({ sessionId: 'sess-1' });

    expect(mockedCompositions.listCompositionsForRoom).toHaveBeenCalledTimes(2);
  });

  it('busts the cache after revertToAudioOnlyRecording', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
    mockedCompositions.listCompositionsForRoom.mockResolvedValue([
      compositionRow({ sid: 'CMa', includeAudio: true, includeVideo: false }),
    ]);
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    await getRecordingArtifactsForSession({ sessionId: 'sess-1' });
    await revertToAudioOnlyRecording({
      sessionId:   'sess-1',
      roomSid:     'RM_t43',
      reason:      'system_error_fallback',
      initiatedBy: 'system',
    });
    await getRecordingArtifactsForSession({ sessionId: 'sess-1' });

    expect(mockedCompositions.listCompositionsForRoom).toHaveBeenCalledTimes(2);
  });
});
