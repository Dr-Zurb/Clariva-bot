/**
 * Appointment Service Unit Tests (e-task-2)
 *
 * Tests for bookAppointment (double-book prevention), getAppointmentById.
 * Uses fake placeholders per TESTING.md (PATIENT_TEST, +10000000000).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  bookAppointment,
  getAppointmentById,
  getDoctorAppointments,
  hasAppointmentOnDate,
  updateAppointment,
} from '../../../src/services/appointment-service';
import { ConflictError, NotFoundError, ValidationError } from '../../../src/utils/errors';
import * as database from '../../../src/config/database';
import * as auditLogger from '../../../src/utils/audit-logger';
import * as doctorSettings from '../../../src/services/doctor-settings-service';
import { ensurePatientMrnIfEligible } from '../../../src/services/patient-service';

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/audit-logger');
jest.mock('../../../src/services/patient-service', () => ({
  ensurePatientMrnIfEligible: jest.fn().mockImplementation(async () => 'P-00001'),
}));
jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn(async () => null),
}));

// `prescription-pdf-service` transitively imports `@react-pdf/renderer`,
// an ESM-only package that ts-jest can't transform out of the box. Stub
// it at the boundary so `notification-service` (consumed by
// `consultation-session-service`, which we `requireActual` below) loads
// cleanly. None of the appointment-service code paths under test invoke
// PDF rendering, so an inert stub is safe.
jest.mock('../../../src/services/prescription-pdf-service', () => ({
  generatePrescriptionPdf: jest.fn(async () => Buffer.from([])),
  buildPrescriptionPdfContext: jest.fn(async () => ({})),
}));

jest.mock('../../../src/services/care-episode-service', () => ({
  syncCareEpisodeLifecycleOnAppointmentCompleted: jest.fn(async () => {}),
}));

// Post-Task-35: appointment-service enriches every Appointment it returns
// with a `consultation_session` summary fetched via these helpers. The
// getAppointmentById / bookAppointment paths in this test don't care about
// that enrichment so we stub both helpers to a no-op (returns null / empty
// map) to keep the existing lightweight mock admin chain viable.
jest.mock('../../../src/services/consultation-session-service', () => {
  const actual = jest.requireActual(
    '../../../src/services/consultation-session-service'
  ) as object;
  return {
    ...actual,
    findLatestAppointmentSessionSummary: jest.fn(async () => null),
    findLatestAppointmentSessionSummariesBulk: jest.fn(async () => new Map()),
  };
});

const mockedDb = database as jest.Mocked<typeof database>;
const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;
const mockedDoctorSettings = doctorSettings as jest.Mocked<typeof doctorSettings>;
const mockEnsureMrn = ensurePatientMrnIfEligible as jest.MockedFunction<typeof ensurePatientMrnIfEligible>;

const doctorId = '550e8400-e29b-41d4-a716-446655440000';
const patientIdForFree = '660e8400-e29b-41d4-a716-446655440099';
const userId = '550e8400-e29b-41d4-a716-446655440001';
const correlationId = 'corr-123';
const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 7);
futureDate.setHours(10, 0, 0, 0);

const validBookInput = {
  doctorId,
  patientName: 'PATIENT_TEST',
  patientPhone: '+10000000000',
  appointmentDate: futureDate.toISOString(),
  reasonForVisit: 'Follow-up consultation',
  notes: 'Follow-up',
};

function createMockAdmin(
  responses: ({ data: unknown; error: null } | { data: null; error: unknown })[]
) {
  let idx = 0;
  const getNext = () => responses[idx++] ?? { data: null, error: null };

  const chain: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    limit: jest.fn().mockImplementation(() => Promise.resolve(getNext())),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn().mockImplementation(() => Promise.resolve(getNext())),
  };
  chain.then = (resolve: (v: unknown) => void) => resolve(getNext());
  chain.catch = () => chain;

  const from = jest.fn().mockReturnValue(chain);
  return { from };
}

function createMockSupabase(
  selectResponse: { data: unknown; error: unknown },
  updateResponse?: { data: unknown; error: unknown }
) {
  let singleCalls = 0;
  const chain: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockImplementation(async () => ({ data: null, error: null })),
    single: jest.fn().mockImplementation(() => {
      singleCalls += 1;
      if (singleCalls === 1) {
        return Promise.resolve(selectResponse);
      }
      return Promise.resolve(updateResponse ?? selectResponse);
    }),
  };
  const from = jest.fn().mockReturnValue(chain);
  return { from, chain };
}

describe('Appointment Service (e-task-2)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (mockedAudit.logAuditEvent as jest.Mock) = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
    (mockedAudit.logDataAccess as jest.Mock) = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
    mockedDoctorSettings.getDoctorSettings.mockResolvedValue(null);
    mockEnsureMrn.mockClear();
    mockEnsureMrn.mockImplementation(async () => 'P-00001');
  });

  describe('bookAppointment', () => {
    it('throws ValidationError for past date', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const input = { ...validBookInput, appointmentDate: pastDate.toISOString() };

      await expect(bookAppointment(input, correlationId)).rejects.toThrow(
        'Cannot book appointments in the past'
      );
    });

    it('throws ConflictError when slot already booked (no userId)', async () => {
      const mockAdmin = createMockAdmin([{ data: [{ id: 'existing' }], error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      const err = await bookAppointment(validBookInput, correlationId).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.message).toBe('This time slot is no longer available');
    });

    it('creates appointment when slot available (no userId)', async () => {
      const createdAppointment = {
        id: 'apt-123',
        doctor_id: doctorId,
        patient_name: validBookInput.patientName,
        patient_phone: validBookInput.patientPhone,
        appointment_date: futureDate.toISOString(),
        status: 'pending',
        reason_for_visit: validBookInput.reasonForVisit,
        notes: validBookInput.notes,
        created_at: new Date(),
        updated_at: new Date(),
      };
      const mockAdmin = createMockAdmin([
        { data: [], error: null },
        { data: createdAppointment, error: null },
      ]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      const result = await bookAppointment(validBookInput, correlationId);

      expect(result.id).toBe('apt-123');
      expect(result.patient_name).toBe(validBookInput.patientName);
      expect(mockedAudit.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create_appointment',
          resourceType: 'appointment',
          resourceId: 'apt-123',
          status: 'success',
        })
      );
      expect(mockEnsureMrn).not.toHaveBeenCalled();
    });

    it('calls ensurePatientMrnIfEligible when freeOfCost and patientId are set', async () => {
      const createdAppointment = {
        id: 'apt-free',
        doctor_id: doctorId,
        patient_id: patientIdForFree,
        patient_name: validBookInput.patientName,
        patient_phone: validBookInput.patientPhone,
        appointment_date: futureDate.toISOString(),
        status: 'confirmed',
        reason_for_visit: validBookInput.reasonForVisit,
        notes: validBookInput.notes,
        created_at: new Date(),
        updated_at: new Date(),
      };
      const mockAdmin = createMockAdmin([
        { data: [], error: null },
        { data: createdAppointment, error: null },
      ]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      await bookAppointment(
        {
          ...validBookInput,
          patientId: patientIdForFree,
          freeOfCost: true,
        },
        correlationId
      );

      expect(mockEnsureMrn).toHaveBeenCalledTimes(1);
      expect(mockEnsureMrn).toHaveBeenCalledWith(patientIdForFree, correlationId);
    });
  });

  describe('getAppointmentById', () => {
    it('returns appointment when found and user is owner', async () => {
      const appointment = {
        id: 'apt-456',
        doctor_id: userId,
        patient_name: 'PATIENT_TEST',
        patient_phone: '+10000000000',
        appointment_date: futureDate,
        status: 'pending',
        notes: 'Test',
        created_at: new Date(),
        updated_at: new Date(),
      };
      const mockAdmin = createMockAdmin([{ data: appointment, error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      const result = await getAppointmentById('apt-456', correlationId, userId);

      expect(result.id).toBe('apt-456');
      expect(result.doctor_id).toBe(userId);
    });

    it('throws NotFoundError when appointment not found', async () => {
      const mockAdmin = createMockAdmin([
        { data: null, error: { code: 'PGRST116', message: 'not found' } } as any,
      ]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      const err = await getAppointmentById('nonexistent', correlationId, userId).catch((e) => e);
      expect(err).toBeInstanceOf(NotFoundError);
      expect(err.message).toBe('Appointment not found');
    });

    it('throws NotFoundError when user is not owner', async () => {
      const appointment = {
        id: 'apt-789',
        doctor_id: 'other-doctor-id',
        patient_name: 'PATIENT_TEST',
        patient_phone: '+10000000000',
        appointment_date: futureDate,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
      };
      const mockAdmin = createMockAdmin([{ data: appointment, error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      const err = await getAppointmentById('apt-789', correlationId, userId).catch((e) => e);
      expect(err).toBeInstanceOf(NotFoundError);
      expect(err.message).toBe('Appointment not found');
    });

    // ------------------------------------------------------------------------
    // CP-D6: doctor-scoped patient_age + patient_sex demographics widening.
    // The endpoint embeds `patient:patients(date_of_birth, gender)` and
    // projects onto the flat `patient_age` / `patient_sex` API fields,
    // stripping the embedded `patient` join object so the surface stays flat.
    // ------------------------------------------------------------------------
    it('returns patient_age + patient_sex for an appointment with a populated patient row', async () => {
      // DOB 30 years ago today (UTC) — `computeAgeYears` uses UTC math, so
      // freeze the input to UTC midnight to keep the assertion stable across
      // CI timezones.
      const dob = new Date();
      dob.setUTCFullYear(dob.getUTCFullYear() - 30);
      dob.setUTCHours(0, 0, 0, 0);
      const dobIso = dob.toISOString().slice(0, 10); // 'YYYY-MM-DD'

      const appointment = {
        id: 'apt-d6-populated',
        doctor_id: userId,
        patient_id: '770e8400-e29b-41d4-a716-446655440099',
        patient_name: 'PATIENT_TEST',
        patient_phone: '+10000000000',
        appointment_date: futureDate,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
        // PostgREST embedded join — single object form.
        patient: { date_of_birth: dobIso, gender: 'male' },
      };
      const mockAdmin = createMockAdmin([{ data: appointment, error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      const result = await getAppointmentById('apt-d6-populated', correlationId, userId);

      expect(result.patient_age).toBe(30);
      expect(result.patient_sex).toBe('male');
    });

    it('returns null demographics for a guest appointment (patient_id null)', async () => {
      const appointment = {
        id: 'apt-d6-guest',
        doctor_id: userId,
        patient_id: null,
        patient_name: 'PATIENT_TEST',
        patient_phone: '+10000000000',
        appointment_date: futureDate,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
        // No patient row to embed — PostgREST returns null for the join.
        patient: null,
      };
      const mockAdmin = createMockAdmin([{ data: appointment, error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      const result = await getAppointmentById('apt-d6-guest', correlationId, userId);

      expect(result.patient_age).toBeNull();
      expect(result.patient_sex).toBeNull();
    });

    it('does not leak the embedded patient join object on the response', async () => {
      const appointment = {
        id: 'apt-d6-no-leak',
        doctor_id: userId,
        patient_id: '770e8400-e29b-41d4-a716-446655440099',
        patient_name: 'PATIENT_TEST',
        patient_phone: '+10000000000',
        appointment_date: futureDate,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
        patient: { date_of_birth: '1995-06-15', gender: 'female' },
      };
      const mockAdmin = createMockAdmin([{ data: appointment, error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      const result = await getAppointmentById('apt-d6-no-leak', correlationId, userId);

      // The embedded join object MUST be stripped so the API surface stays
      // flat. If this regresses, downstream consumers may accidentally
      // start reading `appointment.patient.date_of_birth` directly,
      // which is a contract violation we want to catch immediately.
      expect((result as unknown as Record<string, unknown>).patient).toBeUndefined();
      // Sanity: the projected fields are still present.
      expect(result.patient_sex).toBe('female');
      expect(typeof result.patient_age).toBe('number');
    });

    it('normalizes single-letter gender shorthand (M/F/O) to the long-form union', async () => {
      const appointment = {
        id: 'apt-d6-shorthand',
        doctor_id: userId,
        patient_id: '770e8400-e29b-41d4-a716-446655440099',
        patient_name: 'PATIENT_TEST',
        patient_phone: '+10000000000',
        appointment_date: futureDate,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
        // Legacy import paths write 'F' / 'M' / 'O'; normalize at the boundary
        // so cockpit / chart consumers get a single canonical shape.
        patient: { date_of_birth: '1980-01-01', gender: 'F' },
      };
      const mockAdmin = createMockAdmin([{ data: appointment, error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      const result = await getAppointmentById('apt-d6-shorthand', correlationId, userId);

      expect(result.patient_sex).toBe('female');
    });

    // ------------------------------------------------------------------------
    // CS-03: opd_queue_event_type + opd_token_number JOIN widening.
    // The endpoint embeds `opd_queue_entry:opd_queue_entries(token_number)`
    // and projects onto flat `opd_queue_event_type` / `opd_token_number` API
    // fields, stripping the embedded join object.
    //
    // Post-fix note: an earlier revision of the embed also pulled
    // `event_type`, but that column does not exist on `opd_queue_entries`
    // (migration 028 is the source-of-truth — `id, doctor_id, appointment_id,
    //  session_date, token_number, position, status, created_at, updated_at`
    // only). Selecting it caused PostgREST to 4xx every appointment read,
    // surfacing as "Appointment not found" in the cockpit. The API field
    // `opd_queue_event_type` is now projected from the *presence* of the
    // joined row — present → 'token', absent → null. See
    // `enrichRowWithDemographics` and `EmbeddedOpdQueueJoin` for the
    // full rationale. The tests below mirror that contract.
    // ------------------------------------------------------------------------
    it('returns opd_queue_event_type + opd_token_number for a token-queue appointment', async () => {
      const appointment = {
        id: 'apt-cs03-token',
        doctor_id: userId,
        patient_name: 'PATIENT_TEST',
        patient_phone: '+10000000000',
        appointment_date: futureDate,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
        patient: null,
        // PostgREST returns one-to-many embeds as arrays. The DB enforces
        // UNIQUE(appointment_id) so the array is always 0- or 1-length.
        opd_queue_entry: [{ token_number: 7 }],
      };
      const mockAdmin = createMockAdmin([{ data: appointment, error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      const result = await getAppointmentById('apt-cs03-token', correlationId, userId);

      expect(result.opd_queue_event_type).toBe('token');
      expect(result.opd_token_number).toBe(7);
      // The embedded join object must be stripped from the API surface.
      expect((result as unknown as Record<string, unknown>).opd_queue_entry).toBeUndefined();
    });

    it('returns null OPD fields for an appointment WITHOUT an opd_queue_entries row', async () => {
      const appointment = {
        id: 'apt-cs03-no-queue',
        doctor_id: userId,
        patient_name: 'PATIENT_TEST',
        patient_phone: '+10000000000',
        appointment_date: futureDate,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
        patient: null,
        // LEFT JOIN returns null when no matching opd_queue_entries row exists.
        opd_queue_entry: null,
      };
      const mockAdmin = createMockAdmin([{ data: appointment, error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      const result = await getAppointmentById('apt-cs03-no-queue', correlationId, userId);

      expect(result.opd_queue_event_type).toBeNull();
      expect(result.opd_token_number).toBeNull();
    });
  });

  describe('hasAppointmentOnDate (e-task-2 2026-03-18)', () => {
    const patientId = '550e8400-e29b-41d4-a716-446655440002';
    const patientName = 'PATIENT_TEST';
    const patientPhone = '+10000000000';
    const dateStr = '2026-03-18';

    it('returns true when appointment exists on date (by patient_id)', async () => {
      const mockAdmin = createMockAdmin([{ data: [{ id: 'apt-existing' }], error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      const result = await hasAppointmentOnDate(
        doctorId,
        patientId,
        patientName,
        patientPhone,
        dateStr,
        correlationId
      );

      expect(result).toBe(true);
    });

    it('returns false when no appointment on date (by patient_id)', async () => {
      const mockAdmin = createMockAdmin([{ data: [], error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      const result = await hasAppointmentOnDate(
        doctorId,
        patientId,
        patientName,
        patientPhone,
        dateStr,
        correlationId
      );

      expect(result).toBe(false);
    });

    it('returns true when guest has appointment on date (by name+phone)', async () => {
      const mockAdmin = createMockAdmin([{ data: [{ id: 'apt-guest' }], error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      const result = await hasAppointmentOnDate(
        doctorId,
        null,
        patientName,
        patientPhone,
        dateStr,
        correlationId
      );

      expect(result).toBe(true);
    });

    it('returns false when guest has no appointment on date', async () => {
      const mockAdmin = createMockAdmin([{ data: [], error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

      const result = await hasAppointmentOnDate(
        doctorId,
        null,
        patientName,
        patientPhone,
        dateStr,
        correlationId
      );

      expect(result).toBe(false);
    });
  });

  describe('updateAppointment (e-task-5)', () => {
    it('updates status when provided', async () => {
      const existing = { id: 'apt-patch', doctor_id: userId, status: 'confirmed' };
      const updated = { ...existing, status: 'completed', updated_at: new Date() };
      const mockAdmin = createMockSupabase(
        { data: existing, error: null },
        { data: updated, error: null }
      );
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);
      (mockedAudit.logDataModification as jest.Mock) = jest.fn().mockImplementation(() => Promise.resolve());

      const result = await updateAppointment(
        'apt-patch',
        { status: 'completed' },
        correlationId,
        userId
      );

      expect(result.status).toBe('completed');
      expect(mockAdmin.chain.update).toHaveBeenCalledWith({ status: 'completed' });
    });

    it('updates clinical_notes when provided', async () => {
      const existing = { id: 'apt-patch', doctor_id: userId, status: 'confirmed' };
      const updated = { ...existing, clinical_notes: 'Patient improved', updated_at: new Date() };
      const mockAdmin = createMockSupabase(
        { data: existing, error: null },
        { data: updated, error: null }
      );
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);
      (mockedAudit.logDataModification as jest.Mock) = jest.fn().mockImplementation(() => Promise.resolve());

      const result = await updateAppointment(
        'apt-patch',
        { clinical_notes: 'Patient improved' },
        correlationId,
        userId
      );

      expect(result.clinical_notes).toBe('Patient improved');
      expect(mockAdmin.chain.update).toHaveBeenCalledWith({
        clinical_notes: 'Patient improved',
      });
    });

    it('throws ValidationError when no fields provided', async () => {
      await expect(updateAppointment('apt-patch', {}, correlationId, userId)).rejects.toThrow(
        ValidationError
      );
    });
  });

  // --------------------------------------------------------------------------
  // CS-03: getDoctorAppointments returns OPD queue fields per row.
  // --------------------------------------------------------------------------
  describe('getDoctorAppointments (CS-03 — OPD queue widening)', () => {
    it('returns opd_queue_event_type + opd_token_number per row, with null for non-queue rows', async () => {
      const queueRow = {
        id: 'apt-cs03-list-queue',
        doctor_id: doctorId,
        patient_name: 'PATIENT_TEST',
        patient_phone: '+10000000000',
        appointment_date: futureDate,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
        patient: null,
        // PostgREST returns one-to-many embeds as arrays. The DB enforces
        // UNIQUE(appointment_id) so the array is always 0- or 1-length.
        opd_queue_entry: [{ token_number: 3 }],
      };
      const nonQueueRow = {
        id: 'apt-cs03-list-noqueue',
        doctor_id: doctorId,
        patient_name: 'PATIENT_TEST',
        patient_phone: '+10000000000',
        appointment_date: futureDate,
        status: 'confirmed',
        created_at: new Date(),
        updated_at: new Date(),
        patient: null,
        // No matching opd_queue_entries row — LEFT JOIN returns null.
        opd_queue_entry: null,
      };

      // jest.resetAllMocks() in beforeEach clears the consultation-session-service
      // stub; restore the bulk helper so enrichAppointmentsWithSessions resolves.
      const mockConsultSvc = jest.requireMock('../../../src/services/consultation-session-service') as Record<string, jest.Mock>;
      mockConsultSvc.findLatestAppointmentSessionSummariesBulk.mockImplementation(async () => new Map());

      // getDoctorAppointments uses the user-role `supabase` client (not admin).
      const orderMock = jest.fn().mockImplementation(async () => ({ data: [queueRow, nonQueueRow], error: null }));
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: orderMock,
      };
      (mockedDb as unknown as Record<string, unknown>).supabase = { from: jest.fn().mockReturnValue(chainMock) };

      const results = await getDoctorAppointments(doctorId, correlationId, doctorId);

      const queued = results.find((r) => r.id === 'apt-cs03-list-queue');
      const nonQueued = results.find((r) => r.id === 'apt-cs03-list-noqueue');

      expect(queued?.opd_queue_event_type).toBe('token');
      expect(queued?.opd_token_number).toBe(3);
      expect(nonQueued?.opd_queue_event_type).toBeNull();
      expect(nonQueued?.opd_token_number).toBeNull();

      // Embedded join objects must be stripped.
      expect((queued as unknown as Record<string, unknown>).opd_queue_entry).toBeUndefined();
      expect((nonQueued as unknown as Record<string, unknown>).opd_queue_entry).toBeUndefined();
    });
  });
});
