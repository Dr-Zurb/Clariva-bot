/**
 * getLastSubjectiveForPatient — unit tests (subjective-tab · subj-07).
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
import { getLastSubjectiveForPatient } from '../../../src/services/prescription-service';

const mockedDb = database as jest.Mocked<typeof database>;

const correlationId = 'corr-subj-07';
const doctorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const patientId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const appointmentId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function mockAdmin(options: {
  appointment?: { id: string; doctor_id: string; patient_id: string };
  prescriptions?: Array<Record<string, unknown>>;
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
          limit: jest
            .fn<() => Promise<{ data: Record<string, unknown>[]; error: null }>>()
            .mockResolvedValue({ data: options.prescriptions ?? [], error: null }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  } as never);
}

describe('getLastSubjectiveForPatient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no structured subjective exists', async () => {
    mockAdmin({
      appointment: { id: appointmentId, doctor_id: doctorId, patient_id: patientId },
      prescriptions: [
        {
          id: 'rx-1',
          created_at: '2026-01-01T00:00:00.000Z',
          complaints: [],
          family_history: null,
          social_history: null,
          past_surgical_history: null,
        },
      ],
    });

    const result = await getLastSubjectiveForPatient(
      patientId,
      appointmentId,
      correlationId,
      doctorId,
    );
    expect(result).toBeNull();
  });

  it('returns structured subjective from the latest prior rx', async () => {
    mockAdmin({
      appointment: { id: appointmentId, doctor_id: doctorId, patient_id: patientId },
      prescriptions: [
        {
          id: 'rx-2',
          created_at: '2026-02-01T00:00:00.000Z',
          complaints: [{ id: 'c-1', name: 'Headache' }],
          family_history: 'Father — HTN',
          social_history: null,
          past_surgical_history: null,
        },
      ],
    });

    const result = await getLastSubjectiveForPatient(
      patientId,
      appointmentId,
      correlationId,
      doctorId,
    );

    expect(result).toMatchObject({
      sourcePrescriptionId: 'rx-2',
      familyHistory: 'Father — HTN',
    });
    expect(result?.complaints).toHaveLength(1);
  });

  it('returns socialHistoryStructured from the latest prior rx (sh-02)', async () => {
    const structured = {
      smoking: { status: 'never', products: [] },
      notes: 'Office worker',
    };

    mockAdmin({
      appointment: { id: appointmentId, doctor_id: doctorId, patient_id: patientId },
      prescriptions: [
        {
          id: 'rx-3',
          created_at: '2026-03-01T00:00:00.000Z',
          complaints: [],
          family_history: null,
          social_history: 'Smoking: Non-smoker · Office worker',
          social_history_structured: structured,
          past_surgical_history: null,
        },
      ],
    });

    const result = await getLastSubjectiveForPatient(
      patientId,
      appointmentId,
      correlationId,
      doctorId,
    );

    expect(result).toMatchObject({
      sourcePrescriptionId: 'rx-3',
      socialHistory: 'Smoking: Non-smoker · Office worker',
      socialHistoryStructured: structured,
    });
  });

  it('matches rx with only socialHistoryStructured populated (sh-02)', async () => {
    mockAdmin({
      appointment: { id: appointmentId, doctor_id: doctorId, patient_id: patientId },
      prescriptions: [
        {
          id: 'rx-4',
          created_at: '2026-04-01T00:00:00.000Z',
          complaints: [],
          family_history: null,
          social_history: null,
          social_history_structured: {
            alcohol: { status: 'never', drinks: [] },
          },
          past_surgical_history: null,
        },
      ],
    });

    const result = await getLastSubjectiveForPatient(
      patientId,
      appointmentId,
      correlationId,
      doctorId,
    );

    expect(result?.socialHistoryStructured).toEqual({
      alcohol: { status: 'never', drinks: [] },
    });
  });

  it('matches rx with only phase-2 socialHistoryStructured (sh-08)', async () => {
    mockAdmin({
      appointment: { id: appointmentId, doctor_id: doctorId, patient_id: patientId },
      prescriptions: [
        {
          id: 'rx-5',
          created_at: '2026-04-01T00:00:00.000Z',
          complaints: [],
          family_history: null,
          social_history: null,
          social_history_structured: {
            sleep: { hoursPerNight: 6, quality: 'poor' },
            stress: { level: 'high', support: 'limited' },
          },
          past_surgical_history: null,
        },
      ],
    });

    const result = await getLastSubjectiveForPatient(
      patientId,
      appointmentId,
      correlationId,
      doctorId,
    );

    expect(result?.socialHistoryStructured).toEqual({
      sleep: { hoursPerNight: 6, quality: 'poor' },
      stress: { level: 'high', support: 'limited' },
    });
  });

  it('returns pastSurgicalHistoryStructured from the latest prior rx', async () => {
    const structured = {
      procedures: [{ id: 'psh-1', procedure: 'appendectomy', agoValue: 16, agoUnit: 'years' }],
    };

    mockAdmin({
      appointment: { id: appointmentId, doctor_id: doctorId, patient_id: patientId },
      prescriptions: [
        {
          id: 'rx-psh',
          created_at: '2026-04-01T00:00:00.000Z',
          complaints: [],
          family_history: null,
          family_history_structured: null,
          social_history: null,
          social_history_structured: null,
          past_surgical_history: 'Appendectomy (16 years ago)',
          past_surgical_history_structured: structured,
        },
      ],
    });

    const result = await getLastSubjectiveForPatient(
      patientId,
      appointmentId,
      correlationId,
      doctorId,
    );

    expect(result).toMatchObject({
      sourcePrescriptionId: 'rx-psh',
      pastSurgicalHistory: 'Appendectomy (16 years ago)',
      pastSurgicalHistoryStructured: structured,
    });
  });

  it('matches rx with only pastSurgicalHistoryStructured populated', async () => {
    mockAdmin({
      appointment: { id: appointmentId, doctor_id: doctorId, patient_id: patientId },
      prescriptions: [
        {
          id: 'rx-psh-only',
          created_at: '2026-04-02T00:00:00.000Z',
          complaints: [],
          family_history: null,
          family_history_structured: null,
          social_history: null,
          social_history_structured: null,
          past_surgical_history: null,
          past_surgical_history_structured: { none: true },
        },
      ],
    });

    const result = await getLastSubjectiveForPatient(
      patientId,
      appointmentId,
      correlationId,
      doctorId,
    );

    expect(result?.pastSurgicalHistoryStructured).toEqual({ none: true });
  });
});
