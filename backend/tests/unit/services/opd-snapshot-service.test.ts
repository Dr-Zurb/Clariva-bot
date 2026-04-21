/**
 * OPD snapshot service (e-task-opd-04) — shape smoke tests with mocks.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { buildPatientOpdSnapshot } from '../../../src/services/opd-snapshot-service';
import * as database from '../../../src/config/database';
import * as doctorSettings from '../../../src/services/doctor-settings-service';
import * as opdMode from '../../../src/services/opd/opd-mode-service';
import * as opdQueue from '../../../src/services/opd/opd-queue-service';

jest.mock('../../../src/config/database');
jest.mock('../../../src/services/doctor-settings-service');
jest.mock('../../../src/services/opd/opd-mode-service');
jest.mock('../../../src/services/opd/opd-queue-service');
jest.mock('../../../src/services/opd/opd-metrics');

const mockedDb = database as jest.Mocked<typeof database>;
const mockedDoctorSettings = doctorSettings as jest.Mocked<typeof doctorSettings>;
const mockedOpdMode = opdMode as jest.Mocked<typeof opdMode>;
const mockedOpdQueue = opdQueue as jest.Mocked<typeof opdQueue>;

/**
 * Post-Task-35: `buildPatientOpdSnapshot` issues 2-3 lookups through the
 * admin client:
 *   1. `appointments`         → primary appt row
 *   2. `consultation_sessions`→ latest session (for actual_started_at /
 *                                actual_ended_at — replaces the dropped
 *                                `consultation_started_at` /
 *                                `consultation_ended_at` columns).
 *   3. `consultation_sessions`→ any other-patient live session for
 *                                `inferDoctorBusySnapshot` (only called when
 *                                the caller's own session isn't live).
 * A single `appointmentsChain` serves both appointments AND
 * consultation_sessions in these tests; the `maybeSingle` sequence pops
 * per call in order.
 */
function makeAdminMock(sequences: { appointments: unknown[]; queue?: unknown[] }) {
  let aptIdx = 0;
  let qIdx = 0;
  const appointmentsChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockImplementation(() => {
      const v = sequences.appointments[aptIdx];
      aptIdx += 1;
      return Promise.resolve(v ?? { data: null, error: null });
    }),
  };
  const queueChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockImplementation(() => {
      const v = sequences.queue?.[qIdx];
      qIdx += 1;
      return Promise.resolve(v ?? { data: null, error: null });
    }),
  };
  const from = jest.fn().mockImplementation((table: unknown) => {
    if (table === 'opd_queue_entries') return queueChain;
    return appointmentsChain;
  });
  return { from, appointmentsChain, queueChain };
}

describe('buildPatientOpdSnapshot', () => {
  const future = new Date(Date.now() + 3600_000);
  const baseApt = {
    id: 'apt-1',
    doctor_id: 'd1',
    patient_id: 'p1',
    appointment_date: future.toISOString(),
    status: 'confirmed',
    opd_early_invite_expires_at: null,
    opd_early_invite_response: null,
    opd_session_delay_minutes: null,
  };
  const baseSession = {
    actual_started_at: null,
    actual_ended_at: null,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockedDoctorSettings.getDoctorSettings.mockResolvedValue({
      doctor_id: 'd1',
      timezone: 'Asia/Kolkata',
      slot_interval_minutes: 15,
      opd_mode: 'slot',
    } as any);
    mockedOpdMode.resolveOpdModeFromSettings.mockReturnValue('slot');
    mockedOpdQueue.getQueueEtaInputsForAppointment.mockResolvedValue({
      etaMinutes: 10,
      avgMinutesUsed: 5,
      aheadCount: 2,
    });
  });

  it('returns slot-shaped snapshot when opd_mode is slot', async () => {
    const { from } = makeAdminMock({
      appointments: [
        { data: baseApt, error: null },
        { data: baseSession, error: null },
        { data: null, error: null },
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as any);

    const snap = await buildPatientOpdSnapshot('apt-1', 'c1');

    expect(snap.opdMode).toBe('slot');
    expect(snap.slotStart).toBeDefined();
    expect(snap.slotEnd).toBeDefined();
    expect(snap.suggestedPollSeconds).toBe(20);
    expect(snap.tokenNumber).toBeUndefined();
    expect(Array.isArray(snap.inAppNotifications)).toBe(true);
  });

  it('returns queue-shaped snapshot when opd_mode is queue', async () => {
    mockedDoctorSettings.getDoctorSettings.mockResolvedValue({
      doctor_id: 'd1',
      timezone: 'Asia/Kolkata',
      slot_interval_minutes: 15,
      opd_mode: 'queue',
    } as any);
    mockedOpdMode.resolveOpdModeFromSettings.mockReturnValue('queue');

    const { from } = makeAdminMock({
      appointments: [
        { data: baseApt, error: null },
        { data: baseSession, error: null },
        { data: null, error: null },
      ],
      queue: [{ data: { token_number: 3 }, error: null }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as any);

    const snap = await buildPatientOpdSnapshot('apt-1', 'c1');

    expect(snap.opdMode).toBe('queue');
    expect(snap.tokenNumber).toBe(3);
    expect(snap.etaMinutes).toBe(10);
    expect(snap.etaRange?.minMinutes).toBeDefined();
    expect(snap.slotStart).toBeUndefined();
    expect(snap.inAppNotifications?.some((n) => n.type === 'your_turn_soon')).toBe(true);
  });
});
