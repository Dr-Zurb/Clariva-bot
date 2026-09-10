import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
  supabase: {},
}));

jest.mock('../../../src/utils/db-helpers', () => ({
  handleSupabaseError: jest.fn(),
}));

const markDeskAppointmentCancelled = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const listVisitPaymentsForAppointment = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const deriveVisitPaymentStatus = jest.fn<(...args: unknown[]) => unknown>();
const lastVisitCollectRow = jest.fn<(...args: unknown[]) => unknown>();
const netVisitCollectedMinor = jest.fn<(...args: unknown[]) => unknown>();
const recordTillReversal = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/desk-cancel-service', () => ({
  markDeskAppointmentCancelled: (...args: unknown[]) => markDeskAppointmentCancelled(...args),
}));

jest.mock('../../../src/services/visit-payments-service', () => ({
  deriveVisitPaymentStatus: (...args: unknown[]) => deriveVisitPaymentStatus(...args),
  lastVisitCollectRow: (...args: unknown[]) => lastVisitCollectRow(...args),
  listVisitPaymentsForAppointment: (...args: unknown[]) => listVisitPaymentsForAppointment(...args),
  netVisitCollectedMinor: (...args: unknown[]) => netVisitCollectedMinor(...args),
  recordTillReversal: (...args: unknown[]) => recordTillReversal(...args),
}));

import { getSupabaseAdminClient } from '../../../src/config/database';
import { leaveAppointmentForDesk } from '../../../src/services/desk-left-service';
import { NotFoundError, ValidationError } from '../../../src/utils/errors';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const OTHER_DOCTOR = '00000000-0000-0000-0000-0000000000dd';
const ACTOR_ID = '00000000-0000-0000-0000-0000000000cc';
const APT_ID = '00000000-0000-0000-0000-0000000000ff';
const PAY_ID = '00000000-0000-0000-0000-0000000000bb';

const ARRIVED = {
  id: APT_ID,
  status: 'confirmed',
  doctor_id: DOCTOR_ID,
  patient_checked_in_at: '2026-08-31T00:30:00.000Z',
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

beforeEach(() => {
  jest.clearAllMocks();
  markDeskAppointmentCancelled.mockResolvedValue({
    appointment: { id: APT_ID, status: 'cancelled', opd_token_number: 3 },
  });
  listVisitPaymentsForAppointment.mockResolvedValue([]);
  deriveVisitPaymentStatus.mockReturnValue('due');
});

describe('leaveAppointmentForDesk', () => {
  it('returns cash and cancels a paid arrived visit', async () => {
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => fetchChain(ARRIVED)),
    });
    const collect = { id: PAY_ID, method: 'cash', amount_minor: 1000 };
    listVisitPaymentsForAppointment.mockResolvedValue([collect]);
    deriveVisitPaymentStatus.mockReturnValue('paid');
    lastVisitCollectRow.mockReturnValue(collect);
    netVisitCollectedMinor.mockReturnValue(1000);

    const result = await leaveAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, 'cid', {
      returnMethod: 'cash',
    });

    expect(recordTillReversal).toHaveBeenCalledWith(
      APT_ID,
      DOCTOR_ID,
      { returnMethod: 'cash', reversesPaymentId: PAY_ID, amountMinor: 1000 },
      'cid',
      ACTOR_ID
    );
    expect(markDeskAppointmentCancelled).toHaveBeenCalledWith(APT_ID, DOCTOR_ID, ACTOR_ID, 'cid');
    expect(result.appointment.status).toBe('cancelled');
  });

  it('leaves a no-charge visit without a payment row', async () => {
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => fetchChain(ARRIVED)),
    });
    deriveVisitPaymentStatus.mockReturnValue('no_charge');

    await leaveAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, 'cid', {});
    expect(recordTillReversal).not.toHaveBeenCalled();
    expect(markDeskAppointmentCancelled).toHaveBeenCalled();
  });

  it('refuses waiting visits', async () => {
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => fetchChain({ ...ARRIVED, patient_checked_in_at: null })),
    });
    await expect(
      leaveAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, 'cid', {})
    ).rejects.toMatchObject({ message: 'Not checked in' });
    expect(markDeskAppointmentCancelled).not.toHaveBeenCalled();
  });

  it('refuses completed visits', async () => {
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => fetchChain({ ...ARRIVED, status: 'completed' })),
    });
    await expect(
      leaveAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, 'cid', { returnMethod: 'cash' })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a second left', async () => {
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => fetchChain({ ...ARRIVED, status: 'cancelled' })),
    });
    await expect(
      leaveAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, 'cid', { returnMethod: 'cash' })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('requires returnMethod when paid', async () => {
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => fetchChain(ARRIVED)),
    });
    deriveVisitPaymentStatus.mockReturnValue('paid');
    await expect(
      leaveAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, 'cid', {})
    ).rejects.toMatchObject({ message: 'Choose how you returned the money' });
    expect(recordTillReversal).not.toHaveBeenCalled();
  });

  it('hides another doctor appointment', async () => {
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => fetchChain({ ...ARRIVED, doctor_id: OTHER_DOCTOR })),
    });
    await expect(
      leaveAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, 'cid', {})
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
