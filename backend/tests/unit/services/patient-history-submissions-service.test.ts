import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
  supabase: {},
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn(async () => undefined),
  logDataModification: jest.fn(async () => undefined),
  logAuditEvent: jest.fn(async () => undefined),
}));

jest.mock('../../../src/services/patient-chart-service', () => ({
  createAllergy: jest.fn(async () => ({ id: 'alg-1' })),
  createChronicCondition: jest.fn(async () => ({ id: 'cond-1' })),
  createMedication: jest.fn(async () => ({ id: 'med-1' })),
  getAllergySectionNotes: jest.fn(async () => ({
    notes: null,
    noKnownAllergies: false,
    noKnownAllergiesAt: null,
  })),
  listAllergies: jest.fn(async (): Promise<Array<{ id: string; allergen: string }>> => []),
  listChronicConditions: jest.fn(async (): Promise<Array<{ id: string; condition: string }>> => []),
  listMedications: jest.fn(async (): Promise<Array<{ id: string; drug_name: string; status: string }>> => []),
  upsertAllergySectionNotes: jest.fn(async () => ({
    notes: null,
    noKnownAllergies: true,
    noKnownAllergiesAt: '2026-09-12T04:02:00.000Z',
  })),
}));

import { getSupabaseAdminClient } from '../../../src/config/database';
import {
  acceptHistorySubmissionItem,
  getHistorySubmission,
  getHistorySubmissionView,
  splitWhyToday,
  upsertHistorySubmission,
} from '../../../src/services/patient-history-submissions-service';
import {
  createAllergy,
  createChronicCondition,
  createMedication,
  listAllergies,
  listMedications,
  upsertAllergySectionNotes,
} from '../../../src/services/patient-chart-service';
import { logDataAccess, logDataModification } from '../../../src/utils/audit-logger';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../src/utils/errors';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const ACTOR_ID = '00000000-0000-0000-0000-0000000000cc';
const APT_ID = '00000000-0000-0000-0000-0000000000ff';
const PATIENT_ID = '00000000-0000-0000-0000-0000000000ee';
const SUB_ID = '00000000-0000-0000-0000-0000000000bb';

const CHECKED_IN = {
  id: APT_ID,
  doctor_id: DOCTOR_ID,
  patient_id: PATIENT_ID,
  status: 'confirmed',
  patient_checked_in_at: '2026-09-12T04:00:00.000Z',
};

const BODY = {
  whyToday: 'Headache since morning',
  allergies: { none: true, items: [] },
  medicines: { none: true, items: [] },
  conditions: { none: true, items: [] },
};

function appointmentChain(row: Record<string, unknown> | null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: row,
      error: null,
    }),
  };
}

function lookupChain(row: Record<string, unknown> | null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: row,
      error: null,
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getHistorySubmission', () => {
  it('returns null and audits the staff actor', async () => {
    const apt = appointmentChain(CHECKED_IN);
    const rows = lookupChain(null);
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'appointments' ? apt : rows)),
    });

    const row = await getHistorySubmission(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID);
    expect(row).toBeNull();
    expect(logDataAccess).toHaveBeenCalledWith(
      'cid',
      ACTOR_ID,
      'patient_history_submission',
      PATIENT_ID
    );
  });

  it('hides another doctor appointment', async () => {
    const apt = appointmentChain({ ...CHECKED_IN, doctor_id: 'other' });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => apt),
    });

    await expect(getHistorySubmission(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('returns a chart snapshot for the desk form', async () => {
    jest.mocked(listAllergies).mockResolvedValueOnce([
      { allergen: 'Penicillin', reaction: 'rash' },
    ] as never);
    jest.mocked(listMedications).mockResolvedValueOnce([
      { drug_name: 'Metformin', dose: '500 mg', status: 'active' },
    ] as never);
    const apt = appointmentChain(CHECKED_IN);
    const rows = lookupChain(null);
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'appointments' ? apt : rows)),
    });

    const view = await getHistorySubmissionView(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID);
    expect(view.submission).toBeNull();
    expect(view.chart?.allergies).toEqual([{ allergen: 'Penicillin', reaction: 'rash' }]);
    expect(view.chart?.medications).toEqual([{ drug_name: 'Metformin', dose: '500 mg' }]);
  });
});

describe('upsertHistorySubmission', () => {
  it('rejects before check-in', async () => {
    const apt = appointmentChain({ ...CHECKED_IN, patient_checked_in_at: null });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => apt),
    });

    await expect(
      upsertHistorySubmission(APT_ID, DOCTOR_ID, BODY, 'cid', ACTOR_ID, true)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('inserts a sidecar row and audits the staff actor', async () => {
    const created = {
      id: SUB_ID,
      doctor_id: DOCTOR_ID,
      patient_id: PATIENT_ID,
      appointment_id: APT_ID,
      source: 'front_desk',
      actor_id: ACTOR_ID,
      why_today: BODY.whyToday,
      allergies: BODY.allergies,
      medicines: BODY.medicines,
      conditions: BODY.conditions,
      notice_version: null,
      submitted_at: '2026-09-12T04:01:00.000Z',
      updated_at: '2026-09-12T04:01:00.000Z',
    };
    const apt = appointmentChain(CHECKED_IN);
    const prescriptions = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: null,
        error: null,
      }),
    };
    const lookup = lookupChain(null);
    const insert = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: created,
        error: null,
      }),
    };

    let historyCalls = 0;
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return apt;
        if (table === 'prescriptions') return prescriptions;
        historyCalls += 1;
        return historyCalls === 1 ? lookup : insert;
      }),
    });

    const row = await upsertHistorySubmission(APT_ID, DOCTOR_ID, BODY, 'cid', ACTOR_ID, true);

    expect(row.id).toBe(SUB_ID);
    expect(row.source).toBe('front_desk');
    expect(row.actor_id).toBe(ACTOR_ID);
    expect(upsertAllergySectionNotes).toHaveBeenCalledWith(
      PATIENT_ID,
      { noKnownAllergies: true },
      'cid',
      DOCTOR_ID
    );
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        doctor_id: DOCTOR_ID,
        patient_id: PATIENT_ID,
        source: 'front_desk',
        actor_id: ACTOR_ID,
      })
    );
    expect(logDataModification).toHaveBeenCalledWith(
      'cid',
      ACTOR_ID,
      'create',
      'patient_history_submission',
      SUB_ID,
      undefined,
      DOCTOR_ID
    );
  });

  it('blocks staff after the visit is opened', async () => {
    const apt = appointmentChain(CHECKED_IN);
    const prescriptions = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: { id: 'rx-1' },
        error: null,
      }),
    };
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'appointments' ? apt : prescriptions)),
    });

    await expect(
      upsertHistorySubmission(APT_ID, DOCTOR_ID, BODY, 'cid', ACTOR_ID, true)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('writes named chart rows on desk upsert and does not seed cc', async () => {
    const named = {
      whyToday: '',
      allergies: { none: false, items: [{ name: 'Penicillin', reaction: 'rash' }] },
      medicines: { none: false, items: [{ name: 'Metformin', dose: '500 mg' }] },
      conditions: { none: false, items: [{ name: 'Essential hypertension', code: 'BA00' }] },
    };
    const created = {
      id: SUB_ID,
      doctor_id: DOCTOR_ID,
      patient_id: PATIENT_ID,
      appointment_id: APT_ID,
      source: 'front_desk',
      actor_id: ACTOR_ID,
      why_today: '',
      allergies: named.allergies,
      medicines: named.medicines,
      conditions: named.conditions,
      notice_version: null,
      submitted_at: '2026-09-12T04:01:00.000Z',
      updated_at: '2026-09-12T04:01:00.000Z',
    };
    const apt = appointmentChain(CHECKED_IN);
    const prescriptions = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: null,
        error: null,
      }),
    };
    const lookup = lookupChain(null);
    const insert = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: created,
        error: null,
      }),
    };
    let historyCalls = 0;
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return apt;
        if (table === 'prescriptions') return prescriptions;
        historyCalls += 1;
        return historyCalls === 1 ? lookup : insert;
      }),
    });

    await upsertHistorySubmission(APT_ID, DOCTOR_ID, named, 'cid', ACTOR_ID, true);

    expect(createAllergy).toHaveBeenCalledWith(
      PATIENT_ID,
      { allergen: 'Penicillin', reaction: 'rash', severity: 'unknown' },
      'cid',
      DOCTOR_ID
    );
    expect(createMedication).toHaveBeenCalledWith(
      PATIENT_ID,
      { drugName: 'Metformin', dose: '500 mg', status: 'active', source: 'self' },
      'cid',
      DOCTOR_ID
    );
    expect(createChronicCondition).toHaveBeenCalledWith(
      PATIENT_ID,
      expect.objectContaining({ condition: 'Essential hypertension', code: 'BA00' }),
      'cid',
      DOCTOR_ID
    );
    expect(createAllergy).toHaveBeenCalledTimes(1);
  });
});

const NAMED_SUBMISSION = {
  id: SUB_ID,
  doctor_id: DOCTOR_ID,
  patient_id: PATIENT_ID,
  appointment_id: APT_ID,
  source: 'front_desk',
  actor_id: ACTOR_ID,
  why_today: 'Headache since morning',
  allergies: { none: false, items: [{ name: 'Penicillin', reaction: 'rash' }] },
  medicines: { none: false, items: [{ name: 'Metformin', dose: '500 mg' }] },
  conditions: { none: false, items: [{ name: 'Diabetes' }] },
  notice_version: null,
  submitted_at: '2026-09-12T04:01:00.000Z',
  updated_at: '2026-09-12T04:01:00.000Z',
};

function updateChain(row: Record<string, unknown>) {
  return {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: row,
      error: null,
    }),
  };
}

function mockAcceptDb(opts: {
  submission: Record<string, unknown>;
  prescription?: Record<string, unknown> | null;
  updated?: Record<string, unknown>;
}) {
  const apt = appointmentChain(CHECKED_IN);
  const lookup = lookupChain(opts.submission);
  const prescriptions = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: opts.prescription === undefined ? { id: 'rx-1', cc: null, hopi: null } : opts.prescription,
      error: null,
    }),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
  };
  const updated = updateChain(opts.updated ?? opts.submission);
  (getSupabaseAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn((table: string) => {
      if (table === 'appointments') return apt;
      if (table === 'prescriptions') return prescriptions;
      if (table === 'patient_history_submissions') {
        return {
          ...lookup,
          ...updated,
        };
      }
      return lookup;
    }),
  });
  return { prescriptions, updated };
}

describe('splitWhyToday', () => {
  it('puts a short line on cc only', () => {
    expect(splitWhyToday('Headache since morning')).toEqual({
      cc: 'Headache since morning',
      hopi: null,
    });
  });

  it('splits a long line at 120 chars into cc and hopi', () => {
    const text = `${'a'.repeat(130)} extra`;
    const result = splitWhyToday(text);
    expect(result.cc).toHaveLength(120);
    expect(result.hopi?.startsWith('a')).toBe(true);
  });
});

describe('acceptHistorySubmissionItem', () => {
  it('seeds prescriptions.cc and does not write reason_for_visit', async () => {
    const stamped = {
      ...NAMED_SUBMISSION,
      allergies: {
        ...NAMED_SUBMISSION.allergies,
        why_today_accepted_at: '2026-09-12T04:03:00.000Z',
        why_today_accepted_by: DOCTOR_ID,
      },
    };
    const { prescriptions } = mockAcceptDb({
      submission: NAMED_SUBMISSION,
      prescription: { id: 'rx-1', cc: null, hopi: null },
      updated: stamped,
    });

    const result = await acceptHistorySubmissionItem(
      APT_ID,
      DOCTOR_ID,
      { field: 'why_today' },
      'cid'
    );

    expect(result.outcome).toBe('seeded');
    expect(result.seeded).toEqual({ cc: 'Headache since morning', hopi: null });
    expect(prescriptions.update).toHaveBeenCalledWith({ cc: 'Headache since morning' });
    expect(prescriptions.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ reason_for_visit: expect.anything() })
    );
  });

  it('writes a named allergy with severity unknown', async () => {
    const stamped = {
      ...NAMED_SUBMISSION,
      allergies: {
        none: false,
        items: [
          {
            name: 'Penicillin',
            reaction: 'rash',
            accepted_at: '2026-09-12T04:03:00.000Z',
            accepted_by: DOCTOR_ID,
          },
        ],
      },
    };
    mockAcceptDb({ submission: NAMED_SUBMISSION, updated: stamped });

    const result = await acceptHistorySubmissionItem(
      APT_ID,
      DOCTOR_ID,
      { field: 'allergies', index: 0 },
      'cid'
    );

    expect(result.outcome).toBe('created');
    expect(createAllergy).toHaveBeenCalledWith(
      PATIENT_ID,
      { allergen: 'Penicillin', reaction: 'rash', severity: 'unknown' },
      'cid',
      DOCTOR_ID
    );
  });

  it('sets NKDA on allergy none and does not insert an allergen row', async () => {
    const noneRow = {
      ...NAMED_SUBMISSION,
      allergies: { none: true, items: [] },
    };
    const stamped = {
      ...noneRow,
      allergies: {
        none: true,
        items: [],
        none_accepted_at: '2026-09-12T04:03:00.000Z',
        none_accepted_by: DOCTOR_ID,
      },
    };
    mockAcceptDb({ submission: noneRow, updated: stamped });

    const result = await acceptHistorySubmissionItem(
      APT_ID,
      DOCTOR_ID,
      { field: 'allergies' },
      'cid'
    );

    expect(result.outcome).toBe('nkda');
    expect(upsertAllergySectionNotes).toHaveBeenCalledWith(
      PATIENT_ID,
      { noKnownAllergies: true },
      'cid',
      DOCTOR_ID
    );
    expect(createAllergy).not.toHaveBeenCalled();
  });

  it('refuses NKDA when named allergies already exist', async () => {
    jest.mocked(listAllergies).mockResolvedValueOnce([{ allergen: 'Sulfa' }] as never);
    mockAcceptDb({
      submission: { ...NAMED_SUBMISSION, allergies: { none: true, items: [] } },
    });

    await expect(
      acceptHistorySubmissionItem(APT_ID, DOCTOR_ID, { field: 'allergies' }, 'cid')
    ).rejects.toBeInstanceOf(ConflictError);
    expect(createAllergy).not.toHaveBeenCalled();
  });

  it('merges a case-insensitive duplicate allergy and never inserts again', async () => {
    jest.mocked(listAllergies).mockResolvedValueOnce([{ allergen: 'penicillin' }] as never);
    const stamped = {
      ...NAMED_SUBMISSION,
      allergies: {
        none: false,
        items: [
          {
            name: 'Penicillin',
            reaction: 'rash',
            accepted_at: '2026-09-12T04:03:00.000Z',
            accepted_by: DOCTOR_ID,
          },
        ],
      },
    };
    mockAcceptDb({ submission: NAMED_SUBMISSION, updated: stamped });

    const result = await acceptHistorySubmissionItem(
      APT_ID,
      DOCTOR_ID,
      { field: 'allergies', index: 0 },
      'cid'
    );

    expect(result.outcome).toBe('merged');
    expect(createAllergy).not.toHaveBeenCalled();
  });

  it('writes a medicine as active self-reported', async () => {
    mockAcceptDb({
      submission: NAMED_SUBMISSION,
      updated: NAMED_SUBMISSION,
    });

    await acceptHistorySubmissionItem(
      APT_ID,
      DOCTOR_ID,
      { field: 'medicines', index: 0 },
      'cid'
    );

    expect(createMedication).toHaveBeenCalledWith(
      PATIENT_ID,
      { drugName: 'Metformin', dose: '500 mg', status: 'active', source: 'self' },
      'cid',
      DOCTOR_ID
    );
  });

  it('merges a case-insensitive duplicate medicine', async () => {
    jest.mocked(listMedications).mockResolvedValueOnce([{ drug_name: 'METFORMIN' }] as never);
    mockAcceptDb({ submission: NAMED_SUBMISSION, updated: NAMED_SUBMISSION });

    const result = await acceptHistorySubmissionItem(
      APT_ID,
      DOCTOR_ID,
      { field: 'medicines', index: 0 },
      'cid'
    );

    expect(result.outcome).toBe('merged');
    expect(createMedication).not.toHaveBeenCalled();
  });

  it('writes a condition name only', async () => {
    mockAcceptDb({ submission: NAMED_SUBMISSION, updated: NAMED_SUBMISSION });

    await acceptHistorySubmissionItem(
      APT_ID,
      DOCTOR_ID,
      { field: 'conditions', index: 0 },
      'cid'
    );

    expect(createChronicCondition).toHaveBeenCalledWith(
      PATIENT_ID,
      { condition: 'Diabetes' },
      'cid',
      DOCTOR_ID
    );
  });

  it('refuses medicine none', async () => {
    mockAcceptDb({
      submission: { ...NAMED_SUBMISSION, medicines: { none: true, items: [] } },
    });

    await expect(
      acceptHistorySubmissionItem(APT_ID, DOCTOR_ID, { field: 'medicines' }, 'cid')
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
