/**
 * Consultation Room Service Unit Tests (e-task-2)
 *
 * Tests createTwilioRoom and generateVideoAccessToken.
 * Mocks Twilio SDK to avoid actual API calls.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  createTwilioRoom,
  generateVideoAccessToken,
  isTwilioVideoConfigured,
} from '../../../src/services/consultation-room-service';
import { ValidationError } from '../../../src/utils/errors';

const mockRoomCreate = jest.fn<
  (opts: { uniqueName: string; type: string }) => Promise<{ sid: string; uniqueName: string }>
>();
const mockTokenToJwt = jest.fn().mockReturnValue('mock-jwt-token');
const mockAddGrant = jest.fn();

jest.mock('twilio', () => {
  const tokenCtor = jest.fn().mockImplementation(() => ({
    addGrant: mockAddGrant,
    toJwt: mockTokenToJwt,
  }));
  (tokenCtor as unknown as { VideoGrant: unknown }).VideoGrant = class VideoGrant {
    constructor(_opts: unknown) {}
  };
  const clientFactory = (_sid: string, _token: string) => ({
    video: { v1: { rooms: { create: mockRoomCreate } } },
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

describe('Consultation Room Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoomCreate.mockResolvedValue({
      sid: 'RMabc123',
      uniqueName: 'appointment-uuid-1',
    });
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
      await expect(
        createTwilioRoom('', correlationId)
      ).rejects.toThrow(ValidationError);

      await expect(
        createTwilioRoom('   ', correlationId)
      ).rejects.toThrow(ValidationError);
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
      expect(() =>
        generateVideoAccessToken('', 'room1', correlationId)
      ).toThrow(ValidationError);

      expect(() =>
        generateVideoAccessToken('   ', 'room1', correlationId)
      ).toThrow(ValidationError);
    });

    it('throws ValidationError for empty room name', () => {
      expect(() =>
        generateVideoAccessToken('doctor-1', '', correlationId)
      ).toThrow(ValidationError);

      expect(() =>
        generateVideoAccessToken('doctor-1', '   ', correlationId)
      ).toThrow(ValidationError);
    });
  });
});

describe('isTwilioVideoConfigured', () => {
  it('returns true when all Twilio credentials are set', () => {
    expect(isTwilioVideoConfigured()).toBe(true);
  });
});
