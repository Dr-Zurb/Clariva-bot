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
  validateParseComplaintRequest,
  validateCreatePatientConditionBody,
  validateUpdatePatientConditionBody,
  validateCreatePatientMedicationBody,
  validateUpdatePatientMedicationBody,
  validateUpdateMedicalBackgroundNotesBody,
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

  describe('age', () => {
    it('accepts numeric age string or number', () => {
      expect(validatePatientField('age', '45')).toBe(45);
      expect(validatePatientField('age', '  30  ')).toBe(30);
    });

    it('rejects out-of-range or non-numeric age', () => {
      expect(() => validatePatientField('age', 'not-a-number')).toThrow(
        ValidationError
      );
      expect(() => validatePatientField('age', '')).toThrow(ValidationError);
      expect(() => validatePatientField('age', '0')).toThrow(ValidationError);
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
    reasonForVisit: 'Follow-up visit',
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

describe('validateParseComplaintRequest (subj-14)', () => {
  const fieldSpec = [{ key: 'duration', label: 'Duration', type: 'duration' as const }];

  it('accepts a minimal valid body and trims text', () => {
    const result = validateParseComplaintRequest({
      text: '  burning chest pain 3 days  ',
      fieldSpec,
    });
    expect(result.text).toBe('burning chest pain 3 days');
    expect(result.fieldSpec).toHaveLength(1);
  });

  it('accepts optional category and tier', () => {
    const result = validateParseComplaintRequest({
      text: 'pain',
      category: 'pain',
      tier: 'escalation',
      fieldSpec,
    });
    expect(result.category).toBe('pain');
    expect(result.tier).toBe('escalation');
  });

  it('rejects empty text', () => {
    expect(() => validateParseComplaintRequest({ text: '', fieldSpec })).toThrow(ValidationError);
  });

  it('rejects an empty fieldSpec', () => {
    expect(() => validateParseComplaintRequest({ text: 'pain', fieldSpec: [] })).toThrow(
      ValidationError,
    );
  });

  it('rejects an invalid field type', () => {
    expect(() =>
      validateParseComplaintRequest({
        text: 'pain',
        fieldSpec: [{ key: 'x', label: 'X', type: 'number' }],
      }),
    ).toThrow(ValidationError);
  });

  it('rejects an invalid tier', () => {
    expect(() =>
      validateParseComplaintRequest({ text: 'pain', tier: 'turbo', fieldSpec }),
    ).toThrow(ValidationError);
  });
});

describe('patient chart condition validation', () => {
  it('defaults condition status to active on create', () => {
    const result = validateCreatePatientConditionBody({ condition: 'Hypertension' });
    expect(result.status).toBe('active');
  });

  it('accepts resolved status on update', () => {
    const result = validateUpdatePatientConditionBody({ status: 'resolved' });
    expect(result.status).toBe('resolved');
  });
});

describe('patient chart medication validation', () => {
  it('accepts intake pattern and source on create', () => {
    const result = validateCreatePatientMedicationBody({
      drugName: 'Metformin',
      intakePattern: 'irregular',
      source: 'self',
    });
    expect(result.intakePattern).toBe('irregular');
    expect(result.source).toBe('self');
  });

  it('accepts usage attribute updates', () => {
    const result = validateUpdatePatientMedicationBody({
      status: 'past',
      intakePattern: 'prn',
      source: 'otc',
    });
    expect(result.status).toBe('past');
    expect(result.intakePattern).toBe('prn');
    expect(result.source).toBe('otc');
  });
});

describe('patient chart medical background notes validation', () => {
  it('accepts trimmed section notes on update', () => {
    const result = validateUpdateMedicalBackgroundNotesBody({
      notes: '  Prior hospitalizations abroad  ',
    });
    expect(result.notes).toBe('Prior hospitalizations abroad');
  });

  it('accepts null notes to clear the field', () => {
    const result = validateUpdateMedicalBackgroundNotesBody({ notes: null });
    expect(result.notes).toBeNull();
  });
});
