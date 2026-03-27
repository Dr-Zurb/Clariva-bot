/**
 * Consultation Verification Service Unit Tests (e-task-3, e-task-4)
 *
 * Tests handleParticipantConnected, handleParticipantDisconnected, tryMarkVerified, handleTwilioStatusCallback.
 */
// @ts-nocheck - Jest mock types cause strict inference issues
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  handleParticipantConnected,
  handleParticipantDisconnected,
  tryMarkVerified,
  handleTwilioStatusCallback,
} from '../../../src/services/consultation-verification-service';

const mockFrom = jest.fn();

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => ({ from: mockFrom }),
}));

jest.mock('../../../src/config/env', () => ({
  env: { MIN_VERIFIED_CONSULTATION_SECONDS: 60 },
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

jest.mock('../../../src/services/payout-service', () => ({
  processPayoutForPayment: jest.fn().mockResolvedValue({ success: false }),
}));

jest.mock('../../../src/services/care-episode-service', () => ({
  syncCareEpisodeLifecycleOnAppointmentCompleted: jest.fn().mockResolvedValue(undefined),
}));

const correlationId = 'corr-123';

/**
 * Creates a chain that supports:
 * - appointments: select->eq->single, update
 * - payments: select->eq->eq->or->order->limit->maybeSingle
 * - doctor_settings: select->eq->maybeSingle
 * Payments/doctor_settings return { data: null } so payout trigger exits early.
 */
function createTryMarkVerifiedChain(apt: Record<string, unknown>, disableUpdate = false) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  const limit = jest.fn().mockReturnValue({ maybeSingle });
  const order = jest.fn().mockReturnValue({ limit });
  const or = jest.fn().mockReturnValue({ order });
  const eq2 = jest.fn().mockReturnValue({ or });
  const eqWithSingle = jest.fn().mockReturnValue({
    eq: eq2,
    single: jest.fn().mockResolvedValue({ data: apt, error: null }),
    maybeSingle,
  });
  const mockUpdate = disableUpdate
    ? jest.fn()
    : jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                ...apt,
                status: 'completed',
                verified_at: apt.consultation_ended_at,
              },
              error: null,
            }),
          }),
        }),
      });
  return {
    select: jest.fn().mockReturnValue({ eq: eqWithSingle }),
    update: mockUpdate,
    eq: eqWithSingle,
  };
}

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

  describe('handleParticipantDisconnected', () => {
    it('sets doctor_left_at when doctor disconnects', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_left_at: null,
        patient_left_at: null,
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

      await handleParticipantDisconnected(
        {
          RoomSid: 'RM123',
          ParticipantIdentity: 'doctor-doc-1',
          Timestamp: '2026-03-21T12:35:00.000Z',
          StatusCallbackEvent: 'participant-disconnected',
        },
        correlationId
      );

      expect(chain.update).toHaveBeenCalledWith({ doctor_left_at: '2026-03-21T12:35:00.000Z' });
    });

    it('sets patient_left_at when patient disconnects', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_left_at: null,
        patient_left_at: null,
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

      await handleParticipantDisconnected(
        {
          RoomSid: 'RM123',
          ParticipantIdentity: 'patient-apt-1',
          Timestamp: '2026-03-21T12:36:00.000Z',
          StatusCallbackEvent: 'participant-disconnected',
        },
        correlationId
      );

      expect(chain.update).toHaveBeenCalledWith({ patient_left_at: '2026-03-21T12:36:00.000Z' });
    });

    it('does not update doctor_left_at if already set', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_left_at: '2026-03-21T12:34:00.000Z',
        patient_left_at: null,
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

      await handleParticipantDisconnected(
        {
          RoomSid: 'RM123',
          ParticipantIdentity: 'doctor-doc-1',
          Timestamp: '2026-03-21T12:35:00.000Z',
          StatusCallbackEvent: 'participant-disconnected',
        },
        correlationId
      );

      expect(chain.update).not.toHaveBeenCalled();
    });
  });

  describe('tryMarkVerified', () => {
    it('verifies on patient no-show (doctor joined, patient never joined)', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_joined_at: '2026-03-21T12:00:00.000Z',
        patient_joined_at: null,
        doctor_left_at: null,
        patient_left_at: null,
        consultation_ended_at: '2026-03-21T12:35:00.000Z',
        consultation_duration_seconds: 2100,
        verified_at: null,
        status: 'confirmed',
      };
      const chain = createTryMarkVerifiedChain(apt);
      mockFrom.mockReturnValue(chain);

      await tryMarkVerified('apt-1', correlationId);

      expect(chain.update).toHaveBeenCalledWith({
        verified_at: '2026-03-21T12:35:00.000Z',
        status: 'completed',
      });
    });

    it('verifies when patient left first', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_joined_at: '2026-03-21T12:00:00.000Z',
        patient_joined_at: '2026-03-21T12:01:00.000Z',
        doctor_left_at: '2026-03-21T12:35:00.000Z',
        patient_left_at: '2026-03-21T12:30:00.000Z',
        consultation_ended_at: '2026-03-21T12:35:00.000Z',
        consultation_duration_seconds: 2040,
        verified_at: null,
        status: 'confirmed',
      };
      const chain = createTryMarkVerifiedChain(apt);
      mockFrom.mockReturnValue(chain);

      await tryMarkVerified('apt-1', correlationId);

      expect(chain.update).toHaveBeenCalledWith({
        verified_at: '2026-03-21T12:35:00.000Z',
        status: 'completed',
      });
    });

    it('verifies when doctor left first but overlap >= 60s', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_joined_at: '2026-03-21T12:00:00.000Z',
        patient_joined_at: '2026-03-21T12:01:00.000Z',
        doctor_left_at: '2026-03-21T12:02:00.000Z',
        patient_left_at: '2026-03-21T12:35:00.000Z',
        consultation_ended_at: '2026-03-21T12:35:00.000Z',
        consultation_duration_seconds: 2040,
        verified_at: null,
        status: 'confirmed',
      };
      const chain = createTryMarkVerifiedChain(apt);
      mockFrom.mockReturnValue(chain);

      await tryMarkVerified('apt-1', correlationId);

      expect(chain.update).toHaveBeenCalledWith({
        verified_at: '2026-03-21T12:35:00.000Z',
        status: 'completed',
      });
    });

    it('does not verify when doctor left first and overlap < 60s', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_joined_at: '2026-03-21T12:00:00.000Z',
        patient_joined_at: '2026-03-21T12:01:00.000Z',
        doctor_left_at: '2026-03-21T12:01:45.000Z',
        patient_left_at: '2026-03-21T12:35:00.000Z',
        consultation_ended_at: '2026-03-21T12:35:00.000Z',
        consultation_duration_seconds: 2040,
        verified_at: null,
        status: 'confirmed',
      };
      const chain = createTryMarkVerifiedChain(apt, true);
      mockFrom.mockReturnValue(chain);

      await tryMarkVerified('apt-1', correlationId);

      expect(chain.update).not.toHaveBeenCalled();
    });

    it('verifies on fallback when left_at missing but duration >= 60 and both joined', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_joined_at: '2026-03-21T12:00:00.000Z',
        patient_joined_at: '2026-03-21T12:01:00.000Z',
        doctor_left_at: null,
        patient_left_at: null,
        consultation_ended_at: '2026-03-21T12:35:00.000Z',
        consultation_duration_seconds: 2040,
        verified_at: null,
        status: 'confirmed',
      };
      const chain = createTryMarkVerifiedChain(apt);
      mockFrom.mockReturnValue(chain);

      await tryMarkVerified('apt-1', correlationId);

      expect(chain.update).toHaveBeenCalledWith({
        verified_at: '2026-03-21T12:35:00.000Z',
        status: 'completed',
      });
    });

    it('does not update when fallback duration below threshold', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_joined_at: '2026-03-21T12:00:00.000Z',
        patient_joined_at: '2026-03-21T12:01:00.000Z',
        doctor_left_at: null,
        patient_left_at: null,
        consultation_ended_at: '2026-03-21T12:02:00.000Z',
        consultation_duration_seconds: 30,
        verified_at: null,
        status: 'confirmed',
      };
      const chain = createTryMarkVerifiedChain(apt, true);
      mockFrom.mockReturnValue(chain);

      await tryMarkVerified('apt-1', correlationId);

      expect(chain.update).not.toHaveBeenCalled();
    });

    it('does not update when already verified', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_joined_at: '2026-03-21T12:00:00.000Z',
        patient_joined_at: '2026-03-21T12:01:00.000Z',
        consultation_ended_at: '2026-03-21T12:35:00.000Z',
        consultation_duration_seconds: 2040,
        verified_at: '2026-03-21T12:35:00.000Z',
        status: 'completed',
      };
      const chain = createTryMarkVerifiedChain(apt, true);
      mockFrom.mockReturnValue(chain);

      await tryMarkVerified('apt-1', correlationId);

      expect(chain.update).not.toHaveBeenCalled();
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

    it('routes participant-disconnected to handleParticipantDisconnected', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_left_at: null,
        patient_left_at: null,
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
          StatusCallbackEvent: 'participant-disconnected',
          ParticipantIdentity: 'doctor-doc-1',
          Timestamp: '2026-03-21T12:35:00.000Z',
        },
        correlationId
      );

      expect(chain.update).toHaveBeenCalledWith({ doctor_left_at: '2026-03-21T12:35:00.000Z' });
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
