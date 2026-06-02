/**
 * Consultation Session Facade — Recording-Baseline Lifecycle Hook Tests
 * (Plan 08 · Task 43 · Decision 10 LOCKED).
 *
 * Pins the behaviour of the new lifecycle hook in
 * `consultation-session-service.createSession`:
 *
 *   1. Fresh VIDEO sessions call
 *      `recording-track-service.startAudioOnlyRecording` exactly once
 *      with the persisted row's UUID + Twilio room SID and
 *      `initiatedBy: 'system'`.
 *   2. Voice sessions do NOT call it — the voice adapter still runs
 *      its inline `applyAudioOnlyRecordingRules` path; collapsing
 *      voice onto the Task 43 entry point is a follow-up.
 *   3. Text sessions do NOT call it (no Twilio room).
 *   4. Video sessions whose adapter returned no `providerSessionId`
 *      do NOT call it (guard rail: no roomSid → no flip).
 *   5. A throw from the baseline-establishment call does NOT fail the
 *      outer `createSession` — the session row is still returned.
 *
 * The recording-track-service module is mocked at the module boundary
 * so this suite tests only the facade wiring, not the service
 * internals (those live in `recording-track-service.test.ts`).
 *
 * Mirrors the mocking layout of `consultation-session-service-companion-hook.test.ts`
 * (same facade, different hook).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn:  jest.fn(),
    info:  jest.fn(),
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
    endSession:   jest.fn(async () => {}),
    getJoinToken: jest.fn(async () => ({
      token:     'mock-video-jwt',
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
    endSession:   jest.fn(async () => {}),
    getJoinToken: jest.fn(async () => ({
      token:     'mock-voice-jwt',
      expiresAt: new Date('2026-04-19T14:00:00.000Z'),
    })),
  },
}));

const mockTextCreateSession = jest.fn<
  (input: { appointmentId: string }, correlationId: string) => Promise<{ providerSessionId?: string }>
>();

jest.mock('../../../src/services/text-session-supabase', () => ({
  textSessionSupabaseAdapter: {
    modality: 'text',
    provider: 'supabase_realtime',
    createSession: (...args: [{ appointmentId: string }, string]) =>
      mockTextCreateSession(...args),
    endSession:   jest.fn(async () => {}),
    getJoinToken: jest.fn(async () => ({
      token:     'mock-text-jwt',
      expiresAt: new Date('2026-04-19T14:00:00.000Z'),
    })),
  },
  // Companion provisioning is orthogonal to the Task 43 hook; stub it.
  provisionCompanionChannel: jest.fn(async () => null),
}));

jest.mock('../../../src/services/consultation-message-service', () => ({
  emitConsultStarted: jest.fn(async () => undefined),
  emitConsultEnded:   jest.fn(async () => undefined),
}));

jest.mock('../../../src/services/notification-service', () => ({
  sendPostConsultChatHistoryDm: jest.fn(async () => undefined),
}));

const mockStartAudioOnlyRecording = jest.fn<
  (input: {
    sessionId: string;
    roomSid: string;
    initiatedBy: 'system' | 'doctor_revert' | 'patient_revoke';
    correlationId?: string;
  }) => Promise<{ correlationId: string }>
>();

jest.mock('../../../src/services/recording-track-service', () => ({
  startAudioOnlyRecording: (...args: Parameters<typeof mockStartAudioOnlyRecording>) =>
    mockStartAudioOnlyRecording(...args),
}));

import * as database from '../../../src/config/database';
import { createSession } from '../../../src/services/consultation-session-service';

const mockedDb = database as jest.Mocked<typeof database>;
const correlationId = 'corr-t43-hook';

// ---------------------------------------------------------------------------
// Supabase mock — same shape as companion-hook sibling test, trimmed.
// ---------------------------------------------------------------------------

interface RowState {
  selectMaybeSingleResult: { data: unknown; error: { message: string } | null };
  insertSingleResult:      { data: unknown; error: { message: string } | null };
}

function buildSupabaseMock(state: RowState): { client: { from: jest.Mock } } {
  const maybeSingleSelect = jest.fn().mockResolvedValue(state.selectMaybeSingleResult as never);
  const singleInsert      = jest.fn().mockResolvedValue(state.insertSingleResult as never);

  const selectChain: Record<string, unknown> = {};
  for (const m of ['eq', 'not', 'order', 'limit']) {
    selectChain[m] = jest.fn().mockReturnValue(selectChain);
  }
  selectChain.maybeSingle = maybeSingleSelect;

  const select       = jest.fn().mockReturnValue(selectChain);
  const insertSelect = jest.fn().mockReturnValue({ single: singleInsert });
  const insert       = jest.fn().mockReturnValue({ select: insertSelect });
  const from         = jest.fn().mockImplementation(() => ({ select, insert }));

  return { client: { from } };
}

function buildFixedSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id:                        'sess-uuid-t43',
    appointment_id:            'apt-1',
    doctor_id:                 'doc-1',
    patient_id:                'pat-1',
    modality:                  'video',
    status:                    'scheduled',
    provider:                  'twilio_video',
    provider_session_id:       'RM_t43_wire',
    scheduled_start_at:        '2026-04-19T10:00:00.000Z',
    expected_end_at:           '2026-04-19T10:30:00.000Z',
    actual_started_at:         null,
    actual_ended_at:           null,
    doctor_joined_at:          null,
    patient_joined_at:         null,
    recording_consent_at_book: null,
    recording_artifact_ref:    null,
    created_at:                '2026-04-19T09:55:00.000Z',
    updated_at:                '2026-04-19T09:55:00.000Z',
    ...overrides,
  };
}

const baseInput = {
  appointmentId:     'apt-1',
  doctorId:          'doc-1',
  patientId:         'pat-1' as string | null,
  modality:          'video' as const,
  scheduledStartAt:  new Date('2026-04-19T10:00:00.000Z'),
  expectedEndAt:     new Date('2026-04-19T10:30:00.000Z'),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVideoCreateSession.mockResolvedValue({ providerSessionId: 'RM_vid_1' });
  mockVoiceCreateSession.mockResolvedValue({ providerSessionId: 'RM_voi_1' });
  mockTextCreateSession.mockResolvedValue({ providerSessionId: 'text:apt-1' });
  mockStartAudioOnlyRecording.mockResolvedValue({ correlationId });
});

// ===========================================================================

describe('createSession · Task 43 audio-only baseline hook', () => {
  it('video session calls startAudioOnlyRecording once with the persisted row id + adapter roomSid + system initiator', async () => {
    const sb = buildSupabaseMock({
      selectMaybeSingleResult: { data: null, error: null },
      insertSingleResult: {
        data:  buildFixedSession({ provider_session_id: 'RM_vid_1' }),
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    await createSession({ ...baseInput, modality: 'video' }, correlationId);

    expect(mockStartAudioOnlyRecording).toHaveBeenCalledTimes(1);
    expect(mockStartAudioOnlyRecording).toHaveBeenCalledWith({
      sessionId:     'sess-uuid-t43',
      roomSid:       'RM_vid_1',
      initiatedBy:   'system',
      correlationId,
    });
  });

  it('voice session does NOT call startAudioOnlyRecording (voice adapter owns its inline rule-set path)', async () => {
    const sb = buildSupabaseMock({
      selectMaybeSingleResult: { data: null, error: null },
      insertSingleResult: {
        data: buildFixedSession({
          modality:            'voice',
          provider:            'twilio_video',
          provider_session_id: 'RM_voi_1',
        }),
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    await createSession({ ...baseInput, modality: 'voice' }, correlationId);

    expect(mockStartAudioOnlyRecording).not.toHaveBeenCalled();
  });

  it('text session does NOT call startAudioOnlyRecording (no Twilio room)', async () => {
    const sb = buildSupabaseMock({
      selectMaybeSingleResult: { data: null, error: null },
      insertSingleResult: {
        data: buildFixedSession({
          modality:            'text',
          provider:            'supabase_realtime',
          provider_session_id: 'text:apt-1',
        }),
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    await createSession({ ...baseInput, modality: 'text' }, correlationId);

    expect(mockStartAudioOnlyRecording).not.toHaveBeenCalled();
  });

  it('video session with no providerSessionId from the adapter does NOT call startAudioOnlyRecording (guard rail)', async () => {
    mockVideoCreateSession.mockResolvedValue({});
    const sb = buildSupabaseMock({
      selectMaybeSingleResult: { data: null, error: null },
      insertSingleResult: {
        data:  buildFixedSession({ provider_session_id: null }),
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    await createSession({ ...baseInput, modality: 'video' }, correlationId);

    expect(mockStartAudioOnlyRecording).not.toHaveBeenCalled();
  });

  it('a throw from startAudioOnlyRecording does NOT fail createSession — the session row is still returned', async () => {
    const sb = buildSupabaseMock({
      selectMaybeSingleResult: { data: null, error: null },
      insertSingleResult: {
        data:  buildFixedSession({ provider_session_id: 'RM_vid_1' }),
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);
    mockStartAudioOnlyRecording.mockRejectedValueOnce(new Error('Twilio 503'));

    const result = await createSession({ ...baseInput, modality: 'video' }, correlationId);

    expect(result.id).toBe('sess-uuid-t43');
    expect(result.providerSessionId).toBe('RM_vid_1');
  });
});
