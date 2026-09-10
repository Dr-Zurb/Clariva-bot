/**
 * Doctor medicine-combo aggregation (attested name + sig habits).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn().mockResolvedValue(undefined as never),
}));

import * as database from '../../../src/config/database';
import {
  aggregateDoctorMedicineCombos,
  listMyMedicineCombos,
  MEDICINE_COMBO_LIST_CAP,
  type MedicineComboSourceRow,
} from '../../../src/services/doctor-medicine-combo-service';

const mockedDb = database as jest.Mocked<typeof database>;

const correlationId = 'corr-med-combo';
const doctorA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function row(
  overrides: Partial<MedicineComboSourceRow> & {
    medicine_name: string;
    created_at: string;
    attested?: boolean;
  },
): MedicineComboSourceRow {
  const { created_at, attested = true, ...rest } = overrides;
  return {
    medicine_name: rest.medicine_name,
    dosage: rest.dosage ?? null,
    route: rest.route ?? null,
    frequency: rest.frequency ?? null,
    duration: rest.duration ?? null,
    drug_master_id: rest.drug_master_id ?? null,
    frequency_code: rest.frequency_code ?? null,
    duration_value: rest.duration_value ?? null,
    duration_unit: rest.duration_unit ?? null,
    route_code: rest.route_code ?? null,
    dose_qty: rest.dose_qty ?? null,
    dose_unit: rest.dose_unit ?? null,
    form: rest.form ?? null,
    food_timing: rest.food_timing ?? null,
    prescriptions: {
      doctor_id: doctorA,
      created_at,
      attested_at: attested ? created_at : null,
    },
  };
}

describe('aggregateDoctorMedicineCombos', () => {
  it('groups the same typed name + sig and ranks by use count', () => {
    const combos = aggregateDoctorMedicineCombos([
      row({
        medicine_name: 'Multivitamin',
        dose_qty: 1,
        dose_unit: 'tab',
        frequency_code: 'OD',
        duration_value: 10,
        duration_unit: 'days',
        created_at: '2026-08-01T00:00:00Z',
      }),
      row({
        medicine_name: 'multivitamin',
        dose_qty: 1,
        dose_unit: 'tab',
        frequency_code: 'OD',
        duration_value: 30,
        duration_unit: 'days',
        created_at: '2026-08-02T00:00:00Z',
      }),
      row({
        medicine_name: 'Multivitamin',
        dose_qty: 1,
        dose_unit: 'tab',
        frequency_code: 'OD',
        duration_value: 10,
        duration_unit: 'days',
        created_at: '2026-09-01T00:00:00Z',
      }),
    ]);

    expect(combos).toHaveLength(2);
    expect(combos[0]).toMatchObject({
      nameKey: 'multivitamin',
      durationValue: 10,
      useCount: 2,
    });
    expect(combos[1]).toMatchObject({
      durationValue: 30,
      useCount: 1,
    });
  });

  it('keeps pcm free-text names and ignores instructions-only differences', () => {
    const combos = aggregateDoctorMedicineCombos([
      row({
        medicine_name: 'pcm',
        dosage: '650',
        frequency_code: 'PRN',
        created_at: '2026-09-01T00:00:00Z',
      }),
      row({
        medicine_name: 'PCM',
        dosage: '650',
        frequency_code: 'PRN',
        created_at: '2026-09-02T00:00:00Z',
      }),
    ]);

    expect(combos).toHaveLength(1);
    expect(combos[0]?.nameKey).toBe('pcm');
    expect(combos[0]?.useCount).toBe(2);
    expect(combos[0]?.medicineName).toBe('PCM');
  });

  it('skips drafts and name-only rows', () => {
    const combos = aggregateDoctorMedicineCombos([
      row({
        medicine_name: 'Pantop',
        dose_qty: 1,
        frequency_code: 'OD',
        duration_value: 10,
        duration_unit: 'days',
        created_at: '2026-09-01T00:00:00Z',
        attested: false,
      }),
      row({
        medicine_name: 'Pantop',
        created_at: '2026-09-02T00:00:00Z',
      }),
    ]);

    expect(combos).toHaveLength(0);
  });

  it('treats null duration as distinct from a numbered course', () => {
    const combos = aggregateDoctorMedicineCombos([
      row({
        medicine_name: 'pcm',
        dosage: '650',
        frequency_code: 'PRN',
        created_at: '2026-09-01T00:00:00Z',
      }),
      row({
        medicine_name: 'pcm',
        dosage: '650',
        frequency_code: 'PRN',
        duration_value: 3,
        duration_unit: 'days',
        created_at: '2026-09-02T00:00:00Z',
      }),
    ]);

    expect(combos).toHaveLength(2);
  });

  it('prefers a later drug_master_id when merging the same sig', () => {
    const master = '11111111-1111-1111-1111-111111111111';
    const combos = aggregateDoctorMedicineCombos([
      row({
        medicine_name: 'amlo',
        dosage: '5 mg',
        frequency_code: 'OD',
        created_at: '2026-08-01T00:00:00Z',
      }),
      row({
        medicine_name: 'amlo',
        dosage: '5 mg',
        frequency_code: 'OD',
        drug_master_id: master,
        created_at: '2026-07-01T00:00:00Z',
      }),
    ]);

    expect(combos).toHaveLength(1);
    expect(combos[0]?.drugMasterId).toBe(master);
  });
});

describe('listMyMedicineCombos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scopes the query to the calling doctor and returns aggregated combos', async () => {
    const rows = [
      row({
        medicine_name: 'Pantop',
        dose_qty: 1,
        frequency_code: 'OD',
        duration_value: 10,
        duration_unit: 'days',
        created_at: '2026-09-01T00:00:00Z',
      }),
    ];

    const eq = jest.fn().mockReturnThis();
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq,
      not: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: rows, error: null } as never),
    };
    const from = jest.fn().mockReturnValue(chain);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const combos = await listMyMedicineCombos(correlationId, doctorA);

    expect(from).toHaveBeenCalledWith('prescription_medicines');
    expect(eq).toHaveBeenCalledWith('prescriptions.doctor_id', doctorA);
    expect(combos).toHaveLength(1);
    expect(combos[0]?.nameKey).toBe('pantop');
    expect(combos.length).toBeLessThanOrEqual(MEDICINE_COMBO_LIST_CAP);
  });
});
