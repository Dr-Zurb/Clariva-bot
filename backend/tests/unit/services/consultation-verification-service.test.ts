/**
 * Consultation Verification Service Unit Tests (e-task-4)
 *
 * Tests handleParticipantConnected, handleRoomEnded, tryMarkVerified.
 */
// @ts-nocheck - Jest mock types cause strict inference issues
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  handleParticipantConnected,
  tryMarkVerified,
  handleTwilioStatusCallback,
} from '../../../src/services/consultation-verification-service';

const mockFrom = jest.fn();

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => ({ from: mockFrom }),
}));

jest.mock('../../../src/config/env', () => ({
  env: { MIN_VERIFIED_CONSULTATION_SECONDS: 120 },
}));

jest.mock('../../../src/utils/db-helpers', () => ({
  handleSupabaseError: jest.fn((err: unknown) => {
    throw err;
  }),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataModification: jest.fn().mockResolvedValue(undefined),
}));

const correlationId = 'corr-123';

describe('Consultation Verification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
    });
  });

  describe('handleParticipantConnected', () => {
    it('sets doctor_joined_at when doctor connects', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_joined_at: null,
        patient_joined_at: null,
      };
      const chain = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({ data: [apt], error: null }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      };
      mockFrom.mockReturnValue(chain);

      await handleParticipantConnected(
        {
          RoomSid: 'RM123',
          ParticipantIdentity: 'doctor-doc-1',
          Timestamp: '2026-03-21T12:00:00.000Z',
          StatusCallbackEvent: 'participant-connected',
        },
        correlationId
      );

      expect(chain.update).toHaveBeenCalledWith({ doctor_joined_at: '2026-03-21T12:00:00.000Z' });
    });

    it('sets patient_joined_at when patient connects', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_joined_at: '2026-03-21T12:00:00.000Z',
        patient_joined_at: null,
      };
      const chain = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({ data: [apt], error: null }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      };
      mockFrom.mockReturnValue(chain);

      await handleParticipantConnected(
        {
          RoomSid: 'RM123',
          ParticipantIdentity: 'patient-apt-1',
          Timestamp: '2026-03-21T12:01:00.000Z',
          StatusCallbackEvent: 'participant-connected',
        },
        correlationId
      );

      expect(chain.update).toHaveBeenCalledWith({ patient_joined_at: '2026-03-21T12:01:00.000Z' });
    });

    it('does not update if doctor_joined_at already set', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_joined_at: '2026-03-21T11:59:00.000Z',
        patient_joined_at: null,
      };
      const chain = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({ data: [apt], error: null }),
          }),
        }),
        update: jest.fn(),
      };
      mockFrom.mockReturnValue(chain);

      await handleParticipantConnected(
        {
          RoomSid: 'RM123',
          ParticipantIdentity: 'doctor-doc-1',
          Timestamp: '2026-03-21T12:00:00.000Z',
          StatusCallbackEvent: 'participant-connected',
        },
        correlationId
      );

      expect(chain.update).not.toHaveBeenCalled();
    });
  });

  describe('tryMarkVerified', () => {
    it('sets verified_at and status=completed when all conditions met', async () => {
      const apt = {
        id: 'apt-1',
        doctor_joined_at: '2026-03-21T12:00:00.000Z',
        patient_joined_at: '2026-03-21T12:01:00.000Z',
        consultation_ended_at: '2026-03-21T12:35:00.000Z',
        consultation_duration_seconds: 2040,
        verified_at: null,
        status: 'confirmed',
      };
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });
      const chain = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: apt, error: null }),
          }),
        }),
        update: mockUpdate,
      };
      mockFrom.mockReturnValue(chain);

      await tryMarkVerified('apt-1', correlationId);

      expect(mockUpdate).toHaveBeenCalledWith({
        verified_at: '2026-03-21T12:35:00.000Z',
        status: 'completed',
      });
    });

    it('does not update when duration below threshold', async () => {
      const apt = {
        id: 'apt-1',
        doctor_joined_at: '2026-03-21T12:00:00.000Z',
        patient_joined_at: '2026-03-21T12:01:00.000Z',
        consultation_ended_at: '2026-03-21T12:02:00.000Z',
        consultation_duration_seconds: 60,
        verified_at: null,
        status: 'confirmed',
      };
      const mockUpdate = jest.fn();
      const chain = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: apt, error: null }),
          }),
        }),
        update: mockUpdate,
      };
      mockFrom.mockReturnValue(chain);

      await tryMarkVerified('apt-1', correlationId);

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('does not update when already verified', async () => {
      const apt = {
        id: 'apt-1',
        doctor_joined_at: '2026-03-21T12:00:00.000Z',
        patient_joined_at: '2026-03-21T12:01:00.000Z',
        consultation_ended_at: '2026-03-21T12:35:00.000Z',
        consultation_duration_seconds: 2040,
        verified_at: '2026-03-21T12:35:00.000Z',
        status: 'completed',
      };
      const mockUpdate = jest.fn();
      const chain = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: apt, error: null }),
          }),
        }),
        update: mockUpdate,
      };
      mockFrom.mockReturnValue(chain);

      await tryMarkVerified('apt-1', correlationId);

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('handleTwilioStatusCallback', () => {
    it('routes participant-connected to handleParticipantConnected', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_joined_at: null,
        patient_joined_at: null,
      };
      const chain = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({ data: [apt], error: null }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      };
      mockFrom.mockReturnValue(chain);

      await handleTwilioStatusCallback(
        {
          RoomSid: 'RM123',
          StatusCallbackEvent: 'participant-connected',
          ParticipantIdentity: 'doctor-doc-1',
          Timestamp: '2026-03-21T12:00:00.000Z',
        },
        correlationId
      );

      expect(chain.update).toHaveBeenCalled();
    });

    it('ignores unknown events', async () => {
      const chain = {
        select: jest.fn(),
        update: jest.fn(),
      };
      mockFrom.mockReturnValue(chain);

      await handleTwilioStatusCallback(
        {
          RoomSid: 'RM123',
          StatusCallbackEvent: 'room-created',
        },
        correlationId
      );

      expect(chain.select).not.toHaveBeenCalled();
      expect(chain.update).not.toHaveBeenCalled();
    });
  });
});
