/**
 * Consultation Verification Service Unit Tests (e-task-3, e-task-4, Task 35)
 *
 * Tests handleParticipantConnected, handleParticipantDisconnected,
 * tryMarkVerified, handleTwilioStatusCallback.
 *
 * Post-Task-35: the webhook's RoomSid → appointment lookup path goes
 * through `findSessionByProviderSessionId`, and the room-ended timestamp
 * lives on `consultation_sessions.actual_ended_at`. This test file mocks
 * the consultation-session-service facade so the tests stay table-mock
 * focused and aren't coupled to the session-row persistence path.
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

jest.mock('../../../src/services/opd/opd-queue-service', () => ({
  syncOpdQueueEntryOnAppointmentStatus: jest.fn().mockResolvedValue(undefined),
}));

/**
 * Task 35: the webhook's RoomSid → appointment lookup goes through the
 * consultation-session-service facade. Each test pre-sets what
 * `findSessionByProviderSessionId` should return. The default stub ties
 * any RoomSid to appointment `apt-1` / session `sess-1`.
 */
const findSessionByProviderSessionId = jest.fn();
const markParticipantJoined = jest.fn().mockResolvedValue(undefined);
const updateSessionStatus = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionByProviderSessionId: (...args: unknown[]) =>
    findSessionByProviderSessionId(...args),
  markParticipantJoined: (...args: unknown[]) => markParticipantJoined(...args),
  updateSessionStatus: (...args: unknown[]) => updateSessionStatus(...args),
}));

const correlationId = 'corr-123';

/**
 * Build the default `appointments`-chain mock used by the webhook handlers.
 * The shape matches what `.from('appointments').select(...).eq(...).limit(...)`
 * resolves to for the participant-connected / -disconnected paths.
 */
function appointmentsLookupChain(apt: Record<string, unknown> | null) {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: apt ? [apt] : [], error: null }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
  };
}

/**
 * Build the full query router used by the handler + tryMarkVerified tests.
 *
 * Routes by table name:
 *   - `appointments`   → participant-connected/disconnected chain OR tryMarkVerified chain (depending on method: `.single()` / `.limit()`).
 *   - `consultation_sessions` → returns the pre-set `actual_ended_at` for `tryMarkVerified`'s post-fetch.
 *   - `payments`       → `null` so the per-appointment payout skips.
 *   - `doctor_settings`→ `null` so payout schedule is the default ('weekly').
 */
function buildRouter(opts: {
  apt: Record<string, unknown> | null;
  actualEndedAt?: string | null;
  disableUpdate?: boolean;
  updatedApt?: Record<string, unknown>;
}) {
  const aptSingleChain = () => {
    const maybeSingleNull = jest.fn().mockResolvedValue({ data: null, error: null });
    const limitNull = jest.fn().mockReturnValue({ maybeSingle: maybeSingleNull });
    const orderNull = jest.fn().mockReturnValue({ limit: limitNull });
    const orForPayments = jest.fn().mockReturnValue({ order: orderNull });
    const eqForPaymentsStatus = jest.fn().mockReturnValue({ or: orForPayments });
    const eqWithSingle = jest.fn().mockReturnValue({
      eq: eqForPaymentsStatus,
      single: jest.fn().mockResolvedValue({ data: opts.apt, error: null }),
      maybeSingle: maybeSingleNull,
      limit: jest.fn().mockResolvedValue({ data: opts.apt ? [opts.apt] : [], error: null }),
    });
    const updateChain = opts.disableUpdate
      ? jest.fn()
      : jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data:
                  opts.updatedApt ?? {
                    ...opts.apt,
                    status: 'completed',
                    verified_at: opts.actualEndedAt ?? null,
                  },
                error: null,
              }),
            }),
          }),
        });
    return {
      select: jest.fn().mockReturnValue({ eq: eqWithSingle }),
      update: updateChain,
      eq: eqWithSingle,
    };
  };

  const sessionEndedChain = () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: opts.actualEndedAt === null || opts.actualEndedAt === undefined
        ? null
        : { actual_ended_at: opts.actualEndedAt },
      error: null,
    });
    const limit = jest.fn().mockReturnValue({ maybeSingle });
    const order = jest.fn().mockReturnValue({ limit });
    const not = jest.fn().mockReturnValue({ order });
    const eq = jest.fn().mockReturnValue({ not });
    return {
      select: jest.fn().mockReturnValue({ eq }),
    };
  };

  const paymentsAndSettingsChain = () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const limit = jest.fn().mockReturnValue({ maybeSingle });
    const order = jest.fn().mockReturnValue({ limit });
    const or = jest.fn().mockReturnValue({ order });
    const eq2 = jest.fn().mockReturnValue({ or, maybeSingle });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2, maybeSingle });
    return {
      select: jest.fn().mockReturnValue({ eq: eq1 }),
    };
  };

  const appointmentsChain = aptSingleChain();

  mockFrom.mockImplementation((table: string) => {
    if (table === 'appointments') return appointmentsChain;
    if (table === 'consultation_sessions') return sessionEndedChain();
    if (table === 'payments' || table === 'doctor_settings') return paymentsAndSettingsChain();
    return appointmentsLookupChain(null);
  });

  return appointmentsChain;
}

describe('Consultation Verification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findSessionByProviderSessionId.mockResolvedValue({
      id: 'sess-1',
      appointmentId: 'apt-1',
      doctorId: 'doc-1',
      patientId: null,
      modality: 'video',
      status: 'scheduled',
      provider: 'twilio_video',
      providerSessionId: 'RM123',
      scheduledStartAt: new Date('2026-03-21T12:00:00.000Z'),
      expectedEndAt: new Date('2026-03-21T12:30:00.000Z'),
    });
    mockFrom.mockReturnValue(appointmentsLookupChain(null));
  });

  describe('handleParticipantConnected', () => {
    it('sets doctor_joined_at when doctor connects', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_joined_at: null,
        patient_joined_at: null,
      };
      const chain = appointmentsLookupChain(apt);
      mockFrom.mockImplementation((table: string) =>
        table === 'appointments' ? chain : appointmentsLookupChain(null)
      );

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
      expect(markParticipantJoined).toHaveBeenCalledWith(
        'sess-1',
        'doctor',
        new Date('2026-03-21T12:00:00.000Z')
      );
    });

    it('sets patient_joined_at when patient connects', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_joined_at: '2026-03-21T12:00:00.000Z',
        patient_joined_at: null,
      };
      const chain = appointmentsLookupChain(apt);
      mockFrom.mockImplementation((table: string) =>
        table === 'appointments' ? chain : appointmentsLookupChain(null)
      );

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
      const chain = appointmentsLookupChain(apt);
      chain.update = jest.fn();
      mockFrom.mockImplementation((table: string) =>
        table === 'appointments' ? chain : appointmentsLookupChain(null)
      );

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

    it('exits early when no consultation_session exists for the RoomSid', async () => {
      findSessionByProviderSessionId.mockResolvedValueOnce(null);
      const chain = appointmentsLookupChain(null);
      mockFrom.mockImplementation((table: string) =>
        table === 'appointments' ? chain : appointmentsLookupChain(null)
      );

      await handleParticipantConnected(
        {
          RoomSid: 'RM_UNKNOWN',
          ParticipantIdentity: 'doctor-doc-1',
          Timestamp: '2026-03-21T12:00:00.000Z',
          StatusCallbackEvent: 'participant-connected',
        },
        correlationId
      );

      expect(chain.select).not.toHaveBeenCalled();
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
      const chain = appointmentsLookupChain(apt);
      mockFrom.mockImplementation((table: string) =>
        table === 'appointments' ? chain : appointmentsLookupChain(null)
      );

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
      const chain = appointmentsLookupChain(apt);
      mockFrom.mockImplementation((table: string) =>
        table === 'appointments' ? chain : appointmentsLookupChain(null)
      );

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
      const chain = appointmentsLookupChain(apt);
      chain.update = jest.fn();
      mockFrom.mockImplementation((table: string) =>
        table === 'appointments' ? chain : appointmentsLookupChain(null)
      );

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
        consultation_duration_seconds: 2100,
        verified_at: null,
        status: 'confirmed',
      };
      const chain = buildRouter({ apt, actualEndedAt: '2026-03-21T12:35:00.000Z' });

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
        consultation_duration_seconds: 2040,
        verified_at: null,
        status: 'confirmed',
      };
      const chain = buildRouter({ apt, actualEndedAt: '2026-03-21T12:35:00.000Z' });

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
        consultation_duration_seconds: 2040,
        verified_at: null,
        status: 'confirmed',
      };
      const chain = buildRouter({ apt, actualEndedAt: '2026-03-21T12:35:00.000Z' });

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
        consultation_duration_seconds: 2040,
        verified_at: null,
        status: 'confirmed',
      };
      const chain = buildRouter({ apt, actualEndedAt: '2026-03-21T12:35:00.000Z', disableUpdate: true });

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
        consultation_duration_seconds: 2040,
        verified_at: null,
        status: 'confirmed',
      };
      const chain = buildRouter({ apt, actualEndedAt: '2026-03-21T12:35:00.000Z' });

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
        consultation_duration_seconds: 30,
        verified_at: null,
        status: 'confirmed',
      };
      const chain = buildRouter({
        apt,
        actualEndedAt: '2026-03-21T12:02:00.000Z',
        disableUpdate: true,
      });

      await tryMarkVerified('apt-1', correlationId);

      expect(chain.update).not.toHaveBeenCalled();
    });

    it('does not update when already verified', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_joined_at: '2026-03-21T12:00:00.000Z',
        patient_joined_at: '2026-03-21T12:01:00.000Z',
        consultation_duration_seconds: 2040,
        verified_at: '2026-03-21T12:35:00.000Z',
        status: 'completed',
      };
      const chain = buildRouter({
        apt,
        actualEndedAt: '2026-03-21T12:35:00.000Z',
        disableUpdate: true,
      });

      await tryMarkVerified('apt-1', correlationId);

      expect(chain.update).not.toHaveBeenCalled();
    });

    it('does not update when consultation_sessions has no actual_ended_at yet', async () => {
      const apt = {
        id: 'apt-1',
        doctor_id: 'doc-1',
        doctor_joined_at: '2026-03-21T12:00:00.000Z',
        patient_joined_at: '2026-03-21T12:01:00.000Z',
        doctor_left_at: null,
        patient_left_at: null,
        consultation_duration_seconds: 2040,
        verified_at: null,
        status: 'confirmed',
      };
      const chain = buildRouter({ apt, actualEndedAt: null, disableUpdate: true });

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
      const chain = appointmentsLookupChain(apt);
      mockFrom.mockImplementation((table: string) =>
        table === 'appointments' ? chain : appointmentsLookupChain(null)
      );

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
      const chain = appointmentsLookupChain(apt);
      mockFrom.mockImplementation((table: string) =>
        table === 'appointments' ? chain : appointmentsLookupChain(null)
      );

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
      const appointmentsChain = appointmentsLookupChain(null);
      const sessionsChain = { select: jest.fn(), update: jest.fn() };
      mockFrom.mockImplementation((table: string) =>
        table === 'appointments' ? appointmentsChain : sessionsChain
      );

      await handleTwilioStatusCallback(
        {
          RoomSid: 'RM123',
          StatusCallbackEvent: 'room-created',
        },
        correlationId
      );

      expect(appointmentsChain.select).not.toHaveBeenCalled();
      expect(appointmentsChain.update).not.toHaveBeenCalled();
      expect(findSessionByProviderSessionId).not.toHaveBeenCalled();
    });
  });
});
