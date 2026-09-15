export type HistorySubmissionSource = "front_desk" | "patient" | "assistant";

export type HistoryAllergyItem = {
  name: string;
  reaction?: string | null;
  accepted_at?: string | null;
  accepted_by?: string | null;
};

export type HistoryMedicineItem = {
  name: string;
  dose?: string | null;
  accepted_at?: string | null;
  accepted_by?: string | null;
};

export type HistoryConditionItem = {
  name: string;
  code?: string | null;
  codeTitle?: string | null;
  accepted_at?: string | null;
  accepted_by?: string | null;
};

export type HistoryNoneOrList<T> = {
  none: boolean;
  items: T[];
  none_accepted_at?: string | null;
  none_accepted_by?: string | null;
};

export type HistoryAllergiesPayload = HistoryNoneOrList<HistoryAllergyItem> & {
  why_today_accepted_at?: string | null;
  why_today_accepted_by?: string | null;
};
export type HistoryMedicinesPayload = HistoryNoneOrList<HistoryMedicineItem>;
export type HistoryConditionsPayload = HistoryNoneOrList<HistoryConditionItem>;

export type HistoryAcceptField = "why_today" | "allergies" | "medicines" | "conditions";

export type HistoryAcceptOutcome =
  | "created"
  | "merged"
  | "seeded"
  | "nkda"
  | "already_accepted";

export type AcceptHistorySubmissionBody = {
  field: HistoryAcceptField;
  index?: number;
};

export type PatientHistorySubmission = {
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
};

export type AcceptHistorySubmissionResult = {
  submission: PatientHistorySubmission;
  outcome: HistoryAcceptOutcome;
  seeded?: { cc: string; hopi: string | null };
};

export type UpsertHistorySubmissionBody = {
  whyToday?: string;
  allergies: HistoryAllergiesPayload;
  medicines: HistoryMedicinesPayload;
  conditions: HistoryConditionsPayload;
  noticeVersion?: string | null;
};

export type HistoryChartSnapshot = {
  allergies: Array<{ allergen: string; reaction: string | null }>;
  noKnownAllergies: boolean;
  conditions: Array<{ condition: string; code: string | null }>;
  medications: Array<{ drug_name: string; dose: string | null }>;
};

export type HistorySubmissionView = {
  submission: PatientHistorySubmission | null;
  chart: HistoryChartSnapshot | null;
};

export const HISTORY_WHY_TODAY_MAX = 280;
export const HISTORY_LIST_MAX = 20;
