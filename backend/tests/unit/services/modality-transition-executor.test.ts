/**
 * Modality Transition Executor — Unit Tests (Plan 09 · Task 48)
 *
 * Exercises the 6-branch dispatcher + rollback paths in
 * `backend/src/services/modality-transition-executor.ts`. All external
 * adapters (`voice-session-twilio`, `video-session-twilio`,
 * `recording-track-service`) are mocked at module boundary — the
 * executor is stateless + DB-free by design (per task doc Notes #1),
 * so a pure-mock harness is sufficient to cover the full contract.
 *
 * Matrix covered (one `describe` per transition cell):
 *   · text → voice     — new room, audio-only rules, doctor+patient tokens
 *   · text → video     — new room, full video rules, doctor+patient tokens
 *   · voice → video    — same room; escalateToFullVideoRecording only
 *   · video → voice    — same room; revertToAudioOnlyRecording only
 *   · voice → text     — endSession; newProviderSessionId === null
 *   · video → text     — revertToAudioOnly + endSession; null SID
 *
 * Cross-cutting:
 *   · `NoOpTransitionError` on same-modality dispatch.
 *   · Rollback: text→voice where token mint throws → orphan room closed.
 *   · `transitionLatencyMs` populated on every branch.
 *   · `recordingSegmentRef.kind` matches Plan 08 label conventions.
 *   · `newProvider` stamped only on cross-provider branches.
 *   · Defensive throw when `providerSessionId` is missing on voice↔video
 *     / any→text branches.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-48-modality-transition-executor.md
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { SessionRecord } from '../../../src/types/consultation-session';

// ---------------------------------------------------------------------------
// Mocks (must come before importing the unit under test)
// ---------------------------------------------------------------------------

// -- video-session-twilio.
const mockVideoCreateSession = jest.fn<
  (input: unknown, correlationId: string) => Promise<{ providerSessionId?: string }>
>();
const mockVideoEndSession = jest.fn<
  (providerSessionId: string, correlationId: string) => Promise<void>
>();
const mockVideoGetJoinToken = jest.fn<
  (input: unknown, correlationId: string) => Promise<{ token: string; expiresAt: Date }>
>();
const mockCompleteTwilioRoom = jest.fn<
  (roomSid: string, correlationId: string) => Promise<void>
>();

jest.mock('../../../src/services/video-session-twilio', () => ({
  videoSessionTwilioAdapter: {
    modality: 'video',
    provider: 'twilio_video',
    createSession: (...args: [unknown, string]) => mockVideoCreateSession(...args),
    endSession:    (...args: [string, string])  => mockVideoEndSession(...args),
    getJoinToken:  (...args: [unknown, string]) => mockVideoGetJoinToken(...args),
  },
  completeTwilioRoom: (...args: [string, string]) => mockCompleteTwilioRoom(...args),
}));

// -- voice-session-twilio.
const mockVoiceCreateSession = jest.fn<
  (input: unknown, correlationId: string) => Promise<{ providerSessionId?: string }>
>();
const mockVoiceEndSession = jest.fn<
  (providerSessionId: string, correlationId: string) => Promise<void>
>();
const mockVoiceGetJoinToken = jest.fn<
  (input: unknown, correlationId: string) => Promise<{ token: string; expiresAt: Date }>
>();

jest.mock('../../../src/services/voice-session-twilio', () => ({
  voiceSessionTwilioAdapter: {
    modality: 'voice',
    provider: 'twilio_video',
    createSession: (...args: [unknown, string]) => mockVoiceCreateSession(...args),
    endSession:    (...args: [string, string])  => mockVoiceEndSession(...args),
    getJoinToken:  (...args: [unknown, string]) => mockVoiceGetJoinToken(...args),
  },
}));

// -- recording-track-service.
const mockEscalateToFullVideoRecording = jest.fn<
  (input: unknown) => Promise<{ correlationId: string; escalationStartedAt: Date }>
>();
const mockRevertToAudioOnlyRecording = jest.fn<
  (input: unknown) => Promise<{ correlationId: string }>
>();

jest.mock('../../../src/services/recording-track-service', () => ({
  escalateToFullVideoRecording: (input: unknown) => mockEscalateToFullVideoRecording(input),
  revertToAudioOnlyRecording:   (input: unknown) => mockRevertToAudioOnlyRecording(input),
}));

// ---------------------------------------------------------------------------
// Imports under test — after all mocks are declared.
// ---------------------------------------------------------------------------

import {
  executeModalityTransition,
  NoOpTransitionError,
  AccessTokenMintError,
  __testOnly__,
} from '../../../src/services/modality-transition-executor';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SID_EXISTING = 'RM_existing_room_sid_zzz';
const SID_FRESH = 'RM_freshly_created_sid_xxx';

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id:                 'session_0000000000000001',
    appointmentId:      'appt_0000000000000001',
    doctorId:           'doc_01',
    patientId:          'pat_01',
    modality:           'voice',
    status:             'live',
    provider:           'twilio_video',
    providerSessionId:  SID_EXISTING,
    scheduledStartAt:   new Date('2026-04-19T10:00:00Z'),
    expectedEndAt:      new Date('2026-04-19T10:30:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  // Default happy paths — each test overrides as needed.
  mockVideoCreateSession.mockResolvedValue({ providerSessionId: SID_FRESH });
  mockVoiceCreateSession.mockResolvedValue({ providerSessionId: SID_FRESH });
  mockVideoGetJoinToken.mockResolvedValue({
    token:     'tkn_video_default',
    expiresAt: new Date('2026-04-19T14:00:00Z'),
  });
  mockVoiceGetJoinToken.mockResolvedValue({
    token:     'tkn_voice_default',
    expiresAt: new Date('2026-04-19T14:00:00Z'),
  });
  mockVideoEndSession.mockResolvedValue(undefined);
  mockVoiceEndSession.mockResolvedValue(undefined);
  mockCompleteTwilioRoom.mockResolvedValue(undefined);
  mockEscalateToFullVideoRecording.mockResolvedValue({
    correlationId:       'mock-exec-corr',
    escalationStartedAt: new Date('2026-04-19T10:10:00Z'),
  });
  mockRevertToAudioOnlyRecording.mockResolvedValue({ correlationId: 'mock-exec-corr' });
});

// ============================================================================
// text → voice
// ============================================================================

describe('text → voice', () => {
  const input = () => ({
    session: makeSession({ modality: 'text', providerSessionId: undefined }),
    toModality: 'voice' as const,
    correlationId: 'corr-text-voice',
    initiatedBy: 'patient' as const,
  });

  it('provisions a new voice room via voiceSessionTwilioAdapter.createSession', async () => {
    await executeModalityTransition(input());

    expect(mockVoiceCreateSession).toHaveBeenCalledTimes(1);
    const [createArg, corrArg] = mockVoiceCreateSession.mock.calls[0];
    expect((createArg as { appointmentId: string }).appointmentId).toBe('appt_0000000000000001');
    expect((createArg as { modality: string }).modality).toBe('voice');
    expect(corrArg).toBe('corr-text-voice');
  });

  it('mints BOTH doctor and patient access tokens via voice adapter getJoinToken', async () => {
    mockVoiceGetJoinToken
      .mockResolvedValueOnce({ token: 'tkn_doc', expiresAt: new Date() })
      .mockResolvedValueOnce({ token: 'tkn_pat', expiresAt: new Date() });

    const r = await executeModalityTransition(input());

    expect(mockVoiceGetJoinToken).toHaveBeenCalledTimes(2);
    expect(r.newAccessToken).toBe('tkn_doc');
    expect(r.newPatientAccessToken).toBe('tkn_pat');

    // Assert roles went through as doctor + patient in that order.
    const firstCallInput = mockVoiceGetJoinToken.mock.calls[0][0] as { role: string };
    const secondCallInput = mockVoiceGetJoinToken.mock.calls[1][0] as { role: string };
    expect(firstCallInput.role).toBe('doctor');
    expect(secondCallInput.role).toBe('patient');
  });

  it('returns newProviderSessionId=fresh SID, newProvider=twilio_video_audio, audio_started segment ref', async () => {
    const r = await executeModalityTransition(input());

    expect(r.newProviderSessionId).toBe(SID_FRESH);
    expect(r.newProvider).toBe('twilio_video_audio');
    expect(r.recordingSegmentRef?.kind).toBe('audio_started');
    expect(r.recordingSegmentRef?.compositionLabel).toMatch(
      /^consult_session_0000000000000001_audio_\d{4}-\d{2}-\d{2}T/,
    );
    expect(r.recordingArtifactRef).toBe(r.recordingSegmentRef?.compositionLabel);
    expect(r.transitionLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('closes the orphan room if doctor token mint throws after room creation', async () => {
    mockVoiceGetJoinToken.mockRejectedValueOnce(new Error('twilio token service down'));

    await expect(executeModalityTransition(input())).rejects.toBeInstanceOf(AccessTokenMintError);

    expect(mockCompleteTwilioRoom).toHaveBeenCalledTimes(1);
    expect(mockCompleteTwilioRoom).toHaveBeenCalledWith(SID_FRESH, 'corr-text-voice');
  });

  it('closes the orphan room if patient token mint throws (doctor succeeded first)', async () => {
    mockVoiceGetJoinToken
      .mockResolvedValueOnce({ token: 'tkn_doc_ok', expiresAt: new Date() })
      .mockRejectedValueOnce(new Error('patient token service flaked'));

    const thrown = await executeModalityTransition(input()).catch((e) => e);
    expect(thrown).toBeInstanceOf(AccessTokenMintError);
    expect((thrown as AccessTokenMintError).role).toBe('patient');
    expect(mockCompleteTwilioRoom).toHaveBeenCalledWith(SID_FRESH, 'corr-text-voice');
  });

  it('throws InternalError if voice adapter returns no providerSessionId (contract breach)', async () => {
    mockVoiceCreateSession.mockResolvedValueOnce({ providerSessionId: undefined });

    await expect(executeModalityTransition(input())).rejects.toThrow(/no providerSessionId/);
    expect(mockCompleteTwilioRoom).not.toHaveBeenCalled();
  });
});

// ============================================================================
// text → video
// ============================================================================

describe('text → video', () => {
  const input = () => ({
    session: makeSession({ modality: 'text', providerSessionId: undefined }),
    toModality: 'video' as const,
    correlationId: 'corr-text-video',
    initiatedBy: 'doctor' as const,
  });

  it('provisions a new video room + mints doctor+patient tokens', async () => {
    mockVideoGetJoinToken
      .mockResolvedValueOnce({ token: 'doc_vid', expiresAt: new Date() })
      .mockResolvedValueOnce({ token: 'pat_vid', expiresAt: new Date() });

    const r = await executeModalityTransition(input());

    expect(mockVideoCreateSession).toHaveBeenCalledTimes(1);
    expect(mockVoiceCreateSession).not.toHaveBeenCalled();
    expect(r.newProviderSessionId).toBe(SID_FRESH);
    expect(r.newProvider).toBe('twilio_video');
    expect(r.newAccessToken).toBe('doc_vid');
    expect(r.newPatientAccessToken).toBe('pat_vid');
    expect(r.recordingSegmentRef?.kind).toBe('audio_started'); // video rooms default to audio-only recording (Plan 08 Task 43)
  });

  it('closes orphan room on token mint failure', async () => {
    mockVideoGetJoinToken.mockRejectedValueOnce(new Error('kaboom'));

    await expect(executeModalityTransition(input())).rejects.toBeInstanceOf(AccessTokenMintError);
    expect(mockCompleteTwilioRoom).toHaveBeenCalledWith(SID_FRESH, 'corr-text-video');
  });
});

// ============================================================================
// voice → video (Decision 2 payoff)
// ============================================================================

describe('voice → video', () => {
  const input = () => ({
    session: makeSession({ modality: 'voice' }),
    toModality: 'video' as const,
    correlationId: 'corr-voice-video',
  });

  it('calls escalateToFullVideoRecording ONLY — no new room, no tokens', async () => {
    const r = await executeModalityTransition(input());

    expect(mockEscalateToFullVideoRecording).toHaveBeenCalledTimes(1);
    const payload = mockEscalateToFullVideoRecording.mock.calls[0][0] as {
      sessionId: string;
      roomSid: string;
      doctorId: string;
      escalationRequestId: string;
    };
    expect(payload.sessionId).toBe('session_0000000000000001');
    expect(payload.roomSid).toBe(SID_EXISTING);
    expect(payload.doctorId).toBe('doc_01');
    expect(payload.escalationRequestId).toBe('modality_change:corr-voice-video');

    expect(mockVideoCreateSession).not.toHaveBeenCalled();
    expect(mockVoiceCreateSession).not.toHaveBeenCalled();
    expect(mockVideoGetJoinToken).not.toHaveBeenCalled();
    expect(mockVoiceGetJoinToken).not.toHaveBeenCalled();

    expect(r.newProviderSessionId).toBe(SID_EXISTING);
    expect(r.newProvider).toBeUndefined(); // same room, same provider
    expect(r.newAccessToken).toBeUndefined();
    expect(r.newPatientAccessToken).toBeUndefined();
    expect(r.recordingSegmentRef?.kind).toBe('video_started');
  });

  it('throws InternalError if session has no providerSessionId', async () => {
    await expect(
      executeModalityTransition({ ...input(), session: makeSession({ modality: 'voice', providerSessionId: undefined }) }),
    ).rejects.toThrow(/providerSessionId is missing/);

    expect(mockEscalateToFullVideoRecording).not.toHaveBeenCalled();
  });
});

// ============================================================================
// video → voice
// ============================================================================

describe('video → voice', () => {
  const input = (over: Partial<{ initiatedBy: 'patient' | 'doctor' }> = {}) => ({
    session: makeSession({ modality: 'video' }),
    toModality: 'voice' as const,
    correlationId: 'corr-video-voice',
    ...over,
  });

  it('calls revertToAudioOnlyRecording with the correct reason when initiatedBy=doctor', async () => {
    const r = await executeModalityTransition(input({ initiatedBy: 'doctor' }));

    expect(mockRevertToAudioOnlyRecording).toHaveBeenCalledTimes(1);
    const payload = mockRevertToAudioOnlyRecording.mock.calls[0][0] as {
      reason: string;
      initiatedBy: string;
      roomSid: string;
    };
    expect(payload.reason).toBe('doctor_paused');
    expect(payload.initiatedBy).toBe('doctor');
    expect(payload.roomSid).toBe(SID_EXISTING);

    expect(r.newProviderSessionId).toBe(SID_EXISTING);
    expect(r.newProvider).toBeUndefined();
    expect(r.recordingSegmentRef?.kind).toBe('video_ended');
  });

  it('maps initiatedBy=patient onto reason=patient_revoked', async () => {
    await executeModalityTransition(input({ initiatedBy: 'patient' }));

    const payload = mockRevertToAudioOnlyRecording.mock.calls[0][0] as {
      reason: string;
      initiatedBy: string;
    };
    expect(payload.reason).toBe('patient_revoked');
    expect(payload.initiatedBy).toBe('patient');
  });

  it('defaults to doctor_paused when initiatedBy is undefined', async () => {
    await executeModalityTransition(input());

    const payload = mockRevertToAudioOnlyRecording.mock.calls[0][0] as {
      reason: string;
      initiatedBy: string;
    };
    expect(payload.reason).toBe('doctor_paused');
    expect(payload.initiatedBy).toBe('doctor');
  });

  it('throws InternalError if session has no providerSessionId', async () => {
    await expect(
      executeModalityTransition({ ...input(), session: makeSession({ modality: 'video', providerSessionId: undefined }) }),
    ).rejects.toThrow(/providerSessionId is missing/);

    expect(mockRevertToAudioOnlyRecording).not.toHaveBeenCalled();
  });
});

// ============================================================================
// voice → text
// ============================================================================

describe('voice → text', () => {
  const input = () => ({
    session: makeSession({ modality: 'voice' }),
    toModality: 'text' as const,
    correlationId: 'corr-voice-text',
  });

  it('calls voice adapter endSession and returns newProviderSessionId=null', async () => {
    const r = await executeModalityTransition(input());

    expect(mockVoiceEndSession).toHaveBeenCalledTimes(1);
    expect(mockVoiceEndSession).toHaveBeenCalledWith(SID_EXISTING, 'corr-voice-text');
    expect(mockVideoEndSession).not.toHaveBeenCalled();

    expect(r.newProviderSessionId).toBeNull();
    expect(r.newProvider).toBe('supabase_realtime');
    expect(r.recordingSegmentRef?.kind).toBe('audio_ended');
  });

  it('does NOT call any Twilio-video or recording-track helpers', async () => {
    await executeModalityTransition(input());

    expect(mockEscalateToFullVideoRecording).not.toHaveBeenCalled();
    expect(mockRevertToAudioOnlyRecording).not.toHaveBeenCalled();
    expect(mockVideoCreateSession).not.toHaveBeenCalled();
    expect(mockVoiceCreateSession).not.toHaveBeenCalled();
  });

  it('throws InternalError if session has no providerSessionId', async () => {
    await expect(
      executeModalityTransition({ ...input(), session: makeSession({ modality: 'voice', providerSessionId: undefined }) }),
    ).rejects.toThrow(/providerSessionId is missing/);
  });
});

// ============================================================================
// video → text
// ============================================================================

describe('video → text', () => {
  const input = () => ({
    session: makeSession({ modality: 'video' }),
    toModality: 'text' as const,
    correlationId: 'corr-video-text',
  });

  it('calls revertToAudioOnly FIRST, then video adapter endSession', async () => {
    const callOrder: string[] = [];
    mockRevertToAudioOnlyRecording.mockImplementationOnce(async () => {
      callOrder.push('revert');
      return { correlationId: 'x' };
    });
    mockVideoEndSession.mockImplementationOnce(async () => {
      callOrder.push('endSession');
    });

    const r = await executeModalityTransition(input());

    expect(callOrder).toEqual(['revert', 'endSession']);
    // NOTE: video→text uses video adapter's endSession, not voice adapter's
    // (voice adapter's endSession enqueues a voice-transcription job that
    // is irrelevant for a video room).
    expect(mockVoiceEndSession).not.toHaveBeenCalled();

    expect(r.newProviderSessionId).toBeNull();
    expect(r.newProvider).toBe('supabase_realtime');
    expect(r.recordingSegmentRef?.kind).toBe('video_ended');
  });
});

// ============================================================================
// Same-modality dispatch + latency + no-op defence
// ============================================================================

describe('dispatcher cross-cutting', () => {
  it('throws NoOpTransitionError when fromModality === toModality', async () => {
    const input = {
      session: makeSession({ modality: 'voice' }),
      toModality: 'voice' as const,
      correlationId: 'corr-noop',
    };

    await expect(executeModalityTransition(input)).rejects.toBeInstanceOf(NoOpTransitionError);

    expect(mockVoiceCreateSession).not.toHaveBeenCalled();
    expect(mockVoiceEndSession).not.toHaveBeenCalled();
    expect(mockEscalateToFullVideoRecording).not.toHaveBeenCalled();
    expect(mockRevertToAudioOnlyRecording).not.toHaveBeenCalled();
  });

  it('NoOpTransitionError carries the current modality and correlation id', async () => {
    const err = await executeModalityTransition({
      session: makeSession({ modality: 'text', providerSessionId: undefined }),
      toModality: 'text',
      correlationId: 'corr-noop-text',
    }).catch((e) => e);

    expect(err).toBeInstanceOf(NoOpTransitionError);
    expect((err as NoOpTransitionError).modality).toBe('text');
    expect((err as NoOpTransitionError).correlationId).toBe('corr-noop-text');
  });

  it('transitionLatencyMs is populated on a successful branch', async () => {
    const r = await executeModalityTransition({
      session: makeSession({ modality: 'voice' }),
      toModality: 'video',
      correlationId: 'corr-latency',
    });
    expect(r.transitionLatencyMs).toBeGreaterThanOrEqual(0);
    expect(r.transitionLatencyMs).toBeLessThan(5_000);
  });
});

// ============================================================================
// __testOnly__ helpers — surface coverage for label + reason mapping
// ============================================================================

describe('__testOnly__ helpers', () => {
  it('compositionLabel builds a consult_{session}_{kind}_{ISO} string', () => {
    const label = __testOnly__.compositionLabel(
      'session_abc',
      'video',
      new Date('2026-04-19T10:00:00.000Z'),
    );
    expect(label).toBe('consult_session_abc_video_2026-04-19T10:00:00.000Z');
  });

  it('revertReasonFromInitiator + revertInitiatedBy map correctly', () => {
    expect(__testOnly__.revertReasonFromInitiator('doctor')).toBe('doctor_paused');
    expect(__testOnly__.revertReasonFromInitiator('patient')).toBe('patient_revoked');
    expect(__testOnly__.revertReasonFromInitiator(undefined)).toBe('doctor_paused');

    expect(__testOnly__.revertInitiatedBy('doctor')).toBe('doctor');
    expect(__testOnly__.revertInitiatedBy('patient')).toBe('patient');
    expect(__testOnly__.revertInitiatedBy(undefined)).toBe('doctor');
  });
});
