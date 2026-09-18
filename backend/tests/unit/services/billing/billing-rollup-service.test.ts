// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  getBillingReconciliation,
  getBillingRollup,
} from '../../../../src/services/billing/billing-rollup-service';
import * as database from '../../../../src/config/database';

jest.mock('../../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

const mockedDb = database as jest.Mocked<typeof database>;

describe('billing-rollup-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes a rollup from billable rows', async () => {
    const payload = {
      data: [
        { doctor_id: 'doc-1', status: 'billable', void_reason: null },
        { doctor_id: 'doc-1', status: 'billable', void_reason: null },
        { doctor_id: 'doc-1', status: 'void', void_reason: 'same_encounter_continuation' },
      ],
      error: null,
    };
    const chain = {
      select: jest.fn(),
      eq: jest.fn(),
      then: (resolve: (v: unknown) => void) => resolve(payload),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: () => chain } as never);

    const rows = await getBillingRollup('2026-08-01', 'corr-1', 'doc-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].billableCount).toBe(2);
    expect(rows[0].voidCount).toBe(1);
    expect(rows[0].voidByReason.same_encounter_continuation).toBe(1);
    expect(rows[0].bill.baseMinor).toBe(99_900);
  });

  it('flags a completed appointment with no ledger row and a ledger row without completed', async () => {
    const from = jest.fn((table: string) => {
      const chain = {
        select: jest.fn(),
        eq: jest.fn(),
        gte: jest.fn(),
        lt: jest.fn(),
        in: jest.fn(),
      };
      chain.select.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);
      chain.gte.mockReturnValue(chain);
      if (table === 'appointments') {
        chain.lt.mockResolvedValue({
          data: [{ id: 'apt-missing', doctor_id: 'doc-1', status: 'completed' }],
          error: null,
        });
        chain.in.mockResolvedValue({
          data: [{ id: 'apt-ledger-only', doctor_id: 'doc-1', status: 'confirmed' }],
          error: null,
        });
      }
      if (table === 'billable_consults') {
        chain.eq.mockResolvedValue({
          data: [{ appointment_id: 'apt-ledger-only', doctor_id: 'doc-1' }],
          error: null,
        });
      }
      return chain;
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const result = await getBillingReconciliation('2026-08-01', 'corr-1');
    const kinds = result.gaps.map((g) => g.kind).sort();
    expect(kinds).toEqual(['completed_without_ledger', 'ledger_without_completed']);
  });
});
