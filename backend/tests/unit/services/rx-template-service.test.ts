/**
 * Doctor Rx template service — unit tests (subjective-tab · subj-15).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn().mockResolvedValue(undefined as never),
  logDataModification: jest.fn().mockResolvedValue(undefined as never),
}));

import * as database from '../../../src/config/database';
import {
  createRxTemplate,
  listRxTemplates,
} from '../../../src/services/rx-template-service';

const mockedDb = database as jest.Mocked<typeof database>;

const correlationId = 'corr-subj-15';
const doctorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

type MockChain = {
  select: jest.Mock;
  eq: jest.Mock;
  is: jest.Mock;
  order: jest.Mock;
  insert: jest.Mock;
  single: jest.Mock;
  eqCalls: Array<[string, unknown]>;
  insertedRow?: Record<string, unknown>;
  then: (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) => Promise<unknown>;
};

function buildListChain(rows: unknown[]): MockChain {
  const eqCalls: Array<[string, unknown]> = [];
  const chain: MockChain = {
    select: jest.fn(),
    eq: jest.fn(),
    is: jest.fn(),
    order: jest.fn(),
    insert: jest.fn(),
    single: jest.fn(),
    eqCalls,
    then(onFulfilled) {
      return Promise.resolve(onFulfilled({ data: rows, error: null }));
    },
  };

  chain.select.mockReturnValue(chain);
  chain.eq.mockImplementation(((col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return chain;
  }) as never);
  chain.is.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);

  return chain;
}

function buildInsertChain(row: Record<string, unknown>): MockChain {
  const chain = buildListChain([]);
  chain.insert.mockImplementation(((payload: Record<string, unknown>) => {
    chain.insertedRow = payload;
    return chain;
  }) as never);
  chain.single.mockResolvedValue({ data: row, error: null } as never);
  chain.select.mockReturnValue(chain);
  return chain;
}

describe('rx-template-service (subj-15 scope)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('listRxTemplates filters by scope when provided', async () => {
    const row = {
      id: 't-1',
      doctor_id: doctorId,
      name: 'CC bundle',
      scope: 'chief_complaints',
      medicines_json: [],
      subjective_json: {},
    };

    const chain = buildListChain([row]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    const templates = await listRxTemplates(correlationId, doctorId, 'chief_complaints');
    expect(templates).toEqual([row]);
    expect(chain.eqCalls).toContainEqual(['scope', 'chief_complaints']);
  });

  it('listRxTemplates omits scope filter when scope is undefined', async () => {
    const row = {
      id: 't-2',
      doctor_id: doctorId,
      name: 'Legacy preset',
      scope: 'subjective_full',
      medicines_json: [],
      subjective_json: {},
    };

    const chain = buildListChain([row]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    const templates = await listRxTemplates(correlationId, doctorId);
    expect(templates).toEqual([row]);
    expect(chain.eqCalls.some(([col]: [string, unknown]) => col === 'scope')).toBe(false);
  });

  it('createRxTemplate defaults scope to subjective_full', async () => {
    const inserted = {
      id: 't-3',
      doctor_id: doctorId,
      name: 'Preset',
      scope: 'subjective_full',
      medicines_json: [],
      subjective_json: {},
    };

    const chain = buildInsertChain(inserted);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    const template = await createRxTemplate(
      { name: 'Preset' },
      correlationId,
      doctorId,
    );
    expect(chain.insertedRow?.scope).toBe('subjective_full');
    expect(template.scope).toBe('subjective_full');
  });

  it('createRxTemplate persists explicit scope', async () => {
    const inserted = {
      id: 't-4',
      doctor_id: doctorId,
      name: 'Allergies bundle',
      scope: 'allergies',
      medicines_json: [],
      subjective_json: {},
    };

    const chain = buildInsertChain(inserted);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    const template = await createRxTemplate(
      { name: 'Allergies bundle', scope: 'allergies' },
      correlationId,
      doctorId,
    );
    expect(chain.insertedRow?.scope).toBe('allergies');
    expect(template.scope).toBe('allergies');
  });

  it('createRxTemplate normalizes + persists pmh_json snapshot (subj-17)', async () => {
    const inserted = { id: 't-5', doctor_id: doctorId, name: 'PMH', scope: 'past_medical' };
    const chain = buildInsertChain(inserted);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: jest.fn(() => chain) } as never);

    await createRxTemplate(
      {
        name: 'PMH',
        scope: 'past_medical',
        pmh: {
          conditions: [{ condition: '  Diabetes  ', status: 'active' }, { condition: '' }],
          medications: [{ drugName: 'Metformin', strength: '500mg', status: 'active' }],
        },
      },
      correlationId,
      doctorId,
    );

    const pmh = chain.insertedRow?.pmh_json as {
      conditions: { condition: string }[];
      medications: { drugName: string }[];
    };
    // Trimmed + dropped the nameless row.
    expect(pmh.conditions).toEqual([{ condition: 'Diabetes', status: 'active' }]);
    expect(pmh.medications).toEqual([
      { drugName: 'Metformin', strength: '500mg', status: 'active' },
    ]);
    // Absent allergies slice defaults to an empty object (matches column default).
    expect(chain.insertedRow?.allergies_json).toEqual({});
  });

  it('createRxTemplate normalizes + persists allergies_json snapshot (subj-17)', async () => {
    const inserted = { id: 't-6', doctor_id: doctorId, name: 'Allergies', scope: 'allergies' };
    const chain = buildInsertChain(inserted);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: jest.fn(() => chain) } as never);

    await createRxTemplate(
      {
        name: 'Allergies',
        scope: 'allergies',
        allergies: {
          allergies: [{ allergen: ' Penicillin ', severity: 'severe', reaction: 'rash' }],
        },
      },
      correlationId,
      doctorId,
    );

    expect(chain.insertedRow?.allergies_json).toEqual({
      allergies: [{ allergen: 'Penicillin', severity: 'severe', reaction: 'rash' }],
    });
  });

  it('createRxTemplate round-trips subjective_json.customSubsections for custom_block (subj-39)', async () => {
    const inserted = { id: 't-7', doctor_id: doctorId, name: 'Diet', scope: 'custom_block' };
    const chain = buildInsertChain(inserted);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: jest.fn(() => chain) } as never);

    await createRxTemplate(
      {
        name: 'Diet',
        scope: 'custom_block',
        subjective: {
          customSubsections: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              title: '  Diet  ',
              body: '  Low salt  ',
              children: [
                { id: '22222222-2222-2222-2222-222222222222', title: ' Breakfast ', body: 'Oats' },
              ],
            },
          ],
        },
      },
      correlationId,
      doctorId,
    );

    const subjective = chain.insertedRow?.subjective_json as {
      customSubsections: Array<{
        id: string;
        title: string;
        body: string | null;
        children: Array<{ id: string; title: string; body: string | null }>;
      }>;
    };
    expect(subjective.customSubsections).toEqual([
      {
        id: '11111111-1111-1111-1111-111111111111',
        title: 'Diet',
        body: 'Low salt',
        children: [
          { id: '22222222-2222-2222-2222-222222222222', title: 'Breakfast', body: 'Oats' },
        ],
      },
    ]);
  });

  it('createRxTemplate drops malformed customSubsections + mints missing ids (subj-39)', async () => {
    const inserted = { id: 't-8', doctor_id: doctorId, name: 'Full', scope: 'subjective_full' };
    const chain = buildInsertChain(inserted);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: jest.fn(() => chain) } as never);

    await createRxTemplate(
      {
        name: 'Full',
        scope: 'subjective_full',
        subjective: {
          customSubsections: [
            // No usable title — dropped.
            { id: '33333333-3333-3333-3333-333333333333', title: '   ', children: [] },
            // Missing id — minted.
            { id: '', title: 'Keep', body: null, children: [] },
          ],
        },
      },
      correlationId,
      doctorId,
    );

    const subjective = chain.insertedRow?.subjective_json as {
      customSubsections: Array<{ id: string; title: string }>;
    };
    expect(subjective.customSubsections).toHaveLength(1);
    expect(subjective.customSubsections[0]?.title).toBe('Keep');
    expect(subjective.customSubsections[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('createRxTemplate omits customSubsections when subjective is absent (subj-39)', async () => {
    const inserted = { id: 't-9', doctor_id: doctorId, name: 'Plain', scope: 'subjective_full' };
    const chain = buildInsertChain(inserted);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: jest.fn(() => chain) } as never);

    await createRxTemplate({ name: 'Plain' }, correlationId, doctorId);

    expect(chain.insertedRow?.subjective_json).toEqual({});
  });

  it('createRxTemplate round-trips multiple customSubsections on subjective_full (subj-42)', async () => {
    const inserted = { id: 't-10', doctor_id: doctorId, name: 'Full bundle', scope: 'subjective_full' };
    const chain = buildInsertChain(inserted);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: jest.fn(() => chain) } as never);

    await createRxTemplate(
      {
        name: 'Full bundle',
        scope: 'subjective_full',
        subjective: {
          complaints: [{ id: 'c-1', name: 'Fever' }],
          customSubsections: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              title: 'Diet',
              body: 'Low salt',
              children: [],
            },
            {
              id: '22222222-2222-4222-8222-222222222222',
              title: 'Exercise',
              body: 'Walk daily',
              children: [
                { id: '33333333-3333-4333-8333-333333333333', title: 'Morning', body: '30 min' },
              ],
            },
          ],
        },
      },
      correlationId,
      doctorId,
    );

    const subjective = chain.insertedRow?.subjective_json as {
      complaints: Array<{ name: string }>;
      customSubsections: Array<{
        id: string;
        title: string;
        body: string | null;
        children: Array<{ id: string; title: string; body: string | null }>;
      }>;
    };
    expect(subjective.complaints).toEqual([{ id: 'c-1', name: 'Fever' }]);
    expect(subjective.customSubsections).toHaveLength(2);
    expect(subjective.customSubsections[0]?.title).toBe('Diet');
    expect(subjective.customSubsections[1]?.children).toEqual([
      { id: '33333333-3333-4333-8333-333333333333', title: 'Morning', body: '30 min' },
    ]);
  });
});
