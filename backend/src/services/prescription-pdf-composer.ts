/**
 * Prescription PDF composer — maps DB rows to template-ready shapes (T3.15).
 *
 * Kept separate from `prescription-pdf-service.ts` so unit tests can
 * validate field mapping without loading `@react-pdf/renderer` (ESM).
 *
 * plan-p1: advice + referral are patient-facing; clinical_notes stay private
 * (never mapped into the PDF body). Follow-up free-text wins; else derive
 * from structured value+unit.
 */

import type { PrescriptionPdfData } from '../templates/prescription-pdf/types';
import type { CustomSubsection, FollowUpUnit, PrescriptionMedicine } from '../types/prescription';
import { sanitizeCustomSubsectionsForOutput } from '../utils/custom-subsections';
import { resolveAdviceForOutput } from '../utils/advice-format';
import { resolveFollowUpForOutput } from '../utils/follow-up-format';
import {
  formatAllergiesForOutput,
  type AllergyForOutput,
} from '../utils/allergy-format';
import { formatVitalsForOutput } from '../utils/vitals-format';

export interface PrescriptionPdfSourceRow {
  cc: string | null;
  hopi: string | null;
  social_history?: string | null;
  examination_findings?: string | null;
  vitals_bp_systolic?: number | null;
  vitals_bp_diastolic?: number | null;
  vitals_hr?: number | null;
  vitals_temp_c?: number | null;
  vitals_spo2?: number | null;
  vitals_wt_kg?: number | null;
  vitals_ht_cm?: number | null;
  vitals_rr?: number | null;
  vitals_pain_score?: number | null;
  vitals_glucose_mg_dl?: number | null;
  vitals_gcs_total?: number | null;
  vitals_bp_posture?: string | null;
  vitals_bp_limb?: string | null;
  vitals_json?: { sectionNote?: string | null } | null;
  provisional_diagnosis: string | null;
  investigations_orders: string | null;
  follow_up: string | null;
  follow_up_value?: number | null;
  follow_up_unit?: FollowUpUnit | null;
  patient_education: string | null;
  advice?: string | null;
  referral?: string | null;
  /**
   * Doctor-private. Accepted so callers can spread a Prescription row, but
   * never mapped into the patient PDF body (plan-p1 / ASMT-D5 precedent).
   */
  clinical_notes?: string | null;
  /** subj-22: doctor-defined custom subsections JSONB (depth-2). */
  custom_subsections?: CustomSubsection[] | null;
  /** assessment-plan-custom-sections: custom Assessment sections JSONB (depth-2). */
  assessment_custom_sections?: CustomSubsection[] | null;
  /** assessment-plan-custom-sections: custom Plan sections JSONB (depth-2). */
  plan_custom_sections?: CustomSubsection[] | null;
}

export interface PrescriptionPdfBodyExtras {
  allergies?: AllergyForOutput[];
  /** Doctor asserted nil-known allergies (migration 222). */
  noKnownAllergies?: boolean;
  /** Desk `patient_vitals.note` when the Rx has not stored sectionNote yet. */
  deskVitalsNote?: string | null;
}

/** Map a prescription DB row + medicines into the PDF body (plain TEXT fields only). */
export function mapPrescriptionToPdfBody(
  rx: PrescriptionPdfSourceRow,
  medicines: PrescriptionMedicine[],
  extras: PrescriptionPdfBodyExtras = {},
): PrescriptionPdfData['body'] {
  const socialHistory = rx.social_history?.trim() || null;
  const referral = rx.referral?.trim() || null;
  const examinationFindings = rx.examination_findings?.trim() || null;
  return {
    allergies: formatAllergiesForOutput(extras.allergies, {
      noKnownAllergies: extras.noKnownAllergies,
    }),
    cc: rx.cc,
    hopi: rx.hopi,
    vitals: formatVitalsForOutput({
      vitalsBpSystolic: rx.vitals_bp_systolic,
      vitalsBpDiastolic: rx.vitals_bp_diastolic,
      vitalsHr: rx.vitals_hr,
      vitalsTempC: rx.vitals_temp_c == null ? null : Number(rx.vitals_temp_c),
      vitalsSpo2: rx.vitals_spo2,
      vitalsWtKg: rx.vitals_wt_kg == null ? null : Number(rx.vitals_wt_kg),
      vitalsHtCm: rx.vitals_ht_cm == null ? null : Number(rx.vitals_ht_cm),
      vitalsRr: rx.vitals_rr,
      vitalsPainScore: rx.vitals_pain_score,
      vitalsGlucoseMgDl:
        rx.vitals_glucose_mg_dl == null ? null : Number(rx.vitals_glucose_mg_dl),
      vitalsGcsTotal: rx.vitals_gcs_total,
      vitalsBpPosture: rx.vitals_bp_posture,
      vitalsBpLimb: rx.vitals_bp_limb,
      note: rx.vitals_json?.sectionNote?.trim() || extras.deskVitalsNote?.trim() || null,
    }),
    examinationFindings,
    socialHistory,
    provisionalDiagnosis: rx.provisional_diagnosis,
    // cockpit-v2 / migration 103: DB column renamed; PDF body field
    // name `investigations` stays for the deprecation window.
    investigations: rx.investigations_orders,
    advice: resolveAdviceForOutput(rx.advice, rx.patient_education),
    followUp: resolveFollowUpForOutput(
      rx.follow_up,
      rx.follow_up_value,
      rx.follow_up_unit,
    ),
    // Folded into `advice` — keep null so PDF omits a second section.
    patientEducation: null,
    referral,
    medicines,
    // subj-22: additive block; sanitised (empty sections/children omitted).
    // Does not touch cc/hopi or any existing field.
    customSubsections: sanitizeCustomSubsectionsForOutput(rx.custom_subsections),
    // assessment-plan-custom-sections: same sanitise path as subjective customs.
    assessmentCustomSections: sanitizeCustomSubsectionsForOutput(rx.assessment_custom_sections),
    planCustomSections: sanitizeCustomSubsectionsForOutput(rx.plan_custom_sections),
  };
}
