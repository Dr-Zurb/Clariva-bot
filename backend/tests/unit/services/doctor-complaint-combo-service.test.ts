/**
 * Doctor complaint-combo aggregation (attested name + pack habits).
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
  aggregateDoctorComplaintCombos,
  clearMyComplaintCombo,
  complaintComboHabitSignature,
  complaintSeverityBand,
  COMPLAINT_COMBO_LIST_CAP,
  listMyComplaintCombos,
  type ComplaintComboSourceRow,
} from '../../../src/services/doctor-complaint-combo-service';

const mockedDb = database as jest.Mocked<typeof database>;

const correlationId = 'corr-complaint-combo';
const doctorA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function row(
  overrides: Partial<ComplaintComboSourceRow> & {
    complaints: unknown;
    created_at: string;
    attested?: boolean;
  }
): ComplaintComboSourceRow {
  return {
    complaints: overrides.complaints,
    created_at: overrides.created_at,
    attested_at: overrides.attested === false ? null : overrides.created_at,
  };
}

describe('complaintSeverityBand', () => {
  it('maps numeric scores and named bands', () => {
    expect(complaintSeverityBand(2)).toBe('mild');
    expect(complaintSeverityBand(5)).toBe('moderate');
    expect(complaintSeverityBand(8)).toBe('severe');
    expect(complaintSeverityBand(10)).toBe('very_severe');
    expect(complaintSeverityBand('MINIMAL')).toBe('mild');
    expect(complaintSeverityBand('very_severe')).toBe('very_severe');
    expect(complaintSeverityBand(0)).toBeNull();
  });
});

describe('aggregateDoctorComplaintCombos', () => {
  it('groups the same name + pack and ranks by use count', () => {
    const combos = aggregateDoctorComplaintCombos([
      row({
        complaints: [
          {
            name: 'Headache',
            category: 'pain',
            severity: 'moderate',
            associatedComplaints: [{ name: 'Photophobia' }, { name: 'Nausea' }],
          },
        ],
        created_at: '2026-08-01T00:00:00Z',
      }),
      row({
        complaints: [
          {
            name: 'headache',
            category: 'pain',
            severity: 'moderate',
            associated: ['nausea', 'photophobia'],
          },
        ],
        created_at: '2026-09-01T00:00:00Z',
      }),
      row({
        complaints: [
          {
            name: 'Headache',
            category: 'pain',
            severity: 'severe',
          },
        ],
        created_at: '2026-09-02T00:00:00Z',
      }),
    ]);

    expect(combos).toHaveLength(2);
    expect(combos[0]).toMatchObject({
      nameKey: 'headache',
      severityBand: 'moderate',
      useCount: 2,
    });
    expect(combos[0]?.associatedNames).toEqual(['nausea', 'photophobia']);
    expect(combos[1]).toMatchObject({
      severityBand: 'severe',
      useCount: 1,
    });
  });

  it('ignores name-only cards and duration differences', () => {
    const combos = aggregateDoctorComplaintCombos([
      row({
        complaints: [{ name: 'Headache', duration: '3 days' }],
        created_at: '2026-09-01T00:00:00Z',
      }),
      row({
        complaints: [
          {
            name: 'Headache',
            laterality: 'Left',
            duration: '1 week',
          },
        ],
        created_at: '2026-09-02T00:00:00Z',
      }),
      row({
        complaints: [
          {
            name: 'Headache',
            laterality: 'Left',
            duration: '2 days',
          },
        ],
        created_at: '2026-09-03T00:00:00Z',
      }),
    ]);

    expect(combos).toHaveLength(1);
    expect(combos[0]).toMatchObject({
      laterality: 'Left',
      useCount: 2,
    });
  });

  it('skips unattested prescriptions', () => {
    const combos = aggregateDoctorComplaintCombos([
      row({
        complaints: [{ name: 'Fever', severity: 'mild' }],
        created_at: '2026-09-01T00:00:00Z',
        attested: false,
      }),
    ]);
    expect(combos).toHaveLength(0);
  });

  it('drops uses at or before a reset timestamp', () => {
    const mild = row({
      complaints: [{ name: 'Fever', severity: 'mild' }],
      created_at: '2026-08-01T00:00:00Z',
    });
    const moderate = row({
      complaints: [{ name: 'Fever', severity: 'moderate' }],
      created_at: '2026-09-01T00:00:00Z',
    });
    const sig = complaintComboHabitSignature({
      nameKey: 'fever',
      category: null,
      severityBand: 'mild',
      laterality: null,
      character: null,
      associatedNames: [],
    });

    const afterClear = aggregateDoctorComplaintCombos([mild, mild, moderate], {
      [sig]: '2026-08-15T00:00:00Z',
    });

    expect(afterClear).toHaveLength(1);
    expect(afterClear[0]).toMatchObject({
      severityBand: 'moderate',
      useCount: 1,
    });
  });

  it('counts the same habit again after the reset timestamp', () => {
    const before = row({
      complaints: [{ name: 'Fever', severity: 'mild' }],
      created_at: '2026-08-01T00:00:00Z',
    });
    const after = row({
      complaints: [{ name: 'Fever', severity: 'mild' }],
      created_at: '2026-09-10T00:00:00Z',
    });
    const sig = complaintComboHabitSignature({
      nameKey: 'fever',
      category: null,
      severityBand: 'mild',
      laterality: null,
      character: null,
      associatedNames: [],
    });

    const combos = aggregateDoctorComplaintCombos([before, after], {
      [sig]: '2026-09-01T00:00:00Z',
    });

    expect(combos).toHaveLength(1);
    expect(combos[0]?.useCount).toBe(1);
    expect(combos[0]?.lastUsedAt).toBe('2026-09-10T00:00:00Z');
  });
});

describe('listMyComplaintCombos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scopes the query to the calling doctor and returns aggregated combos', async () => {
    const rows = [
      row({
        complaints: [{ name: 'Cough', character: 'dry' }],
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

    const combos = await listMyComplaintCombos(correlationId, doctorA);

    expect(from).toHaveBeenCalledWith('prescriptions');
    expect(eq).toHaveBeenCalledWith('doctor_id', doctorA);
    expect(combos).toHaveLength(1);
    expect(combos[0]?.nameKey).toBe('cough');
    expect(combos.length).toBeLessThanOrEqual(COMPLAINT_COMBO_LIST_CAP);
  });
});

describe('clearMyComplaintCombo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes a reset timestamp onto existing opd_policies', async () => {
    jest.mocked(doctorSettings.getDoctorSettings).mockResolvedValue({
      doctor_id: doctorA,
      opd_policies: { slot_join_grace_minutes: 10 },
    } as never);

    const eq = jest.fn().mockResolvedValue({ error: null } as never);
    const update = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ update });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await expect(
      clearMyComplaintCombo(correlationId, doctorA, {
        nameKey: 'headache',
        category: 'pain',
        severityBand: 'moderate',
        laterality: null,
        character: null,
        associatedNames: ['photophobia', 'nausea'],
      })
    ).resolves.toEqual({ cleared: true });

    expect(from).toHaveBeenCalledWith('doctor_settings');
    const payload = update.mock.calls[0]?.[0] as {
      opd_policies: Record<string, unknown>;
    };
    expect(payload.opd_policies.slot_join_grace_minutes).toBe(10);
    expect(payload.opd_policies.complaint_combo_resets).toEqual(
      expect.objectContaining({
        [complaintComboHabitSignature({
          nameKey: 'headache',
          category: 'pain',
          severityBand: 'moderate',
          laterality: null,
          character: null,
          associatedNames: ['photophobia', 'nausea'],
        })]: expect.any(String),
      })
    );
  });
});
