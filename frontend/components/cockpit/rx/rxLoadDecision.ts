/**
 * rxl-07 / rxl-24 — adopt today's slip (even when issued); review a later-day
 * or superseded note read-only. Fresh empty form only when this appointment
 * has no note. Front-desk re-check-in is a different appointment (RXL-DL-15).
 */

import type { AppointmentStatus } from "@/types/appointment";
import type { PrescriptionWithRelations } from "@/types/prescription";
import {
  createEmptyRxFormFields,
  rxFormFieldsFromPrescription,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { isSameClinicVisitDay } from "@/lib/clinic-visit-day";

const TERMINAL_APPOINTMENT_STATUSES = new Set<AppointmentStatus>([
  "cancelled",
  "no_show",
]);

export type RxLoadClock = {
  now: Date;
  timezone: string;
};

export type RxLoadDecision =
  | { kind: "none" }
  | { kind: "adopt"; rx: PrescriptionWithRelations }
  | { kind: "review"; rx: PrescriptionWithRelations }
  | { kind: "continue"; source: PrescriptionWithRelations };

export type ClosedSiblingRef = {
  id: string;
  createdAt: string;
};

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

export function issuedInstantIso(
  rx: Pick<PrescriptionWithRelations, "issued_at" | "attested_at">,
): string | null {
  return nonEmpty(rx.issued_at) ?? nonEmpty(rx.attested_at);
}

export function isSupersededNote(
  rx: Pick<PrescriptionWithRelations, "superseded_by_id">,
): boolean {
  return nonEmpty(rx.superseded_by_id) != null;
}

function parseInstant(iso: string): Date | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

export function isIssuedOnClinicDay(
  rx: Pick<PrescriptionWithRelations, "issued_at" | "attested_at">,
  clock: RxLoadClock,
): boolean {
  const iso = issuedInstantIso(rx);
  if (!iso) return false;
  const instant = parseInstant(iso);
  if (!instant) return false;
  return isSameClinicVisitDay(instant, clock.now, clock.timezone);
}

/**
 * Closed = not the live writable slip. Same-day issued notes are open
 * when `clock` is passed (rxl-24). Without a clock, a stamp still closes
 * (rxl-07 fail-closed).
 */
export function isClosedNote(
  rx: Pick<
    PrescriptionWithRelations,
    "attested_at" | "issued_at" | "superseded_by_id"
  >,
  appointmentStatus?: AppointmentStatus | null,
  clock?: RxLoadClock,
): boolean {
  if (isSupersededNote(rx)) return true;
  if (
    appointmentStatus &&
    TERMINAL_APPOINTMENT_STATUSES.has(appointmentStatus)
  ) {
    return true;
  }
  const iso = issuedInstantIso(rx);
  if (iso) {
    if (!clock) return true;
    return !isIssuedOnClinicDay(rx, clock);
  }
  return appointmentStatus === "completed";
}

export function resolveRxLoadDecision(
  newest: PrescriptionWithRelations | null | undefined,
  appointmentStatus?: AppointmentStatus | null,
  clock?: RxLoadClock,
): RxLoadDecision {
  if (!newest) return { kind: "none" };
  if (isSupersededNote(newest)) {
    return { kind: "review", rx: newest };
  }
  if (!isClosedNote(newest, appointmentStatus, clock)) {
    return { kind: "adopt", rx: newest };
  }
  if (clock) {
    return { kind: "review", rx: newest };
  }
  return { kind: "continue", source: newest };
}

export function closedSiblingFromSource(
  source: PrescriptionWithRelations,
): ClosedSiblingRef {
  return { id: source.id, createdAt: source.created_at };
}

/**
 * Complaints, history and diagnosis only (RXL-DL-6). Vitals, exam and plan
 * stay on the empty destination. Intended for the RESET / setInitialFields
 * path so the carry is a seed, not an edit.
 */
export function applySubjectiveCarrySeed(
  destination: RxFormFields,
  source: PrescriptionWithRelations,
): RxFormFields {
  const from = rxFormFieldsFromPrescription(source);
  return {
    ...destination,
    cc: from.cc,
    hopi: from.hopi,
    complaints: from.complaints,
    familyHistory: from.familyHistory,
    familyHistoryStructured: from.familyHistoryStructured,
    socialHistory: from.socialHistory,
    socialHistoryStructured: from.socialHistoryStructured,
    pastSurgicalHistory: from.pastSurgicalHistory,
    pastSurgicalHistoryStructured: from.pastSurgicalHistoryStructured,
    customSubsections: from.customSubsections,
    customSubsectionsText: from.customSubsectionsText,
    diagnoses: from.diagnoses,
    provisionalDiagnosis: from.provisionalDiagnosis,
    differentialDiagnosis: from.differentialDiagnosis,
  };
}

export function emptyContinuationFields(
  consultationType?: string | null,
): RxFormFields {
  return createEmptyRxFormFields(undefined, { consultationType });
}
