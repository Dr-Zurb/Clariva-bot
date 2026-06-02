/**
 * Prescription SOAP field validation (cv2-07).
 * @see backend/src/utils/validation.ts
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateCreatePrescriptionBody,
  validateUpdatePrescriptionBody,
} from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';

const APPOINTMENT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('prescription SOAP validation (cv2-07)', () => {
  describe('validateUpdatePrescriptionBody', () => {
    it('accepts vitalsBpSystolic within range', () => {
      const result = validateUpdatePrescriptionBody({ vitalsBpSystolic: 130 });
      expect(result.vitalsBpSystolic).toBe(130);
    });

    it('rejects vitalsBpSystolic above CHECK max with 400-class error', () => {
      expect(() =>
        validateUpdatePrescriptionBody({ vitalsBpSystolic: 500 })
      ).toThrow(ValidationError);
    });

    it('accepts differentialDiagnosis array', () => {
      const ddx = ['Pharyngitis', 'Tonsillitis'];
      const result = validateUpdatePrescriptionBody({ differentialDiagnosis: ddx });
      expect(result.differentialDiagnosis).toEqual(ddx);
    });

    it('prefers investigationsOrders over investigations when both are set', () => {
      const result = validateUpdatePrescriptionBody({
        investigations: 'legacy CBC',
        investigationsOrders: 'CBC, LFT',
      });
      expect(result.investigations).toBe('CBC, LFT');
      expect(
        (result as { investigationsOrders?: string }).investigationsOrders
      ).toBeUndefined();
    });
  });

  describe('validateCreatePrescriptionBody', () => {
    it('accepts structured SOAP fields on create', () => {
      const result = validateCreatePrescriptionBody({
        appointmentId: APPOINTMENT_ID,
        type: 'structured',
        vitalsBpSystolic: 120,
        vitalsBpDiastolic: 80,
        differentialDiagnosis: ['URI'],
        followUpValue: 5,
        followUpUnit: 'days',
      });
      expect(result.vitalsBpSystolic).toBe(120);
      expect(result.differentialDiagnosis).toEqual(['URI']);
      expect(result.followUpValue).toBe(5);
      expect(result.followUpUnit).toBe('days');
    });

    it('rejects follow-up value without unit', () => {
      expect(() =>
        validateCreatePrescriptionBody({
          appointmentId: APPOINTMENT_ID,
          type: 'structured',
          followUpValue: 3,
        })
      ).toThrow(ValidationError);
    });
  });
});
