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
});
