/**
 * Pure last-visit apply helpers (last-visit-context · lvc-04 / lvc-05).
 */

import {
  EMPTY_RX_MEDICINE,
  type RxMedicine,
} from "@/components/cockpit/rx/RxFormContext";
import { cloneComplaintsForCarryForward } from "@/lib/cockpit/carry-forward-subjective";
import { complaintNamesEquivalent } from "@/lib/cockpit/complaint-search-normalize";
import { applyMode } from "@/lib/cockpit/rx-diff";
import type { LastVisitMedicine } from "@/lib/api/last-visit-summary";
import { formatDateShort } from "@/lib/format-date";
import { formatMedicineSigLine } from "@/lib/medicineCodes";
import { hydrateDoseScheduleFromStored } from "@/lib/chart/chart-medication";
import {
  parseInvestigationsOrders,
  serializeInvestigationsOrders,
} from "@/components/cockpit/rx/inputs/investigations-orders-format";
import {
  normalizeConditionKey,
  seedPrimaryDiagnosisFromLegacy,
} from "@/lib/cockpit/diagnoses";
import {
  appendUniquePlanPhrase,
  parseReferral,
  planPhraseAlreadyPresent,
  referralPartsFromFields,
  resolveReferralForOutput,
} from "@/lib/cockpit/plan-quick-picks";
import { resolveFollowUpForOutput } from "@/lib/cockpit/follow-up-format";
import {
  resolveFamilyHistoryForCarryForward,
  resolvePastSurgicalHistoryForCarryForward,
  resolveSocialHistoryForCarryForward,
} from "@/lib/cockpit/carry-forward-subjective";
import { serializeFamilyHistory } from "@/lib/cockpit/family-history";
import { serializePastSurgicalHistory } from "@/lib/cockpit/past-surgical-history";
import { serializeSocialHistory } from "@/lib/cockpit/social-history";
import {
  serializeCustomSubsections,
  type CustomSubsection,
} from "@/lib/cockpit/custom-subsections";
import type {
  Complaint,
  DiagnosisKind,
  DiagnosisRow,
  ExamSystemFinding,
  FollowUpUnit,
} from "@/types/prescription";
import type { LastVisitSummary } from "@/lib/api/last-visit-summary";

export function formatLastVisitDate(iso: string): string {
  return formatDateShort(iso);
}

export function lastVisitComplaintsHeadline(complaints: Complaint[]): string {
  const names = complaints
    .map((c) => c.name.trim())
    .filter((name) => name.length > 0);
  return names.join(", ");
}

export function lastVisitMedicinesHeadline(
  medicines: LastVisitMedicine[]
): string {
  const n = medicines.filter((m) => m.medicineName.trim()).length;
  if (n === 1) return "1 med";
  return `${n} meds`;
}

export function formatLastVisitMedicineLabel(
  medicine: LastVisitMedicine
): string {
  const sig = formatMedicineSigLine({
    dosage: medicine.dosage,
    doseQty: medicine.doseQty,
    doseUnit: medicine.doseUnit,
    frequencyCode: medicine.frequencyCode,
    frequency: medicine.frequency,
    durationValue: medicine.durationValue,
    durationUnit: medicine.durationUnit,
    duration: medicine.duration,
    foodTiming: medicine.foodTiming,
    route: medicine.route,
    instructions: medicine.instructions,
  });
  return sig ? `${medicine.medicineName} · ${sig}` : medicine.medicineName;
}

export const LAST_VISIT_COMPLAINT_COURSES = [
  "Improving",
  "Unchanged",
  "Worsening",
] as const;

export type LastVisitComplaintCourse =
  (typeof LAST_VISIT_COMPLAINT_COURSES)[number];

/** LVC-DL-4 — drop time-relative fields and last-visit notes; keep name / character / location / severity. */
export function cloneComplaintForLastVisitRepeat(
  complaint: Complaint
): Complaint {
  const [cloned] = cloneComplaintsForCarryForward([complaint]);
  if (!cloned) {
    return { id: crypto.randomUUID(), name: complaint.name };
  }
  const next: Complaint = { ...cloned };
  delete next.onset;
  delete next.duration;
  delete next.notes;
  return next;
}

export function applyLastVisitCourseNote(
  existing: string | undefined | null,
  course: LastVisitComplaintCourse
): string {
  const trimmed = existing?.trim() ?? "";
  if (!trimmed) return course;
  if ((LAST_VISIT_COMPLAINT_COURSES as readonly string[]).includes(trimmed)) {
    return course;
  }
  if (trimmed.toLowerCase().includes(course.toLowerCase())) {
    return trimmed;
  }
  return `${trimmed}; ${course}`;
}

export function lastVisitCourseFromNotes(
  notes: string | undefined | null
): LastVisitComplaintCourse | null {
  const trimmed = notes?.trim() ?? "";
  return (LAST_VISIT_COMPLAINT_COURSES as readonly string[]).includes(trimmed)
    ? (trimmed as LastVisitComplaintCourse)
    : null;
}

export function findComplaintIndexOnNote(
  existing: Complaint[],
  incoming: Complaint
): number {
  return existing.findIndex((c) =>
    complaintNamesEquivalent(c.name, incoming.name)
  );
}

export function complaintAlreadyOnNote(
  existing: Complaint[],
  incoming: Complaint
): boolean {
  return findComplaintIndexOnNote(existing, incoming) >= 0;
}

export function complaintWithLastVisitCourse(
  source: Complaint,
  course: LastVisitComplaintCourse
): Complaint {
  return { ...cloneComplaintForLastVisitRepeat(source), notes: course };
}

export function rxMedicineFromLastVisit(
  medicine: LastVisitMedicine
): RxMedicine {
  return {
    ...EMPTY_RX_MEDICINE,
    medicineName: medicine.medicineName,
    dosage: medicine.dosage,
    route: medicine.route,
    frequency: medicine.frequency,
    duration: medicine.duration,
    instructions: medicine.instructions,
    drugMasterId: medicine.drugMasterId,
    frequencyCode: medicine.frequencyCode,
    durationValue: medicine.durationValue,
    durationUnit: medicine.durationUnit,
    routeCode: medicine.routeCode,
    doseQty: medicine.doseQty,
    doseUnit: medicine.doseUnit,
    form: medicine.form,
    foodTiming: medicine.foodTiming,
    doseSchedule: hydrateDoseScheduleFromStored(
      medicine.frequency,
      medicine.frequencyCode
    ),
  };
}

export function namedMedicines(medicines: RxMedicine[]): RxMedicine[] {
  return medicines.filter((m) => m.medicineName.trim());
}

export function appendLastVisitMedicines(
  current: RxMedicine[],
  prior: LastVisitMedicine[]
): RxMedicine[] {
  const named = namedMedicines(current);
  const blanks = current.filter((m) => !m.medicineName.trim());
  const incoming = prior
    .filter((m) => m.medicineName.trim())
    .map(rxMedicineFromLastVisit);
  const merged = applyMode(named, incoming, "append");
  return blanks.length > 0 ? [...merged, ...blanks] : merged;
}

export const LAST_VISIT_DIAGNOSIS_ACUITIES = [
  "improving",
  "stable",
  "worsening",
] as const;

export type LastVisitDiagnosisAcuity =
  (typeof LAST_VISIT_DIAGNOSIS_ACUITIES)[number];

export const LAST_VISIT_DIAGNOSIS_ACUITY_LABEL: Record<
  LastVisitDiagnosisAcuity,
  string
> = {
  improving: "Improving",
  stable: "Stable",
  worsening: "Worsening",
};

export function lastVisitDiagnosesForStrip(
  summary: Pick<LastVisitSummary, "diagnoses" | "provisionalDiagnosis">
): DiagnosisRow[] {
  const named = (summary.diagnoses ?? []).filter((d) => d.label.trim());
  if (named.length > 0) return named;
  return seedPrimaryDiagnosisFromLegacy(summary.provisionalDiagnosis);
}

export function lastVisitDiagnosesHeadline(diagnoses: DiagnosisRow[]): string {
  return diagnoses
    .map((d) => d.label.trim())
    .filter(Boolean)
    .join(", ");
}

export function findDiagnosisOnNote(
  existing: DiagnosisRow[],
  incoming: DiagnosisRow
): DiagnosisRow | undefined {
  const key = normalizeConditionKey(incoming.label);
  return existing.find((d) => normalizeConditionKey(d.label) === key);
}

function lastVisitDiagnosisKind(
  source: DiagnosisRow,
  current: DiagnosisRow[]
): DiagnosisKind {
  if (source.kind === "differential") return "differential";
  const hasCommitted = current.some(
    (d) => d.kind === "primary" || d.kind === "secondary"
  );
  if (!hasCommitted) {
    return source.kind === "primary" ? "primary" : "secondary";
  }
  return "secondary";
}

export function diagnosisWithLastVisitAcuity(
  source: DiagnosisRow,
  acuity: LastVisitDiagnosisAcuity,
  current: DiagnosisRow[]
): DiagnosisRow {
  return {
    ...source,
    id: crypto.randomUUID(),
    status: "ongoing",
    acuity,
    kind: lastVisitDiagnosisKind(source, current),
    note: null,
  };
}

export function lastVisitInvestigationOrders(
  raw: string | null | undefined
): string[] {
  return parseInvestigationsOrders(raw ?? "");
}

export function lastVisitInvestigationsHeadline(orders: string[]): string {
  if (orders.length === 1) return orders[0]!;
  return `${orders.length} orders`;
}

export function investigationAlreadyOnNote(
  current: string,
  order: string
): boolean {
  const key = order.trim().toLowerCase();
  return parseInvestigationsOrders(current).some(
    (c) => c.trim().toLowerCase() === key
  );
}

export function appendLastVisitInvestigation(
  current: string,
  order: string
): string {
  if (investigationAlreadyOnNote(current, order)) return current;
  return serializeInvestigationsOrders([
    ...parseInvestigationsOrders(current),
    order.trim(),
  ]);
}

export function appendLastVisitAdvice(
  current: string,
  prior: string | null | undefined
): string {
  return appendUniquePlanPhrase(current, prior ?? "");
}

export function formatLastVisitFollowUp(summary: {
  followUp: string | null;
  followUpValue: number | null;
  followUpUnit: FollowUpUnit | null;
}): string | null {
  return resolveFollowUpForOutput(
    summary.followUp,
    summary.followUpValue,
    summary.followUpUnit
  );
}

export function lastVisitFollowUpAlreadyApplied(
  current: {
    followUp: string;
    followUpValue: number | null;
    followUpUnit: FollowUpUnit | null;
  },
  prior: {
    followUp: string | null;
    followUpValue: number | null;
    followUpUnit: FollowUpUnit | null;
  }
): boolean {
  const currentOut = resolveFollowUpForOutput(
    current.followUp,
    current.followUpValue,
    current.followUpUnit
  );
  const priorOut = resolveFollowUpForOutput(
    prior.followUp,
    prior.followUpValue,
    prior.followUpUnit
  );
  if (!priorOut) return true;
  return currentOut === priorOut;
}

export function lastVisitTextPreview(
  text: string | null | undefined,
  max = 48
): string {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export function lastVisitTextAlreadyApplied(
  current: string,
  prior: string | null | undefined
): boolean {
  const incoming = prior?.trim() ?? "";
  if (!incoming) return true;
  return planPhraseAlreadyPresent(current, incoming);
}

export function applyLastVisitText(
  current: string,
  prior: string | null | undefined
): string {
  return appendUniquePlanPhrase(current, prior ?? "");
}

export function lastVisitHistoryLabel(
  kind: "family" | "social" | "pastSurgical",
  summary: LastVisitSummary
): string | null {
  if (kind === "family") {
    const structured = resolveFamilyHistoryForCarryForward(summary);
    if (structured) {
      return serializeFamilyHistory(structured) || null;
    }
    return summary.familyHistory?.trim() || null;
  }
  if (kind === "social") {
    const structured = resolveSocialHistoryForCarryForward(summary);
    if (structured) {
      return serializeSocialHistory(structured) || null;
    }
    return summary.socialHistory?.trim() || null;
  }
  const structured = resolvePastSurgicalHistoryForCarryForward(summary);
  if (structured) {
    return serializePastSurgicalHistory(structured) || null;
  }
  return summary.pastSurgicalHistory?.trim() || null;
}

export function lastVisitHistoryAlreadyApplied(
  kind: "family" | "social" | "pastSurgical",
  current: string,
  summary: LastVisitSummary
): boolean {
  const prior = lastVisitHistoryLabel(kind, summary);
  return lastVisitTextAlreadyApplied(current, prior);
}

export function lastVisitReferralLabel(
  referral: string | null | undefined
): string | null {
  return resolveReferralForOutput(parseReferral(referral ?? ""));
}

export function lastVisitReferralAlreadyApplied(
  current: {
    referralUrgency: string | null;
    referralSpecialties: readonly string[];
    referralReason: string | null;
    referral: string;
  },
  prior: string | null | undefined
): boolean {
  const priorOut = lastVisitReferralLabel(prior);
  if (!priorOut) return true;
  const currentOut = resolveReferralForOutput(referralPartsFromFields(current));
  return currentOut === priorOut;
}

const OBJECTIVE_NOTES_SYSTEM_ID = "objective_notes";

export function lastVisitExamFindings(
  findings: ExamSystemFinding[] | undefined
): ExamSystemFinding[] {
  return (findings ?? []).filter(
    (f) => f.systemId !== OBJECTIVE_NOTES_SYSTEM_ID && examFindingHasContent(f)
  );
}

export function lastVisitObjectiveNotes(
  findings: ExamSystemFinding[] | undefined
): string | null {
  const notes = (findings ?? []).find(
    (f) => f.systemId === OBJECTIVE_NOTES_SYSTEM_ID
  )?.notes;
  return notes?.trim() || null;
}

function examFindingHasContent(finding: ExamSystemFinding): boolean {
  if (finding.notes?.trim()) return true;
  if ((finding.findings ?? []).length > 0) return true;
  return finding.status === "normal" || finding.status === "abnormal";
}

export function lastVisitExamLabel(
  summary: Pick<LastVisitSummary, "examinationFindings" | "examinationJson">
): string | null {
  const text = summary.examinationFindings?.trim();
  if (text) return text;
  const rows = lastVisitExamFindings(summary.examinationJson);
  if (rows.length === 0) return null;
  return rows
    .map((row) => {
      const notes = row.notes?.trim();
      return notes || row.systemId;
    })
    .join(", ");
}

export function lastVisitExamAlreadyApplied(
  current: ExamSystemFinding[],
  prior: ExamSystemFinding[]
): boolean {
  return prior.every((incoming) => {
    const existing = current.find((row) => row.systemId === incoming.systemId);
    if (!existing) return false;
    if (incoming.notes?.trim()) {
      return lastVisitTextAlreadyApplied(existing.notes ?? "", incoming.notes);
    }
    return examFindingHasContent(existing);
  });
}

export function applyLastVisitExamFindings(
  current: ExamSystemFinding[],
  prior: ExamSystemFinding[]
): ExamSystemFinding[] {
  const next = [...current];
  for (const incoming of prior) {
    const index = next.findIndex((row) => row.systemId === incoming.systemId);
    if (index >= 0) {
      const existing = next[index]!;
      if (examFindingHasContent(existing)) continue;
      next[index] = incoming;
      continue;
    }
    next.push(incoming);
  }
  return next;
}

export function lastVisitCustomSectionsWithContent(
  sections: CustomSubsection[] | undefined
): CustomSubsection[] {
  return (sections ?? []).filter((section) => customSectionHasContent(section));
}

export function customSectionHasContent(section: CustomSubsection): boolean {
  if (section.body?.trim()) return true;
  return (section.children ?? []).some((child) => Boolean(child.body?.trim()));
}

export function lastVisitCustomSectionLabel(section: CustomSubsection): string {
  const body = section.body?.trim();
  if (body) return body;
  const child = (section.children ?? []).find((c) => c.body?.trim());
  return child?.body?.trim() || section.title.trim();
}

export function findMatchingCustomSection(
  current: CustomSubsection[],
  prior: CustomSubsection
): number {
  const byId = current.findIndex((section) => section.id === prior.id);
  if (byId >= 0) return byId;
  const title = prior.title.trim().toLowerCase();
  if (!title) return -1;
  return current.findIndex(
    (section) => section.title.trim().toLowerCase() === title
  );
}

function mergeCustomChildren(
  current: CustomSubsection["children"],
  prior: CustomSubsection["children"]
): CustomSubsection["children"] {
  const next = [...(current ?? [])];
  for (const incoming of prior ?? []) {
    const byId = next.findIndex((child) => child.id === incoming.id);
    const byTitle = next.findIndex(
      (child) =>
        child.title.trim().toLowerCase() === incoming.title.trim().toLowerCase()
    );
    const index = byId >= 0 ? byId : byTitle;
    if (index < 0) {
      next.push({ ...incoming });
      continue;
    }
    const existing = next[index]!;
    next[index] = {
      ...existing,
      body: applyLastVisitText(existing.body ?? "", incoming.body),
    };
  }
  return next;
}

export function applyLastVisitCustomSection(
  current: CustomSubsection | null,
  prior: CustomSubsection
): CustomSubsection {
  if (!current) {
    return {
      ...prior,
      children: (prior.children ?? []).map((child) => ({ ...child })),
    };
  }
  return {
    ...current,
    body: applyLastVisitText(current.body ?? "", prior.body),
    children: mergeCustomChildren(current.children, prior.children),
  };
}

export function lastVisitCustomSectionAlreadyApplied(
  current: CustomSubsection | undefined,
  prior: CustomSubsection
): boolean {
  if (!current) return false;
  return (
    serializeCustomSubsections([current]) ===
    serializeCustomSubsections([applyLastVisitCustomSection(current, prior)])
  );
}
