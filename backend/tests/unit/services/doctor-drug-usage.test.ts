/**
 * Doctor drug usage service — unit tests (rx-polish-favorites · rxf-05).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn().mockResolvedValue(undefined as never),
}));

import * as database from '../../../src/config/database';
import {
  DRUG_USAGE_LIST_CAP,
  listMyDrugUsage,
} from '../../../src/services/doctor-drug-usage-service';

const mockedDb = database as jest.Mocked<typeof database>;

const correlationId = 'corr-rxf-05';
const doctorA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const doctorB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const drugParacetamol = '11111111-1111-1111-1111-111111111111';
const drugPamidronate = '22222222-2222-2222-2222-222222222222';

interface UsageRow {
  drug_master_id: string;
  usage_count: number;
}

function buildUsageStore(initial: Array<{ doctor_id: string; drug_master_id: string; usage_count: number }>) {
  const rows = [...initial];
  const limitSpy = jest.fn();

  const from = jest.fn((table: string) => {
    if (table !== 'doctor_drug_usage') {
      throw new Error(`unexpected table ${table}`);
    }

    let doctorFilter: string | undefined;
    let rowLimit = DRUG_USAGE_LIST_CAP;

    const chain = {
      select() {
        return chain;
      },
      eq(col: string, val: string) {
        if (col === 'doctor_id') doctorFilter = val;
        return chain;
      },
      order() {
        return chain;
      },
      limit(n: number) {
        rowLimit = n;
        limitSpy(n);
        return chain;
      },
      then(onFulfilled: (v: { data: UsageRow[]; error: null }) => unknown) {
        const filtered = rows
          .filter((r) => (doctorFilter ? r.doctor_id === doctorFilter : true))
          .sort((a, b) => b.usage_count - a.usage_count)
          .slice(0, rowLimit)
          .map((r) => ({
            drug_master_id: r.drug_master_id,
            usage_count: r.usage_count,
          }));
        return Promise.resolve(onFulfilled({ data: filtered, error: null }));
      },
    };

    return chain;
  });

  return { from, rows, limitSpy };
}

describe('listMyDrugUsage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a map keyed by drug_master_id with usage_count values', async () => {
    const store = buildUsageStore([
      { doctor_id: doctorA, drug_master_id: drugParacetamol, usage_count: 200 },
      { doctor_id: doctorA, drug_master_id: drugPamidronate, usage_count: 3 },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: store.from } as never);

    const scores = await listMyDrugUsage(correlationId, doctorA);

    expect(scores).toEqual({
      [drugParacetamol]: 200,
      [drugPamidronate]: 3,
    });
  });

  it('scopes reads to the requesting doctor (RLS enforced in DB; service filters by doctor_id)', async () => {
    const store = buildUsageStore([
      { doctor_id: doctorA, drug_master_id: drugParacetamol, usage_count: 50 },
      { doctor_id: doctorB, drug_master_id: drugPamidronate, usage_count: 999 },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: store.from } as never);

    const scoresA = await listMyDrugUsage(correlationId, doctorA);
    const scoresB = await listMyDrugUsage(correlationId, doctorB);

    expect(scoresA).toEqual({ [drugParacetamol]: 50 });
    expect(scoresB).toEqual({ [drugPamidronate]: 999 });
    expect(scoresA[drugPamidronate]).toBeUndefined();
    expect(scoresB[drugParacetamol]).toBeUndefined();
  });

  it('returns an empty map for a doctor with no usage rows', async () => {
    const store = buildUsageStore([]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: store.from } as never);

    const scores = await listMyDrugUsage(correlationId, doctorA);

    expect(scores).toEqual({});
  });

  it('honours the 500-row cap on the query', async () => {
    const store = buildUsageStore([]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: store.from } as never);

    await listMyDrugUsage(correlationId, doctorA);

    expect(store.limitSpy).toHaveBeenCalledWith(DRUG_USAGE_LIST_CAP);
  });
});
