/**
 * getLastVisitSummary — unit tests (last-visit-context · lvc-01).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn().mockResolvedValue(undefined as never),
  logDataModification: jest.fn().mockResolvedValue(undefined as never),
}));

import * as database from '../../../src/config/database';
import { getLastVisitSummary } from '../../../src/services/prescription-service';

const mockedDb = database as jest.Mocked<typeof database>;

const correlationId = 'corr-lvc-01';
const doctorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const patientId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const appointmentId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function mockAdmin(options: {
  appointment?: { id: string; doctor_id: string; patient_id: string };
  prescription?: Record<string, unknown> | null;
}) {
  mockedDb.getSupabaseAdminClient.mockReturnValue({
    from: jest.fn((table: string) => {
      if (table === 'appointments') {
        const filters: Record<string, string> = {};
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn((col: string, val: string) => {
            filters[col] = val;
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn(async () => {
                if (filters.id === appointmentId) {
                  return { data: options.appointment ?? null, error: null };
                }
                return { data: { id: 'gate' }, error: null };
              }),
            };
          }),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn(async () => ({ data: { id: 'gate' }, error: null })),
        };
      }
      if (table === 'conversations') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn(async () => ({ data: null, error: null })),
        };
      }
      if (table === 'prescriptions') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          neq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn(async () => ({
            data: options.prescription ?? null,
            error: null,
          })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  } as never);
}

describe('getLastVisitSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when the patient has no prior prescription', async () => {
    mockAdmin({
      appointment: { id: appointmentId, doctor_id: doctorId, patient_id: patientId },
      prescription: null,
    });

    const result = await getLastVisitSummary(patientId, appointmentId, correlationId, doctorId);
    expect(result).toBeNull();
  });

  it('returns complaints and named medicines from the latest prior rx', async () => {
    mockAdmin({
      appointment: { id: appointmentId, doctor_id: doctorId, patient_id: patientId },
      prescription: {
        id: 'rx-prior',
        created_at: '2026-08-12T10:00:00.000Z',
        complaints: [
          { id: 'c-1', name: 'Cough', duration: '5 days' },
          { id: 'c-empty', name: '  ' },
        ],
        diagnoses_json: [{ id: 'd-1', label: 'Acute bronchitis', kind: 'primary' }],
        provisional_diagnosis: 'Acute bronchitis',
        investigations_orders: 'RBS',
        advice: 'Rest',
        follow_up: '3 days',
        follow_up_value: 3,
        follow_up_unit: 'days',
        hopi: 'Worse at night',
        family_history: 'Father — HTN',
        family_history_structured: null,
        social_history: null,
        social_history_structured: null,
        past_surgical_history: null,
        past_surgical_history_structured: null,
        examination_findings: 'Chest clear',
        examination_json: [{ systemId: 'resp', status: 'normal' }],
        assessment_note: 'Likely viral',
        clinical_notes: 'Private note',
        referral: 'ENT',
        custom_subsections: [
          { id: 'sec-diet', title: 'Diet', body: 'Low salt', children: [] },
        ],
        assessment_custom_sections: [],
        plan_custom_sections: [],
        vitals_hr: 72,
        vitals_temp_c: 37,
        prescription_medicines: [
          {
            medicine_name: 'Dextromethorphan',
            dosage: '1 tds',
            route: null,
            frequency: 'tds',
            duration: '5 days',
            instructions: null,
            sort_order: 1,
            drug_master_id: null,
            frequency_code: null,
            duration_value: 5,
            duration_unit: 'days',
            route_code: null,
            dose_qty: 1,
            dose_unit: 'tsp',
            form: 'syrup',
            food_timing: null,
          },
          {
            medicine_name: '  ',
            dosage: '',
            sort_order: 2,
          },
        ],
      },
    });

    const result = await getLastVisitSummary(patientId, appointmentId, correlationId, doctorId);

    expect(result?.sourcePrescriptionId).toBe('rx-prior');
    expect(result?.complaints).toEqual([{ id: 'c-1', name: 'Cough', duration: '5 days' }]);
    expect(result?.provisionalDiagnosis).toBe('Acute bronchitis');
    expect(result?.medicines).toHaveLength(1);
    expect(result?.medicines[0]).toMatchObject({
      medicineName: 'Dextromethorphan',
      durationValue: 5,
      durationUnit: 'days',
      form: 'syrup',
    });
    expect(result?.investigationsOrders).toBe('RBS');
    expect(result?.hopi).toBe('Worse at night');
    expect(result?.familyHistory).toBe('Father — HTN');
    expect(result?.vitals).toEqual({ vitalsHr: 72, vitalsTempC: 37 });
    expect(result?.examinationFindings).toBe('Chest clear');
    expect(result?.customSubsections).toEqual([
      { id: 'sec-diet', title: 'Diet', body: 'Low salt', children: [] },
    ]);
  });
});
