/**
 * Doctor OPD service unit tests (oq-01).
 *
 * Covers `listDoctorQueueSession` after the OQ-D1 widening — full PHI exposure
 * to the authenticated doctor, batched patients fetch (no N+1), age derivation
 * from `date_of_birth` fallback, catalog label resolution, and pass-through of
 * episode / return-flow markers.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { listDoctorQueueSession } from '../../../src/services/opd-doctor-service';
import * as database from '../../../src/config/database';
import * as doctorSettings from '../../../src/services/doctor-settings-service';
import * as catalogHelpers from '../../../src/utils/service-catalog-helpers';

jest.mock('../../../src/config/database');
jest.mock('../../../src/services/doctor-settings-service');
// Mock the catalog helper directly so the test doesn't need to construct a
// fully Zod-valid `service_offerings_json` blob just to verify label lookup.
jest.mock('../../../src/utils/service-catalog-helpers');

// listDoctorQueueSession does not invoke these services, but they're imported
// transitively by opd-doctor-service.ts and pull in heavy ESM-only deps
// (@react-pdf/renderer via prescription-pdf-service). Stub them out so jest's
// CJS transformer never has to touch the ESM module graph.
jest.mock('../../../src/services/appointment-service', () => ({
  updateAppointmentStatus: jest.fn(async () => undefined),
}));
jest.mock('../../../src/services/opd/opd-queue-service', () => ({
  requeueEntryAfterCurrentPatient: jest.fn(async () => undefined),
  requeueEntryToEndOfSession: jest.fn(async () => undefined),
}));

const mockedDb = database as jest.Mocked<typeof database>;
const mockedDoctorSettings = doctorSettings as jest.Mocked<typeof doctorSettings>;
const mockedCatalogHelpers = catalogHelpers as jest.Mocked<typeof catalogHelpers>;

const doctorId = '550e8400-e29b-41d4-a716-446655440000';
const sessionDate = '2026-05-08';
const correlationId = 'corr-oq01';

interface MockResponse<T> {
  data: T;
  error: unknown | null;
}

/**
 * Build a mock supabase admin client with a per-table response queue. Each call
 * to `.from(table)` returns a thenable chain whose terminal methods (`order`,
 * `in`, etc.) resolve with the next queued response for that table. Method
 * counters are exposed on the returned object so tests can assert "no N+1".
 */
function createMockAdmin(responses: {
  opd_queue_entries: MockResponse<unknown>[];
  appointments: MockResponse<unknown>[];
  patients?: MockResponse<unknown>[];
}) {
  const counters = {
    opd_queue_entries: 0,
    appointments: 0,
    patients: 0,
  };

  function makeChain(table: keyof typeof counters) {
    const queue = responses[table] ?? [];
    const chain: Record<string, unknown> = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
      then: undefined as unknown,
    };
    chain.then = (
      resolve: (v: unknown) => void,
      reject?: (e: unknown) => void
    ) => {
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
    if (table === 'opd_queue_entries') {
      counters.opd_queue_entries += 1;
      return makeChain('opd_queue_entries');
    }
    if (table === 'appointments') {
      counters.appointments += 1;
      return makeChain('appointments');
    }
    if (table === 'patients') {
      counters.patients += 1;
      return makeChain('patients');
    }
    return makeChain('appointments');
  });

  return { from, counters };
}

describe('listDoctorQueueSession (oq-01)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedDoctorSettings.getDoctorSettings.mockResolvedValue(null);
    mockedCatalogHelpers.getActiveServiceCatalog.mockReturnValue(null);
  });

  it('returns the widened row shape with PHI exposed (no patientLabel)', async () => {
    const queueRow = {
      id: 'q1',
      appointment_id: 'a1',
      token_number: 4,
      position: 2,
      status: 'waiting',
      session_date: sessionDate,
      created_at: '2026-05-08T03:00:00.000Z',
    };
    const aptRow = {
      id: 'a1',
      patient_id: 'p1',
      patient_name: 'Asha Mehta',
      patient_phone: '+91 98765 43210',
      appointment_date: '2026-05-08T04:30:00.000Z',
      status: 'confirmed',
      reason_for_visit: 'Cough x 3 days',
      consultation_type: 'in_clinic',
      catalog_service_key: null,
      episode_id: null,
      opd_event_type: 'standard',
    };
    const patientRow = {
      id: 'p1',
      medical_record_number: 'P-00042',
      age: 32,
      date_of_birth: null,
      gender: 'F',
    };

    const { from } = createMockAdmin({
      opd_queue_entries: [{ data: [queueRow], error: null }],
      appointments: [{ data: [aptRow], error: null }],
      patients: [{ data: [patientRow], error: null }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const rows = await listDoctorQueueSession(doctorId, sessionDate, correlationId);

    expect(rows).toHaveLength(1);
    const row = rows[0]!;

    // No legacy fields
    expect((row as unknown as Record<string, unknown>).patientLabel).toBeUndefined();
    expect((row as unknown as Record<string, unknown>).appointmentDate).toBeUndefined();

    // Identity (PHI — doctor-scoped)
    expect(row.patientName).toBe('Asha Mehta');
    expect(row.medicalRecordNumber).toBe('P-00042');
    expect(row.patientPhone).toBe('+91 98765 43210');

    // Demographics
    expect(row.age).toBe(32);
    expect(row.gender).toBe('F');

    // Visit details
    expect(row.appointmentStatus).toBe('confirmed');
    expect(row.scheduledAt).toBe('2026-05-08T04:30:00.000Z');
    expect(row.reasonForVisit).toBe('Cough x 3 days');
    expect(row.consultationType).toBe('in_clinic');
    expect(row.catalogServiceKey).toBeNull();
    expect(row.serviceLabel).toBeNull();

    // Episode markers
    expect(row.episodeId).toBeNull();
    expect(row.opdEventType).toBe('standard');

    // Queue metadata
    expect(row.entryId).toBe('q1');
    expect(row.appointmentId).toBe('a1');
    expect(row.tokenNumber).toBe(4);
    expect(row.position).toBe(2);
    expect(row.queueStatus).toBe('waiting');
    expect(row.sessionDate).toBe(sessionDate);
    expect(row.queueCreatedAt).toBe('2026-05-08T03:00:00.000Z');
  });

  it('leaves MRN, age, gender null when patient_id is null (walk-in pre-MRN)', async () => {
    const queueRow = {
      id: 'q-walkin',
      appointment_id: 'a-walkin',
      token_number: 1,
      position: 1,
      status: 'waiting',
      session_date: sessionDate,
      created_at: '2026-05-08T03:00:00.000Z',
    };
    const aptRow = {
      id: 'a-walkin',
      patient_id: null,
      patient_name: 'Walk In',
      patient_phone: '+91 90000 00000',
      appointment_date: '2026-05-08T05:00:00.000Z',
      status: 'pending',
      reason_for_visit: null,
      consultation_type: null,
      catalog_service_key: null,
      episode_id: null,
      opd_event_type: null,
    };

    const { from, counters } = createMockAdmin({
      opd_queue_entries: [{ data: [queueRow], error: null }],
      appointments: [{ data: [aptRow], error: null }],
      patients: [],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const rows = await listDoctorQueueSession(doctorId, sessionDate, correlationId);

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.medicalRecordNumber).toBeNull();
    expect(row.age).toBeNull();
    expect(row.gender).toBeNull();
    expect(row.consultationType).toBeNull();
    expect(row.reasonForVisit).toBeNull();

    // No patients fetch when no appointment carries a patient_id
    expect(counters.patients).toBe(0);
    // No catalog (doctor_settings) fetch when no row carries a catalog key
    expect(mockedDoctorSettings.getDoctorSettings).not.toHaveBeenCalled();
  });

  it('derives age from date_of_birth when patients.age is null', async () => {
    const dob = new Date(Date.UTC(1990, 0, 1)).toISOString().slice(0, 10);
    const expectedAge = (() => {
      const now = new Date();
      let years = now.getUTCFullYear() - 1990;
      if (now.getUTCMonth() < 0 || (now.getUTCMonth() === 0 && now.getUTCDate() < 1)) {
        years -= 1;
      }
      return years;
    })();

    const { from } = createMockAdmin({
      opd_queue_entries: [
        {
          data: [
            {
              id: 'q-dob',
              appointment_id: 'a-dob',
              token_number: 2,
              position: 1,
              status: 'waiting',
              session_date: sessionDate,
              created_at: '2026-05-08T03:00:00.000Z',
            },
          ],
          error: null,
        },
      ],
      appointments: [
        {
          data: [
            {
              id: 'a-dob',
              patient_id: 'p-dob',
              patient_name: 'DOB Test',
              patient_phone: '+91 90000 00001',
              appointment_date: '2026-05-08T05:00:00.000Z',
              status: 'confirmed',
              reason_for_visit: null,
              consultation_type: null,
              catalog_service_key: null,
              episode_id: null,
              opd_event_type: null,
            },
          ],
          error: null,
        },
      ],
      patients: [
        {
          data: [
            {
              id: 'p-dob',
              medical_record_number: null,
              age: null,
              date_of_birth: dob,
              gender: 'M',
            },
          ],
          error: null,
        },
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const rows = await listDoctorQueueSession(doctorId, sessionDate, correlationId);
    expect(rows[0]!.age).toBe(expectedAge);
    expect(rows[0]!.gender).toBe('M');
  });

  it('round-trips episodeId and opdEventType from the appointment row', async () => {
    const { from } = createMockAdmin({
      opd_queue_entries: [
        {
          data: [
            {
              id: 'q-ep',
              appointment_id: 'a-ep',
              token_number: 7,
              position: 3,
              status: 'waiting',
              session_date: sessionDate,
              created_at: '2026-05-08T03:00:00.000Z',
            },
          ],
          error: null,
        },
      ],
      appointments: [
        {
          data: [
            {
              id: 'a-ep',
              patient_id: null,
              patient_name: 'Returning Patient',
              patient_phone: '+91 90000 00002',
              appointment_date: '2026-05-08T05:00:00.000Z',
              status: 'confirmed',
              reason_for_visit: 'Follow-up',
              consultation_type: 'in_clinic',
              catalog_service_key: null,
              episode_id: 'episode-9',
              opd_event_type: 'return_after_completed',
            },
          ],
          error: null,
        },
      ],
      patients: [],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const rows = await listDoctorQueueSession(doctorId, sessionDate, correlationId);
    expect(rows[0]!.episodeId).toBe('episode-9');
    expect(rows[0]!.opdEventType).toBe('return_after_completed');
  });

  it('resolves serviceLabel from the doctor catalog when catalog_service_key is set', async () => {
    const aptRows = [
      {
        id: 'a-cat',
        patient_id: null,
        patient_name: 'Cat Patient',
        patient_phone: '+91 90000 00003',
        appointment_date: '2026-05-08T05:00:00.000Z',
        status: 'confirmed',
        reason_for_visit: null,
        consultation_type: 'video',
        catalog_service_key: 'derm_consult',
        episode_id: null,
        opd_event_type: null,
      },
      {
        id: 'a-miss',
        patient_id: null,
        patient_name: 'Miss Match',
        patient_phone: '+91 90000 00004',
        appointment_date: '2026-05-08T05:15:00.000Z',
        status: 'confirmed',
        reason_for_visit: null,
        consultation_type: 'video',
        catalog_service_key: 'unknown_key',
        episode_id: null,
        opd_event_type: null,
      },
    ];
    const queueRows = [
      {
        id: 'q-cat-1',
        appointment_id: 'a-cat',
        token_number: 1,
        position: 1,
        status: 'waiting',
        session_date: sessionDate,
        created_at: '2026-05-08T03:00:00.000Z',
      },
      {
        id: 'q-cat-2',
        appointment_id: 'a-miss',
        token_number: 2,
        position: 2,
        status: 'waiting',
        session_date: sessionDate,
        created_at: '2026-05-08T03:01:00.000Z',
      },
    ];

    mockedDoctorSettings.getDoctorSettings.mockResolvedValue({
      doctor_id: doctorId,
    } as never);
    mockedCatalogHelpers.getActiveServiceCatalog.mockReturnValue({
      version: 1,
      services: [
        {
          service_key: 'derm_consult',
          service_id: '11111111-1111-1111-1111-111111111111',
          label: 'Dermatology Consultation',
          modalities: { text: { enabled: true, price_minor: 50000 } },
        },
        {
          service_key: 'other',
          service_id: '22222222-2222-2222-2222-222222222222',
          label: 'Other Concern',
          modalities: { text: { enabled: true, price_minor: 50000 } },
        },
      ],
    } as never);

    const { from, counters } = createMockAdmin({
      opd_queue_entries: [{ data: queueRows, error: null }],
      appointments: [{ data: aptRows, error: null }],
      patients: [],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const rows = await listDoctorQueueSession(doctorId, sessionDate, correlationId);

    expect(rows[0]!.catalogServiceKey).toBe('derm_consult');
    expect(rows[0]!.serviceLabel).toBe('Dermatology Consultation');

    // Catalog miss falls back to the raw key (so the UI never renders `null`
    // for legitimately-set keys that simply don't resolve in the catalog).
    expect(rows[1]!.catalogServiceKey).toBe('unknown_key');
    expect(rows[1]!.serviceLabel).toBe('unknown_key');

    // doctor_settings fetched exactly once for the entire request.
    expect(mockedDoctorSettings.getDoctorSettings).toHaveBeenCalledTimes(1);

    // No N+1: appointments + patients each consulted at most once.
    expect(counters.appointments).toBe(1);
    expect(counters.patients).toBe(0);
    expect(counters.opd_queue_entries).toBe(1);
  });

  it('returns [] when no queue entries exist for the session date', async () => {
    const { from, counters } = createMockAdmin({
      opd_queue_entries: [{ data: [], error: null }],
      appointments: [],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const rows = await listDoctorQueueSession(doctorId, sessionDate, correlationId);
    expect(rows).toEqual([]);
    expect(counters.appointments).toBe(0);
    expect(counters.patients).toBe(0);
  });
});
