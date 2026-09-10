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
import type {
  LetterheadBackgroundPreset,
  LetterheadImageFit,
  LetterheadLogoSize,
  LetterheadPageSize,
  LetterheadTextSize,
  LetterheadPreset,
  PatientIdentityPreset,
} from '../../types/letterhead';

export type PrescriptionPdfLogoSrc = string | { data: Buffer; format: 'png' | 'jpg' };

export interface PrescriptionPdfHeaderData {
  /** "Dr. Jane Doe" — already prefixed by the service. */
  doctorName: string;
  qualifications?: string | null;
  specialty?: string | null;
  registrationNumber?: string | null;
  clinicName?: string | null;
  clinicAddress?: string | null;
  /**
   * Buffer source preferred (BRD-D5). String URL kept for tests / fallback;
   * the service never passes a signed URL.
   */
  logoSrc?: PrescriptionPdfLogoSrc | null;
  /** Banner header photo (preset `banner`). Buffer preferred (BRD-D5). */
  headerSrc?: PrescriptionPdfLogoSrc | null;
  /** @deprecated Use logoSrc. Kept so existing fixtures type-check. */
  logoUrl?: string | null;
}

export interface PrescriptionPdfFooterData {
  doctorName: string;
  /** Last 8 chars of prescription_id, displayed for at-a-glance ID on print. */
  shortId: string;
  /** Pre-formatted "May 4, 2026 6:32 PM IST" — service does the timezone math. */
  generatedAtLabel: string;
  /** Banner footer photo (preset `banner`). Buffer preferred (BRD-D5). */
  bannerSrc?: PrescriptionPdfLogoSrc | null;
  footerLine?: string | null;
  hideHaloCredit?: boolean;
  /**
   * rxl-26 / RXL-DL-11 — system text. Null on Version 1.
   * Must render even when hideHaloCredit or a custom footerLine is set.
   */
  replacesLine?: string | null;
}

export interface PrescriptionPdfLayout {
  preset: LetterheadPreset;
  pageSize: LetterheadPageSize;
  accentColor: string;
  chromeColor?: string;
  patientColor?: string;
  preprintMarginTopMm: number;
  preprintMarginBottomMm: number;
  headerHeightMm?: number;
  footerHeightMm?: number;
  pageMarginTopMm?: number;
  pageMarginRightMm?: number;
  pageMarginBottomMm?: number;
  pageMarginLeftMm?: number;
  logoSize?: LetterheadLogoSize;
  headerTextSize?: LetterheadTextSize;
  patientTextSize?: LetterheadTextSize;
  bodyTextSize?: LetterheadTextSize;
  patientIdentityPreset?: PatientIdentityPreset;
  showPatientPhone?: boolean;
  showPatientGuardian?: boolean;
  showPatientMrn?: boolean;
  showPatientAddress?: boolean;
  backgroundSrc?: PrescriptionPdfLogoSrc | null;
  backgroundPreset?: LetterheadBackgroundPreset;
  backgroundOpacity?: number;
  headerFit?: LetterheadImageFit;
  footerFit?: LetterheadImageFit;
  backgroundFit?: LetterheadImageFit;
}

export interface PrescriptionPdfPatientData {
  patientName: string;
  patientAge?: string | null;
  patientGender?: string | null;
  /** Visit date pre-formatted in clinic timezone. */
  visitDateLabel: string;
  patientPhone?: string | null;
  guardianName?: string | null;
  guardianRelation?: string | null;
  address?: string | null;
  medicalRecordNumber?: string | null;
}

export interface PrescriptionPdfBodyData {
  /**
   * Recorded list or "No known allergies". Null when never asked —
   * SectionBlock omits the line. NKDA is not inferred from an empty list.
   */
  allergies: string | null;
  cc: string | null;
  hopi: string | null;
  /** Compact vitals line; null → section omitted. */
  vitals: string | null;
  /** Free-text exam findings; null → section omitted. */
  examinationFindings: string | null;
  /** Derived plain-text social history (from `prescriptions.social_history`). */
  socialHistory: string | null;
  provisionalDiagnosis: string | null;
  investigations: string | null;
  /** plan-p1 — patient-facing lifestyle / advice. */
  advice: string | null;
  followUp: string | null;
  patientEducation: string | null;
  /** plan-p1 — patient-facing referral. */
  referral: string | null;
  medicines: PrescriptionMedicine[];
  /**
   * Doctor-defined custom subjective subsections (subj-22). Already
   * sanitised + empty-omitted; renders as an ordered block (section title →
   * body → child title → body). Empty/absent → no block rendered. Optional so
   * older composer call sites that predate subj-22 still type-check; the
   * current composer always populates it.
   */
  customSubsections?: OutputCustomSubsection[];
  /**
   * assessment-plan-custom-sections — doctor-defined custom Assessment sections.
   * Already sanitised + empty-omitted; renders after the diagnosis block.
   * Empty/absent → no block rendered. Optional for call-site parity.
   */
  assessmentCustomSections?: OutputCustomSubsection[];
  /**
   * assessment-plan-custom-sections — doctor-defined custom Plan sections.
   * Already sanitised + empty-omitted; renders in the plan-side block.
   * Empty/absent → no block rendered. Optional for call-site parity.
   */
  planCustomSections?: OutputCustomSubsection[];
}

export interface PrescriptionPdfData {
  header: PrescriptionPdfHeaderData;
  footer: PrescriptionPdfFooterData;
  patient: PrescriptionPdfPatientData;
  body: PrescriptionPdfBodyData;
  layout?: PrescriptionPdfLayout;
}
