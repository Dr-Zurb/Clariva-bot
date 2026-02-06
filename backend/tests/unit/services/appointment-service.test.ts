/**
 * Appointment Service Unit Tests (e-task-2)
 *
 * Tests for bookAppointment (double-book prevention), getAppointmentById.
 * Uses fake placeholders per TESTING.md (PATIENT_TEST, +10000000000).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { bookAppointment, getAppointmentById } from '../../../src/services/appointment-service';
import { ConflictError, NotFoundError } from '../../../src/utils/errors';
import * as database from '../../../src/config/database';
import * as auditLogger from '../../../src/utils/audit-logger';

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/audit-logger');

const mockedDb = database as jest.Mocked<typeof database>;
const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;

const doctorId = '550e8400-e29b-41d4-a716-446655440000';
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
  notes: 'Follow-up',
};

function createMockAdmin(
  responses: ({ data: unknown; error: null } | { data: null; error: unknown })[]
) {
  let idx = 0;
  const getNext = () => responses[idx++] ?? { data: null, error: null };

  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    lt: jest.fn().mockImplementation(() => Promise.resolve(getNext())),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn().mockImplementation(() => Promise.resolve(getNext())),
  };
  chain.lt.mockImplementation(() => Promise.resolve(getNext()));

  const from = jest.fn().mockReturnValue(chain);
  return { from };
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
});
