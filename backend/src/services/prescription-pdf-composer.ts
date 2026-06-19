/**
 * Prescription PDF composer — maps DB rows to template-ready shapes (T3.15).
 *
 * Kept separate from `prescription-pdf-service.ts` so unit tests can
 * validate field mapping without loading `@react-pdf/renderer` (ESM).
 */

import type { PrescriptionPdfData } from '../templates/prescription-pdf/types';
import type { CustomSubsection, PrescriptionMedicine } from '../types/prescription';
import { sanitizeCustomSubsectionsForOutput } from '../utils/custom-subsections';

export interface PrescriptionPdfSourceRow {
  cc: string | null;
  hopi: string | null;
  social_history?: string | null;
  provisional_diagnosis: string | null;
  investigations_orders: string | null;
  follow_up: string | null;
  patient_education: string | null;
  clinical_notes: string | null;
  /** subj-22: doctor-defined custom subsections JSONB (depth-2). */
  custom_subsections?: CustomSubsection[] | null;
}

/** Map a prescription DB row + medicines into the PDF body (plain TEXT fields only). */
export function mapPrescriptionToPdfBody(
  rx: PrescriptionPdfSourceRow,
  medicines: PrescriptionMedicine[],
): PrescriptionPdfData['body'] {
  const socialHistory = rx.social_history?.trim() || null;
  return {
    cc: rx.cc,
    hopi: rx.hopi,
    socialHistory,
    provisionalDiagnosis: rx.provisional_diagnosis,
    // cockpit-v2 / migration 103: DB column renamed; PDF body field
    // name `investigations` stays for the deprecation window.
    investigations: rx.investigations_orders,
    followUp: rx.follow_up,
    patientEducation: rx.patient_education,
    clinicalNotes: rx.clinical_notes,
    medicines,
    // subj-22: additive block; sanitised (empty sections/children omitted).
    // Does not touch cc/hopi or any existing field.
    customSubsections: sanitizeCustomSubsectionsForOutput(rx.custom_subsections),
  };
}
