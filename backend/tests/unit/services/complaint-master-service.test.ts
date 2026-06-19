/**
 * Complaint master service — unit tests (subjective-tab · subj-06).
 *
 * Covers patient-phrasing ranking: word-order-independent token matching,
 * synonym→canonical resolution, typo tolerance, and stopword handling.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

import * as database from '../../../src/config/database';
import {
  searchComplaints,
  normalizeString,
  tokenize,
  trigramSimilarity,
} from '../../../src/services/complaint-master-service';

const mockedDb = database as jest.Mocked<typeof database>;

type Row = {
  id: string;
  name: string;
  synonyms: string[];
  category: string;
  created_at: string;
  updated_at: string;
};

function row(id: string, name: string, synonyms: string[], category = 'default'): Row {
  return {
    id,
    name,
    synonyms,
    category,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

const SEED: Row[] = [
  row('1', 'Chest pain', [], 'pain'),
  row('2', 'Chest tightness', [], 'default'),
  row('3', 'Back pain', [], 'pain'),
  row('4', 'Headache', ['cephalgia'], 'pain'),
  row('5', 'Loose stools', ['diarrhea', 'loose motions'], 'default'),
  row('6', 'Stomach pain', ['abdominal pain', 'tummy pain'], 'pain'),
];

function mockRows(rows: Row[]): void {
  mockedDb.getSupabaseAdminClient.mockReturnValue({
    from: jest.fn(() => ({
      select: jest.fn<() => Promise<{ data: Row[]; error: null }>>().mockResolvedValue({
        data: rows,
        error: null,
      }),
    })),
  } as never);
}

describe('complaint normalization helpers', () => {
  it('strips stopwords and is word-order independent', () => {
    expect(normalizeString('pain in chest')).toBe('pain chest');
    expect(tokenize('pain in the chest')).toEqual(['pain', 'chest']);
  });

  it('applies light stemming consistently', () => {
    expect(normalizeString('chest paining')).toBe('chest pain');
    expect(normalizeString('loose motions')).toBe('loose motion');
  });

  it('trigram similarity is high for near-typos and low for unrelated', () => {
    expect(trigramSimilarity('headache', 'headeche')).toBeGreaterThan(0.5);
    expect(trigramSimilarity('headache', 'fever')).toBeLessThan(0.3);
  });
});

describe('searchComplaints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array for short queries without hitting the DB', async () => {
    await expect(searchComplaints('a')).resolves.toEqual([]);
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('returns empty array for all-stopword queries', async () => {
    await expect(searchComplaints('in the')).resolves.toEqual([]);
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('matches reordered phrasing: "pain in chest" → Chest pain first', async () => {
    mockRows(SEED);
    const results = await searchComplaints('pain in chest', 5);
    expect(results[0].name).toBe('Chest pain');
  });

  it('ranks exact match above broader token matches', async () => {
    mockRows(SEED);
    const results = await searchComplaints('chest pain', 5);
    expect(results[0].name).toBe('Chest pain');
  });

  it('resolves a synonym to its canonical patient label', async () => {
    mockRows(SEED);
    const results = await searchComplaints('loose motion', 5);
    expect(results[0].name).toBe('Loose stools');
  });

  it('tolerates a typo via trigram similarity', async () => {
    mockRows(SEED);
    const results = await searchComplaints('headeche', 5);
    expect(results.some((r) => r.name === 'Headache')).toBe(true);
  });

  it('does not surface unrelated complaints', async () => {
    mockRows(SEED);
    const results = await searchComplaints('pain in chest', 10);
    expect(results.some((r) => r.name === 'Back pain')).toBe(false);
  });
});
