// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { issueInvoice } from '../../../../src/services/billing/invoice-service';
import * as database from '../../../../src/config/database';
import * as subscriptionService from '../../../../src/services/billing/subscription-service';

jest.mock('../../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../../src/utils/audit-logger', () => ({
  logDataModification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../../src/services/billing/subscription-service', () => {
  const actual = jest.requireActual('../../../../src/services/billing/subscription-service');
  return {
    ensureSubscription: jest.fn(),
    billForSubscription: actual.billForSubscription,
  };
});

const mockedDb = database as jest.Mocked<typeof database>;
const mockedSub = subscriptionService as jest.Mocked<typeof subscriptionService>;

const issuedRow = {
  id: 'inv-1',
  doctor_id: '11111111-1111-4111-8111-111111111111',
  billing_period: '2026-08-01',
  invoice_number: 'HA-2026-2027-00001',
  billable_count: 21,
  not_billed_count: 1,
  base_minor: 99_900,
  metered_minor: 4_900,
  subtotal_minor: 104_800,
  adjustments_minor: 0,
  gst_minor: 18_864,
  total_minor: 123_664,
  cap_applied: false,
  status: 'issued',
  issued_at: '2026-09-01T10:00:00.000Z',
};

const standardSub = {
  doctorId: issuedRow.doctor_id,
  status: 'active',
  planKind: 'standard',
  baseMinor: 99_900,
  includedConsults: 20,
  perConsultMinor: 4_900,
  capMinor: 1_249_900,
  baseWaivedUntil: null,
  levelsLockedUntil: null,
};

describe('issueInvoice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSub.ensureSubscription.mockResolvedValue(standardSub);
  });

  it('returns the existing invoice without inserting again', async () => {
    const insert = jest.fn();
    const from = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: issuedRow, error: null }),
      insert,
    }));
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from, rpc: jest.fn() } as never);

    const first = await issueInvoice(issuedRow.doctor_id, '2026-08-01', 'corr');
    const second = await issueInvoice(issuedRow.doctor_id, '2026-08-01', 'corr');
    expect(first.id).toBe('inv-1');
    expect(second.invoiceNumber).toBe(first.invoiceNumber);
    expect(insert).not.toHaveBeenCalled();
    expect(mockedSub.ensureSubscription).not.toHaveBeenCalled();
  });

  it('inserts once and latches invoiced_at + invoice_id', async () => {
    const updateEq = jest.fn().mockReturnThis();
    const updateIs = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({
      eq: updateEq,
      is: updateIs,
    });
    updateEq.mockReturnValue({ eq: updateEq, is: updateIs });

    const insert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: issuedRow, error: null }),
      }),
    });

    const ledgerRows = [
      ...Array.from({ length: 21 }, (_, i) => ({ id: `b${i}`, status: 'billable' })),
      { id: 'v1', status: 'void' },
    ];

    const from = jest.fn((table: string) => {
      if (table === 'doctor_invoices') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          neq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          insert,
        };
      }
      const payload =
        table === 'billable_consults'
          ? { data: ledgerRows, error: null }
          : { data: [], error: null };
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        update,
        then: (resolve) => resolve(payload),
      };
      return chain;
    });

    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from,
      rpc: jest.fn().mockResolvedValue({ data: 1, error: null }),
    } as never);

    const issued = await issueInvoice(issuedRow.doctor_id, '2026-08-01', 'corr');
    expect(issued.invoiceNumber).toBe('HA-2026-2027-00001');
    expect(issued.description).toContain('Platform subscription and usage');
    expect(issued.description.toLowerCase()).not.toMatch(/commission/);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      invoiced_at: issuedRow.issued_at,
      invoice_id: 'inv-1',
    });
  });
});
