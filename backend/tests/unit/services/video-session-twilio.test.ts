/**
 * Video Session Twilio Adapter Unit Tests (Plan 01 · Task 15)
 *
 * Renamed from consultation-room-service.test.ts. Tests the Twilio Video
 * primitives (createTwilioRoom + generateVideoAccessToken + completeTwilioRoom)
 * and the `videoSessionTwilioAdapter` object that satisfies
 * `ConsultationSessionAdapter`.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  createTwilioRoom,
  generateVideoAccessToken,
  isTwilioVideoConfigured,
  videoSessionTwilioAdapter,
} from '../../../src/services/video-session-twilio';
import { ValidationError } from '../../../src/utils/errors';

const mockRoomCreate = jest.fn<
  (opts: { uniqueName: string; type: string }) => Promise<{ sid: string; uniqueName: string }>
>();
const mockRoomComplete = jest.fn<
  (opts: { status: string }) => Promise<{ sid: string; status: string }>
>();
const mockTokenToJwt = jest.fn().mockReturnValue('mock-jwt-token');
const mockAddGrant = jest.fn();

// Plan 06 · Task 37: the adapter's `getJoinToken` now fires an
// `emitPartyJoined` banner (covers both video AND voice — the voice
// adapter delegates here). Mock the helper at the module boundary so
// these tests assert the call without touching the writer chain.
const mockEmitPartyJoined = jest.fn<(sessionId: string, role: 'doctor' | 'patient') => Promise<void>>();

jest.mock('../../../src/services/consultation-message-service', () => ({
  emitPartyJoined: (...args: [string, 'doctor' | 'patient']) => mockEmitPartyJoined(...args),
}));

jest.mock('twilio', () => {
  const tokenCtor = jest.fn().mockImplementation(() => ({
    addGrant: mockAddGrant,
    toJwt: mockTokenToJwt,
  }));
  (tokenCtor as unknown as { VideoGrant: unknown }).VideoGrant = class VideoGrant {
    constructor(_opts: unknown) {}
  };
  const clientFactory = (_sid: string, _token: string) => ({
    video: {
      v1: {
        rooms: Object.assign(
          (sid: string) => ({
            update: (opts: { status: string }) => mockRoomComplete(opts),
            sid,
          }),
          { create: mockRoomCreate }
        ),
      },
    },
  });
  clientFactory.jwt = { AccessToken: tokenCtor };
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

const correlationId = 'corr-123';

describe('Video Session Twilio Adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoomCreate.mockResolvedValue({
      sid: 'RMabc123',
      uniqueName: 'appointment-uuid-1',
    });
    mockRoomComplete.mockResolvedValue({ sid: 'RMabc123', status: 'completed' });
  });

  describe('createTwilioRoom', () => {
    it('creates room and returns roomSid and roomName', async () => {
      const result = await createTwilioRoom('appointment-uuid-1', correlationId);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        roomSid: 'RMabc123',
        roomName: 'appointment-uuid-1',
      });
      expect(mockRoomCreate).toHaveBeenCalledWith({
        uniqueName: 'appointment-uuid-1',
        type: 'group',
      });
    });

    it('throws ValidationError for empty room name', async () => {
      await expect(createTwilioRoom('', correlationId)).rejects.toThrow(ValidationError);
      await expect(createTwilioRoom('   ', correlationId)).rejects.toThrow(ValidationError);
    });
  });

  describe('generateVideoAccessToken', () => {
    it('returns JWT string for valid identity and room', () => {
      const token = generateVideoAccessToken(
        'doctor-doctorId123',
        'appointment-uuid-1',
        correlationId
      );

      expect(token).toBe('mock-jwt-token');
      expect(mockAddGrant).toHaveBeenCalled();
      expect(mockTokenToJwt).toHaveBeenCalled();
    });

    it('throws ValidationError for empty identity', () => {
      expect(() => generateVideoAccessToken('', 'room1', correlationId)).toThrow(ValidationError);
      expect(() => generateVideoAccessToken('   ', 'room1', correlationId)).toThrow(ValidationError);
    });

    it('throws ValidationError for empty room name', () => {
      expect(() => generateVideoAccessToken('doctor-1', '', correlationId)).toThrow(ValidationError);
      expect(() => generateVideoAccessToken('doctor-1', '   ', correlationId)).toThrow(ValidationError);
    });
  });
});

describe('isTwilioVideoConfigured', () => {
  it('returns true when all Twilio credentials are set', () => {
    expect(isTwilioVideoConfigured()).toBe(true);
  });
});

describe('videoSessionTwilioAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoomCreate.mockResolvedValue({
      sid: 'RMabc123',
      uniqueName: 'appointment-uuid-1',
    });
    mockRoomComplete.mockResolvedValue({ sid: 'RMabc123', status: 'completed' });
  });

  it('declares modality=video and provider=twilio_video', () => {
    expect(videoSessionTwilioAdapter.modality).toBe('video');
    expect(videoSessionTwilioAdapter.provider).toBe('twilio_video');
  });

  it('createSession provisions a room and returns providerSessionId', async () => {
    const result = await videoSessionTwilioAdapter.createSession(
      {
        appointmentId: 'apt-1',
        doctorId: 'doc-1',
        patientId: 'pat-1',
        modality: 'video',
        scheduledStartAt: new Date('2026-04-19T10:00:00Z'),
        expectedEndAt: new Date('2026-04-19T10:30:00Z'),
      },
      correlationId
    );

    expect(result.providerSessionId).toBe('RMabc123');
    expect(mockRoomCreate).toHaveBeenCalledWith({
      uniqueName: 'appointment-apt-1',
      type: 'group',
    });
  });

  it('getJoinToken builds doctor identity correctly', async () => {
    const token = await videoSessionTwilioAdapter.getJoinToken(
      {
        appointmentId: 'apt-1',
        doctorId: 'doc-1',
        role: 'doctor',
      },
      correlationId
    );

    expect(token.token).toBe('mock-jwt-token');
    expect(token.expiresAt).toBeInstanceOf(Date);
  });

  it('getJoinToken builds patient identity correctly', async () => {
    const token = await videoSessionTwilioAdapter.getJoinToken(
      {
        appointmentId: 'apt-1',
        doctorId: 'doc-1',
        role: 'patient',
      },
      correlationId
    );

    expect(token.token).toBe('mock-jwt-token');
  });

  it('endSession calls Twilio room.update with status=completed', async () => {
    await videoSessionTwilioAdapter.endSession('RMabc123', correlationId);
    expect(mockRoomComplete).toHaveBeenCalledWith({ status: 'completed' });
  });

  it('endSession swallows 20404 (already completed)', async () => {
    mockRoomComplete.mockRejectedValueOnce(new Error('Twilio error 20404 not found'));
    await expect(
      videoSessionTwilioAdapter.endSession('RMabc123', correlationId)
    ).resolves.toBeUndefined();
  });

  // Plan 06 · Task 37 — emitPartyJoined wire-up on getJoinToken.
  describe('getJoinToken emitPartyJoined wire-up', () => {
    it('fires emitPartyJoined(doctor) when sessionId is supplied', async () => {
      await videoSessionTwilioAdapter.getJoinToken(
        {
          appointmentId: 'apt-1',
          doctorId: 'doc-1',
          role: 'doctor',
          sessionId: 'sess-1',
        },
        correlationId
      );
      expect(mockEmitPartyJoined).toHaveBeenCalledTimes(1);
      expect(mockEmitPartyJoined).toHaveBeenCalledWith('sess-1', 'doctor');
    });

    it('fires emitPartyJoined(patient) when sessionId is supplied', async () => {
      await videoSessionTwilioAdapter.getJoinToken(
        {
          appointmentId: 'apt-1',
          doctorId: 'doc-1',
          role: 'patient',
          sessionId: 'sess-1',
        },
        correlationId
      );
      expect(mockEmitPartyJoined).toHaveBeenCalledTimes(1);
      expect(mockEmitPartyJoined).toHaveBeenCalledWith('sess-1', 'patient');
    });

    it('does NOT emit when sessionId is absent (legacy lazy-write path)', async () => {
      await videoSessionTwilioAdapter.getJoinToken(
        {
          appointmentId: 'apt-1',
          doctorId: 'doc-1',
          role: 'doctor',
        },
        correlationId
      );
      expect(mockEmitPartyJoined).not.toHaveBeenCalled();
    });
  });
});
