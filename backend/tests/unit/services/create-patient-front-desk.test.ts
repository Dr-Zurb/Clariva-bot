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
const rpc = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const insert = jest.fn<(...args: unknown[]) => unknown>();
const select = jest.fn<(...args: unknown[]) => unknown>();
const eq = jest.fn<(...args: unknown[]) => unknown>();
const from = jest.fn<(...args: unknown[]) => unknown>();

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(() => ({ from, rpc })),
  supabase: {},
}));

import { createPatientForFrontDesk } from '../../../src/services/patient-service';
import { logDataModification } from '../../../src/utils/audit-logger';
import {
  ageYearsFromIsoDate,
  calendarYmd,
  subtractCalendarDays,
  subtractCalendarMonths,
} from '../../../src/utils/validation';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const ACTOR_ID = '00000000-0000-0000-0000-0000000000cc';
const PATIENT_ID = '00000000-0000-0000-0000-0000000000ee';

beforeEach(() => {
  jest.clearAllMocks();
  findPossiblePatientMatches.mockResolvedValue([]);
  from.mockImplementation((table: unknown) => {
    if (table === 'patients') {
      return { select, insert, eq };
    }
    return { select, eq };
  });
  select.mockReturnValue({ eq, single, maybeSingle });
  eq.mockReturnValue({ eq, single, maybeSingle, select });
  insert.mockReturnValue({ select });
  maybeSingle.mockResolvedValue({ data: null, error: null });
  single.mockResolvedValue({
    data: {
      id: PATIENT_ID,
      name: 'Ria',
      phone: '9814861579',
      doctor_id: DOCTOR_ID,
      registered_via: 'front_desk',
      medical_record_number: null,
    },
    error: null,
  });
  rpc.mockResolvedValue({ data: 'P-01000', error: null });
});

describe('createPatientForFrontDesk', () => {
  it('returns possible_duplicates without inserting when phone matches an owned patient', async () => {
    select.mockReturnValue({ eq, single, maybeSingle });
    eq.mockImplementation(() => ({
      eq,
      single,
      maybeSingle: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: null,
        error: null,
      }),
      then: (resolve: (v: unknown) => void) =>
        resolve({
          data: [
            {
              id: PATIENT_ID,
              name: 'Ria',
              phone: '9814861579',
              age: 30,
              gender: 'female',
              medical_record_number: 'P-00001',
            },
          ],
          error: null,
        }),
    }));

    const result = await createPatientForFrontDesk(
      DOCTOR_ID,
      { name: 'Ria Sharma', phone: '+919814861579' },
      'cid'
    );

    expect(result.kind).toBe('possible_duplicates');
    if (result.kind === 'possible_duplicates') {
      expect(result.matches[0]?.patientId).toBe(PATIENT_ID);
    }
    expect(insert).not.toHaveBeenCalled();
  });

  it('creates, assigns MRN, and audits the real actor', async () => {
    findPossiblePatientMatches.mockResolvedValue([]);
    eq.mockReturnValue({
      eq,
      single,
      maybeSingle,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    });
    // assignMrnAfterPayment: first from('patients').select.eq.single
    let patientSelects = 0;
    single.mockImplementation(() => {
      patientSelects += 1;
      if (patientSelects === 1) {
        return Promise.resolve({
          data: {
            id: PATIENT_ID,
            name: 'Ria',
            phone: '9814861579',
            doctor_id: DOCTOR_ID,
            registered_via: 'front_desk',
            medical_record_number: null,
          },
          error: null,
        });
      }
      return Promise.resolve({
        data: { id: PATIENT_ID, medical_record_number: null },
        error: null,
      });
    });

    const result = await createPatientForFrontDesk(
      DOCTOR_ID,
      { name: 'Ria', phone: '9814861579', confirmNew: true },
      'cid',
      ACTOR_ID
    );

    expect(result.kind).toBe('created');
    if (result.kind === 'created') {
      expect(result.patient.id).toBe(PATIENT_ID);
      expect(result.patient.medical_record_number).toBe('P-01000');
      expect(result.patient.registered_via).toBe('front_desk');
    }
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        registered_via: 'front_desk',
        created_by: ACTOR_ID,
      })
    );
    expect(rpc).toHaveBeenCalledWith('assign_patient_mrn', { p_patient_id: PATIENT_ID });
    expect(logDataModification).toHaveBeenCalledWith(
      'cid',
      ACTOR_ID,
      'create',
      'patient',
      PATIENT_ID,
      undefined,
      DOCTOR_ID
    );
  });

  it('stores guardian and last-10 alt phone on create', async () => {
    eq.mockReturnValue({
      eq,
      single,
      maybeSingle,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    });

    await createPatientForFrontDesk(
      DOCTOR_ID,
      {
        name: 'Sunita Devi',
        phone: '9814861579',
        guardianName: 'Ram Prakash',
        guardianRelation: 'spouse',
        altPhone: '+919000010017',
        address: '42 Model Town',
        confirmNew: true,
      },
      'cid',
      ACTOR_ID
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        guardian_name: 'Ram Prakash',
        guardian_relation: 'spouse',
        alt_phone: '9000010017',
        address: '42 Model Town',
      })
    );
  });

  it('stores date of birth and derives whole-year age', async () => {
    eq.mockReturnValue({
      eq,
      single,
      maybeSingle,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    });

    const now = new Date();
    const dob = `${now.getFullYear() - 31}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    await createPatientForFrontDesk(
      DOCTOR_ID,
      {
        name: 'Ria Sharma',
        phone: '9814861579',
        dateOfBirth: dob,
        confirmNew: true,
      },
      'cid',
      ACTOR_ID
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        date_of_birth: dob,
        age: 31,
      })
    );
  });

  it('stores age 0 for an infant DOB and does not invent a DOB from years', async () => {
    eq.mockReturnValue({
      eq,
      single,
      maybeSingle,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    });

    const now = new Date();
    const infantDob = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    await createPatientForFrontDesk(
      DOCTOR_ID,
      {
        name: 'Baby Sharma',
        phone: '9814861579',
        dateOfBirth: infantDob,
        confirmNew: true,
      },
      'cid',
      ACTOR_ID
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        date_of_birth: infantDob,
        age: 0,
      })
    );

    await createPatientForFrontDesk(
      DOCTOR_ID,
      {
        name: 'Ria Sharma',
        phone: '9814861579',
        age: 31,
        confirmNew: true,
      },
      'cid',
      ACTOR_ID
    );

    expect(insert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        age: 31,
        date_of_birth: undefined,
      })
    );
  });

  it('derives a date of birth from months or days', async () => {
    eq.mockReturnValue({
      eq,
      single,
      maybeSingle,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    });

    const today = calendarYmd();
    const threeMonths = subtractCalendarMonths(today, 3);
    const tenDays = subtractCalendarDays(today, 10);

    await createPatientForFrontDesk(
      DOCTOR_ID,
      {
        name: 'Baby Sharma',
        phone: '9814861579',
        age: 3,
        ageUnit: 'months',
        confirmNew: true,
      },
      'cid',
      ACTOR_ID
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        date_of_birth: threeMonths,
        age: ageYearsFromIsoDate(threeMonths!),
      })
    );

    await createPatientForFrontDesk(
      DOCTOR_ID,
      {
        name: 'Newborn Sharma',
        phone: '9814861579',
        age: 10,
        ageUnit: 'days',
        confirmNew: true,
      },
      'cid',
      ACTOR_ID
    );

    expect(insert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        date_of_birth: tenDays,
        age: 0,
      })
    );
  });

  it('stamps doctor as registered_via when the actor is the doctor', async () => {
    eq.mockReturnValue({
      eq,
      single,
      maybeSingle,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    });
    single.mockResolvedValue({
      data: {
        id: PATIENT_ID,
        name: 'Ria',
        phone: '9814861579',
        doctor_id: DOCTOR_ID,
        registered_via: 'doctor',
        created_by: DOCTOR_ID,
        medical_record_number: null,
      },
      error: null,
    });

    const result = await createPatientForFrontDesk(
      DOCTOR_ID,
      { name: 'Ria', phone: '9814861579', confirmNew: true },
      'cid',
      DOCTOR_ID
    );

    expect(result.kind).toBe('created');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        registered_via: 'doctor',
        created_by: DOCTOR_ID,
      })
    );
  });
});
