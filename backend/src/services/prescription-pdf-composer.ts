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

export interface PrescriptionPdfSourceRow {
  cc: string | null;
  hopi: string | null;
  social_history?: string | null;
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

/** Map a prescription DB row + medicines into the PDF body (plain TEXT fields only). */
export function mapPrescriptionToPdfBody(
  rx: PrescriptionPdfSourceRow,
  medicines: PrescriptionMedicine[],
): PrescriptionPdfData['body'] {
  const socialHistory = rx.social_history?.trim() || null;
  const referral = rx.referral?.trim() || null;
  return {
    cc: rx.cc,
    hopi: rx.hopi,
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
