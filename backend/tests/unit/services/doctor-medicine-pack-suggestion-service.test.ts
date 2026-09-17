/**
 * Exact attested medicine-pack suggestions for the medicines template picker.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn().mockResolvedValue(undefined as never),
  logAuditEvent: jest.fn().mockResolvedValue(undefined as never),
}));
jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn().mockResolvedValue(null as never),
}));

import * as database from '../../../src/config/database';
import * as doctorSettings from '../../../src/services/doctor-settings-service';
import {
  aggregateMedicinePackSuggestions,
  countUnseenPackSuggestions,
  dismissMyMedicinePackSuggestion,
  MEDICINE_PACK_DISMISSALS_KEY,
  MEDICINE_PACK_MIN_USES,
  medicinePackSignature,
  savedMedicinePackKeys,
  type MedicinePackSourceRow,
} from '../../../src/services/doctor-medicine-pack-suggestion-service';

const mockedDb = database as jest.Mocked<typeof database>;
const doctorA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function line(
  overrides: Partial<MedicinePackSourceRow> & {
    prescription_id: string;
    medicine_name: string;
    created_at: string;
    attested?: boolean;
  }
): MedicinePackSourceRow {
  const { created_at, attested = true, prescription_id, ...rest } = overrides;
  return {
    medicine_name: rest.medicine_name,
    dosage: rest.dosage ?? '',
    route: rest.route ?? null,
    frequency: rest.frequency ?? '',
    duration: rest.duration ?? '',
    drug_master_id: rest.drug_master_id ?? null,
    frequency_code: rest.frequency_code ?? 'OD',
    duration_value: rest.duration_value ?? 5,
    duration_unit: rest.duration_unit ?? 'days',
    route_code: rest.route_code ?? null,
    dose_qty: rest.dose_qty ?? 1,
    dose_unit: rest.dose_unit ?? 'tab',
    form: rest.form ?? null,
    food_timing: rest.food_timing ?? null,
    prescriptions: {
      id: prescription_id,
      doctor_id: doctorA,
      created_at,
      attested_at: attested ? created_at : null,
    },
  };
}

function uriPack(prescriptionId: string, createdAt: string, durationValue = 5): MedicinePackSourceRow[] {
  return [
    line({
      prescription_id: prescriptionId,
      medicine_name: 'Azithromycin',
      created_at: createdAt,
      duration_value: durationValue,
    }),
    line({
      prescription_id: prescriptionId,
      medicine_name: 'Paracetamol',
      created_at: createdAt,
      frequency_code: 'TID',
      duration_value: durationValue,
    }),
  ];
}

function repeatPack(times: number, prefix: string, durationValue = 5): MedicinePackSourceRow[] {
  const rows: MedicinePackSourceRow[] = [];
  for (let i = 0; i < times; i += 1) {
    rows.push(
      ...uriPack(`${prefix}-${i}`, `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00Z`, durationValue)
    );
  }
  return rows;
}

describe('aggregateMedicinePackSuggestions', () => {
  it('requires at least two named+sig medicines and five exact repeats', () => {
    expect(aggregateMedicinePackSuggestions(repeatPack(4, 'short'))).toEqual([]);
    expect(
      aggregateMedicinePackSuggestions([
        line({
          prescription_id: 'solo',
          medicine_name: 'Azithromycin',
          created_at: '2026-08-01T00:00:00Z',
        }),
      ])
    ).toEqual([]);

    const packs = aggregateMedicinePackSuggestions(repeatPack(MEDICINE_PACK_MIN_USES, 'ok'));
    expect(packs).toHaveLength(1);
    expect(packs[0]?.useCount).toBe(5);
    expect(packs[0]?.medicines.map((m) => m.nameKey).sort()).toEqual([
      'azithromycin',
      'paracetamol',
    ]);
  });

  it('treats medicine order as the same exact set', () => {
    const rows: MedicinePackSourceRow[] = [];
    for (let i = 0; i < 5; i += 1) {
      const id = `flip-${i}`;
      const created = `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00Z`;
      const pair = uriPack(id, created);
      rows.push(...(i % 2 === 0 ? pair : pair.slice().reverse()));
    }
    expect(aggregateMedicinePackSuggestions(rows)).toHaveLength(1);
  });

  it('keeps a different duration as a distinct pack', () => {
    const rows = [...repeatPack(5, 'five', 5), ...repeatPack(5, 'seven', 7)];
    const packs = aggregateMedicinePackSuggestions(rows);
    expect(packs).toHaveLength(2);
    expect(packs.map((p) => p.medicines[0]?.durationValue).sort()).toEqual([5, 7]);
  });

  it('caps suggestions at five and ranks by use count', () => {
    const rows: MedicinePackSourceRow[] = [];
    for (let pack = 0; pack < 6; pack += 1) {
      const extra = `Extra${pack}`;
      for (let i = 0; i < 5 + pack; i += 1) {
        const id = `p${pack}-${i}`;
        const created = `2026-07-${String((pack + i) % 28 + 1).padStart(2, '0')}T00:00:00Z`;
        rows.push(
          ...uriPack(id, created),
          line({
            prescription_id: id,
            medicine_name: extra,
            created_at: created,
            duration_value: 3,
          })
        );
      }
    }
    const packs = aggregateMedicinePackSuggestions(rows);
    expect(packs).toHaveLength(5);
    expect(packs[0]?.useCount).toBeGreaterThan(packs[4]?.useCount ?? 0);
  });

  it('ignores uses at or before a dismiss so the pack can qualify again later', () => {
    const rows = repeatPack(5, 'old');
    const key = medicinePackSignature(
      aggregateMedicinePackSuggestions(rows)[0]?.medicines ?? []
    );
    expect(
      aggregateMedicinePackSuggestions(rows, {
        dismissals: { [key]: '2026-08-20T00:00:00Z' },
      })
    ).toEqual([]);

    const after = uriPack('fresh', '2026-09-01T00:00:00Z');
    expect(
      aggregateMedicinePackSuggestions([...rows, ...after], {
        dismissals: { [key]: '2026-08-20T00:00:00Z' },
      })
    ).toEqual([]);

    const requalified: MedicinePackSourceRow[] = [...after];
    for (let i = 0; i < 4; i += 1) {
      requalified.push(...uriPack(`new-${i}`, `2026-09-0${i + 2}T00:00:00Z`));
    }
    expect(
      aggregateMedicinePackSuggestions(requalified, {
        dismissals: { [key]: '2026-08-20T00:00:00Z' },
      })
    ).toHaveLength(1);
  });

  it('hides a pack that already matches a saved medicines template', () => {
    const rows = repeatPack(5, 'saved');
    const suggested = aggregateMedicinePackSuggestions(rows);
    const saved = savedMedicinePackKeys([
      {
        medicines_json: suggested[0]!.medicines.map((m, index) => ({
          medicineName: m.medicineName,
          dosage: m.dosage,
          doseQty: m.doseQty,
          doseUnit: m.doseUnit,
          frequencyCode: m.frequencyCode,
          frequency: m.frequency,
          durationValue: m.durationValue,
          durationUnit: m.durationUnit,
          duration: m.duration,
          foodTiming: m.foodTiming,
          routeCode: m.routeCode,
          form: m.form,
          sortOrder: index,
        })),
      } as never,
    ]);
    expect(aggregateMedicinePackSuggestions(rows, { savedPackKeys: saved })).toEqual([]);
  });
});

describe('countUnseenPackSuggestions', () => {
  it('counts only pack signatures that have not been opened', () => {
    const suggestions = aggregateMedicinePackSuggestions(repeatPack(5, 'seen'));
    expect(countUnseenPackSuggestions(suggestions, [])).toBe(1);
    expect(
      countUnseenPackSuggestions(suggestions, [medicinePackSignature(suggestions[0]!.medicines)])
    ).toBe(0);
  });
});

describe('dismissMyMedicinePackSuggestion', () => {
  beforeEach(() => {
    mockedDb.getSupabaseAdminClient.mockReset();
    (doctorSettings.getDoctorSettings as jest.Mock).mockReset();
  });

  it('writes a dismiss timestamp onto existing opd_policies', async () => {
    jest.mocked(doctorSettings.getDoctorSettings).mockResolvedValue({
      doctor_id: doctorA,
      opd_policies: { slot_join_grace_minutes: 10 },
    } as never);
    const eq = jest.fn().mockResolvedValue({ error: null } as never);
    const update = jest.fn().mockReturnValue({ eq });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: jest.fn().mockReturnValue({ update }) } as never);

    const habits = [
      {
        nameKey: 'azithromycin',
        dosage: '',
        doseQty: 1,
        doseUnit: 'tab',
        frequencyCode: 'OD',
        frequency: '',
        durationValue: 5,
        durationUnit: 'days',
        duration: '',
        foodTiming: null,
        routeCode: null,
        form: null,
      },
      {
        nameKey: 'paracetamol',
        dosage: '',
        doseQty: 1,
        doseUnit: 'tab',
        frequencyCode: 'TID',
        frequency: '',
        durationValue: 5,
        durationUnit: 'days',
        duration: '',
        foodTiming: null,
        routeCode: null,
        form: null,
      },
    ];

    await dismissMyMedicinePackSuggestion('corr-pack', doctorA, habits);

    const payload = update.mock.calls[0]?.[0] as {
      opd_policies: Record<string, unknown>;
    };
    expect(payload.opd_policies.slot_join_grace_minutes).toBe(10);
    const dismissals = payload.opd_policies[MEDICINE_PACK_DISMISSALS_KEY] as Record<
      string,
      string
    >;
    expect(dismissals[medicinePackSignature(habits)]).toEqual(expect.any(String));
  });
});
