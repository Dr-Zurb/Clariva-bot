/**
 * rcp-29: per-doctor identity backfill — split plan + consent + load-shaped fixtures.
 */

import { describe, it, expect } from '@jest/globals';
import {
  buildCloneInsertPayload,
  collectDoctorIdsForPatient,
  consentForCloneRow,
  consentForPrimaryRow,
  pickPrimaryDoctorId,
  planPatientSplit,
  type PlatformPatientRow,
} from '../../../src/services/perdoctor-identity-backfill';

const doctorA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const doctorB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const doctorC = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const sharedPatientId = '11111111-1111-1111-1111-111111111111';
const psid = '987654321012345';

function platformPatient(overrides: Partial<PlatformPatientRow> = {}): PlatformPatientRow {
  return {
    id: sharedPatientId,
    doctor_id: null,
    platform: 'instagram',
    platform_external_id: psid,
    name: 'Priya Sharma',
    phone: '+919876543210',
    consent_status: 'granted',
    consent_granted_at: '2026-01-01T00:00:00.000Z',
    consent_method: 'instagram_dm',
    medical_record_number: 'P-00001',
    ...overrides,
  };
}

describe('perdoctor-identity-backfill (rcp-29)', () => {
  describe('collectDoctorIdsForPatient', () => {
    it('collects distinct doctors from conversations and appointments', () => {
      const ids = collectDoctorIdsForPatient(
        sharedPatientId,
        [
          { doctor_id: doctorB, patient_id: sharedPatientId },
          { doctor_id: doctorA, patient_id: sharedPatientId },
        ],
        [{ doctor_id: doctorA, patient_id: sharedPatientId }]
      );
      expect(ids).toEqual([doctorA, doctorB]);
    });
  });

  describe('consent rules (DL-7)', () => {
    it('clone rows always start pending', () => {
      expect(consentForCloneRow()).toEqual({
        consent_status: 'pending',
        consent_granted_at: null,
        consent_revoked_at: null,
        consent_method: null,
      });
    });

    it('primary row preserves granting doctor consent on original', () => {
      expect(consentForPrimaryRow(platformPatient())).toEqual({
        consent_status: 'granted',
        consent_granted_at: '2026-01-01T00:00:00.000Z',
        consent_revoked_at: null,
        consent_method: 'instagram_dm',
      });
    });

    it('clone insert payload does not copy granted consent to additional doctors', () => {
      const payload = buildCloneInsertPayload(
        platformPatient(),
        doctorB,
        consentForCloneRow()
      );
      expect(payload.doctor_id).toBe(doctorB);
      expect(payload.consent_status).toBe('pending');
      expect(payload.platform_external_id).toBe(psid);
      expect(payload.name).toBe('Priya Sharma');
    });
  });

  describe('planPatientSplit', () => {
    it('single-doctor row: stamp doctor_id only (no clone)', () => {
      const plan = planPatientSplit(platformPatient(), [doctorA]);
      expect(plan.stampPrimaryDoctorId).toBe(true);
      expect(plan.clones).toHaveLength(0);
      expect(plan.primaryDoctorId).toBe(doctorA);
      expect(plan.noop).toBe(false);
    });

    it('single-doctor already stamped: noop', () => {
      const plan = planPatientSplit(platformPatient({ doctor_id: doctorA }), [doctorA]);
      expect(plan.noop).toBe(true);
      expect(plan.stampPrimaryDoctorId).toBe(false);
    });

    it('shared PSID across two doctors: primary keeps row, one clone for other doctor', () => {
      const plan = planPatientSplit(platformPatient(), [doctorA, doctorB]);
      expect(plan.primaryDoctorId).toBe(pickPrimaryDoctorId([doctorA, doctorB]));
      expect(plan.clones).toHaveLength(1);
      expect(plan.clones[0]?.doctorId).toBe(doctorB);
      expect(plan.clones[0]?.action).toBe('create');
      expect(plan.clones[0]?.consent.consent_status).toBe('pending');
      expect(plan.stampPrimaryDoctorId).toBe(true);
    });

    it('shared PSID across three doctors: two clones', () => {
      const plan = planPatientSplit(platformPatient(), [doctorA, doctorB, doctorC]);
      expect(plan.clones).toHaveLength(2);
      expect(plan.clones.map((c) => c.doctorId).sort()).toEqual([doctorB, doctorC]);
    });

    it('idempotent: reuses existing per-doctor clone rows', () => {
      const existing = new Map<string, string>([[doctorB, 'clone-patient-b-id']]);
      const plan = planPatientSplit(platformPatient({ doctor_id: doctorA }), [doctorA, doctorB], existing);
      expect(plan.clones[0]?.action).toBe('reuse');
      expect(plan.clones[0]?.existingPatientId).toBe('clone-patient-b-id');
      expect(plan.noop).toBe(true);
    });

    it('book-for-other excluded: no platform means not passed into planner (caller skips)', () => {
      const plan = planPatientSplit(
        platformPatient({ platform: '', platform_external_id: '' }),
        []
      );
      expect(plan.noop).toBe(true);
    });
  });

  describe('load-shaped FK integrity (in-memory simulation)', () => {
    it('N doctors ⇒ N per-doctor patient targets after split plan applied', () => {
      const doctors = [doctorA, doctorB];
      const plan = planPatientSplit(platformPatient(), doctors);
      const patientIdsByDoctor = new Map<string, string>();
      patientIdsByDoctor.set(plan.primaryDoctorId, sharedPatientId);

      for (const clone of plan.clones) {
        const cloneId = clone.existingPatientId ?? `clone-${clone.doctorId}`;
        patientIdsByDoctor.set(clone.doctorId, cloneId);
      }

      expect(patientIdsByDoctor.size).toBe(2);
      expect(patientIdsByDoctor.get(doctorA)).toBe(sharedPatientId);
      expect(patientIdsByDoctor.get(doctorB)).toMatch(/^clone-/);

      const conversations = [
        { doctor_id: doctorA, patient_id: sharedPatientId },
        { doctor_id: doctorB, patient_id: sharedPatientId },
      ];
      const appointments = [{ doctor_id: doctorB, patient_id: sharedPatientId }];

      for (const clone of plan.clones) {
        const targetId = patientIdsByDoctor.get(clone.doctorId)!;
        for (const c of conversations) {
          if (c.doctor_id === clone.doctorId && c.patient_id === sharedPatientId) {
            c.patient_id = targetId;
          }
        }
        for (const a of appointments) {
          if (a.doctor_id === clone.doctorId && a.patient_id === sharedPatientId) {
            a.patient_id = targetId;
          }
        }
      }

      expect(conversations.find((c) => c.doctor_id === doctorA)?.patient_id).toBe(sharedPatientId);
      expect(conversations.find((c) => c.doctor_id === doctorB)?.patient_id).toBe(
        patientIdsByDoctor.get(doctorB)
      );
      expect(appointments[0]?.patient_id).toBe(patientIdsByDoctor.get(doctorB));
      expect(conversations.every((c) => c.patient_id !== sharedPatientId || c.doctor_id === doctorA)).toBe(
        true
      );
    });
  });
});
