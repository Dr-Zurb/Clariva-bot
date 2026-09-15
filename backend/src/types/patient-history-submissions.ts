/**
 * Appointment-scoped history captured at the front desk (dvp P2).
 * Sidecar records what the desk entered this visit. Desk upsert also
 * writes the mapped chart tables (same trust as desk vitals). PHI: the answers.
 */

export const HISTORY_SUBMISSION_SOURCES = ['front_desk', 'patient', 'assistant'] as const;
export type HistorySubmissionSource = (typeof HISTORY_SUBMISSION_SOURCES)[number];

export interface HistoryAllergyItem {
  name: string;
  reaction?: string | null;
  accepted_at?: string | null;
  accepted_by?: string | null;
}

export interface HistoryMedicineItem {
  name: string;
  dose?: string | null;
  accepted_at?: string | null;
  accepted_by?: string | null;
}

export interface HistoryConditionItem {
  name: string;
  code?: string | null;
  codeTitle?: string | null;
  accepted_at?: string | null;
  accepted_by?: string | null;
}

export interface HistoryNoneOrList<T> {
  none: boolean;
  items: T[];
  none_accepted_at?: string | null;
  none_accepted_by?: string | null;
}

export type HistoryAllergiesPayload = HistoryNoneOrList<HistoryAllergyItem> & {
  /** Visit-scoped why-today stamp stored on this JSONB (no extra column). */
  why_today_accepted_at?: string | null;
  why_today_accepted_by?: string | null;
};
export type HistoryMedicinesPayload = HistoryNoneOrList<HistoryMedicineItem>;
export type HistoryConditionsPayload = HistoryNoneOrList<HistoryConditionItem>;

export const HISTORY_ACCEPT_FIELDS = [
  'why_today',
  'allergies',
  'medicines',
  'conditions',
] as const;
export type HistoryAcceptField = (typeof HISTORY_ACCEPT_FIELDS)[number];

export type HistoryAcceptOutcome = 'created' | 'merged' | 'seeded' | 'nkda' | 'already_accepted';

export interface AcceptHistorySubmissionInput {
  field: HistoryAcceptField;
  index?: number;
}

export interface PatientHistorySubmission {
  id: string;
  doctor_id: string;
  patient_id: string;
  appointment_id: string;
  source: HistorySubmissionSource;
  actor_id: string;
  why_today: string;
  why_today_accepted_at: string | null;
  why_today_accepted_by: string | null;
  allergies: HistoryAllergiesPayload;
  medicines: HistoryMedicinesPayload;
  conditions: HistoryConditionsPayload;
  notice_version: string | null;
  submitted_at: string;
  updated_at: string;
}

export interface AcceptHistorySubmissionResult {
  submission: PatientHistorySubmission;
  outcome: HistoryAcceptOutcome;
  seeded?: { cc: string; hopi: string | null };
}

export interface UpsertHistorySubmissionInput {
  whyToday: string;
  allergies: HistoryAllergiesPayload;
  medicines: HistoryMedicinesPayload;
  conditions: HistoryConditionsPayload;
  noticeVersion?: string | null;
  source?: HistorySubmissionSource;
}

export interface HistoryChartAllergy {
  allergen: string;
  reaction: string | null;
}

export interface HistoryChartCondition {
  condition: string;
  code: string | null;
}

export interface HistoryChartMedication {
  drug_name: string;
  dose: string | null;
}

/** Existing chart chips the desk can show without doctor-only routes. */
export interface HistoryChartSnapshot {
  allergies: HistoryChartAllergy[];
  noKnownAllergies: boolean;
  conditions: HistoryChartCondition[];
  medications: HistoryChartMedication[];
}

export interface HistorySubmissionView {
  submission: PatientHistorySubmission | null;
  chart: HistoryChartSnapshot | null;
}
