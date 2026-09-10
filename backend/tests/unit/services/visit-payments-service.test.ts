import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
  supabase: {},
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn(async () => undefined),
  logDataModification: jest.fn(async () => undefined),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn(async () => ({ appointment_fee_minor: 50000, appointment_fee_currency: 'INR' })),
  getDoctorTimezone: jest.fn(async () => 'Asia/Kolkata'),
}));

jest.mock('../../../src/services/opd/opd-queue-service', () => ({
  localDayUtcRange: jest.fn(() => ({
    start: '2026-08-30T18:30:00.000Z',
    end: '2026-08-31T18:30:00.000Z',
  })),
}));

import { getSupabaseAdminClient } from '../../../src/config/database';
import { logDataModification } from '../../../src/utils/audit-logger';
import { NotFoundError, ValidationError } from '../../../src/utils/errors';
import {
  collectVisitPayment,
  deriveVisitPaymentStatus,
  getDeskHisab,
} from '../../../src/services/visit-payments-service';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const ACTOR_ID = '00000000-0000-0000-0000-0000000000cc';
const APT_ID = '00000000-0000-0000-0000-0000000000ff';
const PATIENT_ID = '00000000-0000-0000-0000-0000000000ee';
const PAY_ID = '00000000-0000-0000-0000-0000000000bb';

const OPEN_APT = {
  id: APT_ID,
  doctor_id: DOCTOR_ID,
  patient_id: PATIENT_ID,
  status: 'confirmed',
};

function appointmentChain(row: Record<string, unknown> | null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: row,
      error: null,
    }),
  };
}

function paymentListChain(rows: unknown[]) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: rows,
      error: null,
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deriveVisitPaymentStatus', () => {
  it('is due with no rows, no charge with a zero row, paid with cash', () => {
    expect(deriveVisitPaymentStatus([])).toBe('due');
    expect(deriveVisitPaymentStatus([{ method: 'no_charge', amount_minor: 0 }])).toBe('no_charge');
    expect(
      deriveVisitPaymentStatus([
        { method: 'cash', amount_minor: 50000 },
        { method: 'upi', amount_minor: 10000 },
      ])
    ).toBe('paid');
  });

  it('is returned when a reversal nets the collect to zero', () => {
    expect(
      deriveVisitPaymentStatus([
        { method: 'cash', amount_minor: 1000 },
        { method: 'reversal', amount_minor: 1000 },
      ])
    ).toBe('returned');
  });
});

describe('collectVisitPayment', () => {
  it('inserts cash and audits the staff actor', async () => {
    const created = {
      id: PAY_ID,
      doctor_id: DOCTOR_ID,
      appointment_id: APT_ID,
      patient_id: PATIENT_ID,
      amount_minor: 50000,
      currency: 'INR',
      method: 'cash',
      collected_by: ACTOR_ID,
      collected_at: '2026-08-30T10:00:00.000Z',
      note: null,
      created_at: '2026-08-30T10:00:00.000Z',
    };
    const apt = appointmentChain(OPEN_APT);
    const list = paymentListChain([]);
    const insert = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: created,
        error: null,
      }),
    };
    let payCalls = 0;
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return apt;
        payCalls += 1;
        return payCalls === 1 ? list : insert;
      }),
    });

    const result = await collectVisitPayment(
      APT_ID,
      DOCTOR_ID,
      { method: 'cash', amountMinor: 50000 },
      'cid',
      ACTOR_ID
    );
    expect(result.visit.status).toBe('paid');
    expect(result.payment.amount_minor).toBe(50000);
    expect(logDataModification).toHaveBeenCalledWith(
      'cid',
      ACTOR_ID,
      'create',
      'visit_payment',
      PAY_ID,
      ['method', 'amount_minor'],
      DOCTOR_ID
    );
  });

  it('rejects cancelled visits', async () => {
    const apt = appointmentChain({ ...OPEN_APT, status: 'cancelled' });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => apt),
    });
    await expect(
      collectVisitPayment(APT_ID, DOCTOR_ID, { method: 'cash', amountMinor: 100 }, 'cid', ACTOR_ID)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('hides another doctor appointment', async () => {
    const apt = appointmentChain({ ...OPEN_APT, doctor_id: 'other' });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => apt),
    });
    await expect(
      collectVisitPayment(APT_ID, DOCTOR_ID, { method: 'cash', amountMinor: 100 }, 'cid', ACTOR_ID)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects no charge after a collection', async () => {
    const apt = appointmentChain(OPEN_APT);
    const list = paymentListChain([{ method: 'cash', amount_minor: 50000 }]);
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'appointments' ? apt : list)),
    });
    await expect(
      collectVisitPayment(APT_ID, DOCTOR_ID, { method: 'no_charge' }, 'cid', ACTOR_ID)
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('getDeskHisab', () => {
  it('tallies cash and due visits for the session day', async () => {
    const aptList = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: [
          { id: APT_ID, status: 'confirmed' },
          { id: '00000000-0000-0000-0000-0000000000a1', status: 'completed' },
          { id: '00000000-0000-0000-0000-0000000000a2', status: 'cancelled' },
        ],
        error: null,
      }),
    };
    const payList = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: [
          {
            appointment_id: APT_ID,
            method: 'cash',
            amount_minor: 50000,
            collected_by: ACTOR_ID,
          },
        ],
        error: null,
      }),
    };
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'appointments' ? aptList : payList)),
    });

    const hisab = await getDeskHisab(DOCTOR_ID, '2026-08-31', 'cid', ACTOR_ID);
    expect(hisab.totals.cashMinor).toBe(50000);
    expect(hisab.totals.collectedMinor).toBe(50000);
    expect(hisab.dueCount).toBe(1);
    expect(hisab.noChargeCount).toBe(0);
    expect(hisab.visits).toHaveLength(2);
    expect(hisab.suggestedAmountMinor).toBe(50000);
  });

  it('subtracts a till reversal from the day totals', async () => {
    const aptList = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: [
          { id: APT_ID, status: 'cancelled' },
          { id: '00000000-0000-0000-0000-0000000000a1', status: 'confirmed' },
        ],
        error: null,
      }),
    };
    const payList = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: [
          {
            appointment_id: APT_ID,
            method: 'cash',
            amount_minor: 1000,
            collected_by: ACTOR_ID,
          },
          {
            appointment_id: APT_ID,
            method: 'reversal',
            amount_minor: 1000,
            return_method: 'cash',
            collected_by: ACTOR_ID,
          },
        ],
        error: null,
      }),
    };
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'appointments' ? aptList : payList)),
    });

    const hisab = await getDeskHisab(DOCTOR_ID, '2026-08-31', 'cid', ACTOR_ID);
    expect(hisab.totals.cashMinor).toBe(0);
    expect(hisab.totals.collectedMinor).toBe(0);
    expect(hisab.visits).toHaveLength(1);
  });
});
