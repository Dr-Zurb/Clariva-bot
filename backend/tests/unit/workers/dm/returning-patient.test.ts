/**
 * rcp-20: Returning-patient profile read seam — doctor-scoped, PHI-free, flag-gated.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Appointment, Patient } from '../../../../src/types/database';
import * as appointmentService from '../../../../src/services/appointment-service';
import * as patientService from '../../../../src/services/patient-service';
import {
  deriveRecencyBucket,
  emptyReturningPatientProfile,
  isPlaceholderPatientName,
  isPlaceholderPatientPhone,
  loadReturningPatientProfile,
  buildReturningPatientSummary,
} from '../../../../src/workers/dm/returning-patient';

jest.mock('../../../../src/config/env', () => ({
  env: { RETURNING_PATIENT_MEMORY_ENABLED: false },
}));

jest.mock('../../../../src/services/appointment-service', () => ({
  listAppointmentsForPatient: jest.fn(),
}));

jest.mock('../../../../src/services/patient-service', () => ({
  findPatientByIdWithAdmin: jest.fn(),
}));

function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'pat-1',
    name: 'Placeholder',
    phone: 'placeholder-instagram-sender-1',
    medical_record_number: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function appt(
  overrides: Partial<Appointment> & Pick<Appointment, 'id' | 'appointment_date' | 'status'>
): Appointment {
  return {
    doctor_id: 'doc-a',
    patient_id: 'pat-1',
    patient_name: 'Test',
    patient_phone: '+10000000000',
    patient_age: null,
    patient_sex: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Appointment;
}

describe('returning-patient (rcp-20)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { env } = jest.requireMock<{ env: { RETURNING_PATIENT_MEMORY_ENABLED: boolean } }>(
      '../../../../src/config/env'
    );
    env.RETURNING_PATIENT_MEMORY_ENABLED = false;
  });

  describe('placeholder helpers', () => {
    it('treats Placeholder name and synthetic phone as absent', () => {
      expect(isPlaceholderPatientName('Placeholder')).toBe(true);
      expect(isPlaceholderPatientName('')).toBe(true);
      expect(isPlaceholderPatientName('Priya')).toBe(false);

      expect(isPlaceholderPatientPhone('placeholder-instagram-123')).toBe(true);
      expect(isPlaceholderPatientPhone('')).toBe(true);
      expect(isPlaceholderPatientPhone('+919876543210')).toBe(false);
    });
  });

  describe('loadReturningPatientProfile', () => {
    it('returns isReturning false with zero DB reads when flag is off', async () => {
      const profile = await loadReturningPatientProfile({
        doctorId: 'doc-a',
        patientId: 'pat-1',
        correlationId: 'corr-1',
      });

      expect(profile).toEqual(emptyReturningPatientProfile());
      expect(patientService.findPatientByIdWithAdmin).not.toHaveBeenCalled();
      expect(appointmentService.listAppointmentsForPatient).not.toHaveBeenCalled();
    });

    it('returns isReturning false for a new placeholder sender when flag is on', async () => {
      const { env } = jest.requireMock<{ env: { RETURNING_PATIENT_MEMORY_ENABLED: boolean } }>(
        '../../../../src/config/env'
      );
      env.RETURNING_PATIENT_MEMORY_ENABLED = true;

      jest.mocked(patientService.findPatientByIdWithAdmin).mockResolvedValue(patient());
      jest.mocked(appointmentService.listAppointmentsForPatient).mockResolvedValue([]);

      const profile = await loadReturningPatientProfile({
        doctorId: 'doc-a',
        patientId: 'pat-1',
        correlationId: 'corr-1',
      });

      expect(profile.isReturning).toBe(false);
      expect(profile.hasName).toBe(false);
      expect(profile.hasPhone).toBe(false);
      expect(profile.priorVisits.attendedCount).toBe(0);
    });

    it('returns isReturning true with hasGrantedConsent when prior completed visit and consent granted', async () => {
      const { env } = jest.requireMock<{ env: { RETURNING_PATIENT_MEMORY_ENABLED: boolean } }>(
        '../../../../src/config/env'
      );
      env.RETURNING_PATIENT_MEMORY_ENABLED = true;

      const past = new Date(Date.now() - 86400000 * 14);
      jest.mocked(patientService.findPatientByIdWithAdmin).mockResolvedValue(
        patient({
          name: 'Priya Sharma',
          phone: '+919876543210',
          consent_status: 'granted',
          age: 32,
        })
      );
      jest.mocked(appointmentService.listAppointmentsForPatient).mockResolvedValue([
        appt({
          id: 'appt-1',
          appointment_date: past,
          status: 'completed',
          catalog_service_key: 'follow_up',
          consultation_type: 'video',
        }),
      ]);

      const profile = await loadReturningPatientProfile({
        doctorId: 'doc-a',
        patientId: 'pat-1',
        correlationId: 'corr-1',
      });

      expect(profile.isReturning).toBe(true);
      expect(profile.hasGrantedConsent).toBe(true);
      expect(profile.consentStatus).toBe('granted');
      expect(profile.hasName).toBe(true);
      expect(profile.hasPhone).toBe(true);
      expect(profile.knownFieldKeys).toEqual(['name', 'phone', 'age']);
      expect(profile.priorVisits.attendedCount).toBe(1);
      expect(profile.priorVisits.lastServiceKey).toBe('follow_up');
      expect(profile.priorVisits.lastModality).toBe('video');
      expect(profile.priorVisits.recencyBucket).toBe('within_1_month');
    });

    it('sets hasGrantedConsent false when consent is revoked but still computes profile', async () => {
      const { env } = jest.requireMock<{ env: { RETURNING_PATIENT_MEMORY_ENABLED: boolean } }>(
        '../../../../src/config/env'
      );
      env.RETURNING_PATIENT_MEMORY_ENABLED = true;

      jest.mocked(patientService.findPatientByIdWithAdmin).mockResolvedValue(
        patient({
          name: 'Priya Sharma',
          phone: '+919876543210',
          consent_status: 'revoked',
        })
      );
      jest.mocked(appointmentService.listAppointmentsForPatient).mockResolvedValue([
        appt({
          id: 'appt-1',
          appointment_date: new Date(Date.now() - 86400000),
          status: 'completed',
        }),
      ]);

      const profile = await loadReturningPatientProfile({
        doctorId: 'doc-a',
        patientId: 'pat-1',
        correlationId: 'corr-1',
      });

      expect(profile.isReturning).toBe(true);
      expect(profile.hasGrantedConsent).toBe(false);
      expect(profile.consentStatus).toBe('revoked');
    });

    it('does not count cancelled, no_show, or pending as attended visits', async () => {
      const { env } = jest.requireMock<{ env: { RETURNING_PATIENT_MEMORY_ENABLED: boolean } }>(
        '../../../../src/config/env'
      );
      env.RETURNING_PATIENT_MEMORY_ENABLED = true;

      jest.mocked(patientService.findPatientByIdWithAdmin).mockResolvedValue(
        patient({ name: 'Priya', phone: '+919876543210', consent_status: 'granted' })
      );
      jest.mocked(appointmentService.listAppointmentsForPatient).mockResolvedValue([
        appt({ id: 'a1', appointment_date: new Date(), status: 'cancelled' }),
        appt({ id: 'a2', appointment_date: new Date(), status: 'no_show' }),
        appt({ id: 'a3', appointment_date: new Date(), status: 'pending' }),
      ]);

      const profile = await loadReturningPatientProfile({
        doctorId: 'doc-a',
        patientId: 'pat-1',
        correlationId: 'corr-1',
      });

      expect(profile.isReturning).toBe(false);
      expect(profile.priorVisits.attendedCount).toBe(0);
    });

    it('isolates visit history per doctor — same patientId, different doctor scopes', async () => {
      const { env } = jest.requireMock<{ env: { RETURNING_PATIENT_MEMORY_ENABLED: boolean } }>(
        '../../../../src/config/env'
      );
      env.RETURNING_PATIENT_MEMORY_ENABLED = true;

      jest.mocked(patientService.findPatientByIdWithAdmin).mockResolvedValue(
        patient({ name: 'Priya', phone: '+919876543210', consent_status: 'granted' })
      );

      const docAVisit = appt({
        id: 'appt-doc-a',
        doctor_id: 'doc-a',
        appointment_date: new Date(Date.now() - 86400000 * 60),
        status: 'completed',
        catalog_service_key: 'general_consult',
        consultation_type: 'in_clinic',
      });
      const docBVisit = appt({
        id: 'appt-doc-b',
        doctor_id: 'doc-b',
        appointment_date: new Date(Date.now() - 86400000 * 10),
        status: 'completed',
        catalog_service_key: 'follow_up',
        consultation_type: 'video',
      });

      jest
        .mocked(appointmentService.listAppointmentsForPatient)
        .mockImplementation(async (_patientId: string, doctorId: string) => {
          if (doctorId === 'doc-a') return [docAVisit];
          if (doctorId === 'doc-b') return [docBVisit];
          return [];
        });

      const profileA = await loadReturningPatientProfile({
        doctorId: 'doc-a',
        patientId: 'pat-shared',
        correlationId: 'corr-1',
      });
      const profileB = await loadReturningPatientProfile({
        doctorId: 'doc-b',
        patientId: 'pat-shared',
        correlationId: 'corr-1',
      });

      expect(appointmentService.listAppointmentsForPatient).toHaveBeenCalledWith(
        'pat-shared',
        'doc-a',
        'corr-1'
      );
      expect(appointmentService.listAppointmentsForPatient).toHaveBeenCalledWith(
        'pat-shared',
        'doc-b',
        'corr-1'
      );
      expect(profileA.priorVisits.lastServiceKey).toBe('general_consult');
      expect(profileA.priorVisits.lastModality).toBe('in_clinic');
      expect(profileB.priorVisits.lastServiceKey).toBe('follow_up');
      expect(profileB.priorVisits.lastModality).toBe('video');
      expect(profileA.priorVisits.lastServiceKey).not.toBe(profileB.priorVisits.lastServiceKey);
    });
  });

  describe('deriveRecencyBucket', () => {
    it('maps elapsed time to coarse buckets', () => {
      const now = Date.now();
      expect(deriveRecencyBucket(new Date(now - 86400000 * 10).toISOString(), now)).toBe(
        'within_1_month'
      );
      expect(deriveRecencyBucket(new Date(now - 86400000 * 60).toISOString(), now)).toBe(
        'within_3_months'
      );
      expect(deriveRecencyBucket(new Date(now - 86400000 * 200).toISOString(), now)).toBe(
        'within_1_year'
      );
      expect(deriveRecencyBucket(new Date(now - 86400000 * 400).toISOString(), now)).toBe(
        'over_1_year'
      );
    });
  });

  describe('buildReturningPatientSummary', () => {
    it('builds PHI-safe structured hint with opaque keys only', () => {
      expect(
        buildReturningPatientSummary({
          isReturning: true,
          hasGrantedConsent: true,
          consentStatus: 'granted',
          hasName: true,
          hasPhone: true,
          knownFieldKeys: ['name', 'phone'],
          priorVisits: {
            attendedCount: 2,
            lastServiceKey: 'follow_up',
            recencyBucket: 'within_3_months',
          },
        })
      ).toBe(
        'returning patient: prior_visits=2, last_service=[follow_up], recency=[within_3_months], follow_up_offer_eligible=true'
      );
    });
  });
});
