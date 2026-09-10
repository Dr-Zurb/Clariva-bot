import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/services/patient-matching-service', () => ({
  findPossiblePatientMatches: jest.fn(),
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn(async () => undefined),
  logDataModification: jest.fn(async () => undefined),
  logAuditEvent: jest.fn(async () => undefined),
}));

const from = jest.fn<(...args: unknown[]) => unknown>();

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(() => ({ from })),
  supabase: {},
}));

import {
  archivePatientForFrontDesk,
  restorePatientForFrontDesk,
} from '../../../src/services/patient-service';
import { logDataModification } from '../../../src/utils/audit-logger';
import { ForbiddenError, ValidationError } from '../../../src/utils/errors';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const OTHER_DOCTOR = '00000000-0000-0000-0000-0000000000bb';
const ACTOR_ID = '00000000-0000-4000-8000-0000000000cc';
const PATIENT_ID = '00000000-0000-4000-8000-0000000000ee';

const OWNED: {
  id: string;
  name: string;
  phone: string;
  doctor_id: string;
  archived_at: string | null;
  archived_by: string | null;
} = {
  id: PATIENT_ID,
  name: 'Ria Sharma',
  phone: '9814861579',
  doctor_id: DOCTOR_ID,
  archived_at: null,
  archived_by: null,
};

const CLINICAL_TABLES = new Set([
  'prescriptions',
  'patient_allergies',
  'patient_chronic_conditions',
  'patient_medications',
  'patient_vitals',
  'patient_problem_list_v',
]);

let completedHit = false;
let clinicalHitTable: string | null = null;
let lastUpdate: Record<string, unknown> | null = null;
let updatedRow: typeof OWNED | null = null;

function emptyMaybe() {
  return Promise.resolve({ data: null, error: null });
}

function clinicalChain(table: string) {
  return {
    select: () => ({
      eq: () => ({
        limit: () => ({
          maybeSingle: () =>
            Promise.resolve(
              clinicalHitTable === table
                ? { data: { id: 'hit' }, error: null }
                : { data: null, error: null }
            ),
        }),
      }),
    }),
  };
}

function accessChain() {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          limit: () => ({ maybeSingle: () => emptyMaybe() }),
          maybeSingle: () => emptyMaybe(),
        }),
      }),
    }),
  };
}

function mockOwnedFrom(row: typeof OWNED) {
  let appointmentQueries = 0;
  lastUpdate = null;
  from.mockImplementation((table: unknown) => {
    const name = String(table);
    if (name === 'conversations') return accessChain();
    if (name === 'appointments') {
      appointmentQueries += 1;
      if (appointmentQueries === 1) return accessChain();
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: () =>
                  Promise.resolve(
                    completedHit ? { data: { id: 'apt' }, error: null } : { data: null, error: null }
                  ),
              }),
            }),
          }),
        }),
      };
    }
    if (CLINICAL_TABLES.has(name)) return clinicalChain(name);
    return {
      select: (cols?: unknown) => {
        if (cols === '*') {
          return {
            eq: () => ({
              single: () => Promise.resolve({ data: row, error: null }),
            }),
          };
        }
        return {
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { id: PATIENT_ID }, error: null }),
            }),
          }),
        };
      },
      update: (patch: Record<string, unknown>) => {
        lastUpdate = patch;
        const next = { ...row, ...patch };
        updatedRow = next;
        return {
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: next, error: null }),
              }),
            }),
          }),
        };
      },
    };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  completedHit = false;
  clinicalHitTable = null;
  lastUpdate = null;
  updatedRow = null;
  mockOwnedFrom(OWNED);
});

describe('archivePatientForFrontDesk', () => {
  it('stamps archived_at and audits field names only', async () => {
    const result = await archivePatientForFrontDesk(DOCTOR_ID, PATIENT_ID, 'cid', ACTOR_ID);

    expect(result.kind).toBe('archived');
    if (result.kind === 'archived') {
      expect(result.patient.archived_at).toBeTruthy();
      expect(result.patient.archived_by).toBe(ACTOR_ID);
    }
    expect(lastUpdate).toEqual(
      expect.objectContaining({
        archived_by: ACTOR_ID,
      })
    );
    expect(logDataModification).toHaveBeenCalledWith(
      'cid',
      ACTOR_ID,
      'update',
      'patient',
      PATIENT_ID,
      ['archived_at', 'archived_by'],
      DOCTOR_ID
    );
  });

  it('is idempotent when already archived', async () => {
    mockOwnedFrom({
      ...OWNED,
      archived_at: '2026-08-23T00:00:00.000Z',
      archived_by: ACTOR_ID,
    });

    const result = await archivePatientForFrontDesk(DOCTOR_ID, PATIENT_ID, 'cid', ACTOR_ID);

    expect(result.kind).toBe('archived');
    expect(lastUpdate).toBeNull();
    expect(logDataModification).not.toHaveBeenCalled();
  });

  it('refuses a merged row', async () => {
    mockOwnedFrom({
      ...OWNED,
      name: '[Merged]',
      phone: `merged-${PATIENT_ID}`,
    });

    await expect(archivePatientForFrontDesk(DOCTOR_ID, PATIENT_ID, 'cid')).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(lastUpdate).toBeNull();
  });

  it('refuses when a completed appointment exists', async () => {
    completedHit = true;

    const result = await archivePatientForFrontDesk(DOCTOR_ID, PATIENT_ID, 'cid');

    expect(result).toEqual({ kind: 'has_clinical_data' });
    expect(lastUpdate).toBeNull();
  });

  it('forbids a patient owned by another doctor with no link', async () => {
    from.mockImplementation((table: unknown) => {
      if (table === 'conversations' || table === 'appointments') return accessChain();
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => emptyMaybe(),
            }),
          }),
        }),
      };
    });

    await expect(
      archivePatientForFrontDesk(OTHER_DOCTOR, PATIENT_ID, 'cid')
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('restorePatientForFrontDesk', () => {
  it('clears the archive stamp', async () => {
    mockOwnedFrom({
      ...OWNED,
      archived_at: '2026-08-23T00:00:00.000Z',
      archived_by: ACTOR_ID,
    });

    const patient = await restorePatientForFrontDesk(DOCTOR_ID, PATIENT_ID, 'cid', ACTOR_ID);

    expect(patient.archived_at).toBeNull();
    expect(patient.archived_by).toBeNull();
    expect(lastUpdate).toEqual({ archived_at: null, archived_by: null });
    expect(updatedRow).toBeTruthy();
    expect(logDataModification).toHaveBeenCalledWith(
      'cid',
      ACTOR_ID,
      'update',
      'patient',
      PATIENT_ID,
      ['archived_at', 'archived_by'],
      DOCTOR_ID
    );
  });
});
