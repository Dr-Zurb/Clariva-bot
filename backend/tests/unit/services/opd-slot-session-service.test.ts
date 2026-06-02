/**
 * Slot session list (sl-01) — mocked Supabase + doctor settings.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import { listDoctorSlotSession } from '../../../src/services/opd-slot-session-service';
import * as database from '../../../src/config/database';
import * as doctorSettings from '../../../src/services/doctor-settings-service';
import * as catalogHelpers from '../../../src/utils/service-catalog-helpers';

jest.mock('../../../src/config/database');
jest.mock('../../../src/services/doctor-settings-service');
jest.mock('../../../src/utils/service-catalog-helpers');

const mockedDb = database as jest.Mocked<typeof database>;
const mockedDoctorSettings = doctorSettings as jest.Mocked<typeof doctorSettings>;
const mockedCatalogHelpers = catalogHelpers as jest.Mocked<typeof catalogHelpers>;

const doctorId = '550e8400-e29b-41d4-a716-446655440000';
const sessionDate = '2026-05-08';
const correlationId = 'corr-sl01';

interface MockResponse<T> {
  data: T;
  error: unknown | null;
}

function createSlotMockAdmin(responses: {
  appointments: MockResponse<unknown>[];
  patients?: MockResponse<unknown>[];
  consultation_sessions: MockResponse<unknown>[];
}) {
  const counters = {
    appointments: 0,
    patients: 0,
    consultation_sessions: 0,
  };

  function makeChain(table: keyof typeof counters) {
    const queue =
      table === 'patients'
        ? (responses.patients ?? [{ data: [], error: null }])
        : (responses[table] as MockResponse<unknown>[]);
    const chain: Record<string, unknown> = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: undefined as unknown,
    };
    chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      const r = queue.shift();
      if (!r) {
        if (reject) reject(new Error(`No mock response queued for table=${table}`));
        return;
      }
      resolve(r);
    };
    return chain;
  }

  const from = jest.fn((table: string) => {
    if (table === 'appointments') {
      counters.appointments += 1;
      return makeChain('appointments');
    }
    if (table === 'patients') {
      counters.patients += 1;
      return makeChain('patients');
    }
    if (table === 'consultation_sessions') {
      counters.consultation_sessions += 1;
      return makeChain('consultation_sessions');
    }
    return makeChain('appointments');
  });

  return { from, counters };
}

function baseApt(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    patient_id: 'p1',
    patient_name: 'PHI Name',
    patient_phone: '+91 90000 00001',
    appointment_date: '2026-05-08T04:30:00.000Z',
    status: 'confirmed',
    reason_for_visit: 'Checkup',
    consultation_type: 'video',
    catalog_service_key: null,
    episode_id: null,
    opd_event_type: 'standard',
    notes: 'Note',
    opd_session_delay_minutes: null,
    opd_early_invite_expires_at: null,
    opd_early_invite_response: null,
    created_at: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('listDoctorSlotSession (sl-01)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-08T05:00:00.000Z'));
    jest.resetAllMocks();
    mockedDoctorSettings.getDoctorSettings.mockResolvedValue({
      doctor_id: doctorId,
      timezone: 'Asia/Kolkata',
      slot_interval_minutes: 20,
      opd_policies: null,
    } as never);
    mockedCatalogHelpers.getActiveServiceCatalog.mockReturnValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns empty entries and zero counts when no appointments match the session day', async () => {
    const { from, counters } = createSlotMockAdmin({
      appointments: [{ data: [], error: null }],
      consultation_sessions: [],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const payload = await listDoctorSlotSession(doctorId, sessionDate, correlationId);

    expect(payload.entries).toEqual([]);
    expect(payload.counts).toEqual({
      all: 0,
      upcoming: 0,
      running_late: 0,
      in_consultation: 0,
      completed: 0,
      missed: 0,
      cancelled: 0,
      overflow: 0,
    });
    expect(payload.date).toBe(sessionDate);
    expect(typeof payload.snapshotAt).toBe('string');
    expect(counters.appointments).toBe(1);
    expect(counters.patients).toBe(0);
    expect(counters.consultation_sessions).toBe(0);
  });

  it('assigns 1-based positions in chronological appointment_date order', async () => {
    const apt1 = baseApt({
      id: 'early',
      appointment_date: '2026-05-08T03:00:00.000Z',
      status: 'cancelled',
      patient_id: null,
    });
    const apt2 = baseApt({
      id: 'late',
      appointment_date: '2026-05-08T06:00:00.000Z',
      status: 'completed',
      patient_id: null,
    });
    const { from } = createSlotMockAdmin({
      appointments: [{ data: [apt1, apt2], error: null }],
      patients: [],
      consultation_sessions: [{ data: [], error: null }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const { entries } = await listDoctorSlotSession(doctorId, sessionDate, correlationId);
    expect(entries.map((e) => e.appointmentId)).toEqual(['early', 'late']);
    expect(entries.map((e) => e.position)).toEqual([1, 2]);
  });

  it('counts.upcoming includes grace rows (DL-4)', async () => {
    const graceApt = baseApt({
      id: 'g1',
      appointment_date: '2026-05-08T05:10:00.000Z',
      status: 'confirmed',
      patient_id: null,
    });
    const upcomingApt = baseApt({
      id: 'u1',
      appointment_date: '2026-05-08T05:45:00.000Z',
      status: 'confirmed',
      patient_id: null,
    });
    const { from } = createSlotMockAdmin({
      appointments: [{ data: [graceApt, upcomingApt], error: null }],
      patients: [],
      consultation_sessions: [{ data: [], error: null }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const { counts, entries } = await listDoctorSlotSession(doctorId, sessionDate, correlationId);
    const g = entries.find((e) => e.appointmentId === 'g1');
    const u = entries.find((e) => e.appointmentId === 'u1');
    expect(g?.slotStatus).toBe('grace');
    expect(u?.slotStatus).toBe('upcoming');
    expect(counts.upcoming).toBe(2);
    expect(counts.all).toBe(2);
  });

  it('passes through patient PHI fields', async () => {
    const apt = baseApt({ id: 'phi1' });
    const patientRow = {
      id: 'p1',
      medical_record_number: 'MRN-1',
      age: 40,
      date_of_birth: null,
      gender: 'F',
    };
    const { from } = createSlotMockAdmin({
      appointments: [{ data: [apt], error: null }],
      patients: [{ data: [patientRow], error: null }],
      consultation_sessions: [{ data: [], error: null }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const { entries } = await listDoctorSlotSession(doctorId, sessionDate, correlationId);
    expect(entries[0]!.patientName).toBe('PHI Name');
    expect(entries[0]!.patientPhone).toBe('+91 90000 00001');
    expect(entries[0]!.medicalRecordNumber).toBe('MRN-1');
  });

  it('marks in_consultation when a live consultation_session exists', async () => {
    const apt = baseApt({ id: 'live1', patient_id: null });
    const { from } = createSlotMockAdmin({
      appointments: [{ data: [apt], error: null }],
      patients: [],
      consultation_sessions: [
        { data: [{ appointment_id: 'live1' }], error: null },
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const { entries, counts } = await listDoctorSlotSession(doctorId, sessionDate, correlationId);
    expect(entries[0]!.slotStatus).toBe('in_consultation');
    expect(counts.in_consultation).toBe(1);
    expect(counts.upcoming).toBe(0);
  });

  it('skips patients query when no appointment has patient_id', async () => {
    const apt = baseApt({ id: 'walk', patient_id: null });
    const { from, counters } = createSlotMockAdmin({
      appointments: [{ data: [apt], error: null }],
      consultation_sessions: [{ data: [], error: null }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await listDoctorSlotSession(doctorId, sessionDate, correlationId);
    expect(counters.patients).toBe(0);
  });
});
