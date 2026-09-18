/**
 * Lightweight patients-list hover peek — skips appointments/Rx/payments.
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

const listAllergies = jest.fn(
  async (_patientId: string, _correlationId: string, _userId: string) => [
    { id: 'a1', allergen: 'Penicillin' },
  ]
);
const listChronicConditions = jest.fn(
  async (_patientId: string, _correlationId: string, _userId: string) => [
    { id: 'c1', condition: 'Hypertension', status: 'active' },
  ]
);
const getProblemList = jest.fn(
  async (_patientId: string, _correlationId: string, _userId: string) => [
    { label: 'Hypertension', source: 'chronic' },
  ]
);
const listVitals = jest.fn(
  async (
    _patientId: string,
    _correlationId: string,
    _userId: string,
    _limit?: number
  ) => [
    {
      height_cm: 170,
      weight_kg: 72,
      recorded_at: '2026-05-01T00:00:00.000Z',
    },
  ]
);
const listAppointmentsForPatient = jest.fn(
  async (_patientId: string, _userId: string, _correlationId: string) => {
    throw new Error('peek must not load appointments');
  }
);
const listPrescriptionsByPatient = jest.fn(
  async (_patientId: string, _correlationId: string, _userId: string) => {
    throw new Error('peek must not load prescriptions');
  }
);

jest.mock('../../../src/services/patient-chart-service', () => ({
  listAllergies,
  listChronicConditions,
  getProblemList,
  listVitals,
}));

jest.mock('../../../src/services/appointment-service', () => ({
  listAppointmentsForPatient,
}));

jest.mock('../../../src/services/prescription-service', () => ({
  listPrescriptionsByPatient,
}));

jest.mock('../../../src/services/patient-service', () => ({
  findPatientByIdWithAdmin: jest.fn(async () => ({
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    name: 'Akashdeep Singh',
  })),
}));

import { getPatientQuickPeek } from '../../../src/services/patient-overview-service';

const DOCTOR = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PATIENT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function buildChain(result: Record<string, unknown>) {
  const chain: Record<string, jest.Mock | ((resolve: (v: unknown) => void) => Promise<void>)> =
    {};
  const terminal = jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue(result);
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = terminal;
  return chain;
}

describe('getPatientQuickPeek', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    listAllergies.mockClear();
    listChronicConditions.mockClear();
    getProblemList.mockClear();
    listVitals.mockClear();
    listAppointmentsForPatient.mockClear();
    listPrescriptionsByPatient.mockClear();
  });

  it('returns slim chart fields and never loads appointments or prescriptions', async () => {
    mockFrom.mockImplementation(() =>
      buildChain({ data: { id: 'link-1' }, error: null })
    );

    const peek = await getPatientQuickPeek(PATIENT, 'cid', DOCTOR);

    expect(peek.patient).toEqual({ id: PATIENT, name: 'Akashdeep Singh' });
    expect(peek.snapshot.height_cm).toBe(170);
    expect(peek.snapshot.weight_kg).toBe(72);
    expect(peek.allergies).toHaveLength(1);
    expect(peek.chronic_conditions).toHaveLength(1);
    expect(peek.active_problems).toHaveLength(1);

    expect(listVitals).toHaveBeenCalledWith(PATIENT, 'cid', DOCTOR, 20);
    expect(listAppointmentsForPatient).not.toHaveBeenCalled();
    expect(listPrescriptionsByPatient).not.toHaveBeenCalled();
  });
});
