/**
 * Diagnosis catalog service — unit tests (assessment-tab · asmt-06).
 *
 * Covers ICD-11 catalog ranking: direct code lookup, synonym/vernacular →
 * canonical title resolution, typo tolerance, and short/empty-query guards.
 *
 * The service pulls a candidate set from the `search_diagnosis_catalog` RPC
 * (migration 164) and re-ranks in TS, so the mock stands in for that RPC and
 * the ranking assertions exercise the TS scoring over the returned candidates.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

import * as database from '../../../src/config/database';
import { searchDiagnosisCatalog } from '../../../src/services/diagnosis-catalog-service';

const mockedDb = database as jest.Mocked<typeof database>;

type Row = {
  id: string;
  code: string;
  title: string;
  synonyms: string[];
  chapter: string | null;
  created_at: string;
  updated_at: string;
};

function row(id: string, code: string, title: string, synonyms: string[]): Row {
  return {
    id,
    code,
    title,
    synonyms,
    chapter: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

const SEED: Row[] = [
  row('1', 'BA00', 'Essential hypertension', ['hypertension', 'high blood pressure', 'BP high']),
  row('2', '5A11', 'Type 2 diabetes mellitus', ['sugar', 'diabetes', 'T2DM']),
  row('3', '5A00', 'Hypothyroidism', ['underactive thyroid', 'thyroid low']),
  row('4', 'CA23', 'Asthma', ['bronchial asthma']),
  row('5', '8A80', 'Migraine', ['migraine headache']),
];

const rpcMock =
  jest.fn<() => Promise<{ data: Row[]; error: null }>>();

function mockRows(rows: Row[]): void {
  rpcMock.mockResolvedValue({ data: rows, error: null });
  mockedDb.getSupabaseAdminClient.mockReturnValue({
    rpc: rpcMock,
  } as never);
}

describe('searchDiagnosisCatalog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array for short queries without hitting the DB', async () => {
    await expect(searchDiagnosisCatalog('a')).resolves.toEqual([]);
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('resolves vernacular via synonyms to the canonical ICD title', async () => {
    mockRows(SEED);
    const results = await searchDiagnosisCatalog('sugar', 5);
    expect(results[0]?.title).toBe('Type 2 diabetes mellitus');
    expect(results[0]?.code).toBe('5A11');
  });

  it('resolves "BP high" to Essential hypertension', async () => {
    mockRows(SEED);
    const results = await searchDiagnosisCatalog('BP high', 5);
    expect(results[0]?.title).toBe('Essential hypertension');
  });

  it('surfaces a row by ICD code prefix', async () => {
    mockRows(SEED);
    const results = await searchDiagnosisCatalog('BA0', 5);
    expect(results[0]?.code).toBe('BA00');
  });

  it('tolerates a typo via trigram similarity', async () => {
    mockRows(SEED);
    const results = await searchDiagnosisCatalog('asthama', 5);
    expect(results.some((r) => r.title === 'Asthma')).toBe(true);
  });

  it('ranks an exact title match first', async () => {
    mockRows(SEED);
    const results = await searchDiagnosisCatalog('migraine', 5);
    expect(results[0]?.title).toBe('Migraine');
  });

  it('does not surface unrelated diagnoses', async () => {
    mockRows(SEED);
    const results = await searchDiagnosisCatalog('sugar', 10);
    expect(results.some((r) => r.title === 'Asthma')).toBe(false);
  });

  it('delegates candidate filtering to the search_diagnosis_catalog RPC', async () => {
    mockRows(SEED);
    await searchDiagnosisCatalog('diabetes', 5);
    expect(rpcMock).toHaveBeenCalledWith('search_diagnosis_catalog', {
      search_query: 'diabetes',
      candidate_limit: 200,
    });
  });
});
