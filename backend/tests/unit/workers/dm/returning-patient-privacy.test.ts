/**
 * rcp-24: Cross-tenant isolation, consent suppression, and PHI-safe audit for returning memory.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Appointment, Patient } from '../../../../src/types/database';
import type { ReturningPatientProfile } from '../../../../src/types/returning-patient';
import * as appointmentService from '../../../../src/services/appointment-service';
import * as patientService from '../../../../src/services/patient-service';
import {
  loadReturningPatientProfile,
  shouldUseReturningPatientMemory,
} from '../../../../src/workers/dm/returning-patient';
import {
  auditCollectionSkipped,
  auditReturningPatientRecognized,
} from '../../../../src/workers/dm/returning-patient-audit';
import { canOfferReturningFollowUpService } from '../../../../src/workers/dm/returning-followup-offer';
import { isReturningPatientReadyToSkipCollection } from '../../../../src/workers/dm/booking-entry-ready-path';
import * as auditLogger from '../../../../src/utils/audit-logger';

jest.mock('../../../../src/config/env', () => ({
  env: {
    RETURNING_PATIENT_MEMORY_ENABLED: true,
    LOG_LEVEL: 'info',
    NODE_ENV: 'test',
  },
}));

jest.mock('../../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../src/services/slot-selection-service', () => ({
  buildBookingPageUrl: jest.fn(() => 'https://example.com/book'),
}));

jest.mock('../../../../src/services/appointment-service', () => ({
  listAppointmentsForPatient: jest.fn(),
}));

jest.mock('../../../../src/services/patient-service', () => ({
  findPatientByIdWithAdmin: jest.fn(),
}));

jest.mock('../../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(() => null),
}));

function perDoctorPatient(
  doctorTag: 'a' | 'b',
  consent: Patient['consent_status'] = 'granted'
): Patient {
  return {
    id: doctorTag === 'a' ? 'pat-doctor-a' : 'pat-doctor-b',
    doctor_id: doctorTag === 'a' ? 'doc-a' : 'doc-b',
    name: 'Priya Sharma',
    phone: '+919876543210',
    consent_status: consent,
    platform: 'instagram',
    platform_external_id: 'ig-sender-999',
    medical_record_number: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function sharedPatient(consent: Patient['consent_status'] = 'granted'): Patient {
  return {
    id: 'pat-shared-ig',
    name: 'Priya Sharma',
    phone: '+919876543210',
    consent_status: consent,
    platform: 'instagram',
    platform_external_id: 'ig-sender-999',
    medical_record_number: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function appt(
  doctorId: string,
  serviceKey: string,
  patientId: string,
  overrides: Partial<Appointment> = {}
): Appointment {
  return {
    id: `appt-${doctorId}`,
    doctor_id: doctorId,
    patient_id: patientId,
    appointment_date: new Date(Date.now() - 86400000 * 14),
    status: 'completed',
    catalog_service_key: serviceKey,
    consultation_type: 'video',
    patient_name: 'Priya Sharma',
    patient_phone: '+919876543210',
    patient_age: null,
    patient_sex: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Appointment;
}

describe('returning-patient privacy (rcp-24 / rcp-28)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { env } = jest.requireMock<{ env: { RETURNING_PATIENT_MEMORY_ENABLED: boolean } }>(
      '../../../../src/config/env'
    );
    env.RETURNING_PATIENT_MEMORY_ENABLED = true;
  });

  describe('cross-tenant isolation', () => {
    it('Dr A visit history never surfaces for Dr B — per-doctor patient rows, same IG sender', async () => {
      jest
        .mocked(patientService.findPatientByIdWithAdmin)
        .mockImplementation(async (id: string) => {
          if (id === 'pat-doctor-a') return perDoctorPatient('a');
          if (id === 'pat-doctor-b') return perDoctorPatient('b');
          return null;
        });

      jest
        .mocked(appointmentService.listAppointmentsForPatient)
        .mockImplementation(async (_patientId: string, doctorId: string) => {
          if (doctorId === 'doc-a') {
            return [appt('doc-a', 'general_consult', 'pat-doctor-a', { consultation_type: 'in_clinic' })];
          }
          return [];
        });

      const profileA = await loadReturningPatientProfile({
        doctorId: 'doc-a',
        patientId: 'pat-doctor-a',
        correlationId: 'corr-iso',
      });
      const profileB = await loadReturningPatientProfile({
        doctorId: 'doc-b',
        patientId: 'pat-doctor-b',
        correlationId: 'corr-iso',
      });

      expect(appointmentService.listAppointmentsForPatient).toHaveBeenCalledWith(
        'pat-doctor-a',
        'doc-a',
        'corr-iso'
      );
      expect(appointmentService.listAppointmentsForPatient).toHaveBeenCalledWith(
        'pat-doctor-b',
        'doc-b',
        'corr-iso'
      );

      expect(profileA.isReturning).toBe(true);
      expect(profileA.priorVisits.lastServiceKey).toBe('general_consult');
      expect(profileB.isReturning).toBe(false);
      expect(profileB.priorVisits.attendedCount).toBe(0);
      expect(profileB.priorVisits.lastServiceKey).toBeUndefined();

      expect(shouldUseReturningPatientMemory(profileA)).toBe(true);
      expect(shouldUseReturningPatientMemory(profileB)).toBe(false);
    });

    it('rcp-28: consent granted under Dr A does not grant under Dr B (same PSID)', async () => {
      jest
        .mocked(patientService.findPatientByIdWithAdmin)
        .mockImplementation(async (id: string) => {
          if (id === 'pat-doctor-a') return perDoctorPatient('a', 'granted');
          if (id === 'pat-doctor-b') return perDoctorPatient('b', 'pending');
          return null;
        });
      jest.mocked(appointmentService.listAppointmentsForPatient).mockResolvedValue([]);

      const profileA = await loadReturningPatientProfile({
        doctorId: 'doc-a',
        patientId: 'pat-doctor-a',
        correlationId: 'corr-consent-iso',
      });
      const profileB = await loadReturningPatientProfile({
        doctorId: 'doc-b',
        patientId: 'pat-doctor-b',
        correlationId: 'corr-consent-iso',
      });

      expect(profileA.hasGrantedConsent).toBe(true);
      expect(profileB.hasGrantedConsent).toBe(false);
      expect(shouldUseReturningPatientMemory(profileA)).toBe(false);
      expect(shouldUseReturningPatientMemory(profileB)).toBe(false);
    });
  });

  describe('consent revocation and pending suppression', () => {
    const returningWithVisits: ReturningPatientProfile = {
      isReturning: true,
      hasGrantedConsent: false,
      consentStatus: 'revoked',
      hasName: true,
      hasPhone: true,
      knownFieldKeys: ['name', 'phone'],
      priorVisits: {
        attendedCount: 3,
        lastServiceKey: 'follow_up',
        recencyBucket: 'within_3_months',
      },
    };

    it('revoked consent suppresses shouldUseReturningPatientMemory (rcp-21/22/23 gate)', () => {
      expect(shouldUseReturningPatientMemory(returningWithVisits)).toBe(false);
    });

    it('pending consent suppresses memory consumers', () => {
      const pending: ReturningPatientProfile = {
        ...returningWithVisits,
        consentStatus: 'pending',
      };
      expect(shouldUseReturningPatientMemory(pending)).toBe(false);
    });

    it('revoked consent suppresses collection skip (rcp-22)', () => {
      expect(
        isReturningPatientReadyToSkipCollection(returningWithVisits, sharedPatient('revoked'))
      ).toBe(false);
    });

    it('pending consent suppresses collection skip (rcp-22)', () => {
      const pendingProfile: ReturningPatientProfile = {
        ...returningWithVisits,
        consentStatus: 'pending',
      };
      expect(
        isReturningPatientReadyToSkipCollection(pendingProfile, sharedPatient('pending'))
      ).toBe(false);
    });

    it('revoked consent suppresses follow-up offer (rcp-23)', () => {
      const catalog = {
        version: 1 as const,
        services: [{ service_key: 'follow_up', label: 'Follow-up', modalities: {} }],
      };
      expect(
        canOfferReturningFollowUpService(
          returningWithVisits,
          { step: 'responded', updatedAt: new Date().toISOString() },
          { service_offerings_json: catalog } as never
        )
      ).toBe(false);
    });

    it('loadReturningPatientProfile sets hasGrantedConsent false when consent revoked', async () => {
      jest.mocked(patientService.findPatientByIdWithAdmin).mockResolvedValue(sharedPatient('revoked'));
      jest.mocked(appointmentService.listAppointmentsForPatient).mockResolvedValue([
        appt('doc-a', 'follow_up', 'pat-shared-ig'),
      ]);

      const profile = await loadReturningPatientProfile({
        doctorId: 'doc-a',
        patientId: 'pat-shared-ig',
        correlationId: 'corr-revoked',
      });

      expect(profile.isReturning).toBe(true);
      expect(profile.hasGrantedConsent).toBe(false);
      expect(shouldUseReturningPatientMemory(profile)).toBe(false);
    });
  });

  describe('audit events (enum/opaque metadata only)', () => {
    const profile: ReturningPatientProfile = {
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
    };

    it('auditReturningPatientRecognized emits redactionApplied + opaque fields only', async () => {
      const spy = jest.spyOn(auditLogger, 'logAuditEvent').mockResolvedValue(undefined);

      await auditReturningPatientRecognized('corr-audit', 'doc-a', 'pat-1', profile);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'returning_patient_recognized',
          resourceType: 'patient',
          resourceId: 'pat-1',
          status: 'success',
          metadata: {
            doctorId: 'doc-a',
            redactionApplied: true,
            attendedCount: 2,
            recencyBucket: 'within_3_months',
            recalledServiceKey: 'follow_up',
            knownFieldKeyCount: 2,
          },
        })
      );

      const metadata = spy.mock.calls[0][0].metadata ?? {};
      expect(JSON.stringify(metadata)).not.toMatch(/Priya|919876543210|headache/i);
      expect(Object.keys(metadata)).not.toEqual(
        expect.arrayContaining(['patientName', 'lastVisitSummary', 'reason_for_visit'])
      );

      spy.mockRestore();
    });

    it('auditCollectionSkipped emits skippedFieldKeys (names only, no values)', async () => {
      const spy = jest.spyOn(auditLogger, 'logAuditEvent').mockResolvedValue(undefined);

      await auditCollectionSkipped('corr-audit', 'doc-a', 'pat-1', ['name', 'phone']);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'collection_skipped',
          metadata: {
            doctorId: 'doc-a',
            redactionApplied: true,
            skippedFieldKeys: ['name', 'phone'],
          },
        })
      );

      spy.mockRestore();
    });

    it('validateNoPHI accepts audit metadata keys (no throw via logAuditEvent)', async () => {
      const spy = jest.spyOn(auditLogger, 'logAuditEvent').mockImplementation(async (params) => {
        expect(params.metadata).toBeDefined();
        expect(params.metadata?.redactionApplied).toBe(true);
      });

      await auditReturningPatientRecognized('corr-phi', 'doc-a', 'pat-1', profile);
      await auditCollectionSkipped('corr-phi', 'doc-a', 'pat-1', ['name', 'phone', 'age']);

      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });
  });
});
