import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
  supabase: {},
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataModification: jest.fn(async () => undefined),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../src/services/opd/opd-queue-service', () => ({
  syncOpdQueueEntryOnAppointmentStatus: jest.fn(async () => undefined),
}));

import { getSupabaseAdminClient } from '../../../src/config/database';
import { logDataModification } from '../../../src/utils/audit-logger';
import { NotFoundError, ValidationError } from '../../../src/utils/errors';
import { syncOpdQueueEntryOnAppointmentStatus } from '../../../src/services/opd/opd-queue-service';
import { cancelAppointmentForDesk } from '../../../src/services/desk-cancel-service';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const OTHER_DOCTOR = '00000000-0000-0000-0000-0000000000dd';
const ACTOR_ID = '00000000-0000-0000-0000-0000000000cc';
const APT_ID = '00000000-0000-0000-0000-0000000000ff';

const WAITING = {
  id: APT_ID,
  status: 'confirmed',
  doctor_id: DOCTOR_ID,
  patient_checked_in_at: null,
  opd_queue_entry: { token_number: 4 },
};

function fetchChain(row: Record<string, unknown> | null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: row,
      error: null,
    }),
  };
}

function updateChain(row: Record<string, unknown>) {
  return {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: row,
      error: null,
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('cancelAppointmentForDesk', () => {
  it('cancels pending/confirmed for the acting doctor and audits the staff actor', async () => {
    const fetch = fetchChain(WAITING);
    const write = updateChain({ ...WAITING, status: 'cancelled' });
    let calls = 0;
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => {
        calls += 1;
        return calls === 1 ? fetch : write;
      }),
    });

    const result = await cancelAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, 'cid');
    expect(result.appointment).toEqual({
      id: APT_ID,
      status: 'cancelled',
      opd_token_number: 4,
    });
    expect(logDataModification).toHaveBeenCalledWith(
      'cid',
      ACTOR_ID,
      'update',
      'appointment',
      APT_ID,
      ['status'],
      DOCTOR_ID
    );
    expect(syncOpdQueueEntryOnAppointmentStatus).toHaveBeenCalledWith(APT_ID, 'cancelled', 'cid');
  });

  it('hides another doctor appointment', async () => {
    const fetch = fetchChain({ ...WAITING, doctor_id: OTHER_DOCTOR });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => fetch),
    });
    await expect(
      cancelAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, 'cid')
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(syncOpdQueueEntryOnAppointmentStatus).not.toHaveBeenCalled();
  });

  it('refuses completed and already cancelled', async () => {
    for (const status of ['completed', 'cancelled', 'no_show'] as const) {
      const fetch = fetchChain({ ...WAITING, status });
      (getSupabaseAdminClient as jest.Mock).mockReturnValue({
        from: jest.fn(() => fetch),
      });
      await expect(
        cancelAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, 'cid')
      ).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it('refuses checked-in visits', async () => {
    const fetch = fetchChain({
      ...WAITING,
      patient_checked_in_at: '2026-08-30T10:00:00.000Z',
    });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => fetch),
    });
    await expect(
      cancelAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, 'cid')
    ).rejects.toMatchObject({
      message: 'Already checked in. Use Left.',
    });
  });
});
