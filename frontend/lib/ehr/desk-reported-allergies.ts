/**
 * Leftover helpers for unaccepted sidecar allergies.
 * Desk upsert now writes `patient_allergies` directly (DVP-DL-4 killed).
 * Keep these for older unapplied rows and tests; the live safety surface
 * no longer merges them.
 */

import type { PatientHistorySubmission } from "@/types/patient-history-submissions";
import type { MatchableAllergy } from "@/lib/ehr/match-allergens";

export type DeskReportedAllergy = {
  id: string;
  index: number;
  name: string;
  reaction: string | null;
};

export function deskAllergyId(submissionId: string, index: number): string {
  return `desk:${submissionId}:${index}`;
}

export function ackKeyForDeskAllergy(id: string): string {
  return `desk-allergy:${id}`;
}

export function unacceptedDeskAllergies(
  submission: PatientHistorySubmission | null | undefined,
): DeskReportedAllergy[] {
  if (!submission || submission.allergies.none) return [];
  return submission.allergies.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.accepted_at && item.name.trim().length > 0)
    .map(({ item, index }) => ({
      id: deskAllergyId(submission.id, index),
      index,
      name: item.name,
      reaction: item.reaction ?? null,
    }));
}

export function toMatchableDeskAllergies(
  reported: ReadonlyArray<DeskReportedAllergy>,
  patientId: string,
): MatchableAllergy[] {
  const now = "1970-01-01T00:00:00.000Z";
  return reported.map((item) => ({
    id: item.id,
    doctor_id: "",
    patient_id: patientId,
    allergen: item.name,
    severity: "unknown",
    reaction: item.reaction,
    note: null,
    archived_at: null,
    created_at: now,
    updated_at: now,
    reportedAtDesk: true,
  }));
}
