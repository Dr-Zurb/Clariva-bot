import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const findPossiblePatientMatches = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/patient-matching-service', () => ({
  findPossiblePatientMatches: (...args: unknown[]) => findPossiblePatientMatches(...args),
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn(async () => undefined),
  logDataModification: jest.fn(async () => undefined),
  logAuditEvent: jest.fn(async () => undefined),
}));

const maybeSingle = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const single = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const update = jest.fn<(...args: unknown[]) => unknown>();
const select = jest.fn<(...args: unknown[]) => unknown>();
const eq = jest.fn<(...args: unknown[]) => unknown>();
const limit = jest.fn<(...args: unknown[]) => unknown>();
const from = jest.fn<(...args: unknown[]) => unknown>();

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(() => ({ from })),
  supabase: {},
}));

import { updatePatientForFrontDesk } from '../../../src/services/patient-service';
import { logDataModification } from '../../../src/utils/audit-logger';
import { ForbiddenError, ValidationError } from '../../../src/utils/errors';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const OTHER_DOCTOR = '00000000-0000-0000-0000-0000000000bb';
const ACTOR_ID = '00000000-0000-4000-8000-0000000000cc';
const PATIENT_ID = '00000000-0000-4000-8000-0000000000ee';
const OTHER_ID = '00000000-0000-4000-8000-0000000000ff';

const OWNED = {
  id: PATIENT_ID,
  name: 'Ria Sharma',
  phone: '9814861579',
  doctor_id: DOCTOR_ID,
  guardian_name: 'Ram Prakash',
  guardian_relation: 'father',
};

const BODY = {
  name: 'Ria Sharma',
  phone: '9814861579',
  age: 31,
  gender: 'female',
  guardianName: 'Anil Sharma',
  guardianRelation: 'father' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  findPossiblePatientMatches.mockResolvedValue([]);
  from.mockImplementation((table: unknown) => {
    if (table === 'conversations' || table === 'appointments') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => ({ maybeSingle }),
            }),
          }),
        }),
      };
    }
    return { select, update, eq };
  });
  select.mockReturnValue({ eq, single, maybeSingle, limit });
  eq.mockReturnValue({ eq, single, maybeSingle, select, then: undefined });
  limit.mockReturnValue({ maybeSingle });
  update.mockReturnValue({ eq });
  maybeSingle.mockResolvedValue({ data: null, error: null });
  single.mockResolvedValue({ data: OWNED, error: null });
});

function grantOwnedAccess(): void {
  maybeSingle
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: { id: PATIENT_ID }, error: null });
  single.mockResolvedValueOnce({ data: OWNED, error: null });
}

describe('updatePatientForFrontDesk', () => {
  it('updates name and guardian and audits the actor', async () => {
    grantOwnedAccess();
    eq.mockImplementation(() => ({
      eq,
      single,
      maybeSingle,
      select,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    }));
    single.mockImplementation(() =>
      Promise.resolve({
        data: { ...OWNED, guardian_name: 'Anil Sharma' },
        error: null,
      })
    );

    const result = await updatePatientForFrontDesk(DOCTOR_ID, PATIENT_ID, BODY, 'cid', ACTOR_ID);

    expect(result.kind).toBe('updated');
    if (result.kind === 'updated') {
      expect(result.patient.guardian_name).toBe('Anil Sharma');
    }
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ria Sharma',
        guardian_name: 'Anil Sharma',
        guardian_relation: 'father',
        age: 31,
      })
    );
    expect(logDataModification).toHaveBeenCalledWith(
      'cid',
      ACTOR_ID,
      'update',
      'patient',
      PATIENT_ID,
      expect.arrayContaining(['name', 'guardian_name', 'phone']),
      DOCTOR_ID
    );
  });

  it('returns possible_duplicates when another owned patient shares the phone', async () => {
    grantOwnedAccess();
    findPossiblePatientMatches.mockResolvedValue([
      { patientId: OTHER_ID, name: 'Other', phone: '9814861579', confidence: 0.8 },
    ]);
    eq.mockImplementation(() => ({
      eq,
      single,
      maybeSingle,
      select,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    }));

    const result = await updatePatientForFrontDesk(DOCTOR_ID, PATIENT_ID, BODY, 'cid');

    expect(result.kind).toBe('possible_duplicates');
    if (result.kind === 'possible_duplicates') {
      expect(result.matches.map((m) => m.patientId)).toEqual([OTHER_ID]);
    }
    expect(update).not.toHaveBeenCalled();
  });

  it('ignores the current patient in the duplicate list', async () => {
    grantOwnedAccess();
    findPossiblePatientMatches.mockResolvedValue([
      { patientId: PATIENT_ID, name: 'Ria', phone: '9814861579', confidence: 1 },
    ]);
    eq.mockImplementation(() => ({
      eq,
      single,
      maybeSingle,
      select,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    }));
    single
      .mockResolvedValueOnce({ data: OWNED, error: null })
      .mockResolvedValueOnce({ data: OWNED, error: null });

    const result = await updatePatientForFrontDesk(DOCTOR_ID, PATIENT_ID, BODY, 'cid');

    expect(result.kind).toBe('updated');
  });

  it('proceeds when confirmNew is set', async () => {
    grantOwnedAccess();
    findPossiblePatientMatches.mockResolvedValue([
      { patientId: OTHER_ID, name: 'Other', phone: '9814861579', confidence: 1 },
    ]);
    single
      .mockResolvedValueOnce({ data: OWNED, error: null })
      .mockResolvedValueOnce({ data: OWNED, error: null });

    const result = await updatePatientForFrontDesk(
      DOCTOR_ID,
      PATIENT_ID,
      { ...BODY, confirmNew: true },
      'cid'
    );

    expect(result.kind).toBe('updated');
    expect(findPossiblePatientMatches).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });

  it('refuses a merged row', async () => {
    const merged = {
      ...OWNED,
      name: '[Merged]',
      phone: `merged-${PATIENT_ID}`,
    };
    from.mockImplementation((table: unknown) => {
      if (table === 'conversations' || table === 'appointments') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: (cols?: unknown) => {
          if (cols === '*') {
            return {
              eq: () => ({
                single: () => Promise.resolve({ data: merged, error: null }),
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
        update,
      };
    });

    await expect(
      updatePatientForFrontDesk(DOCTOR_ID, PATIENT_ID, BODY, 'cid')
    ).rejects.toBeInstanceOf(ValidationError);
    expect(update).not.toHaveBeenCalled();
  });

  it('forbids a patient owned by another doctor with no link', async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(
      updatePatientForFrontDesk(OTHER_DOCTOR, PATIENT_ID, BODY, 'cid')
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(update).not.toHaveBeenCalled();
  });
});
