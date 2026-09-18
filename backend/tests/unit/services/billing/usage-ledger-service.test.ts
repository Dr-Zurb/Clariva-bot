/**
 * Usage ledger recorder (billing P1).
 */
// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  billingPeriodFor,
  recordBillableConsult,
  voidBillableConsult,
} from '../../../../src/services/billing/usage-ledger-service';
import * as database from '../../../../src/config/database';

jest.mock('../../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../../src/utils/audit-logger', () => ({
  logDataModification: jest.fn().mockResolvedValue(undefined),
}));

const mockedDb = database as jest.Mocked<typeof database>;

function createAdmin(handlers: {
  onInsert?: () => { data: unknown; error: unknown };
  onLedgerSelect?: () => { data: unknown; error: unknown };
  onLedgerUpdate?: () => { data: unknown; error: unknown };
}) {
  const from = jest.fn((table: string) => {
    if (table === 'appointments') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'apt-1', patient_id: 'pat-1' },
          error: null,
        }),
      };
    }
    return {
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockImplementation(async () =>
            handlers.onInsert?.() ?? { data: { id: 'row-1', status: 'billable' }, error: null }
          ),
        }),
      }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      neq: jest.fn().mockResolvedValue({ data: [], error: null }),
      is: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockImplementation(async () =>
            handlers.onLedgerUpdate?.() ?? { data: { id: 'row-1' }, error: null }
          ),
        }),
      }),
      maybeSingle: jest.fn().mockImplementation(async () =>
        handlers.onLedgerSelect?.() ?? { data: null, error: null }
      ),
    };
  });
  return { from };
}

const baseInput = {
  appointmentId: 'apt-1',
  doctorId: 'doc-1',
  modality: 'video',
  source: 'verified_overlap',
  occurredAt: '2026-08-31T18:00:00.000Z',
};

describe('billingPeriodFor', () => {
  it('uses Asia/Kolkata, including 23:30 IST on the last day of the month', () => {
    expect(billingPeriodFor('2026-08-31T18:00:00.000Z')).toBe('2026-08-01');
    expect(billingPeriodFor('2026-08-31T19:00:00.000Z')).toBe('2026-09-01');
  });
});

describe('recordBillableConsult', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts a billable row', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(createAdmin({}) as never);
    const result = await recordBillableConsult(baseInput, 'corr-1');
    expect(result.recorded).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.status).toBe('billable');
  });

  it('treats a unique conflict as a silent success', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createAdmin({
        onInsert: () => ({ data: null, error: { code: '23505', message: 'duplicate' } }),
      }) as never
    );
    const result = await recordBillableConsult(baseInput, 'corr-1');
    expect(result.duplicate).toBe(true);
    expect(result.recorded).toBe(false);
  });

  it('never throws when the insert fails', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createAdmin({
        onInsert: () => ({ data: null, error: { code: '57014', message: 'boom' } }),
      }) as never
    );
    await expect(recordBillableConsult(baseInput, 'corr-1')).resolves.toEqual({
      recorded: false,
      duplicate: false,
      status: null,
      voidReason: null,
    });
  });

  it('voids a same-day continuation after a sub-120s billable consult', async () => {
    const admin = {
      from: (table: string) => {
        if (table === 'appointments') {
          const chain = {
            select: jest.fn(),
            eq: jest.fn(),
            in: jest.fn(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'apt-2', patient_id: 'pat-1' },
              error: null,
            }),
          };
          chain.select.mockReturnValue(chain);
          chain.eq.mockImplementation((col: string) => {
            if (col === 'patient_id') {
              return Promise.resolve({
                data: [{ id: 'apt-1', consultation_duration_seconds: 45, patient_id: 'pat-1' }],
                error: null,
              });
            }
            return chain;
          });
          chain.in.mockReturnValue(chain);
          return chain;
        }
        return {
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'row-2', status: 'void' },
                error: null,
              }),
            }),
          }),
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          neq: jest.fn().mockResolvedValue({ data: [{ appointment_id: 'apt-1' }], error: null }),
        };
      },
    };
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await recordBillableConsult({ ...baseInput, appointmentId: 'apt-2' }, 'corr-1');
    expect(result.recorded).toBe(true);
    expect(result.status).toBe('void');
    expect(result.voidReason).toBe('same_encounter_continuation');
  });

  it('bills a same-day second consult after a normal-length first one', async () => {
    const admin = {
      from: (table: string) => {
        if (table === 'appointments') {
          const chain = {
            select: jest.fn(),
            eq: jest.fn(),
            in: jest.fn(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'apt-2', patient_id: 'pat-1' },
              error: null,
            }),
          };
          chain.select.mockReturnValue(chain);
          chain.eq.mockImplementation((col: string) => {
            if (col === 'patient_id') {
              return Promise.resolve({
                data: [{ id: 'apt-1', consultation_duration_seconds: 600, patient_id: 'pat-1' }],
                error: null,
              });
            }
            return chain;
          });
          chain.in.mockReturnValue(chain);
          return chain;
        }
        return {
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'row-2', status: 'billable' },
                error: null,
              }),
            }),
          }),
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          neq: jest.fn().mockResolvedValue({ data: [{ appointment_id: 'apt-1' }], error: null }),
        };
      },
    };
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await recordBillableConsult({ ...baseInput, appointmentId: 'apt-2' }, 'corr-1');
    expect(result.recorded).toBe(true);
    expect(result.status).toBe('billable');
  });
});

describe('voidBillableConsult', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refuses after invoiced_at is set', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: () => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'row-1', status: 'billable', invoiced_at: '2026-09-01T00:00:00Z' },
          error: null,
        }),
      }),
    } as never);

    const result = await voidBillableConsult('apt-1', 'test', 'corr-1');
    expect(result.voided).toBe(false);
    expect(result.reason).toBe('already_invoiced');
  });
});
