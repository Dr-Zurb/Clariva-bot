/**
 * rxl-22 — clone parent + children on re-issue.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logDataModification: jest.fn().mockResolvedValue(undefined as never),
  logDataAccess: jest.fn().mockResolvedValue(undefined as never),
}));

import * as database from '../../../src/config/database';
import * as auditLogger from '../../../src/utils/audit-logger';
import { ConflictError, ValidationError } from '../../../src/utils/errors';
import type {
  Prescription,
  PrescriptionAttachment,
  PrescriptionMedicine,
} from '../../../src/types/prescription';
import {
  PRESCRIPTION_CLONE_CLINICAL_COLUMNS,
  PRESCRIPTION_CLONE_SKIP_COLUMNS,
  buildRevisionAttachmentInserts,
  buildRevisionMedicineInserts,
  buildRevisionParentInsert,
  nextRevisionVersion,
  parseRevisionReason,
  reissuePrescriptionAsRevision,
} from '../../../src/services/prescription-revision-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;

const V1_ID = '11111111-1111-1111-1111-111111111111';
const V2_ID = '22222222-2222-2222-2222-222222222222';
const DOCTOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const APPOINTMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CORR = 'corr-rxl-22';

function sourceRx(overrides: Partial<Prescription> = {}): Prescription {
  return {
    id: V1_ID,
    appointment_id: APPOINTMENT_ID,
    episode_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    patient_id: 'pppppppp-pppp-pppp-pppp-pppppppppppp',
    doctor_id: DOCTOR_ID,
    type: 'structured',
    cc: 'fever',
    hopi: 'two days',
    complaints: [{ id: 'c1', name: 'fever' }],
    family_history: 'dm',
    family_history_structured: {} as Prescription['family_history_structured'],
    social_history: 'smoker',
    social_history_structured: {} as Prescription['social_history_structured'],
    past_surgical_history: 'appendectomy',
    past_surgical_history_structured: {} as Prescription['past_surgical_history_structured'],
    custom_subsections: [],
    provisional_diagnosis: 'viral fever',
    diagnoses_json: [
      {
        id: 'd1',
        label: 'viral fever',
        kind: 'primary',
        certainty: 'provisional',
        status: 'new',
      },
    ],
    differential_diagnosis: ['dengue'],
    assessment_note: 'looks well',
    assessment_acuity: 'stable',
    assessment_custom_sections: [],
    vitals_bp_systolic: 120,
    vitals_bp_diastolic: 80,
    vitals_hr: 88,
    vitals_temp_c: 38.2,
    vitals_spo2: 98,
    vitals_wt_kg: 70,
    vitals_ht_cm: 170,
    vitals_rr: 16,
    vitals_pain_score: 2,
    vitals_glucose_mg_dl: 110,
    vitals_gcs_total: 15,
    vitals_bp_posture: 'sitting',
    vitals_bp_limb: null,
    vitals_head_circumference_cm: null,
    vitals_muac_cm: null,
    vitals_waist_cm: null,
    vitals_json: { vitalsAvpu: 'alert' },
    examination_findings: 'throat congested',
    examination_json: [],
    test_results: 'rbs 142',
    test_results_json: [],
    lab_reports_json: [],
    investigations_orders: 'RBS',
    investigations_orders_json: [],
    follow_up: '3 days',
    follow_up_value: 3,
    follow_up_unit: 'days',
    advice: 'rest',
    referral: null,
    patient_education: 'hydrate',
    clinical_notes: 'private',
    plan_custom_sections: [],
    sent_to_patient_at: '2026-09-09T10:20:00.000Z',
    attested_at: '2026-09-09T10:15:00.000Z',
    version: null,
    supersedes_id: null,
    superseded_by_id: null,
    revision_reason: null,
    issued_at: '2026-09-09T10:15:00.000Z',
    printed_at: '2026-09-09T10:16:00.000Z',
    created_at: '2026-09-09T10:00:00.000Z',
    updated_at: '2026-09-09T10:15:00.000Z',
    ...overrides,
  };
}

function sourceMed(): PrescriptionMedicine {
  return {
    id: 'med-1',
    prescription_id: V1_ID,
    medicine_name: 'Paracetamol',
    dosage: '500 mg',
    route: 'oral',
    frequency: 'TID',
    duration: '3 days',
    instructions: 'after food',
    sort_order: 0,
    created_at: '2026-09-09T10:05:00.000Z',
    drug_master_id: 'drug-1',
    frequency_code: 'TID',
    duration_value: 3,
    duration_unit: 'days',
    route_code: 'oral',
    dose_qty: 1,
    dose_unit: 'tab',
    form: 'tablet',
    food_timing: 'after_food',
  };
}

function sourceAtt(): PrescriptionAttachment {
  return {
    id: 'att-1',
    prescription_id: V1_ID,
    file_path: `${DOCTOR_ID}/objective/lab.jpg`,
    file_type: 'image/jpeg',
    caption: 'rbs strip',
    uploaded_at: '2026-09-09T10:10:00.000Z',
  };
}

function chainable(terminal: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => Promise.resolve(terminal).then(resolve);
      }
      if (typeof prop === 'symbol') return undefined;
      if (!chain[prop]) {
        chain[prop] = jest.fn(() => self);
      }
      return chain[prop];
    },
  });
  return self as {
    select: jest.Mock;
    eq: jest.Mock;
    is: jest.Mock;
    order: jest.Mock;
    single: jest.Mock;
    maybeSingle: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    insert: jest.Mock;
  };
}

function mockReissue(opts: {
  source: Prescription;
  meds?: PrescriptionMedicine[];
  atts?: PrescriptionAttachment[];
  linkRow?: { id: string } | null;
}) {
  const inserts: { table: string; payload: unknown }[] = [];
  const deletes: string[] = [];

  const rxSelect = chainable({ data: opts.source, error: null });
  rxSelect.single = jest.fn(async () => ({ data: opts.source, error: null })) as never;

  const v2: Prescription = {
    ...opts.source,
    id: V2_ID,
    version: nextRevisionVersion(opts.source.version),
    supersedes_id: opts.source.id,
    superseded_by_id: null,
    revision_reason: 'dose_correction',
    sent_to_patient_at: null,
    printed_at: null,
    created_at: '2026-09-09T18:40:00.000Z',
    updated_at: '2026-09-09T18:40:00.000Z',
  };

  const rxInsert = chainable({ data: v2, error: null });
  rxInsert.single = jest.fn(async () => ({ data: v2, error: null })) as never;
  const insertRx = jest.fn((payload: unknown) => {
    inserts.push({ table: 'prescriptions', payload });
    return rxInsert;
  });

  const linkChain = chainable({ data: opts.linkRow === undefined ? { id: V1_ID } : opts.linkRow, error: null });
  linkChain.maybeSingle = jest.fn(async () => ({
    data: opts.linkRow === undefined ? { id: V1_ID } : opts.linkRow,
    error: null,
  })) as never;
  const updateRx = jest.fn(() => linkChain);

  const deleteRx = jest.fn(() => {
    const del = chainable({ data: null, error: null });
    del.eq = jest.fn((col: string, id: string) => {
      if (col === 'id') deletes.push(id);
      return Promise.resolve({ data: null, error: null });
    }) as never;
    return del;
  });

  const meds = opts.meds ?? [];
  const medSelect = chainable({ data: meds, error: null });
  medSelect.order = jest.fn(async () => ({ data: meds, error: null })) as never;

  const clonedMeds = meds.map((m) => ({ ...m, id: 'med-2', prescription_id: V2_ID }));
  const insertMed = jest.fn((payload: unknown) => {
    inserts.push({ table: 'prescription_medicines', payload });
    const chain = chainable({ data: clonedMeds, error: null });
    chain.select = jest.fn(async () => ({ data: clonedMeds, error: null })) as never;
    return chain;
  });

  const atts = opts.atts ?? [];
  const attSelect = chainable({ data: atts, error: null });
  attSelect.eq = jest.fn(async () => ({ data: atts, error: null })) as never;

  const clonedAtts = atts.map((a) => ({ ...a, id: 'att-2', prescription_id: V2_ID }));
  const insertAtt = jest.fn((payload: unknown) => {
    inserts.push({ table: 'prescription_attachments', payload });
    const chain = chainable({ data: clonedAtts, error: null });
    chain.select = jest.fn(async () => ({ data: clonedAtts, error: null })) as never;
    return chain;
  });

  const from = jest.fn((table: string) => {
    if (table === 'prescriptions') {
      return {
        select: jest.fn(() => rxSelect),
        insert: insertRx,
        update: updateRx,
        delete: deleteRx,
      };
    }
    if (table === 'prescription_medicines') {
      return {
        select: jest.fn(() => medSelect),
        insert: insertMed,
      };
    }
    if (table === 'prescription_attachments') {
      return {
        select: jest.fn(() => attSelect),
        insert: insertAtt,
      };
    }
    return {};
  });

  mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);
  return { inserts, deletes, insertRx, updateRx, v2 };
}

describe('rxl-22 revision clone builders', () => {
  it('treats a null previous version as 1 so the first re-issue is Version 2', () => {
    expect(nextRevisionVersion(null)).toBe(2);
    expect(nextRevisionVersion(2)).toBe(3);
  });

  it('rejects a missing or unknown revision reason', () => {
    expect(() => parseRevisionReason('')).toThrow(ValidationError);
    expect(() => parseRevisionReason('typo')).toThrow(ValidationError);
    expect(parseRevisionReason('dose_correction')).toBe('dose_correction');
  });

  it('copies every clinical and visit field and resets revision / delivery stamps', () => {
    const source = sourceRx();
    const issuedAt = '2026-09-09T18:40:00.000Z';
    const insert = buildRevisionParentInsert(source, {
      reason: 'dose_correction',
      issuedAt,
    });

    for (const col of PRESCRIPTION_CLONE_CLINICAL_COLUMNS) {
      expect(insert[col]).toEqual(source[col]);
    }
    expect(insert.appointment_id).toBe(source.appointment_id);
    expect(insert.patient_id).toBe(source.patient_id);
    expect(insert.doctor_id).toBe(source.doctor_id);
    expect(insert.episode_id).toBe(source.episode_id);
    expect(insert.type).toBe(source.type);

    for (const col of PRESCRIPTION_CLONE_SKIP_COLUMNS) {
      if (col === 'id' || col === 'created_at' || col === 'updated_at') {
        expect(insert[col]).toBeUndefined();
      }
    }
    expect(insert.version).toBe(2);
    expect(insert.supersedes_id).toBe(V1_ID);
    expect(insert.superseded_by_id).toBeNull();
    expect(insert.revision_reason).toBe('dose_correction');
    expect(insert.issued_at).toBe(issuedAt);
    expect(insert.attested_at).toBe(issuedAt);
    expect(insert.sent_to_patient_at).toBeNull();
    expect(insert.printed_at).toBeNull();
    expect(insert.id).toBeUndefined();
  });

  it('copies medicine structured fields and attachment path without ids', () => {
    const meds = buildRevisionMedicineInserts([sourceMed()], V2_ID);
    expect(meds).toHaveLength(1);
    expect(meds[0]).toMatchObject({
      prescription_id: V2_ID,
      medicine_name: 'Paracetamol',
      drug_master_id: 'drug-1',
      frequency_code: 'TID',
      dose_qty: 1,
      food_timing: 'after_food',
    });
    expect(meds[0]?.id).toBeUndefined();
    expect(meds[0]?.created_at).toBeUndefined();

    const atts = buildRevisionAttachmentInserts([sourceAtt()], V2_ID);
    expect(atts[0]).toEqual({
      prescription_id: V2_ID,
      file_path: `${DOCTOR_ID}/objective/lab.jpg`,
      file_type: 'image/jpeg',
      caption: 'rbs strip',
    });
  });
});

describe('reissuePrescriptionAsRevision', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts Version 2, copies children, and marks Version 1 superseded', async () => {
    const { inserts } = mockReissue({
      source: sourceRx(),
      meds: [sourceMed()],
      atts: [sourceAtt()],
    });

    const result = await reissuePrescriptionAsRevision(
      V1_ID,
      'dose_correction',
      CORR,
      DOCTOR_ID
    );

    expect(result.id).toBe(V2_ID);
    expect(result.version).toBe(2);
    expect(result.supersedes_id).toBe(V1_ID);
    expect(result.prescription_medicines).toHaveLength(1);
    expect(result.prescription_attachments).toHaveLength(1);
    expect(result.prescription_attachments?.[0]?.file_path).toBe(
      `${DOCTOR_ID}/objective/lab.jpg`
    );

    const parentInsert = inserts.find((i) => i.table === 'prescriptions')?.payload as Record<
      string,
      unknown
    >;
    expect(parentInsert.version).toBe(2);
    expect(parentInsert.supersedes_id).toBe(V1_ID);
    expect(parentInsert.cc).toBe('fever');
    expect(parentInsert.sent_to_patient_at).toBeNull();

    expect(mockedAudit.logDataModification).toHaveBeenCalledWith(
      CORR,
      DOCTOR_ID,
      'create',
      'prescription',
      V2_ID,
      ['version', 'supersedes_id', 'revision_reason']
    );
  });

  it('refuses a draft (not finished) and an already-superseded row', async () => {
    mockReissue({ source: sourceRx({ attested_at: null }) });
    await expect(
      reissuePrescriptionAsRevision(V1_ID, 'dose_correction', CORR, DOCTOR_ID)
    ).rejects.toMatchObject({
      name: 'ConflictError',
      details: { reason: 'not_issued' },
    });

    mockReissue({
      source: sourceRx({ superseded_by_id: V2_ID }),
    });
    await expect(
      reissuePrescriptionAsRevision(V1_ID, 'dose_correction', CORR, DOCTOR_ID)
    ).rejects.toMatchObject({
      name: 'ConflictError',
      details: { reason: 'superseded' },
    });
  });

  it('rolls back the new row when the supersede link loses a race', async () => {
    const { deletes } = mockReissue({
      source: sourceRx(),
      linkRow: null,
    });

    await expect(
      reissuePrescriptionAsRevision(V1_ID, 'dose_correction', CORR, DOCTOR_ID)
    ).rejects.toBeInstanceOf(ConflictError);

    expect(deletes).toContain(V2_ID);
    expect(mockedAudit.logDataModification).not.toHaveBeenCalled();
  });

  it('does not belong to another doctor', async () => {
    mockReissue({ source: sourceRx({ doctor_id: 'someone-else' }) });
    await expect(
      reissuePrescriptionAsRevision(V1_ID, 'dose_correction', CORR, DOCTOR_ID)
    ).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});
