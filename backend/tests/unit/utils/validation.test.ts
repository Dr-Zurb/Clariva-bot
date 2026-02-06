/**
 * Validation Utils Unit Tests (e-task-4)
 *
 * Tests for patient collection field Zod schemas: phone (E.164-like), name, DOB, gender, reason_for_visit.
 * e-task-1: Tests for availableSlotsQuerySchema (availableSlotsQuerySchema, validateAvailableSlotsQuery).
 */

import { describe, it, expect } from '@jest/globals';
import {
  validatePatientField,
  validateAvailableSlotsQuery,
  validateBookAppointment,
  validateGetAppointmentParams,
} from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';

describe('validatePatientField', () => {
  describe('phone', () => {
    it('accepts E.164-like numbers', () => {
      expect(validatePatientField('phone', '+10000000000')).toBe('+10000000000');
      expect(validatePatientField('phone', '10000000000')).toBe('10000000000');
      expect(validatePatientField('phone', '+123456789012345')).toBe(
        '+123456789012345'
      );
    });

    it('rejects invalid phone formats', () => {
      expect(() => validatePatientField('phone', '')).toThrow(ValidationError);
      expect(() => validatePatientField('phone', '555-123-4567')).toThrow(
        ValidationError
      );
      expect(() => validatePatientField('phone', '(555) 123-4567')).toThrow(
        ValidationError
      );
      expect(() => validatePatientField('phone', '0123456789')).toThrow(
        ValidationError
      );
      expect(() => validatePatientField('phone', 'abc')).toThrow(ValidationError);
    });
  });

  describe('name', () => {
    it('accepts valid names', () => {
      expect(validatePatientField('name', 'PATIENT_TEST')).toBe('PATIENT_TEST');
      expect(validatePatientField('name', 'A')).toBe('A');
      expect(validatePatientField('name', '  PATIENT_TEST  ')).toBe('PATIENT_TEST');
    });

    it('rejects empty or too long', () => {
      expect(() => validatePatientField('name', '')).toThrow(ValidationError);
      expect(() =>
        validatePatientField('name', 'x'.repeat(201))
      ).toThrow(ValidationError);
    });
  });

  describe('date_of_birth', () => {
    it('accepts ISO date', () => {
      expect(validatePatientField('date_of_birth', '1990-01-15')).toBe(
        '1990-01-15'
      );
    });

    it('accepts US-style M/D/YYYY', () => {
      expect(validatePatientField('date_of_birth', '1/15/1990')).toBe(
        '1990-01-15'
      );
    });

    it('rejects invalid dates', () => {
      expect(() =>
        validatePatientField('date_of_birth', 'not-a-date')
      ).toThrow(ValidationError);
      expect(() => validatePatientField('date_of_birth', '')).toThrow(
        ValidationError
      );
    });
  });

  describe('gender', () => {
    it('accepts optional gender', () => {
      expect(validatePatientField('gender', 'male')).toBe('male');
      expect(validatePatientField('gender', '  female  ')).toBe('female');
      expect(validatePatientField('gender', '')).toBeUndefined();
    });

    it('rejects too long', () => {
      expect(() =>
        validatePatientField('gender', 'x'.repeat(51))
      ).toThrow(ValidationError);
    });
  });

  describe('reason_for_visit', () => {
    it('accepts reason within length', () => {
      expect(validatePatientField('reason_for_visit', 'Checkup')).toBe(
        'Checkup'
      );
      expect(validatePatientField('reason_for_visit', '  Follow-up  ')).toBe(
        'Follow-up'
      );
    });

    it('rejects over max length', () => {
      expect(() =>
        validatePatientField('reason_for_visit', 'x'.repeat(501))
      ).toThrow(ValidationError);
    });
  });
});

describe('validateAvailableSlotsQuery (e-task-1)', () => {
  const doctorId = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid doctorId and date', () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 30);
    const dateStr = d.toISOString().slice(0, 10);
    const result = validateAvailableSlotsQuery({
      doctorId: '550e8400-e29b-41d4-a716-446655440000',
      date: dateStr,
    });
    expect(result.doctorId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.date).toBe(dateStr);
  });

  it('rejects past dates', () => {
    expect(() =>
      validateAvailableSlotsQuery({ doctorId, date: '2020-01-01' })
    ).toThrow(ValidationError);
  });

  it('rejects invalid doctorId (not UUID)', () => {
    expect(() =>
      validateAvailableSlotsQuery({ doctorId: 'not-uuid', date: '2026-02-01' })
    ).toThrow(ValidationError);
  });

  it('rejects invalid date format', () => {
    expect(() =>
      validateAvailableSlotsQuery({ doctorId, date: '02/01/2026' })
    ).toThrow(ValidationError);
  });

  it('rejects date beyond max future range', () => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 95);
    const date = farFuture.toISOString().slice(0, 10);
    expect(() => validateAvailableSlotsQuery({ doctorId, date })).toThrow(
      ValidationError
    );
  });
});

describe('validateBookAppointment (e-task-2)', () => {
  const futureDate = new Date();
  futureDate.setUTCDate(futureDate.getUTCDate() + 7);
  futureDate.setUTCHours(10, 0, 0, 0);
  const validBody = {
    doctorId: '550e8400-e29b-41d4-a716-446655440000',
    patientName: 'PATIENT_TEST',
    patientPhone: '+10000000000',
    appointmentDate: futureDate.toISOString(),
  };

  it('accepts valid body', () => {
    const result = validateBookAppointment(validBody);
    expect(result.doctorId).toBe(validBody.doctorId);
    expect(result.patientName).toBe(validBody.patientName);
    expect(result.appointmentDate).toBe(validBody.appointmentDate);
  });

  it('rejects past appointmentDate', () => {
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 1);
    expect(() =>
      validateBookAppointment({ ...validBody, appointmentDate: past.toISOString() })
    ).toThrow(ValidationError);
  });

  it('rejects invalid doctorId', () => {
    expect(() =>
      validateBookAppointment({ ...validBody, doctorId: 'not-uuid' })
    ).toThrow(ValidationError);
  });

  it('rejects invalid phone', () => {
    expect(() =>
      validateBookAppointment({ ...validBody, patientPhone: 'invalid' })
    ).toThrow(ValidationError);
  });
});

describe('validateGetAppointmentParams (e-task-2)', () => {
  it('accepts valid UUID', () => {
    const result = validateGetAppointmentParams({
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejects invalid id', () => {
    expect(() => validateGetAppointmentParams({ id: 'not-uuid' })).toThrow(
      ValidationError
    );
  });
});
