/**
 * np-10 — cross-tenant parity battery (NP-DL-7 / NP-R8).
 *
 * Verifies changed read paths always apply doctor_id scoping on the admin client.
 * Uses mocked Supabase chain — no live DB, no PHI.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/services/prescription-pdf-service', () => ({
  generatePrescriptionPdf: jest.fn(async () => Buffer.from([])),
  buildPrescriptionPdfContext: jest.fn(async () => ({})),
}));

const mockFrom = jest.fn();
const mockAdmin = { from: mockFrom };

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => mockAdmin,
  supabase: mockAdmin,
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn(async () => undefined),
  logDataModification: jest.fn(async () => undefined),
  logAuditEvent: jest.fn(async () => undefined),
}));

jest.mock('../../../src/services/patient-matching-service', () => ({
  listPossibleDuplicates: jest.fn(async () => ({ groups: [] })),
}));

import { listPrescriptionsByPatient } from '../../../src/services/prescription-service';
import {
  __resetKpisCacheForTests,
  computePatientsKpis,
} from '../../../src/services/patient-overview-service';

const DOCTOR_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DOCTOR_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PATIENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function buildChain(result: Record<string, unknown>) {
  const chain: Record<string, jest.Mock | ((resolve: (v: unknown) => void) => Promise<void>)> =
    {};
  const terminal = jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue(result);
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.not = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  chain.gte = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = terminal;
  chain.then = (resolve: (v: unknown) => void) => {
    void terminal().then(resolve);
    return Promise.resolve();
  };
  return chain;
}

describe('np-10 tenant isolation — prescription embed path', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('scopes listPrescriptionsByPatient by doctor_id on the embed query', async () => {
    const rxChain = buildChain({
      data: [
        {
          id: 'rx-1',
          patient_id: PATIENT_ID,
          doctor_id: DOCTOR_A,
          prescription_medicines: [],
          prescription_attachments: [],
        },
      ],
      error: null,
    });
    mockFrom.mockImplementation((table: unknown) => {
      if (table === 'appointments' || table === 'conversations') {
        return buildChain({ data: { id: 'link-1' }, error: null });
      }
      return rxChain;
    });

    await listPrescriptionsByPatient(PATIENT_ID, 'cid', DOCTOR_A);

    expect((rxChain.eq as jest.Mock).mock.calls).toEqual(
      expect.arrayContaining([
        ['doctor_id', DOCTOR_A],
        ['patient_id', PATIENT_ID],
      ])
    );
    expect(rxChain.select).toHaveBeenCalledWith(
      '*, prescription_medicines(*), prescription_attachments(*)'
    );
  });

  it('skipAccessGate still scopes by doctor_id (no cross-tenant widen)', async () => {
    const rxChain = buildChain({ data: [], error: null });
    mockFrom.mockReturnValue(rxChain);

    await listPrescriptionsByPatient(PATIENT_ID, 'cid', DOCTOR_A, {
      skipAccessGate: true,
    });

    expect(mockFrom).toHaveBeenCalledWith('prescriptions');
    expect((rxChain.eq as jest.Mock).mock.calls).toContainEqual(['doctor_id', DOCTOR_A]);
    expect((rxChain.eq as jest.Mock).mock.calls).not.toContainEqual(['doctor_id', DOCTOR_B]);
  });
});

describe('np-10 tenant isolation — KPI parallel count path', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    __resetKpisCacheForTests();
  });

  it('every KPI query includes doctor_id = authenticated user', async () => {
    const doctorIdCalls: Array<[string, string]> = [];

    mockFrom.mockImplementation((table: unknown) => {
      const tableName = String(table);
      const chain = buildChain({
        data: tableName === 'appointments' ? [] : [],
        count: 0,
        error: null,
      });
      chain.eq = jest.fn().mockImplementation((col: unknown, val: unknown) => {
        if (col === 'doctor_id') doctorIdCalls.push([tableName, String(val)]);
        return chain;
      });
      if (tableName === 'patients') {
        chain.gte = jest.fn().mockReturnValue(chain);
        chain.in = jest.fn().mockReturnValue(chain);
      }
      return chain;
    });

    await computePatientsKpis(DOCTOR_A, 'cid');

    const aptScoped = doctorIdCalls.filter(([t]) => t === 'appointments');
    const rxScoped = doctorIdCalls.filter(([t]) => t === 'prescriptions');
    const problemScoped = doctorIdCalls.filter(([t]) => t === 'patient_problem_list_v');

    expect(aptScoped.every(([, id]) => id === DOCTOR_A)).toBe(true);
    expect(rxScoped.every(([, id]) => id === DOCTOR_A)).toBe(true);
    expect(problemScoped.every(([, id]) => id === DOCTOR_A)).toBe(true);
    expect(doctorIdCalls.some(([, id]) => id === DOCTOR_B)).toBe(false);
  });
});
