/**
 * Voice Session Twilio Adapter Unit Tests (Plan 05 · Task 23)
 *
 * Asserts the contract of `voiceSessionTwilioAdapter`:
 *   1. Thin wrapper over `videoSessionTwilioAdapter` — `createSession`,
 *      `endSession`, `getJoinToken` each call the video adapter exactly
 *      once with the unmodified input.
 *   2. After a successful `createSession`, audio-only Recording Rules are
 *      applied via Twilio's `recordingRules.update()` with the exact
 *      shape the task file pins.
 *   3. A Recording Rules failure propagates as `InternalError`; the
 *      adapter does not swallow it.
 *   4. `endSession` survives a transcription-enqueue failure (logs +
 *      resolves; never throws — consult is already over).
 *   5. The persisted adapter fields are `modality: 'voice'` +
 *      `provider: 'twilio_video'` (the voice/video split lives on
 *      `consultation_sessions.modality`, not `provider`).
 *
 * The Twilio SDK is mocked at module boundary — the assertion on
 * `recordingRules.update` is anchored on the rule payload shape, not the
 * SDK call surface, so a future SDK version that exposes the same
 * capability differently is still caught.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { InternalError } from '../../../src/utils/errors';

// ---------------------------------------------------------------------------
// Mocks (must come before importing the unit under test)
// ---------------------------------------------------------------------------

const mockVideoCreateSession = jest.fn<
  (input: unknown, correlationId: string) => Promise<{ providerSessionId?: string }>
>();
const mockVideoEndSession = jest.fn<
  (providerSessionId: string, correlationId: string) => Promise<void>
>();
const mockVideoGetJoinToken = jest.fn<
  (input: unknown, correlationId: string) => Promise<{ token: string; expiresAt: Date }>
>();

jest.mock('../../../src/services/video-session-twilio', () => ({
  videoSessionTwilioAdapter: {
    modality: 'video',
    provider: 'twilio_video',
    createSession: (...args: [unknown, string]) => mockVideoCreateSession(...args),
    endSession: (...args: [string, string]) => mockVideoEndSession(...args),
    getJoinToken: (...args: [unknown, string]) => mockVideoGetJoinToken(...args),
  },
}));

const mockEnqueueVoiceTranscription = jest.fn<
  (input: { providerSessionId: string }) => Promise<void>
>();

jest.mock('../../../src/services/voice-transcription-service', () => ({
  enqueueVoiceTranscription: (
    ...args: [{ providerSessionId: string }]
  ) => mockEnqueueVoiceTranscription(...args),
}));

// Plan 06 · Task 37 — mock the system-emitter surface so the test can
// assert the voice adapter does NOT double-emit `party_joined`. The
// video adapter (mocked above) owns that banner per task-37 Notes #7;
// if the voice adapter ever grew its own direct emit call, this test
// would catch it.
const mockEmitPartyJoined = jest.fn<(sessionId: string, role: 'doctor' | 'patient') => Promise<void>>();

jest.mock('../../../src/services/consultation-message-service', () => ({
  emitPartyJoined: (...args: [string, 'doctor' | 'patient']) => mockEmitPartyJoined(...args),
}));

// Twilio SDK — only the rooms(sid).recordingRules.update path is
// exercised here. Anchor the assertion on the payload shape, not the SDK
// surface.
const mockRecordingRulesUpdate = jest.fn<
  (opts: { rules: Array<{ type: string; kind: string }> }) => Promise<unknown>
>();

jest.mock('twilio', () => {
  const clientFactory = (_sid: string, _token: string) => ({
    video: {
      v1: {
        rooms: (sid: string) => ({
          sid,
          recordingRules: { update: mockRecordingRulesUpdate },
        }),
      },
    },
  });
  return { __esModule: true, default: clientFactory };
});

jest.mock('../../../src/config/env', () => ({
  env: {
    TWILIO_ACCOUNT_SID: 'ACtest123',
    TWILIO_AUTH_TOKEN: 'test-auth-token',
    TWILIO_API_KEY_SID: 'SKtest456',
    TWILIO_API_KEY_SECRET: 'test-api-key-secret',
  },
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Imported after the mocks are registered.
import {
  applyAudioOnlyRecordingRules,
  voiceSessionTwilioAdapter,
} from '../../../src/services/voice-session-twilio';

const correlationId = 'corr-voice-001';

const baseCreateInput = {
  appointmentId: 'apt-voice-1',
  doctorId: 'doc-1',
  patientId: 'pat-1',
  modality: 'voice' as const,
  scheduledStartAt: new Date('2026-04-19T10:00:00.000Z'),
  expectedEndAt: new Date('2026-04-19T10:30:00.000Z'),
};

describe('voiceSessionTwilioAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVideoCreateSession.mockResolvedValue({ providerSessionId: 'RM_voice_abc' });
    mockVideoEndSession.mockResolvedValue();
    mockVideoGetJoinToken.mockResolvedValue({
      token: 'mock-jwt-token',
      expiresAt: new Date('2026-04-19T14:00:00.000Z'),
    });
    mockEnqueueVoiceTranscription.mockResolvedValue();
    mockRecordingRulesUpdate.mockResolvedValue({ type: 'recording-rules-updated' });
  });

  describe('adapter metadata', () => {
    it('declares modality=voice and provider=twilio_video', () => {
      // Decision 8 LOCKED: voice and video share the provider value
      // ("twilio_video") because `provider` answers "which backend
      // service-of-record?", not "which modality?". The voice/video
      // distinction is on `consultation_sessions.modality`.
      expect(voiceSessionTwilioAdapter.modality).toBe('voice');
      expect(voiceSessionTwilioAdapter.provider).toBe('twilio_video');
    });
  });

  describe('createSession', () => {
    it('delegates to the video adapter with unmodified input and applies audio-only Recording Rules', async () => {
      const result = await voiceSessionTwilioAdapter.createSession(
        baseCreateInput,
        correlationId
      );

      expect(mockVideoCreateSession).toHaveBeenCalledTimes(1);
      expect(mockVideoCreateSession).toHaveBeenCalledWith(
        baseCreateInput,
        correlationId
      );

      // Rule shape anchored on the payload, not the SDK surface. A future
      // Twilio SDK that exposes recording rules differently is still
      // forced to match this shape.
      expect(mockRecordingRulesUpdate).toHaveBeenCalledTimes(1);
      expect(mockRecordingRulesUpdate).toHaveBeenCalledWith({
        rules: [
          { type: 'include', kind: 'audio' },
          { type: 'exclude', kind: 'video' },
        ],
      });

      expect(result).toEqual({ providerSessionId: 'RM_voice_abc' });
    });

    it('propagates recording-rule failure as InternalError (no swallow)', async () => {
      mockRecordingRulesUpdate.mockRejectedValueOnce(
        new Error('Twilio 20429 rate limit')
      );

      await expect(
        voiceSessionTwilioAdapter.createSession(baseCreateInput, correlationId)
      ).rejects.toThrow(InternalError);

      // The video adapter still ran — the failure was on the post-create
      // rules update. This pins that the voice adapter does NOT silently
      // return a "successful" session when the rules update is dropped.
      expect(mockVideoCreateSession).toHaveBeenCalledTimes(1);
      expect(mockRecordingRulesUpdate).toHaveBeenCalledTimes(1);
    });

    it('refuses when the video adapter returns no providerSessionId', async () => {
      // Defensive guard — the video adapter's documented contract is to
      // throw on failure, but if the shape ever slips to "resolved but
      // empty", we fail loudly rather than silently skip Recording Rules.
      mockVideoCreateSession.mockResolvedValueOnce({});

      await expect(
        voiceSessionTwilioAdapter.createSession(baseCreateInput, correlationId)
      ).rejects.toThrow(InternalError);

      expect(mockRecordingRulesUpdate).not.toHaveBeenCalled();
    });
  });

  describe('endSession', () => {
    it('defers to video adapter then enqueues transcription', async () => {
      await voiceSessionTwilioAdapter.endSession('RM_voice_abc', correlationId);

      expect(mockVideoEndSession).toHaveBeenCalledTimes(1);
      expect(mockVideoEndSession).toHaveBeenCalledWith('RM_voice_abc', correlationId);

      expect(mockEnqueueVoiceTranscription).toHaveBeenCalledTimes(1);
      expect(mockEnqueueVoiceTranscription).toHaveBeenCalledWith({
        providerSessionId: 'RM_voice_abc',
      });
    });

    it('survives transcription-enqueue failure without throwing', async () => {
      // The consult is already over when endSession runs; transcription
      // is best-effort. A queue outage must not surface as a failed
      // "end session" to the controller layer.
      mockEnqueueVoiceTranscription.mockRejectedValueOnce(
        new Error('queue unavailable')
      );

      await expect(
        voiceSessionTwilioAdapter.endSession('RM_voice_abc', correlationId)
      ).resolves.toBeUndefined();

      expect(mockVideoEndSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('getJoinToken', () => {
    it('defers entirely to the video adapter', async () => {
      const input = {
        appointmentId: 'apt-voice-1',
        doctorId: 'doc-1',
        role: 'doctor' as const,
        providerSessionId: 'RM_voice_abc',
        sessionId: 'sess-uuid-1',
      };

      const token = await voiceSessionTwilioAdapter.getJoinToken(input, correlationId);

      expect(mockVideoGetJoinToken).toHaveBeenCalledTimes(1);
      expect(mockVideoGetJoinToken).toHaveBeenCalledWith(input, correlationId);
      expect(token.token).toBe('mock-jwt-token');
      // Audio-only is enforced client-side + at Recording Rules; the
      // token itself carries identical grants to the video token.
    });

    // Plan 06 · Task 37 Notes #7 — no-double-banner contract.
    it('does NOT call emitPartyJoined directly — the video adapter owns that banner', async () => {
      await voiceSessionTwilioAdapter.getJoinToken(
        {
          appointmentId: 'apt-voice-1',
          doctorId: 'doc-1',
          role: 'doctor',
          providerSessionId: 'RM_voice_abc',
          sessionId: 'sess-uuid-1',
        },
        correlationId
      );

      // The video adapter is fully mocked in this suite, so the only
      // way `emitPartyJoined` could be called is if the voice adapter's
      // own code path invoked it. If that regression ever lands, this
      // assertion flips and we catch it in CI.
      expect(mockEmitPartyJoined).not.toHaveBeenCalled();
    });
  });
});

describe('applyAudioOnlyRecordingRules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordingRulesUpdate.mockResolvedValue({ type: 'recording-rules-updated' });
  });

  it('calls Twilio with the exact rule shape', async () => {
    await applyAudioOnlyRecordingRules('RM_xyz', correlationId);

    expect(mockRecordingRulesUpdate).toHaveBeenCalledWith({
      rules: [
        { type: 'include', kind: 'audio' },
        { type: 'exclude', kind: 'video' },
      ],
    });
  });

  it('throws InternalError when roomSid is empty', async () => {
    await expect(applyAudioOnlyRecordingRules('', correlationId)).rejects.toThrow(
      InternalError
    );
    await expect(applyAudioOnlyRecordingRules('   ', correlationId)).rejects.toThrow(
      InternalError
    );
    expect(mockRecordingRulesUpdate).not.toHaveBeenCalled();
  });

  it('wraps Twilio errors in InternalError', async () => {
    mockRecordingRulesUpdate.mockRejectedValueOnce(new Error('20404 not found'));
    await expect(
      applyAudioOnlyRecordingRules('RM_missing', correlationId)
    ).rejects.toThrow(InternalError);
  });
});
