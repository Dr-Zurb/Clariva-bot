"use client";

/**
 * RxFormContext — state owner for the cockpit-v2 prescription form refactor
 * (cv2-05). Extracted from PrescriptionForm.tsx's local hooks per DL-26 / DL-27.
 *
 * Inventory of state moved (vs PrescriptionForm.tsx as of 2026-05-17):
 *
 *  - cc, hopi (string, useState)                    → fields.cc, fields.hopi
 *  - provisionalDiagnosis (string, useState)        → fields.provisionalDiagnosis
 *  - investigations (string, useState)              → fields.investigationsOrders
 *  - followUp (string, useState)                    → fields.followUp (legacy free-text)
 *  - patientEducation (string, useState)            → fields.patientEducation
 *  - clinicalNotes (string, useState)               → fields.clinicalNotes
 *  - medicines (MedicineEntry[], useState)          → fields.medicines (reducer-managed)
 *  - formSnapshot + useAutoSave (useMemo + hook)    → provider autosave wiring
 *  - isDirty (implicit via edits)                   → state.isDirty (reducer)
 *  - autosave saving / savedAt (useAutoSave)        → autoSave.* on context value
 *
 * UI-only state that STAYS in PrescriptionForm.tsx (not form fields):
 *  - entryMode, prescription, loading, saving (send), uploading, attachments,
 *    templatePickerOpen, previewOpen, allergies, DDI, medicineInstanceIds, etc.
 *
 * NEW fields (cv2-04 migration; typed here, no UI yet — cv2-07 adds inputs):
 *  - vitals_bp_systolic / vitals_bp_diastolic / vitals_hr / vitals_temp_c /
 *    vitals_spo2 / vitals_wt_kg / vitals_ht_cm
 *  - Vitals 2.0 (obj-05 migration 151; typed here, grid UI is obj-07): vitals_rr /
 *    vitals_pain_score / vitals_glucose_mg_dl / vitals_gcs_total / vitals_bp_posture /
 *    vitals_bp_limb / vitals_head_circumference_cm / vitals_muac_cm / vitals_waist_cm
 *  - examination_findings
 *  - differential_diagnosis (string[])
 *  - advice
 *  - follow_up_value (number) + follow_up_unit ('days' | 'weeks' | 'months' | 'as_needed')
 *  - referral
 *  - test_results
 *  - vitals_text (legacy placeholder — no current UI input; preserved for cv2-07)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type MutableRefObject,
} from "react";
import { createPrescription, updatePrescription } from "@/lib/api";
import { useAutoSave, type UseAutoSaveResult } from "@/hooks/useAutoSave";
import type { MedicineRowValue } from "@/components/consultation/MedicineRow";
import {
  addComplaintToTree,
  demoteComplaintUnderParent,
  promoteAssociatedComplaint,
  removeComplaintFromTree,
  reorderComplaintsInTree,
  sanitizeComplaintForStorage,
  updateComplaintInTree,
} from "@/lib/cockpit/complaint-tree";
import {
  normalizeComplaintChipFields,
  resolveComplaintAttributeFields,
} from "@/lib/cockpit/complaint-schema";
import { formatFeverDisplaySummary } from "@/lib/cockpit/fever-temperature";
import {
  EMPTY_SOCIAL_HISTORY_STRUCTURED,
  hasSocialHistoryStructuredContent,
  normalizeSocialHistoryStructured,
  parseSocialHistoryAsStructured,
  serializeSocialHistory,
  type SocialHistoryStructured,
} from "@/lib/cockpit/social-history";
import {
  EMPTY_FAMILY_HISTORY_STRUCTURED,
  hasFamilyHistoryStructuredContent,
  normalizeFamilyHistoryStructured,
  parseFamilyHistoryAsStructured,
  serializeFamilyHistory,
  type FamilyHistoryStructured,
} from "@/lib/cockpit/family-history";
import {
  EMPTY_PAST_SURGICAL_HISTORY_STRUCTURED,
  hasPastSurgicalHistoryStructuredContent,
  normalizePastSurgicalHistoryStructured,
  parsePastSurgicalHistoryAsStructured,
  serializePastSurgicalHistory,
  type PastSurgicalHistoryStructured,
} from "@/lib/cockpit/past-surgical-history";
import {
  addCustomSubsection,
  addCustomSubsectionChild,
  createEmptyCustomSubsection,
  createCustomSubsectionId,
  normalizeCustomSubsections,
  removeCustomSubsection,
  removeCustomSubsectionChild,
  reorderCustomSubsectionChildren,
  reorderCustomSubsections,
  serializeCustomSubsections,
  serializeCustomSubsectionsForPayload,
  updateCustomSubsection,
  updateCustomSubsectionChild,
  type CustomSubsection,
  type CustomSubsectionChild,
} from "@/lib/cockpit/custom-subsections";
import {
  EXAM_CORE_SYSTEM_ORDER,
  resolveExamSystem,
} from "@/lib/cockpit/exam-schema";
import type {
  Complaint,
  ExamSystemFinding,
  ExamSystemStatus,
  PrescriptionType,
  PrescriptionWithRelations,
  UpdatePrescriptionPayload,
  VitalsBpLimb,
  VitalsBpPosture,
} from "@/types/prescription";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FollowUpUnit = "days" | "weeks" | "months" | "as_needed";

/** Re-export for consumers that import from RxFormContext. */
export type { Complaint } from "@/types/prescription";
export type { ExamSystemFinding, ExamSystemStatus } from "@/types/prescription";
export type { VitalsBpLimb, VitalsBpPosture } from "@/types/prescription";
export type { SocialHistoryStructured } from "@/lib/cockpit/social-history";
export type { FamilyHistoryStructured } from "@/lib/cockpit/family-history";
export type { PastSurgicalHistoryStructured } from "@/lib/cockpit/past-surgical-history";
export type { CustomSubsection, CustomSubsectionChild } from "@/lib/cockpit/custom-subsections";
export { createCustomSubsectionId, createEmptyCustomSubsection } from "@/lib/cockpit/custom-subsections";

/** Mirrors MedicineRowValue — hand rows straight to <MedicineRow>. */
export type RxMedicine = MedicineRowValue;

export interface RxFormFields {
  cc: string;
  hopi: string;
  /** True when the doctor edited the free-text HOPI fallback directly (ST-D2). */
  hopiManualOverride: boolean;

  complaints: Complaint[];
  /** Derived display string; kept in sync on hydrate; payload re-derives from structured on save. */
  familyHistory: string;
  familyHistoryStructured: FamilyHistoryStructured;
  /** Derived display string; kept in sync on hydrate; payload re-derives from structured on save. */
  socialHistory: string;
  socialHistoryStructured: SocialHistoryStructured;
  pastSurgicalHistory: string;
  pastSurgicalHistoryStructured: PastSurgicalHistoryStructured;
  customSubsections: CustomSubsection[];
  /** Derived display string; kept in sync on hydrate; payload re-derives from structured on save. */
  customSubsectionsText: string;

  /** Legacy free-text vitals (DEPRECATED; preserved until cv2-07 structured UI). */
  vitalsText: string;

  vitalsBpSystolic: number | null;
  vitalsBpDiastolic: number | null;
  vitalsHr: number | null;
  vitalsTempC: number | null;
  vitalsSpo2: number | null;
  vitalsWtKg: number | null;
  vitalsHtCm: number | null;

  // objective-tab / migration 151 — Vitals 2.0 extended vitals (canonical units).
  vitalsRr: number | null;
  vitalsPainScore: number | null;
  vitalsGlucoseMgDl: number | null;
  vitalsGcsTotal: number | null;
  vitalsBpPosture: VitalsBpPosture | null;
  vitalsBpLimb: VitalsBpLimb | null;
  vitalsHeadCircumferenceCm: number | null;
  vitalsMuacCm: number | null;
  vitalsWaistCm: number | null;

  examinationFindings: string;
  /**
   * Structured per-system exam findings (obj-01). `examinationFindings` is
   * derived from this on save when non-empty; an empty array leaves the
   * legacy free-text `examinationFindings` untouched (OBJ-D2 passthrough).
   */
  examFindings: ExamSystemFinding[];

  /**
   * Per-visit objective custom free-text sections (obj-13). Seeded from the
   * doctor default (`objective_custom_sections`); their content derives into
   * `examination_findings` on save (OBJ-D2) — never a new patient-facing column.
   */
  objectiveCustomSections: CustomSubsection[];

  provisionalDiagnosis: string;
  differentialDiagnosis: string[];

  /** Renamed DB column `investigations_orders`; API field stays `investigations`. */
  investigationsOrders: string;
  medicines: RxMedicine[];

  advice: string;
  followUp: string;
  followUpValue: number | null;
  followUpUnit: FollowUpUnit | null;
  referral: string;
  testResults: string;

  patientEducation: string;
  clinicalNotes: string;
  /** Prior Rx re-use audit (rxss-03); client form state only in v1. */
  fromPrescriptionId: string | null;
}

export interface RxFormState {
  fields: RxFormFields;
  isDirty: boolean;
  isSaving: boolean;
  isSubmitting: boolean;
  lastSavedAt: string | null;
  submitError: string | null;
}

export type RxFormAction =
  | { type: "SET_FIELD"; key: keyof RxFormFields; value: RxFormFields[keyof RxFormFields] }
  | { type: "SET_MEDICINES"; medicines: RxMedicine[] }
  | { type: "ADD_MEDICINE"; medicine: RxMedicine }
  | { type: "REMOVE_MEDICINE"; index: number }
  | { type: "UPDATE_MEDICINE"; index: number; patch: Partial<RxMedicine> }
  | { type: "ADD_COMPLAINT"; complaint: Complaint; parentId?: string }
  | { type: "UPDATE_COMPLAINT"; index: number; patch: Partial<Complaint>; parentId?: string }
  | { type: "REMOVE_COMPLAINT"; index: number; parentId?: string }
  | { type: "REORDER_COMPLAINTS"; fromIndex: number; toIndex: number; parentId?: string }
  | { type: "PROMOTE_COMPLAINT"; parentId: string; childIndex: number }
  | { type: "DEMOTE_COMPLAINT"; sourceIndex: number; targetParentId: string }
  | { type: "SET_COMPLAINTS"; complaints: Complaint[] }
  | { type: "SET_FAMILY_HISTORY_STRUCTURED"; structured: FamilyHistoryStructured }
  | { type: "SET_SOCIAL_HISTORY_STRUCTURED"; structured: SocialHistoryStructured }
  | { type: "SET_PAST_SURGICAL_HISTORY_STRUCTURED"; structured: PastSurgicalHistoryStructured }
  | { type: "ADD_CUSTOM_SUBSECTION"; section: CustomSubsection }
  | { type: "UPDATE_CUSTOM_SUBSECTION"; index: number; patch: Partial<CustomSubsection> }
  | { type: "REMOVE_CUSTOM_SUBSECTION"; index: number }
  | { type: "REORDER_CUSTOM_SUBSECTIONS"; fromIndex: number; toIndex: number }
  | { type: "ADD_CUSTOM_SUBSECTION_CHILD"; sectionId: string; child: CustomSubsectionChild }
  | {
      type: "UPDATE_CUSTOM_SUBSECTION_CHILD";
      sectionId: string;
      childIndex: number;
      patch: Partial<CustomSubsectionChild>;
    }
  | { type: "REMOVE_CUSTOM_SUBSECTION_CHILD"; sectionId: string; childIndex: number }
  | {
      type: "REORDER_CUSTOM_SUBSECTION_CHILDREN";
      sectionId: string;
      fromIndex: number;
      toIndex: number;
    }
  | { type: "SET_CUSTOM_SUBSECTIONS"; sections: CustomSubsection[] }
  | { type: "ADD_OBJECTIVE_CUSTOM_SECTION"; section: CustomSubsection }
  | { type: "UPDATE_OBJECTIVE_CUSTOM_SECTION"; index: number; patch: Partial<CustomSubsection> }
  | { type: "REMOVE_OBJECTIVE_CUSTOM_SECTION"; index: number }
  | { type: "REORDER_OBJECTIVE_CUSTOM_SECTIONS"; fromIndex: number; toIndex: number }
  | { type: "SET_OBJECTIVE_CUSTOM_SECTIONS"; sections: CustomSubsection[] }
  | {
      type: "SET_EXAM_SYSTEM";
      systemId: string;
      status: ExamSystemStatus;
      findings?: string[];
      notes?: string | null;
    }
  | { type: "CLEAR_EXAM_SYSTEM"; systemId: string }
  | { type: "MARK_ALL_EXAM_NORMAL"; systemIds: string[] }
  | { type: "SET_EXAM_FINDINGS"; examFindings: ExamSystemFinding[] }
  | { type: "ADD_DDX"; entry: string }
  | { type: "REMOVE_DDX"; index: number }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS"; lastSavedAt: string }
  | { type: "SAVE_ERROR"; error: string }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_SUCCESS" }
  | { type: "SUBMIT_ERROR"; error: string }
  | { type: "RESET"; initialFields: RxFormFields };

export const EMPTY_RX_MEDICINE: RxMedicine = {
  medicineName: "",
  dosage: "",
  route: "",
  frequency: "",
  duration: "",
  instructions: "",
  drugMasterId: null,
  frequencyCode: null,
  durationValue: null,
  durationUnit: null,
  routeCode: null,
  doseQty: null,
  doseUnit: null,
  form: null,
  foodTiming: null,
};

export function createEmptyComplaint(id?: string): Complaint {
  return {
    id: id ?? crypto.randomUUID(),
    name: "",
  };
}

export function createEmptyRxFormFields(
  seedMedicines: RxMedicine[] = [{ ...EMPTY_RX_MEDICINE }],
): RxFormFields {
  return {
    cc: "",
    hopi: "",
    hopiManualOverride: false,
    complaints: [],
    familyHistory: "",
    familyHistoryStructured: { ...EMPTY_FAMILY_HISTORY_STRUCTURED },
    socialHistory: "",
    socialHistoryStructured: { ...EMPTY_SOCIAL_HISTORY_STRUCTURED },
    pastSurgicalHistory: "",
    pastSurgicalHistoryStructured: { ...EMPTY_PAST_SURGICAL_HISTORY_STRUCTURED },
    customSubsections: [],
    customSubsectionsText: "",
    vitalsText: "",
    vitalsBpSystolic: null,
    vitalsBpDiastolic: null,
    vitalsHr: null,
    vitalsTempC: null,
    vitalsSpo2: null,
    vitalsWtKg: null,
    vitalsHtCm: null,
    vitalsRr: null,
    vitalsPainScore: null,
    vitalsGlucoseMgDl: null,
    vitalsGcsTotal: null,
    vitalsBpPosture: null,
    vitalsBpLimb: null,
    vitalsHeadCircumferenceCm: null,
    vitalsMuacCm: null,
    vitalsWaistCm: null,
    examinationFindings: "",
    examFindings: [],
    objectiveCustomSections: [],
    provisionalDiagnosis: "",
    differentialDiagnosis: [],
    investigationsOrders: "",
    medicines: seedMedicines,
    advice: "",
    followUp: "",
    followUpValue: null,
    followUpUnit: null,
    referral: "",
    testResults: "",
    patientEducation: "",
    clinicalNotes: "",
    fromPrescriptionId: null,
  };
}

/** Read investigations from API row (column rename compat). */
export function investigationsFromPrescription(
  rx: Pick<PrescriptionWithRelations, "investigations" | "investigations_orders">,
): string {
  return rx.investigations_orders ?? rx.investigations ?? "";
}

export function medicinesFromPrescription(
  rx: PrescriptionWithRelations,
): RxMedicine[] {
  const meds = rx.prescription_medicines ?? [];
  if (meds.length === 0) return [{ ...EMPTY_RX_MEDICINE }];
  return meds.map((m) => ({
    medicineName: m.medicine_name,
    dosage: m.dosage ?? "",
    route: m.route ?? "",
    frequency: m.frequency ?? "",
    duration: m.duration ?? "",
    instructions: m.instructions ?? "",
    drugMasterId: m.drug_master_id ?? null,
    frequencyCode: m.frequency_code ?? null,
    durationValue: m.duration_value ?? null,
    durationUnit: m.duration_unit ?? null,
    routeCode: m.route_code ?? null,
    doseQty: m.dose_qty != null ? Number(m.dose_qty) : null,
    doseUnit: m.dose_unit ?? null,
    form: m.form ?? null,
    foodTiming: m.food_timing ?? null,
  }));
}

function hydrateComplaintFromApi(
  c: NonNullable<PrescriptionWithRelations["complaints"]>[number],
): Complaint {
  const children = (c.associatedComplaints ?? []).map((child) => {
    const leaf = hydrateComplaintFromApi(child);
    const { associatedComplaints: _nested, ...rest } = leaf;
    return rest;
  });
  const complaintName = c.name ?? "";
  const category = c.category ?? undefined;
  const schemaFields = resolveComplaintAttributeFields({
    complaintName,
    category: category ?? null,
  });
  const base = {
    id: c.id,
    name: complaintName,
    onset: c.onset ?? undefined,
    duration: c.duration ?? undefined,
    location: c.location ?? undefined,
    character: c.character ?? undefined,
    radiation: c.radiation ?? undefined,
    severity: c.severity ?? undefined,
    timing: c.timing ?? undefined,
    aggravating: c.aggravating ?? undefined,
    relieving: c.relieving ?? undefined,
    laterality: c.laterality ?? undefined,
    painScore: c.painScore ?? undefined,
    temperature: c.temperature ?? undefined,
    temperatureUnit: c.temperatureUnit ?? undefined,
    feverGrade: c.feverGrade ?? undefined,
    measuredBy: c.measuredBy ?? undefined,
    reportedBy: c.reportedBy ?? undefined,
    frequency: c.frequency ?? undefined,
    color: c.color ?? undefined,
    associated: c.associated ?? undefined,
    notes: c.notes ?? undefined,
    category,
    associatedComplaints: children.length > 0 ? children : undefined,
  };
  return normalizeComplaintChipFields(base, schemaFields);
}

export function complaintsFromPrescription(
  rx: Pick<PrescriptionWithRelations, "complaints">,
): Complaint[] {
  return (rx.complaints ?? []).map(hydrateComplaintFromApi);
}

export function namedComplaints(complaints: Complaint[]): Complaint[] {
  return complaints.filter((c) => c.name.trim());
}

function formatSeverity(severity: Complaint["severity"]): string | null {
  if (severity === null || severity === undefined) return null;
  return String(severity);
}

function formatComplaintHopiDetail(complaint: Complaint): string {
  const parts: string[] = [];

  // Labels follow the resolved per-category schema so the note matches the card
  // (e.g. fever's "Max temperature", cough's "Sputum") instead of generic keys.
  const fields = resolveComplaintAttributeFields({
    complaintName: complaint.name,
    category: complaint.category ?? null,
  });

  for (const field of fields) {
    if (field.key === "severity") {
      const severity = formatSeverity(complaint.severity);
      if (severity) parts.push(`${field.label}: ${severity}`);
      continue;
    }
    if (field.type === "temperature") {
      const summary = formatFeverDisplaySummary(
        complaint.temperature,
        complaint.temperatureUnit ?? "F",
        complaint.feverGrade,
        complaint.measuredBy,
        complaint.reportedBy,
      );
      if (summary) parts.push(`${field.label}: ${summary}`);
      continue;
    }
    if (field.key === "reportedBy") {
      continue;
    }
    const raw = complaint[field.key];
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed) parts.push(`${field.label}: ${trimmed}`);
  }

  if (complaint.associated && complaint.associated.length > 0) {
    const joined = complaint.associated.map((s) => s.trim()).filter(Boolean).join(", ");
    if (joined) parts.push(`Associated: ${joined}`);
  }

  return parts.join("; ");
}

/** Format one complaint card into an OLDCARTS prose line. */
export function formatComplaintHopiLine(complaint: Complaint): string {
  const detail = formatComplaintHopiDetail(complaint);
  return detail ? `${complaint.name.trim()} — ${detail}` : complaint.name.trim();
}

/** Parent block including indented associated-complaint sub-lines (subj-12). */
export function formatComplaintHopiBlock(complaint: Complaint): string {
  const lines = [formatComplaintHopiLine(complaint)];
  for (const child of complaint.associatedComplaints ?? []) {
    if (!child.name.trim()) continue;
    lines.push(`  • Associated: ${formatComplaintHopiLine(child)}`);
  }
  return lines.join("\n");
}

/** Join complaint names (primary first) for the CC column. */
export function deriveCcFromComplaints(complaints: Complaint[]): string {
  return namedComplaints(complaints)
    .map((c) => c.name.trim())
    .join(", ");
}

/** Multi-complaint OLDCARTS summary for the HOPI column. */
export function deriveHopiFromComplaints(complaints: Complaint[]): string {
  return namedComplaints(complaints).map(formatComplaintHopiBlock).join("\n\n");
}

// ---------------------------------------------------------------------------
// Structured examination (obj-01)
// ---------------------------------------------------------------------------

/**
 * Canonical core ordering for the derived `examination_findings` string —
 * single-sourced from obj-02's exam registry (`exam-schema.ts`) so derivation
 * (obj-01) and the cards (obj-03) share one order contract. Keeps the
 * derivation deterministic (never relies on object/array key order); unknown
 * systems sort after the core set, alphabetically by `systemId`.
 */
export { EXAM_CORE_SYSTEM_ORDER };

/** Hydrate `examination_json` from a loaded prescription, dropping bad rows. */
export function normalizeExamFindings(
  json: ExamSystemFinding[] | null | undefined,
): ExamSystemFinding[] {
  if (!Array.isArray(json)) return [];
  const out: ExamSystemFinding[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const systemId = typeof row.systemId === "string" ? row.systemId.trim() : "";
    if (!systemId) continue;
    if (row.status !== "normal" && row.status !== "abnormal") continue;
    const findings = Array.isArray(row.findings)
      ? row.findings
          .filter((f): f is string => typeof f === "string")
          .map((f) => f.trim())
          .filter(Boolean)
      : [];
    out.push({
      systemId,
      status: row.status,
      findings,
      notes: typeof row.notes === "string" ? row.notes.trim() || null : null,
    });
  }
  return out;
}

/** Deterministic order: core registry index first, then alpha by systemId. */
function compareExamSystems(a: ExamSystemFinding, b: ExamSystemFinding): number {
  const ai = EXAM_CORE_SYSTEM_ORDER.indexOf(a.systemId);
  const bi = EXAM_CORE_SYSTEM_ORDER.indexOf(b.systemId);
  const aRank = ai === -1 ? EXAM_CORE_SYSTEM_ORDER.length : ai;
  const bRank = bi === -1 ? EXAM_CORE_SYSTEM_ORDER.length : bi;
  if (aRank !== bRank) return aRank - bRank;
  return a.systemId.localeCompare(b.systemId);
}

function renderExamSystemLine(finding: ExamSystemFinding): string {
  // Registry label (obj-02) for core systems; safe humanized fallback for
  // unknown / future custom ids (resolveExamSystem never throws).
  const label = resolveExamSystem(finding.systemId).label;
  const findings = (finding.findings ?? []).map((f) => f.trim()).filter(Boolean);
  let body: string;
  if (finding.status === "normal") {
    body = "Normal";
  } else {
    body = findings.length > 0 ? findings.join(", ") : "Abnormal";
  }
  const notes = finding.notes?.trim();
  return notes ? `${label}: ${body} (${notes})` : `${label}: ${body}`;
}

/**
 * Render structured exam findings into the deterministic derived text that
 * mirrors `examination_findings` on save (OBJ-D2). Pure + stable (registry
 * order, no `Date.now`). An empty list returns "" so the caller can fall back
 * to the legacy free-text passthrough (P1-D2).
 */
export function deriveExaminationFindingsFromExam(
  examFindings: ExamSystemFinding[],
): string {
  const normalized = normalizeExamFindings(examFindings);
  if (normalized.length === 0) return "";
  return [...normalized]
    .sort(compareExamSystems)
    .map(renderExamSystemLine)
    .join("\n");
}

/** Upsert a single system's structured finding (reducer helper). */
function upsertExamSystem(
  examFindings: ExamSystemFinding[],
  next: ExamSystemFinding,
): ExamSystemFinding[] {
  const idx = examFindings.findIndex((f) => f.systemId === next.systemId);
  if (idx === -1) return [...examFindings, next];
  const copy = [...examFindings];
  copy[idx] = next;
  return copy;
}

function hydratePastSurgicalHistoryFromPrescription(
  rx: Pick<
    PrescriptionWithRelations,
    "past_surgical_history" | "past_surgical_history_structured"
  >,
): { structured: PastSurgicalHistoryStructured; displayText: string } {
  const jsonb = rx.past_surgical_history_structured;
  if (jsonb && typeof jsonb === "object" && hasPastSurgicalHistoryStructuredContent(jsonb)) {
    const structured = normalizePastSurgicalHistoryStructured(jsonb);
    return {
      structured,
      displayText: rx.past_surgical_history ?? serializePastSurgicalHistory(structured),
    };
  }

  const text = rx.past_surgical_history ?? "";
  const structured = parsePastSurgicalHistoryAsStructured(text);
  return {
    structured,
    displayText: text,
  };
}

function hydrateFamilyHistoryFromPrescription(
  rx: Pick<PrescriptionWithRelations, "family_history" | "family_history_structured">,
): { structured: FamilyHistoryStructured; displayText: string } {
  const jsonb = rx.family_history_structured;
  if (jsonb && typeof jsonb === "object" && hasFamilyHistoryStructuredContent(jsonb)) {
    const structured = normalizeFamilyHistoryStructured(jsonb);
    return {
      structured,
      displayText: rx.family_history ?? serializeFamilyHistory(structured),
    };
  }

  const text = rx.family_history ?? "";
  const structured = parseFamilyHistoryAsStructured(text);
  return {
    structured,
    displayText: text,
  };
}

function hydrateSocialHistoryFromPrescription(
  rx: Pick<PrescriptionWithRelations, "social_history" | "social_history_structured">,
): { structured: SocialHistoryStructured; displayText: string } {
  const jsonb = rx.social_history_structured;
  if (jsonb && typeof jsonb === "object" && hasSocialHistoryStructuredContent(jsonb)) {
    const structured = normalizeSocialHistoryStructured(jsonb);
    return {
      structured,
      displayText: rx.social_history ?? serializeSocialHistory(structured),
    };
  }

  const text = rx.social_history ?? "";
  const structured = parseSocialHistoryAsStructured(text);
  return {
    structured,
    displayText: text,
  };
}

export function rxFormFieldsFromPrescription(
  rx: PrescriptionWithRelations,
  medicines: RxMedicine[] = medicinesFromPrescription(rx),
): RxFormFields {
  const complaints = complaintsFromPrescription(rx);
  const hasStructuredComplaints = namedComplaints(complaints).length > 0;
  const socialHistoryHydrated = hydrateSocialHistoryFromPrescription(rx);
  const familyHistoryHydrated = hydrateFamilyHistoryFromPrescription(rx);
  const pastSurgicalHydrated = hydratePastSurgicalHistoryFromPrescription(rx);
  const customSubsections = normalizeCustomSubsections(rx.custom_subsections);

  return {
    cc: rx.cc ?? "",
    hopi: hasStructuredComplaints ? "" : (rx.hopi ?? ""),
    hopiManualOverride: false,
    complaints,
    familyHistory: familyHistoryHydrated.displayText,
    familyHistoryStructured: familyHistoryHydrated.structured,
    socialHistory: socialHistoryHydrated.displayText,
    socialHistoryStructured: socialHistoryHydrated.structured,
    pastSurgicalHistory: pastSurgicalHydrated.displayText,
    pastSurgicalHistoryStructured: pastSurgicalHydrated.structured,
    customSubsections,
    customSubsectionsText: serializeCustomSubsections(customSubsections),
    vitalsText: "",
    vitalsBpSystolic: rx.vitals_bp_systolic ?? null,
    vitalsBpDiastolic: rx.vitals_bp_diastolic ?? null,
    vitalsHr: rx.vitals_hr ?? null,
    vitalsTempC: rx.vitals_temp_c ?? null,
    vitalsSpo2: rx.vitals_spo2 ?? null,
    vitalsWtKg: rx.vitals_wt_kg ?? null,
    vitalsHtCm: rx.vitals_ht_cm ?? null,
    vitalsRr: rx.vitals_rr ?? null,
    vitalsPainScore: rx.vitals_pain_score ?? null,
    vitalsGlucoseMgDl: rx.vitals_glucose_mg_dl ?? null,
    vitalsGcsTotal: rx.vitals_gcs_total ?? null,
    vitalsBpPosture: rx.vitals_bp_posture ?? null,
    vitalsBpLimb: rx.vitals_bp_limb ?? null,
    vitalsHeadCircumferenceCm: rx.vitals_head_circumference_cm ?? null,
    vitalsMuacCm: rx.vitals_muac_cm ?? null,
    vitalsWaistCm: rx.vitals_waist_cm ?? null,
    examinationFindings: rx.examination_findings ?? "",
    examFindings: normalizeExamFindings(rx.examination_json),
    // obj-13: per-visit instances seed from the doctor default (in ObjectiveSection),
    // not from the row — their content already derived into examination_findings (OBJ-D2).
    objectiveCustomSections: [],
    provisionalDiagnosis: rx.provisional_diagnosis ?? "",
    differentialDiagnosis: rx.differential_diagnosis ?? [],
    investigationsOrders: investigationsFromPrescription(rx),
    medicines,
    advice: rx.advice ?? "",
    followUp: rx.follow_up ?? "",
    followUpValue: rx.follow_up_value ?? null,
    followUpUnit: rx.follow_up_unit ?? null,
    referral: rx.referral ?? "",
    testResults: rx.test_results ?? "",
    patientEducation: rx.patient_education ?? "",
    clinicalNotes: rx.clinical_notes ?? "",
    fromPrescriptionId: null,
  };
}

function serializeComplaintLeaf(
  c: Complaint,
): NonNullable<UpdatePrescriptionPayload["complaints"]>[number] {
  return {
    id: c.id,
    name: c.name.trim(),
    onset: c.onset?.trim() || undefined,
    duration: c.duration?.trim() || undefined,
    location: c.location?.trim() || undefined,
    character: c.character?.trim() || undefined,
    radiation: c.radiation?.trim() || undefined,
    severity: c.severity ?? undefined,
    timing: c.timing?.trim() || undefined,
    aggravating: c.aggravating?.trim() || undefined,
    relieving: c.relieving?.trim() || undefined,
    laterality: c.laterality?.trim() || undefined,
    painScore: typeof c.painScore === "number" ? c.painScore : undefined,
    temperature: typeof c.temperature === "number" ? c.temperature : undefined,
    temperatureUnit: c.temperatureUnit ?? undefined,
    feverGrade: c.feverGrade ?? undefined,
    measuredBy: c.measuredBy?.trim() || undefined,
    reportedBy: c.reportedBy?.trim() || undefined,
    frequency: c.frequency?.trim() || undefined,
    color: c.color?.trim() || undefined,
    associated:
      c.associated && c.associated.length > 0
        ? c.associated.map((s) => s.trim()).filter(Boolean)
        : undefined,
    notes: c.notes?.trim() || undefined,
    category: c.category ?? undefined,
  };
}

function serializeComplaintForPayload(
  c: Complaint,
): NonNullable<UpdatePrescriptionPayload["complaints"]>[number] {
  const stored = sanitizeComplaintForStorage(c, 0);
  const children = (stored.associatedComplaints ?? [])
    .filter((child) => child.name.trim())
    .map((child) => serializeComplaintLeaf(sanitizeComplaintForStorage(child, 1)));
  return {
    ...serializeComplaintLeaf(stored),
    associatedComplaints: children.length > 0 ? children : undefined,
  };
}

export function buildRxPayload(fields: RxFormFields): UpdatePrescriptionPayload {
  const structured = namedComplaints(fields.complaints);
  const derivedCc = structured.length > 0 ? deriveCcFromComplaints(fields.complaints) : null;
  const derivedHopi =
    structured.length > 0 ? deriveHopiFromComplaints(fields.complaints) : null;
  const hopiFallback = fields.hopi.trim();
  let socialStructured = normalizeSocialHistoryStructured(fields.socialHistoryStructured);
  let hasSocialStructured = hasSocialHistoryStructuredContent(socialStructured);
  if (!hasSocialStructured && fields.socialHistory.trim()) {
    const hydrated = parseSocialHistoryAsStructured(fields.socialHistory);
    if (hasSocialHistoryStructuredContent(hydrated)) {
      socialStructured = hydrated;
      hasSocialStructured = true;
    }
  }
  const derivedSocialHistory = hasSocialStructured
    ? serializeSocialHistory(socialStructured)
    : fields.socialHistory.trim() || null;

  let familyStructured = normalizeFamilyHistoryStructured(fields.familyHistoryStructured);
  let hasFamilyStructured = hasFamilyHistoryStructuredContent(familyStructured);
  if (!hasFamilyStructured && fields.familyHistory.trim()) {
    const hydrated = parseFamilyHistoryAsStructured(fields.familyHistory);
    if (hasFamilyHistoryStructuredContent(hydrated)) {
      familyStructured = hydrated;
      hasFamilyStructured = true;
    }
  }
  const derivedFamilyHistory = hasFamilyStructured
    ? serializeFamilyHistory(familyStructured)
    : fields.familyHistory.trim() || null;

  let pastSurgicalStructured = normalizePastSurgicalHistoryStructured(
    fields.pastSurgicalHistoryStructured,
  );
  let hasPastSurgicalStructured = hasPastSurgicalHistoryStructuredContent(pastSurgicalStructured);
  if (!hasPastSurgicalStructured && fields.pastSurgicalHistory.trim()) {
    const hydrated = parsePastSurgicalHistoryAsStructured(fields.pastSurgicalHistory);
    if (hasPastSurgicalHistoryStructuredContent(hydrated)) {
      pastSurgicalStructured = hydrated;
      hasPastSurgicalStructured = true;
    }
  }
  const derivedPastSurgicalHistory = hasPastSurgicalStructured
    ? serializePastSurgicalHistory(pastSurgicalStructured)
    : fields.pastSurgicalHistory.trim() || null;

  const storedCustomSubsections = serializeCustomSubsectionsForPayload(fields.customSubsections);
  const derivedCustomSubsectionsText =
    storedCustomSubsections.length > 0
      ? serializeCustomSubsections(storedCustomSubsections)
      : null;

  // objective-tab / OBJ-D2 — derive examination_findings from the structured
  // exam when present; otherwise leave the legacy free-text untouched (the
  // byte-parity passthrough contract, P1-D2). obj-13 appends any non-empty
  // objective custom-section text after the base block; empty custom sections
  // contribute nothing, so legacy/empty rows stay byte-identical.
  const storedExamFindings = normalizeExamFindings(fields.examFindings);
  const baseExaminationFindings =
    storedExamFindings.length > 0
      ? deriveExaminationFindingsFromExam(storedExamFindings)
      : fields.examinationFindings.trim();
  const objectiveCustomText = serializeCustomSubsections(fields.objectiveCustomSections);
  const derivedExaminationFindings =
    [baseExaminationFindings, objectiveCustomText]
      .filter((block) => Boolean(block && block.trim()))
      .join("\n\n") || null;

  let hopi: string | null;
  if (fields.hopiManualOverride && hopiFallback) {
    hopi = derivedHopi ? `${derivedHopi}\n\n${hopiFallback}` : hopiFallback;
  } else if (derivedHopi) {
    hopi = derivedHopi;
  } else {
    hopi = hopiFallback || null;
  }

  return {
    cc: derivedCc ?? (fields.cc.trim() || null),
    hopi,
    complaints: fields.complaints
      .filter((c) => c.name.trim())
      .map((c) => serializeComplaintForPayload(c)),
    familyHistory: derivedFamilyHistory,
    familyHistoryStructured: hasFamilyStructured ? familyStructured : null,
    socialHistory: derivedSocialHistory,
    socialHistoryStructured: hasSocialStructured ? socialStructured : null,
    pastSurgicalHistory: derivedPastSurgicalHistory,
    pastSurgicalHistoryStructured: hasPastSurgicalStructured ? pastSurgicalStructured : null,
    customSubsections: storedCustomSubsections,
    customSubsectionsText: derivedCustomSubsectionsText,
    provisionalDiagnosis: fields.provisionalDiagnosis.trim() || null,
    investigations: fields.investigationsOrders.trim() || null,
    followUp: fields.followUp.trim() || null,
    patientEducation: fields.patientEducation.trim() || null,
    clinicalNotes: fields.clinicalNotes.trim() || null,
    vitalsBpSystolic: fields.vitalsBpSystolic,
    vitalsBpDiastolic: fields.vitalsBpDiastolic,
    vitalsHr: fields.vitalsHr,
    vitalsTempC: fields.vitalsTempC,
    vitalsSpo2: fields.vitalsSpo2,
    vitalsWtKg: fields.vitalsWtKg,
    vitalsHtCm: fields.vitalsHtCm,
    vitalsRr: fields.vitalsRr,
    vitalsPainScore: fields.vitalsPainScore,
    vitalsGlucoseMgDl: fields.vitalsGlucoseMgDl,
    vitalsGcsTotal: fields.vitalsGcsTotal,
    vitalsBpPosture: fields.vitalsBpPosture,
    vitalsBpLimb: fields.vitalsBpLimb,
    vitalsHeadCircumferenceCm: fields.vitalsHeadCircumferenceCm,
    vitalsMuacCm: fields.vitalsMuacCm,
    vitalsWaistCm: fields.vitalsWaistCm,
    examinationFindings: derivedExaminationFindings,
    examinationJson: storedExamFindings,
    differentialDiagnosis:
      fields.differentialDiagnosis.length > 0 ? fields.differentialDiagnosis : null,
    advice: fields.advice.trim() || null,
    followUpValue: fields.followUpValue,
    followUpUnit: fields.followUpUnit,
    referral: fields.referral.trim() || null,
    testResults: fields.testResults.trim() || null,
    medicines: fields.medicines
      .filter((m) => m.medicineName.trim())
      .map((m, i) => ({
        medicineName: m.medicineName.trim(),
        dosage: m.dosage.trim() || null,
        route: m.route.trim() || null,
        frequency: m.frequency.trim() || null,
        duration: m.duration.trim() || null,
        instructions: m.instructions.trim() || null,
        sortOrder: i,
        drugMasterId: m.drugMasterId,
        frequencyCode: m.frequencyCode,
        durationValue: m.durationValue,
        durationUnit: m.durationUnit,
        routeCode: m.routeCode,
        doseQty: m.doseQty,
        doseUnit: m.doseUnit,
        form: m.form?.trim() || null,
        foodTiming: m.foodTiming,
      })),
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function rxFormReducer(state: RxFormState, action: RxFormAction): RxFormState {
  switch (action.type) {
    case "SET_FIELD": {
      const nextFields = { ...state.fields, [action.key]: action.value };
      if (action.key === "hopi") {
        nextFields.hopiManualOverride = true;
      }
      if (action.key === "socialHistory") {
        nextFields.socialHistoryStructured = parseSocialHistoryAsStructured(
          String(action.value ?? ""),
        );
      }
      return {
        ...state,
        fields: nextFields,
        isDirty: true,
        submitError: null,
      };
    }
    case "SET_MEDICINES":
      return {
        ...state,
        fields: { ...state.fields, medicines: action.medicines },
        isDirty: true,
        submitError: null,
      };
    case "ADD_MEDICINE":
      return {
        ...state,
        fields: {
          ...state.fields,
          medicines: [...state.fields.medicines, action.medicine],
        },
        isDirty: true,
        submitError: null,
      };
    case "REMOVE_MEDICINE": {
      const { medicines } = state.fields;
      if (medicines.length <= 1) return state;
      return {
        ...state,
        fields: {
          ...state.fields,
          medicines: medicines.filter((_, i) => i !== action.index),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "UPDATE_MEDICINE": {
      const next = [...state.fields.medicines];
      next[action.index] = { ...next[action.index], ...action.patch };
      return {
        ...state,
        fields: { ...state.fields, medicines: next },
        isDirty: true,
        submitError: null,
      };
    }
    case "ADD_COMPLAINT":
      return {
        ...state,
        fields: {
          ...state.fields,
          complaints: addComplaintToTree(
            state.fields.complaints,
            action.complaint,
            action.parentId,
          ),
        },
        isDirty: true,
        submitError: null,
      };
    case "REMOVE_COMPLAINT":
      return {
        ...state,
        fields: {
          ...state.fields,
          complaints: removeComplaintFromTree(
            state.fields.complaints,
            action.index,
            action.parentId,
          ),
        },
        isDirty: true,
        submitError: null,
      };
    case "UPDATE_COMPLAINT":
      return {
        ...state,
        fields: {
          ...state.fields,
          complaints: updateComplaintInTree(
            state.fields.complaints,
            action.index,
            action.patch,
            action.parentId,
          ),
        },
        isDirty: true,
        submitError: null,
      };
    case "REORDER_COMPLAINTS":
      return {
        ...state,
        fields: {
          ...state.fields,
          complaints: reorderComplaintsInTree(
            state.fields.complaints,
            action.fromIndex,
            action.toIndex,
            action.parentId,
          ),
        },
        isDirty: true,
        submitError: null,
      };
    case "PROMOTE_COMPLAINT":
      return {
        ...state,
        fields: {
          ...state.fields,
          complaints: promoteAssociatedComplaint(
            state.fields.complaints,
            action.parentId,
            action.childIndex,
          ),
        },
        isDirty: true,
        submitError: null,
      };
    case "DEMOTE_COMPLAINT":
      return {
        ...state,
        fields: {
          ...state.fields,
          complaints: demoteComplaintUnderParent(
            state.fields.complaints,
            action.sourceIndex,
            action.targetParentId,
          ),
        },
        isDirty: true,
        submitError: null,
      };
    case "SET_COMPLAINTS":
      return {
        ...state,
        fields: {
          ...state.fields,
          complaints: action.complaints,
          hopi: "",
          hopiManualOverride: false,
        },
        isDirty: true,
        submitError: null,
      };
    case "SET_FAMILY_HISTORY_STRUCTURED": {
      const structured = normalizeFamilyHistoryStructured(action.structured, {
        keepEmptyRelativeCards: true,
      });
      return {
        ...state,
        fields: {
          ...state.fields,
          familyHistoryStructured: structured,
          familyHistory: serializeFamilyHistory(structured),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "SET_SOCIAL_HISTORY_STRUCTURED": {
      const structured = normalizeSocialHistoryStructured(action.structured);
      return {
        ...state,
        fields: {
          ...state.fields,
          socialHistoryStructured: structured,
          socialHistory: serializeSocialHistory(structured),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "SET_PAST_SURGICAL_HISTORY_STRUCTURED": {
      const structured = normalizePastSurgicalHistoryStructured(action.structured, {
        keepEmptyProcedureRows: true,
      });
      return {
        ...state,
        fields: {
          ...state.fields,
          pastSurgicalHistoryStructured: structured,
          pastSurgicalHistory: serializePastSurgicalHistory(structured),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "ADD_CUSTOM_SUBSECTION": {
      const customSubsections = addCustomSubsection(
        state.fields.customSubsections,
        action.section,
      );
      return {
        ...state,
        fields: {
          ...state.fields,
          customSubsections,
          customSubsectionsText: serializeCustomSubsections(customSubsections),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "UPDATE_CUSTOM_SUBSECTION": {
      const customSubsections = updateCustomSubsection(
        state.fields.customSubsections,
        action.index,
        action.patch,
      );
      return {
        ...state,
        fields: {
          ...state.fields,
          customSubsections,
          customSubsectionsText: serializeCustomSubsections(customSubsections),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "REMOVE_CUSTOM_SUBSECTION": {
      const customSubsections = removeCustomSubsection(
        state.fields.customSubsections,
        action.index,
      );
      return {
        ...state,
        fields: {
          ...state.fields,
          customSubsections,
          customSubsectionsText: serializeCustomSubsections(customSubsections),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "REORDER_CUSTOM_SUBSECTIONS": {
      const customSubsections = reorderCustomSubsections(
        state.fields.customSubsections,
        action.fromIndex,
        action.toIndex,
      );
      return {
        ...state,
        fields: {
          ...state.fields,
          customSubsections,
          customSubsectionsText: serializeCustomSubsections(customSubsections),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "ADD_CUSTOM_SUBSECTION_CHILD": {
      const customSubsections = addCustomSubsectionChild(
        state.fields.customSubsections,
        action.sectionId,
        action.child,
      );
      return {
        ...state,
        fields: {
          ...state.fields,
          customSubsections,
          customSubsectionsText: serializeCustomSubsections(customSubsections),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "UPDATE_CUSTOM_SUBSECTION_CHILD": {
      const customSubsections = updateCustomSubsectionChild(
        state.fields.customSubsections,
        action.sectionId,
        action.childIndex,
        action.patch,
      );
      return {
        ...state,
        fields: {
          ...state.fields,
          customSubsections,
          customSubsectionsText: serializeCustomSubsections(customSubsections),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "REMOVE_CUSTOM_SUBSECTION_CHILD": {
      const customSubsections = removeCustomSubsectionChild(
        state.fields.customSubsections,
        action.sectionId,
        action.childIndex,
      );
      return {
        ...state,
        fields: {
          ...state.fields,
          customSubsections,
          customSubsectionsText: serializeCustomSubsections(customSubsections),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "REORDER_CUSTOM_SUBSECTION_CHILDREN": {
      const customSubsections = reorderCustomSubsectionChildren(
        state.fields.customSubsections,
        action.sectionId,
        action.fromIndex,
        action.toIndex,
      );
      return {
        ...state,
        fields: {
          ...state.fields,
          customSubsections,
          customSubsectionsText: serializeCustomSubsections(customSubsections),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "SET_CUSTOM_SUBSECTIONS": {
      const customSubsections = normalizeCustomSubsections(action.sections);
      return {
        ...state,
        fields: {
          ...state.fields,
          customSubsections,
          customSubsectionsText: serializeCustomSubsections(customSubsections),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "ADD_OBJECTIVE_CUSTOM_SECTION": {
      const objectiveCustomSections = addCustomSubsection(
        state.fields.objectiveCustomSections,
        action.section,
      );
      return {
        ...state,
        fields: { ...state.fields, objectiveCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "UPDATE_OBJECTIVE_CUSTOM_SECTION": {
      const objectiveCustomSections = updateCustomSubsection(
        state.fields.objectiveCustomSections,
        action.index,
        action.patch,
      );
      return {
        ...state,
        fields: { ...state.fields, objectiveCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "REMOVE_OBJECTIVE_CUSTOM_SECTION": {
      const objectiveCustomSections = removeCustomSubsection(
        state.fields.objectiveCustomSections,
        action.index,
      );
      return {
        ...state,
        fields: { ...state.fields, objectiveCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "REORDER_OBJECTIVE_CUSTOM_SECTIONS": {
      const objectiveCustomSections = reorderCustomSubsections(
        state.fields.objectiveCustomSections,
        action.fromIndex,
        action.toIndex,
      );
      return {
        ...state,
        fields: { ...state.fields, objectiveCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "SET_OBJECTIVE_CUSTOM_SECTIONS": {
      const objectiveCustomSections = normalizeCustomSubsections(action.sections);
      return {
        ...state,
        fields: { ...state.fields, objectiveCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "SET_EXAM_SYSTEM": {
      const findings = (action.findings ?? [])
        .map((f) => f.trim())
        .filter(Boolean);
      const examFindings = upsertExamSystem(state.fields.examFindings, {
        systemId: action.systemId,
        status: action.status,
        findings,
        notes: action.notes?.trim() || null,
      });
      return {
        ...state,
        fields: { ...state.fields, examFindings },
        isDirty: true,
        submitError: null,
      };
    }
    case "CLEAR_EXAM_SYSTEM":
      return {
        ...state,
        fields: {
          ...state.fields,
          examFindings: state.fields.examFindings.filter(
            (f) => f.systemId !== action.systemId,
          ),
        },
        isDirty: true,
        submitError: null,
      };
    case "MARK_ALL_EXAM_NORMAL": {
      let examFindings = state.fields.examFindings;
      for (const systemId of action.systemIds) {
        examFindings = upsertExamSystem(examFindings, {
          systemId,
          status: "normal",
          findings: [],
          notes: null,
        });
      }
      return {
        ...state,
        fields: { ...state.fields, examFindings },
        isDirty: true,
        submitError: null,
      };
    }
    case "SET_EXAM_FINDINGS":
      return {
        ...state,
        fields: {
          ...state.fields,
          examFindings: normalizeExamFindings(action.examFindings),
        },
        isDirty: true,
        submitError: null,
      };
    case "ADD_DDX":
      return {
        ...state,
        fields: {
          ...state.fields,
          differentialDiagnosis: [...state.fields.differentialDiagnosis, action.entry],
        },
        isDirty: true,
        submitError: null,
      };
    case "REMOVE_DDX":
      return {
        ...state,
        fields: {
          ...state.fields,
          differentialDiagnosis: state.fields.differentialDiagnosis.filter(
            (_, i) => i !== action.index,
          ),
        },
        isDirty: true,
        submitError: null,
      };
    case "SAVE_START":
      return { ...state, isSaving: true, submitError: null };
    case "SAVE_SUCCESS":
      return {
        ...state,
        isSaving: false,
        isDirty: false,
        lastSavedAt: action.lastSavedAt,
      };
    case "SAVE_ERROR":
      return { ...state, isSaving: false, submitError: action.error };
    case "SUBMIT_START":
      return { ...state, isSubmitting: true, submitError: null };
    case "SUBMIT_SUCCESS":
      return { ...state, isSubmitting: false, isDirty: false };
    case "SUBMIT_ERROR":
      return { ...state, isSubmitting: false, submitError: action.error };
    case "RESET":
      return {
        fields: action.initialFields,
        isDirty: false,
        isSaving: false,
        isSubmitting: false,
        lastSavedAt: null,
        submitError: null,
      };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface RxFormContextValue {
  appointmentId: string;
  patientId: string | null;
  token: string;
  state: RxFormState;
  dispatch: React.Dispatch<RxFormAction>;
  setField: <K extends keyof RxFormFields>(key: K, value: RxFormFields[K]) => void;
  setFamilyHistoryStructured: (structured: FamilyHistoryStructured) => void;
  setSocialHistoryStructured: (structured: SocialHistoryStructured) => void;
  setPastSurgicalHistoryStructured: (structured: PastSurgicalHistoryStructured) => void;
  isDirty: boolean;
  submitDisabled: boolean;
  buildPayload: () => UpdatePrescriptionPayload;
  autoSave: UseAutoSaveResult;
}

const RxFormContext = createContext<RxFormContextValue | null>(null);

export interface RxFormProviderProps {
  appointmentId: string;
  patientId: string | null;
  token: string;
  entryMode: PrescriptionType;
  initialFields: RxFormFields;
  autosaveEnabled: boolean;
  prescriptionIdRef: MutableRefObject<string | null>;
  onPrescriptionCreated: (prescription: PrescriptionWithRelations) => void;
  children: React.ReactNode;
}

export function RxFormProvider({
  appointmentId,
  patientId,
  token,
  entryMode,
  initialFields,
  autosaveEnabled,
  prescriptionIdRef,
  onPrescriptionCreated,
  children,
}: RxFormProviderProps): JSX.Element {
  const [state, dispatch] = useReducer(rxFormReducer, {
    fields: initialFields,
    isDirty: false,
    isSaving: false,
    isSubmitting: false,
    lastSavedAt: null,
    submitError: null,
  });

  const initialFieldsRef = useRef(initialFields);
  useEffect(() => {
    if (initialFieldsRef.current === initialFields) return;
    initialFieldsRef.current = initialFields;
    dispatch({ type: "RESET", initialFields });
  }, [initialFields]);

  const setField = useCallback(<K extends keyof RxFormFields>(key: K, value: RxFormFields[K]) => {
    dispatch({ type: "SET_FIELD", key, value });
  }, []);

  const setFamilyHistoryStructured = useCallback((structured: FamilyHistoryStructured) => {
    dispatch({ type: "SET_FAMILY_HISTORY_STRUCTURED", structured });
  }, []);

  const setSocialHistoryStructured = useCallback((structured: SocialHistoryStructured) => {
    dispatch({ type: "SET_SOCIAL_HISTORY_STRUCTURED", structured });
  }, []);

  const setPastSurgicalHistoryStructured = useCallback((structured: PastSurgicalHistoryStructured) => {
    dispatch({ type: "SET_PAST_SURGICAL_HISTORY_STRUCTURED", structured });
  }, []);

  const fieldsRef = useRef(state.fields);
  fieldsRef.current = state.fields;

  const buildPayload = useCallback(() => buildRxPayload(fieldsRef.current), []);

  const formSnapshot = useMemo(
    () =>
      JSON.stringify({
        fields: state.fields,
        entryMode,
      }),
    [state.fields, entryMode],
  );

  const persistSnapshot = useCallback(async () => {
    dispatch({ type: "SAVE_START" });
    try {
      const payload = buildRxPayload(fieldsRef.current);
      const existingId = prescriptionIdRef.current;
      if (existingId) {
        await updatePrescription(token, existingId, payload);
      } else {
        const res = await createPrescription(token, {
          appointmentId,
          patientId: patientId ?? undefined,
          type: entryMode,
          ...payload,
        });
        prescriptionIdRef.current = res.data.prescription.id;
        onPrescriptionCreated(res.data.prescription);
      }
      dispatch({ type: "SAVE_SUCCESS", lastSavedAt: new Date().toISOString() });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      dispatch({ type: "SAVE_ERROR", error: message });
      throw err;
    }
  }, [
    appointmentId,
    entryMode,
    onPrescriptionCreated,
    patientId,
    prescriptionIdRef,
    token,
  ]);

  const autoSave = useAutoSave({
    value: formSnapshot,
    save: persistSnapshot,
    debounceMs: 1500,
    enabled: autosaveEnabled,
  });

  const filledMedicineCount = state.fields.medicines.filter((m) =>
    m.medicineName.trim(),
  ).length;
  const submitDisabled =
    state.isSubmitting ||
    (filledMedicineCount === 0 &&
      !state.fields.advice.trim() &&
      !state.fields.provisionalDiagnosis.trim());

  const value: RxFormContextValue = useMemo(
    () => ({
      appointmentId,
      patientId,
      token,
      state,
      dispatch,
      setField,
      setFamilyHistoryStructured,
      setSocialHistoryStructured,
      setPastSurgicalHistoryStructured,
      isDirty: state.isDirty,
      submitDisabled,
      buildPayload,
      autoSave,
    }),
    [appointmentId, patientId, token, autoSave, buildPayload, setField, setFamilyHistoryStructured, setSocialHistoryStructured, setPastSurgicalHistoryStructured, state, submitDisabled],
  );

  return <RxFormContext.Provider value={value}>{children}</RxFormContext.Provider>;
}

/** Returns form context when a parent `<RxFormProvider>` exists; otherwise `null`. */
export function useOptionalRxForm(): RxFormContextValue | null {
  return useContext(RxFormContext);
}

export function useRxForm(): RxFormContextValue {
  const ctx = useContext(RxFormContext);
  if (!ctx) {
    throw new Error("useRxForm must be called inside an <RxFormProvider>.");
  }
  return ctx;
}
