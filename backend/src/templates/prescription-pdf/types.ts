/**
 * Shared types for the prescription PDF templates (T3.15).
 *
 * The composer / service layer pre-shapes the prescription + doctor +
 * patient + appointment rows into these flat structures so the React
 * components don't have to know anything about Supabase row shapes.
 *
 * Pattern mirrors backend/src/services/transcript-pdf-composer.ts —
 * separating "render" from "fetch" makes the templates trivially
 * unit-testable with a synthesised payload.
 */

import type { PrescriptionMedicine } from '../../types/prescription';
import type { OutputCustomSubsection } from '../../utils/custom-subsections';

export interface PrescriptionPdfHeaderData {
  /** "Dr. Jane Doe" — already prefixed by the service. */
  doctorName: string;
  qualifications?: string | null;
  specialty?: string | null;
  registrationNumber?: string | null;
  clinicName?: string | null;
  clinicAddress?: string | null;
  /** Resolved logo URL (signed if from private storage; null when missing or unreachable). */
  logoUrl?: string | null;
}

export interface PrescriptionPdfFooterData {
  doctorName: string;
  /** Last 8 chars of prescription_id, displayed for at-a-glance ID on print. */
  shortId: string;
  /** Pre-formatted "May 4, 2026 6:32 PM IST" — service does the timezone math. */
  generatedAtLabel: string;
}

export interface PrescriptionPdfPatientData {
  patientName: string;
  patientAge?: string | null;
  patientGender?: string | null;
  /** Visit date pre-formatted in clinic timezone. */
  visitDateLabel: string;
}

export interface PrescriptionPdfBodyData {
  cc: string | null;
  hopi: string | null;
  /** Derived plain-text social history (from `prescriptions.social_history`). */
  socialHistory: string | null;
  provisionalDiagnosis: string | null;
  investigations: string | null;
  followUp: string | null;
  patientEducation: string | null;
  clinicalNotes: string | null;
  medicines: PrescriptionMedicine[];
  /**
   * Doctor-defined custom subjective subsections (subj-22). Already
   * sanitised + empty-omitted; renders as an ordered block (section title →
   * body → child title → body). Empty/absent → no block rendered. Optional so
   * older composer call sites that predate subj-22 still type-check; the
   * current composer always populates it.
   */
  customSubsections?: OutputCustomSubsection[];
}

export interface PrescriptionPdfData {
  header: PrescriptionPdfHeaderData;
  footer: PrescriptionPdfFooterData;
  patient: PrescriptionPdfPatientData;
  body: PrescriptionPdfBodyData;
}
