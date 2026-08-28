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
 *  - followUp (string) — notes only; patient output merges with structured
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
 *  - referral (chips + notes composed on save)
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
  useState,
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
import { deriveInvestigationOrdersJson } from "@/lib/cockpit/investigation-order-catalog";
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
  isTeleconsult,
  resolveExamSystem,
  teleconsultNormalLine,
} from "@/lib/cockpit/exam-schema";
import {
  normalizeExamFindingEntries,
  renderExamSystemFindingBody,
} from "@/lib/cockpit/exam-finding-utils";
import { normalizeCvsFindingEntries } from "@/lib/cockpit/cvs-exam-migrations";
import { normalizeRespFindingEntries } from "@/lib/cockpit/resp-exam-migrations";
import { normalizeAbdFindingEntries } from "@/lib/cockpit/abd-exam-migrations";
import { normalizeCnsFindingEntries } from "@/lib/cockpit/cns-exam-migrations";
import {
  deriveTestResults,
  normalizeLabReports,
  normalizeTestResults,
} from "@/lib/cockpit/test-results";
import {
  deriveDifferentialDiagnosis,
  derivePrimaryDiagnosis,
  enforceSinglePrimary,
  normalizeDiagnoses,
  seedAcuityFromLegacyVisit,
  seedDifferentialsFromLegacy,
  seedPrimaryDiagnosisFromLegacy,
  sortDiagnosesPrimaryFirst,
} from "@/lib/cockpit/diagnoses";
import {
  hydrateFollowUpNotes,
} from "@/lib/cockpit/follow-up-format";
import {
  hydrateReferralFields,
  resolveReferralForOutput,
  referralPartsFromFields,
} from "@/lib/cockpit/plan-quick-picks";
import { hydrateAdviceField } from "@/lib/cockpit/advice-format";
import { DOSE_UNIT_OPTIONS } from "@/lib/medicineCodes";
import {
  hydrateMeasurementContextFromPrescription,
  hydrateVitalProvenanceFromPrescription,
  resolveDefaultMeasurementContext,
  type VitalProvenanceMap,
} from "@/lib/cockpit/measurement-context";
import {
  createEmptyBpReading,
  DEFAULT_BP_CONTEXT,
  hydrateBpContextFromPrescription,
  hydrateBpReadingsFromPrescription,
  resolvePrimaryBpForPayload,
} from "@/lib/cockpit/bp-readings";
import {
  createEmptyGlucoseReading,
  DEFAULT_GLUCOSE_CONTEXT,
  glucoseReadingRowHasData,
  hydrateGlucoseContextFromPrescription,
  hydrateGlucoseReadingsFromPrescription,
  resolvePrimaryGlucoseForPayload,
} from "@/lib/cockpit/glucose-readings";
import {
  assembleVitalsJsonPayload,
  createEmptyJsonVitalFields,
  hasVitalsJsonContent,
  hydrateJsonVitalFields,
  pickJsonVitalFields,
} from "@/lib/cockpit/vitals-json";
import {
  assembleVitalsCustomEntries,
  hydrateCustomVitalNotesFromEntries,
  hydrateVitalsCustom,
  type CustomVitalDef,
  type CustomVitalValueMap,
} from "@/lib/cockpit/vitals-custom";
import {
  hydrateVitalNotesFromPrescription,
  type VitalNotesMap,
} from "@/lib/cockpit/vital-notes";
import type {
  VitalsAvpu,
  VitalsGlucoseDevice,
  VitalsGlucoseTiming,
  VitalsHrSource,
  VitalsO2DeliveryMethod,
  VitalsPulseRhythm,
  VitalsPupilReactivity,
  VitalsSpo2Device,
  VitalsTempDevice,
  VitalsTempSite,
} from "@/lib/cockpit/categorical-vitals-schema";
import type {
  AssessmentAcuity,
  Complaint,
  DiagnosisRow,
  ExamFindingEntry,
  ExamSystemFinding,
  ExamSystemStatus,
  PrescriptionType,
  PrescriptionWithRelations,
  LabReport,
  TestResultRow,
  UpdatePrescriptionPayload,
  VitalsBpLimb,
  VitalsBpPosture,
} from "@/types/prescription";
import type { BpContext, BpReading, GlucoseContext, GlucoseReading, MeasurementContext } from "@/types/prescription";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FollowUpUnit = "days" | "weeks" | "months" | "as_needed";

/** Re-export for consumers that import from RxFormContext. */
export type { Complaint } from "@/types/prescription";
export type { ExamFindingEntry, ExamSystemFinding, ExamSystemStatus } from "@/types/prescription";
export type {
  LabReport,
  TestResultRow,
  TestResultSource,
  TestResultInterpretation,
} from "@/types/prescription";
export type {
  DiagnosisRow,
  DiagnosisKind,
  DiagnosisCertainty,
  DiagnosisStatus,
} from "@/types/prescription";
export type { VitalsBpLimb, VitalsBpPosture, BpContext, BpReading, GlucoseContext, GlucoseReading, MeasurementContext } from "@/types/prescription";
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
  /** Multi-reading BP rows; primary (index 0) mirrors legacy columns on save. */
  vitalsBpReadings: BpReading[];
  /** Multi-reading glucose rows; primary (index 0) mirrors legacy column on save. */
  vitalsGlucoseReadings: GlucoseReading[];
  /** Visit-level default glucose device. */
  vitalsGlucoseContext: GlucoseContext;
  /** Visit-level BP measurement context (teleconsult provenance). */
  /** Visit-level BP cuff method; who/where live in `vitalsMeasurementContext`. */
  vitalsBpContext: BpContext;
  /** Visit-level who / where for all vitals (teleconsult provenance). */
  vitalsMeasurementContext: MeasurementContext;
  /** Per-vital who/where overrides (Tier-1 teleconsult vitals). */
  vitalsProvenanceOverrides: VitalProvenanceMap;
  /** Per-vital optional notes (vitals_json.vitalNotes). */
  vitalsNotes: Record<string, string | null>;
  vitalsHeadCircumferenceCm: number | null;
  vitalsMuacCm: number | null;
  vitalsWaistCm: number | null;

  /**
   * vit-14: active doctor-authored custom-vital DEFINITIONS for this visit
   * (seeded from `doctor_settings.vitals_custom`, overlaid with any
   * self-describing entries already stored on the prescription).
   */
  vitalsCustomDefs: CustomVitalDef[];
  /** vit-14: per-visit entered custom-vital VALUES, keyed by definition id. */
  vitalsCustomValues: CustomVitalValueMap;

  // vitals-section / migration 156 — json-backed extended vitals (canonical units).
  vitalsO2FlowLMin: number | null;
  vitalsFio2Pct: number | null;
  vitalsPefrLMin: number | null;
  vitalsBloodKetonesMmolL: number | null;
  vitalsHipCm: number | null;
  vitalsGcsE: number | null;
  vitalsGcsV: number | null;
  vitalsGcsM: number | null;
  vitalsPupilSizeLeftMm: number | null;
  vitalsPupilSizeRightMm: number | null;
  vitalsCapillaryRefillS: number | null;
  vitalsFetalHeartRateBpm: number | null;
  vitalsFundalHeightCm: number | null;
  vitalsO2DeliveryMethod: VitalsO2DeliveryMethod | null;
  vitalsSpo2Device: VitalsSpo2Device | null;
  vitalsGlucoseTiming: VitalsGlucoseTiming | null;
  vitalsGlucoseDevice: VitalsGlucoseDevice | null;
  vitalsPupilReactivityLeft: VitalsPupilReactivity | null;
  vitalsPupilReactivityRight: VitalsPupilReactivity | null;
  vitalsAvpu: VitalsAvpu | null;
  vitalsPulseRhythm: VitalsPulseRhythm | null;
  vitalsHrSource: VitalsHrSource | null;
  vitalsTempSite: VitalsTempSite | null;
  vitalsTempDevice: VitalsTempDevice | null;

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

  /**
   * assessment-plan-custom-sections — per-visit custom Assessment sections
   * (depth-2 tree, mirrors subjective customs). Seeded from the doctor default
   * (`assessment_custom_sections`); persisted to
   * `prescriptions.assessment_custom_sections` and included (sanitised) in PDF/SMS.
   */
  assessmentCustomSections: CustomSubsection[];

  /**
   * assessment-plan-custom-sections — per-visit custom Plan sections (depth-2
   * tree). Seeded from `plan_custom_sections`; persisted to
   * `prescriptions.plan_custom_sections` and included (sanitised) in PDF/SMS.
   */
  planCustomSections: CustomSubsection[];

  provisionalDiagnosis: string;
  differentialDiagnosis: string[];
  /**
   * assessment-tab / migration 161 — structured diagnosis rows. Primary label
   * derives into `provisionalDiagnosis` on save (ASMT-D4). Empty = legacy
   * free-text passthrough for the strip / payload.
   */
  diagnoses: DiagnosisRow[];

  /**
   * assessment-tab / migration 160 — visit-level impression note + acuity.
   * Dormant writers: Assessment UI no longer edits these. Kept in form state
   * for hydrate/back-compat; payload always emits null so columns stay empty.
   * Per-diagnosis acuity lives on `diagnoses[].acuity`.
   */
  assessmentNote: string;
  assessmentAcuity: AssessmentAcuity | null;

  /** Renamed DB column `investigations_orders`; API field stays `investigations`. */
  investigationsOrders: string;
  medicines: RxMedicine[];

  advice: string;
  followUp: string;
  followUpValue: number | null;
  followUpUnit: FollowUpUnit | null;
  /**
   * Referral chips (urgency / specialties / reason) + free notes.
   * `referral` is notes only in the form; save/PDF compose via
   * `resolveReferralForOutput`. Hydrate splits the persisted TEXT back.
   */
  referralUrgency: string | null;
  referralSpecialties: string[];
  referralReason: string | null;
  referral: string;
  testResults: string;
  /**
   * Structured point-of-care / patient-brought test results (obj-20).
   * `testResults` is derived from this on save when non-empty; an empty array
   * leaves the legacy free-text `testResults` untouched (OBJ-D2 passthrough).
   */
  testResultsStructured: TestResultRow[];
  /**
   * Lab/imaging report headers grouping structured rows (rpt-02/03). Client form
   * state only until the save-path wires `lab_reports_json` through the API.
   */
  labReports: LabReport[];

  patientEducation: string;
  clinicalNotes: string;
  /** Prior Rx re-use audit (rxss-03); client form state only in v1. */
  fromPrescriptionId: string | null;
}

export interface RxFormState {
  fields: RxFormFields;
  /** Appointment `consultation_type` — readable modality for exam layer (tc-01). */
  consultationType: string | null;
  isDirty: boolean;
  isSaving: boolean;
  isSubmitting: boolean;
  lastSavedAt: string | null;
  submitError: string | null;
}

/** Reducer-owned slice — `consultationType` is merged at the provider boundary. */
type RxFormReducerState = Omit<RxFormState, "consultationType">;

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
  // assessment-plan-custom-sections — Assessment custom sections (depth-2, mirrors subjective).
  | { type: "ADD_ASSESSMENT_CUSTOM_SECTION"; section: CustomSubsection }
  | { type: "UPDATE_ASSESSMENT_CUSTOM_SECTION"; index: number; patch: Partial<CustomSubsection> }
  | { type: "REMOVE_ASSESSMENT_CUSTOM_SECTION"; index: number }
  | { type: "REORDER_ASSESSMENT_CUSTOM_SECTIONS"; fromIndex: number; toIndex: number }
  | { type: "ADD_ASSESSMENT_CUSTOM_SECTION_CHILD"; sectionId: string; child: CustomSubsectionChild }
  | {
      type: "UPDATE_ASSESSMENT_CUSTOM_SECTION_CHILD";
      sectionId: string;
      childIndex: number;
      patch: Partial<CustomSubsectionChild>;
    }
  | { type: "REMOVE_ASSESSMENT_CUSTOM_SECTION_CHILD"; sectionId: string; childIndex: number }
  | {
      type: "REORDER_ASSESSMENT_CUSTOM_SECTION_CHILDREN";
      sectionId: string;
      fromIndex: number;
      toIndex: number;
    }
  | { type: "SET_ASSESSMENT_CUSTOM_SECTIONS"; sections: CustomSubsection[] }
  // assessment-plan-custom-sections — Plan custom sections (depth-2, mirrors subjective).
  | { type: "ADD_PLAN_CUSTOM_SECTION"; section: CustomSubsection }
  | { type: "UPDATE_PLAN_CUSTOM_SECTION"; index: number; patch: Partial<CustomSubsection> }
  | { type: "REMOVE_PLAN_CUSTOM_SECTION"; index: number }
  | { type: "REORDER_PLAN_CUSTOM_SECTIONS"; fromIndex: number; toIndex: number }
  | { type: "ADD_PLAN_CUSTOM_SECTION_CHILD"; sectionId: string; child: CustomSubsectionChild }
  | {
      type: "UPDATE_PLAN_CUSTOM_SECTION_CHILD";
      sectionId: string;
      childIndex: number;
      patch: Partial<CustomSubsectionChild>;
    }
  | { type: "REMOVE_PLAN_CUSTOM_SECTION_CHILD"; sectionId: string; childIndex: number }
  | {
      type: "REORDER_PLAN_CUSTOM_SECTION_CHILDREN";
      sectionId: string;
      fromIndex: number;
      toIndex: number;
    }
  | { type: "SET_PLAN_CUSTOM_SECTIONS"; sections: CustomSubsection[] }
  | {
      type: "SET_EXAM_SYSTEM";
      systemId: string;
      status: ExamSystemStatus;
      findings?: ExamFindingEntry[];
      notes?: string | null;
    }
  | { type: "CLEAR_EXAM_SYSTEM"; systemId: string }
  | { type: "MARK_ALL_EXAM_NORMAL"; systemIds: string[] }
  | { type: "SET_EXAM_FINDINGS"; examFindings: ExamSystemFinding[] }
  | { type: "SET_TEST_RESULTS"; testResults: TestResultRow[] }
  | { type: "ADD_TEST_RESULT"; row: TestResultRow }
  | { type: "UPDATE_TEST_RESULT"; id: string; patch: Partial<TestResultRow> }
  | { type: "REMOVE_TEST_RESULT"; id: string }
  | { type: "SET_LAB_REPORTS"; labReports: LabReport[] }
  | { type: "ADD_LAB_REPORT"; report: LabReport }
  | { type: "UPDATE_LAB_REPORT"; id: string; patch: Partial<LabReport> }
  | { type: "REMOVE_LAB_REPORT"; id: string }
  /** Scaffold a panel: append report header + all analyte rows in one action. */
  | { type: "ADD_LAB_PANEL"; report: LabReport; rows: TestResultRow[] }
  | { type: "SET_DIAGNOSES"; diagnoses: DiagnosisRow[] }
  | { type: "ADD_DIAGNOSIS"; diagnosis: DiagnosisRow }
  | { type: "UPDATE_DIAGNOSIS"; id: string; patch: Partial<DiagnosisRow> }
  | { type: "REMOVE_DIAGNOSIS"; id: string }
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

export type RxFormSeedOptions = {
  /** Appointment `consultation_type` — drives vitals provenance defaults. */
  consultationType?: string | null;
};

export function createEmptyRxFormFields(
  seedMedicines: RxMedicine[] = [{ ...EMPTY_RX_MEDICINE }],
  seedOptions?: RxFormSeedOptions,
): RxFormFields {
  const visitMeasurementContext = resolveDefaultMeasurementContext(
    seedOptions?.consultationType,
  );
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
    vitalsBpReadings: [createEmptyBpReading()],
    vitalsGlucoseReadings: [createEmptyGlucoseReading()],
    vitalsGlucoseContext: { device: DEFAULT_GLUCOSE_CONTEXT.device },
    vitalsBpContext: { method: DEFAULT_BP_CONTEXT.method },
    vitalsMeasurementContext: { ...visitMeasurementContext },
    vitalsProvenanceOverrides: {},
    vitalsNotes: {},
    vitalsHeadCircumferenceCm: null,
    vitalsMuacCm: null,
    vitalsWaistCm: null,
    vitalsCustomDefs: [],
    vitalsCustomValues: {},
    ...createEmptyJsonVitalFields(),
    examinationFindings: "",
    examFindings: [],
    objectiveCustomSections: [],
    assessmentCustomSections: [],
    planCustomSections: [],
    provisionalDiagnosis: "",
    differentialDiagnosis: [],
    diagnoses: [],
    assessmentNote: "",
    assessmentAcuity: null,
    investigationsOrders: "",
    medicines: seedMedicines,
    advice: "",
    followUp: "",
    followUpValue: null,
    followUpUnit: null,
    referralUrgency: null,
    referralSpecialties: [],
    referralReason: null,
    referral: "",
    testResults: "",
    testResultsStructured: [],
    labReports: [],
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
    const findingsRaw = normalizeExamFindingEntries(row.findings as unknown[] | null | undefined);
    const findings =
      systemId === "cvs"
        ? normalizeCvsFindingEntries(findingsRaw)
        : systemId === "resp"
          ? normalizeRespFindingEntries(findingsRaw)
          : systemId === "abd"
            ? normalizeAbdFindingEntries(findingsRaw)
            : systemId === "cns"
              ? normalizeCnsFindingEntries(findingsRaw)
              : findingsRaw;
    out.push({
      systemId,
      status: row.status,
      findings,
      notes: typeof row.notes === "string" ? row.notes.trim() || null : null,
    });
  }
  return out;
}

function hydrateRxFormFields(fields: RxFormFields): RxFormFields {
  const examFindings = normalizeExamFindings(fields.examFindings);
  // Legacy CVS pulse rows carried a `notes` attribute; pulse notes now live on
  // the shared Vitals HR note. Carry any existing pulse note over (without
  // clobbering an explicit vitals note) so nothing is lost on load.
  const legacyPulseNote = extractLegacyCvsPulseNote(fields.examFindings);
  const vitalsNotes =
    legacyPulseNote && !fields.vitalsNotes.vitalsHr?.trim()
      ? { ...fields.vitalsNotes, vitalsHr: legacyPulseNote }
      : fields.vitalsNotes;
  return {
    ...fields,
    examFindings,
    vitalsNotes,
  };
}

/** Pull a legacy `pulse.notes` attribute from raw CVS exam findings, if present. */
function extractLegacyCvsPulseNote(
  examFindings: ExamSystemFinding[] | null | undefined,
): string | null {
  if (!Array.isArray(examFindings)) return null;
  const cvs = examFindings.find((f) => f?.systemId === "cvs");
  const pulse = cvs?.findings?.find((e) => e.findingId === "pulse");
  const note = pulse?.attributes?.notes?.trim();
  return note ? note : null;
}

/** Deterministic order: core registry index first, then exam/objective notes, then alpha. */
function compareExamSystems(a: ExamSystemFinding, b: ExamSystemFinding): number {
  const order = [
    ...EXAM_CORE_SYSTEM_ORDER,
    "additional_notes",
    "objective_notes",
  ];
  const ai = order.indexOf(a.systemId);
  const bi = order.indexOf(b.systemId);
  const aRank = ai === -1 ? order.length : ai;
  const bRank = bi === -1 ? order.length : bi;
  if (aRank !== bRank) return aRank - bRank;
  return a.systemId.localeCompare(b.systemId);
}

/**
 * Visit-level teleconsult limitation caveat appended to a non-empty derived exam
 * block (tc-03, TC-D1). Derived-only — never stored as data — and a constant (no
 * timestamp) so the derivation stays pure + stable.
 */
export const TELECONSULT_EXAM_CAVEAT =
  "Assessment via teleconsultation; physical examination limited to inspection and patient-reported data.";

function renderExamSystemLine(finding: ExamSystemFinding, teleconsult: boolean): string {
  const label = resolveExamSystem(finding.systemId).label;
  // Free-text sibling / L1 notes: emit notes only (no Normal / chip body).
  if (finding.systemId === "additional_notes" || finding.systemId === "objective_notes") {
    const notes = finding.notes?.trim();
    return notes ? `${label}: ${notes}` : "";
  }
  let body: string;
  if (finding.status === "normal") {
    // Teleconsult "normal" must not over-claim auscultation/palpation (TC-D4):
    // emit the inspection-scoped WNL line (tc-01) instead of a bare "Normal".
    body = teleconsult ? teleconsultNormalLine(finding.systemId) : "Normal";
  } else {
    body = renderExamSystemFindingBody(finding);
  }
  const notes = finding.notes?.trim();
  return notes ? `${label}: ${body} (${notes})` : `${label}: ${body}`;
}

/** Options for {@link deriveExaminationFindingsFromExam} (tc-03). */
export interface DeriveExaminationOptions {
  /**
   * Appointment modality (tc-01). **Absent → in-clinic**, keeping every existing
   * findings-only call byte-identical (TC-D5). Only an explicitly-provided
   * teleconsult modality scopes the normal line + appends the caveat.
   */
  consultationType?: string | null;
}

/**
 * Render structured exam findings into the deterministic derived text that
 * mirrors `examination_findings` on save (OBJ-D2). Pure + stable (registry
 * order, no `Date.now`). An empty list returns "" so the caller can fall back
 * to the legacy free-text passthrough (P1-D2).
 *
 * On a teleconsult (tc-03) the normal line is inspection-scoped and a single
 * visit-level limitation caveat is appended; in-clinic output is unchanged.
 */
export function deriveExaminationFindingsFromExam(
  examFindings: ExamSystemFinding[],
  options?: DeriveExaminationOptions,
): string {
  const normalized = normalizeExamFindings(examFindings);
  if (normalized.length === 0) return "";
  const teleconsult =
    options?.consultationType !== undefined && isTeleconsult(options.consultationType);
  const body = [...normalized]
    .sort(compareExamSystems)
    .map((finding) => renderExamSystemLine(finding, teleconsult))
    .filter((line) => line.length > 0)
    .join("\n");
  if (!body) return "";
  return teleconsult ? `${body}\n${TELECONSULT_EXAM_CAVEAT}` : body;
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
  seedOptions?: RxFormSeedOptions,
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
    vitalsBpReadings: hydrateBpReadingsFromPrescription({
      columns: {
        systolic: rx.vitals_bp_systolic ?? null,
        diastolic: rx.vitals_bp_diastolic ?? null,
        posture: rx.vitals_bp_posture ?? null,
        limb: rx.vitals_bp_limb ?? null,
      },
      vitalsJson: rx.vitals_json,
    }),
    vitalsGlucoseReadings: hydrateGlucoseReadingsFromPrescription({
      columns: {
        valueMgDl: rx.vitals_glucose_mg_dl ?? null,
        timing: rx.vitals_json?.vitalsGlucoseTiming ?? null,
        device: rx.vitals_json?.vitalsGlucoseDevice ?? null,
      },
      vitalsJson: rx.vitals_json,
    }),
    vitalsGlucoseContext: {
      device:
        hydrateGlucoseContextFromPrescription(rx.vitals_json).device ??
        DEFAULT_GLUCOSE_CONTEXT.device,
    },
    vitalsBpContext: {
      method: hydrateBpContextFromPrescription(rx.vitals_json).method ?? DEFAULT_BP_CONTEXT.method,
    },
    vitalsMeasurementContext: hydrateMeasurementContextFromPrescription(
      rx.vitals_json,
      seedOptions?.consultationType,
    ),
    vitalsProvenanceOverrides: hydrateVitalProvenanceFromPrescription(rx.vitals_json),
    vitalsNotes: {
      ...hydrateVitalNotesFromPrescription(rx.vitals_json),
      ...hydrateCustomVitalNotesFromEntries(rx.vitals_json?.vitalsCustom),
    },
    vitalsHeadCircumferenceCm: rx.vitals_head_circumference_cm ?? null,
    vitalsMuacCm: rx.vitals_muac_cm ?? null,
    vitalsWaistCm: rx.vitals_waist_cm ?? null,
    ...(() => {
      const { defs, values } = hydrateVitalsCustom(rx.vitals_json, []);
      return { vitalsCustomDefs: defs, vitalsCustomValues: values };
    })(),
    ...hydrateJsonVitalFields(rx.vitals_json),
    examinationFindings: rx.examination_findings ?? "",
    examFindings: normalizeExamFindings(rx.examination_json),
    // obj-13: per-visit instances seed from the doctor default (in ObjectiveSection),
    // not from the row — their content already derived into examination_findings (OBJ-D2).
    objectiveCustomSections: [],
    // assessment-plan-custom-sections: dedicated columns (mirror subjective customs).
    // Hydrate from the row; fresh visits seed from doctor defaults in provider setup.
    assessmentCustomSections: normalizeCustomSubsections(rx.assessment_custom_sections),
    planCustomSections: normalizeCustomSubsections(rx.plan_custom_sections),
    // asmt-03 / asmt-05: prefer structured diagnoses_json; else seed one
    // primary from legacy free-text. Also seed differential cards from any
    // legacy differential_diagnosis[] not already represented (ASMT-D4′).
    // Seed primary acuity from dormant visit-level assessment_acuity when
    // the structured rows have none. Keep provisionalDiagnosis +
    // differentialDiagnosis mirrors in sync for the strip glance.
    ...(() => {
      const fromJson = normalizeDiagnoses(rx.diagnoses_json);
      let diagnoses =
        fromJson.length > 0
          ? sortDiagnosesPrimaryFirst(fromJson)
          : seedPrimaryDiagnosisFromLegacy(rx.provisional_diagnosis);
      const seededDdx = seedDifferentialsFromLegacy(
        rx.differential_diagnosis,
        diagnoses,
      );
      if (seededDdx.length > 0) {
        diagnoses = sortDiagnosesPrimaryFirst(
          enforceSinglePrimary([...diagnoses, ...seededDdx]),
        );
      }
      diagnoses = seedAcuityFromLegacyVisit(diagnoses, rx.assessment_acuity);
      const provisionalDiagnosis =
        diagnoses.length > 0
          ? derivePrimaryDiagnosis(diagnoses)
          : (rx.provisional_diagnosis ?? "");
      const differentialDiagnosis =
        diagnoses.some((d) => d.kind === "differential")
          ? deriveDifferentialDiagnosis(diagnoses)
          : (rx.differential_diagnosis ?? []);
      return { diagnoses, provisionalDiagnosis, differentialDiagnosis };
    })(),
    // Visit-level note/acuity are dormant — keep hydrate for display of old
    // data if needed, but UI no longer edits them.
    assessmentNote: rx.assessment_note ?? "",
    assessmentAcuity: rx.assessment_acuity ?? null,
    investigationsOrders: investigationsFromPrescription(rx),
    medicines,
    advice: hydrateAdviceField(rx.advice, rx.patient_education),
    // Notes only — strip persisted patient-facing echoes (follow-up polish).
    followUp: hydrateFollowUpNotes(
      rx.follow_up,
      rx.follow_up_value,
      rx.follow_up_unit,
    ),
    followUpValue: rx.follow_up_value ?? null,
    followUpUnit: rx.follow_up_unit ?? null,
    ...hydrateReferralFields(rx.referral),
    testResults: rx.test_results ?? "",
    testResultsStructured: normalizeTestResults(rx.test_results_json),
    // rpt-03: hydrate when the column is present; empty when absent / save-path deferred.
    labReports: normalizeLabReports(rx.lab_reports_json),
    // Folded into `advice` on hydrate; column kept null on save.
    patientEducation: "",
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

export function buildRxPayload(
  fields: RxFormFields,
  options?: DeriveExaminationOptions,
): UpdatePrescriptionPayload {
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

  // assessment-plan-custom-sections: dedicated columns (mirror subjective).
  const storedAssessmentCustomSections = serializeCustomSubsectionsForPayload(
    fields.assessmentCustomSections,
  );
  const storedPlanCustomSections = serializeCustomSubsectionsForPayload(
    fields.planCustomSections,
  );

  // objective-tab / OBJ-D2 — derive examination_findings from the structured
  // exam when present; otherwise leave the legacy free-text untouched (the
  // byte-parity passthrough contract, P1-D2). obj-13 appends any non-empty
  // objective custom-section text after the base block; empty custom sections
  // contribute nothing, so legacy/empty rows stay byte-identical.
  const storedExamFindings = normalizeExamFindings(fields.examFindings);
  const baseExaminationFindings =
    storedExamFindings.length > 0
      ? deriveExaminationFindingsFromExam(storedExamFindings, options)
      : fields.examinationFindings.trim();
  const objectiveCustomText = serializeCustomSubsections(fields.objectiveCustomSections);
  const derivedExaminationFindings =
    [baseExaminationFindings, objectiveCustomText]
      .filter((block) => Boolean(block && block.trim()))
      .join("\n\n") || null;

  // objective-tab / OBJ-D2 (obj-20) — derive test_results from the structured
  // result rows when present; otherwise leave the legacy free-text untouched
  // (byte-parity passthrough). Empty / all-dropped rows fall back to the legacy
  // testResults text, keeping legacy saves byte-identical.
  const storedTestResults = normalizeTestResults(fields.testResultsStructured);
  const derivedTestResults =
    (storedTestResults.length > 0
      ? deriveTestResults(storedTestResults)
      : fields.testResults.trim()) || null;

  const primaryBp = resolvePrimaryBpForPayload(fields);
  const primaryGlucose = resolvePrimaryGlucoseForPayload(fields);
  const primaryReading = fields.vitalsGlucoseReadings[0];
  const usesGlucoseReadingCluster =
    primaryReading != null && glucoseReadingRowHasData(primaryReading);
  const jsonFieldsForPayload = {
    ...pickJsonVitalFields({ ...createEmptyJsonVitalFields(), ...fields }),
    ...(usesGlucoseReadingCluster
      ? {
          vitalsGlucoseTiming: primaryGlucose.timing,
          vitalsGlucoseDevice:
            primaryGlucose.device ?? fields.vitalsGlucoseContext.device ?? null,
        }
      : {}),
  };

  const storedVitalsJson = assembleVitalsJsonPayload(
    jsonFieldsForPayload,
    fields.vitalsBpReadings,
    fields.vitalsBpContext,
    fields.vitalsMeasurementContext,
    fields.vitalsProvenanceOverrides,
    assembleVitalsCustomEntries(
      fields.vitalsCustomDefs,
      fields.vitalsCustomValues,
      fields.vitalsNotes,
    ),
    fields.vitalsGlucoseReadings,
    fields.vitalsGlucoseContext,
    fields.vitalsNotes,
  );

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
    assessmentCustomSections: storedAssessmentCustomSections,
    planCustomSections: storedPlanCustomSections,
    // asmt-03 / ASMT-D4: when structured diagnoses are present, derive
    // provisionalDiagnosis from the primary label (byte-identical for a
    // single-Dx visit). Empty structured set = legacy free-text passthrough.
    provisionalDiagnosis: (() => {
      const storedDiagnoses = normalizeDiagnoses(fields.diagnoses);
      if (storedDiagnoses.length > 0) {
        return derivePrimaryDiagnosis(storedDiagnoses) || null;
      }
      return fields.provisionalDiagnosis.trim() || null;
    })(),
    diagnosesJson: normalizeDiagnoses(fields.diagnoses),
    investigations: fields.investigationsOrders.trim() || null,
    // plan-investigations-library / migration 167 — structured orders derived
    // from the chip labels (INV-D8); the flat `investigations` string above
    // stays authoritative for output so readers are byte-identical.
    investigationsOrdersJson: deriveInvestigationOrdersJson(fields.investigationsOrders),
    // Notes only in `follow_up` TEXT; PDF/SMS merge with structured at read time.
    followUp: fields.followUp.trim() || null,
    // Single Advice bucket — legacy patient_education cleared on write.
    patientEducation: null,
    clinicalNotes: fields.clinicalNotes.trim() || null,
    vitalsBpSystolic: primaryBp.systolic,
    vitalsBpDiastolic: primaryBp.diastolic,
    vitalsHr: fields.vitalsHr,
    vitalsTempC: fields.vitalsTempC,
    vitalsSpo2: fields.vitalsSpo2,
    vitalsWtKg: fields.vitalsWtKg,
    vitalsHtCm: fields.vitalsHtCm,
    vitalsRr: fields.vitalsRr,
    vitalsPainScore: fields.vitalsPainScore,
    vitalsGlucoseMgDl: primaryGlucose.valueMgDl,
    vitalsGcsTotal: fields.vitalsGcsTotal,
    vitalsBpPosture: primaryBp.posture,
    vitalsBpLimb: primaryBp.limb,
    vitalsHeadCircumferenceCm: fields.vitalsHeadCircumferenceCm,
    vitalsMuacCm: fields.vitalsMuacCm,
    vitalsWaistCm: fields.vitalsWaistCm,
    examinationFindings: derivedExaminationFindings,
    examinationJson: storedExamFindings,
    // asmt-05 / ASMT-D4′: derive differentialDiagnosis from non-excluded
    // differential cards. When no structured diagnoses exist, fall back to
    // the legacy chip-field passthrough (byte-identical for equal content).
    differentialDiagnosis: (() => {
      const storedDiagnoses = normalizeDiagnoses(fields.diagnoses);
      if (storedDiagnoses.length > 0) {
        const derived = deriveDifferentialDiagnosis(storedDiagnoses);
        return derived.length > 0 ? derived : null;
      }
      return fields.differentialDiagnosis.length > 0
        ? fields.differentialDiagnosis
        : null;
    })(),
    // Clinician-private impression note (ASMT-D5): trimmed, empty → null; never
    // rendered on patient output. Visit-level acuity stays dormant — per-diagnosis
    // acuity lives in diagnosesJson.
    assessmentNote: fields.assessmentNote.trim() || null,
    assessmentAcuity: null,
    advice: fields.advice.trim() || null,
    followUpValue: fields.followUpValue,
    followUpUnit: fields.followUpUnit,
    // Chips + notes compose into the single `referral` TEXT column.
    referral: resolveReferralForOutput(referralPartsFromFields(fields)),
    testResults: derivedTestResults,
    testResultsJson: storedTestResults,
    ...(hasVitalsJsonContent(storedVitalsJson) ? { vitalsJson: storedVitalsJson } : {}),
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
        doseUnit:
          m.doseUnit && DOSE_UNIT_OPTIONS.some((o) => o.unit === m.doseUnit)
            ? m.doseUnit
            : null,
        form: m.form?.trim() || null,
        foodTiming: m.foodTiming,
      })),
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function rxFormReducer(state: RxFormReducerState, action: RxFormAction): RxFormReducerState {
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
      // asmt-03 / asmt-05: strip glance edits `provisionalDiagnosis` — keep the
      // primary structured row label in sync (seed one primary when empty).
      // Never write the strip label onto a differential card.
      if (action.key === "provisionalDiagnosis") {
        const label = String(action.value ?? "");
        if (nextFields.diagnoses.length > 0) {
          const primaryId =
            nextFields.diagnoses.find((d) => d.kind === "primary")?.id ??
            nextFields.diagnoses.find((d) => d.kind === "secondary")?.id;
          if (primaryId) {
            nextFields.diagnoses = nextFields.diagnoses.map((row) =>
              row.id === primaryId ? { ...row, label } : row,
            );
          } else if (label.trim()) {
            // Only differentials present — seed a primary alongside them.
            nextFields.diagnoses = sortDiagnosesPrimaryFirst(
              enforceSinglePrimary([
                ...seedPrimaryDiagnosisFromLegacy(label),
                ...nextFields.diagnoses,
              ]),
            );
          }
        } else if (label.trim()) {
          nextFields.diagnoses = seedPrimaryDiagnosisFromLegacy(label);
        }
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
          medicines: [action.medicine, ...state.fields.medicines],
        },
        isDirty: true,
        submitError: null,
      };
    case "REMOVE_MEDICINE": {
      const { medicines } = state.fields;
      const next =
        medicines.length <= 1
          ? // Capture-bar flow: clearing the last named card leaves a hidden blank seed.
            [{ ...EMPTY_RX_MEDICINE }]
          : medicines.filter((_, i) => i !== action.index);
      return {
        ...state,
        fields: {
          ...state.fields,
          medicines: next,
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
    // assessment-plan-custom-sections — Assessment custom sections (depth-2).
    case "ADD_ASSESSMENT_CUSTOM_SECTION": {
      const assessmentCustomSections = addCustomSubsection(
        state.fields.assessmentCustomSections,
        action.section,
      );
      return {
        ...state,
        fields: { ...state.fields, assessmentCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "UPDATE_ASSESSMENT_CUSTOM_SECTION": {
      const assessmentCustomSections = updateCustomSubsection(
        state.fields.assessmentCustomSections,
        action.index,
        action.patch,
      );
      return {
        ...state,
        fields: { ...state.fields, assessmentCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "REMOVE_ASSESSMENT_CUSTOM_SECTION": {
      const assessmentCustomSections = removeCustomSubsection(
        state.fields.assessmentCustomSections,
        action.index,
      );
      return {
        ...state,
        fields: { ...state.fields, assessmentCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "REORDER_ASSESSMENT_CUSTOM_SECTIONS": {
      const assessmentCustomSections = reorderCustomSubsections(
        state.fields.assessmentCustomSections,
        action.fromIndex,
        action.toIndex,
      );
      return {
        ...state,
        fields: { ...state.fields, assessmentCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "ADD_ASSESSMENT_CUSTOM_SECTION_CHILD": {
      const assessmentCustomSections = addCustomSubsectionChild(
        state.fields.assessmentCustomSections,
        action.sectionId,
        action.child,
      );
      return {
        ...state,
        fields: { ...state.fields, assessmentCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "UPDATE_ASSESSMENT_CUSTOM_SECTION_CHILD": {
      const assessmentCustomSections = updateCustomSubsectionChild(
        state.fields.assessmentCustomSections,
        action.sectionId,
        action.childIndex,
        action.patch,
      );
      return {
        ...state,
        fields: { ...state.fields, assessmentCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "REMOVE_ASSESSMENT_CUSTOM_SECTION_CHILD": {
      const assessmentCustomSections = removeCustomSubsectionChild(
        state.fields.assessmentCustomSections,
        action.sectionId,
        action.childIndex,
      );
      return {
        ...state,
        fields: { ...state.fields, assessmentCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "REORDER_ASSESSMENT_CUSTOM_SECTION_CHILDREN": {
      const assessmentCustomSections = reorderCustomSubsectionChildren(
        state.fields.assessmentCustomSections,
        action.sectionId,
        action.fromIndex,
        action.toIndex,
      );
      return {
        ...state,
        fields: { ...state.fields, assessmentCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "SET_ASSESSMENT_CUSTOM_SECTIONS": {
      const assessmentCustomSections = normalizeCustomSubsections(action.sections);
      return {
        ...state,
        fields: { ...state.fields, assessmentCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    // assessment-plan-custom-sections — Plan custom sections (depth-2).
    case "ADD_PLAN_CUSTOM_SECTION": {
      const planCustomSections = addCustomSubsection(
        state.fields.planCustomSections,
        action.section,
      );
      return {
        ...state,
        fields: { ...state.fields, planCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "UPDATE_PLAN_CUSTOM_SECTION": {
      const planCustomSections = updateCustomSubsection(
        state.fields.planCustomSections,
        action.index,
        action.patch,
      );
      return {
        ...state,
        fields: { ...state.fields, planCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "REMOVE_PLAN_CUSTOM_SECTION": {
      const planCustomSections = removeCustomSubsection(
        state.fields.planCustomSections,
        action.index,
      );
      return {
        ...state,
        fields: { ...state.fields, planCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "REORDER_PLAN_CUSTOM_SECTIONS": {
      const planCustomSections = reorderCustomSubsections(
        state.fields.planCustomSections,
        action.fromIndex,
        action.toIndex,
      );
      return {
        ...state,
        fields: { ...state.fields, planCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "ADD_PLAN_CUSTOM_SECTION_CHILD": {
      const planCustomSections = addCustomSubsectionChild(
        state.fields.planCustomSections,
        action.sectionId,
        action.child,
      );
      return {
        ...state,
        fields: { ...state.fields, planCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "UPDATE_PLAN_CUSTOM_SECTION_CHILD": {
      const planCustomSections = updateCustomSubsectionChild(
        state.fields.planCustomSections,
        action.sectionId,
        action.childIndex,
        action.patch,
      );
      return {
        ...state,
        fields: { ...state.fields, planCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "REMOVE_PLAN_CUSTOM_SECTION_CHILD": {
      const planCustomSections = removeCustomSubsectionChild(
        state.fields.planCustomSections,
        action.sectionId,
        action.childIndex,
      );
      return {
        ...state,
        fields: { ...state.fields, planCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "REORDER_PLAN_CUSTOM_SECTION_CHILDREN": {
      const planCustomSections = reorderCustomSubsectionChildren(
        state.fields.planCustomSections,
        action.sectionId,
        action.fromIndex,
        action.toIndex,
      );
      return {
        ...state,
        fields: { ...state.fields, planCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "SET_PLAN_CUSTOM_SECTIONS": {
      const planCustomSections = normalizeCustomSubsections(action.sections);
      return {
        ...state,
        fields: { ...state.fields, planCustomSections },
        isDirty: true,
        submitError: null,
      };
    }
    case "SET_EXAM_SYSTEM": {
      const findings = normalizeExamFindingEntries(action.findings);
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
    case "SET_TEST_RESULTS":
      return {
        ...state,
        fields: {
          ...state.fields,
          testResultsStructured: normalizeTestResults(action.testResults),
        },
        isDirty: true,
        submitError: null,
      };
    case "ADD_TEST_RESULT":
      return {
        ...state,
        fields: {
          ...state.fields,
          testResultsStructured: [action.row, ...state.fields.testResultsStructured],
        },
        isDirty: true,
        submitError: null,
      };
    case "UPDATE_TEST_RESULT":
      return {
        ...state,
        fields: {
          ...state.fields,
          testResultsStructured: state.fields.testResultsStructured.map((row) =>
            row.id === action.id ? { ...row, ...action.patch, id: row.id } : row,
          ),
        },
        isDirty: true,
        submitError: null,
      };
    case "REMOVE_TEST_RESULT":
      return {
        ...state,
        fields: {
          ...state.fields,
          testResultsStructured: state.fields.testResultsStructured.filter(
            (row) => row.id !== action.id,
          ),
        },
        isDirty: true,
        submitError: null,
      };
    case "SET_LAB_REPORTS":
      return {
        ...state,
        fields: {
          ...state.fields,
          labReports: normalizeLabReports(action.labReports),
        },
        isDirty: true,
        submitError: null,
      };
    case "ADD_LAB_REPORT":
      return {
        ...state,
        fields: {
          ...state.fields,
          labReports: [action.report, ...state.fields.labReports],
        },
        isDirty: true,
        submitError: null,
      };
    case "UPDATE_LAB_REPORT":
      return {
        ...state,
        fields: {
          ...state.fields,
          labReports: state.fields.labReports.map((report) =>
            report.id === action.id ? { ...report, ...action.patch, id: report.id } : report,
          ),
        },
        isDirty: true,
        submitError: null,
      };
    case "REMOVE_LAB_REPORT":
      return {
        ...state,
        fields: {
          ...state.fields,
          labReports: state.fields.labReports.filter((report) => report.id !== action.id),
          // Collapse linked rows to ungrouped (unknown reportId → Other results).
          testResultsStructured: state.fields.testResultsStructured.map((row) =>
            row.reportId === action.id ? { ...row, reportId: null } : row,
          ),
        },
        isDirty: true,
        submitError: null,
      };
    case "ADD_LAB_PANEL":
      return {
        ...state,
        fields: {
          ...state.fields,
          labReports: [action.report, ...state.fields.labReports],
          testResultsStructured: [
            ...action.rows,
            ...state.fields.testResultsStructured,
          ],
        },
        isDirty: true,
        submitError: null,
      };
    case "SET_DIAGNOSES": {
      const diagnoses = sortDiagnosesPrimaryFirst(
        enforceSinglePrimary(normalizeDiagnoses(action.diagnoses)),
      );
      return {
        ...state,
        fields: {
          ...state.fields,
          diagnoses,
          provisionalDiagnosis: derivePrimaryDiagnosis(diagnoses),
          differentialDiagnosis: deriveDifferentialDiagnosis(diagnoses),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "ADD_DIAGNOSIS": {
      // Newest card first within its kind group after primary-first sort.
      const next = [action.diagnosis, ...state.fields.diagnoses];
      const diagnoses = sortDiagnosesPrimaryFirst(enforceSinglePrimary(next));
      return {
        ...state,
        fields: {
          ...state.fields,
          diagnoses,
          provisionalDiagnosis: derivePrimaryDiagnosis(diagnoses),
          differentialDiagnosis: deriveDifferentialDiagnosis(diagnoses),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "UPDATE_DIAGNOSIS": {
      const patched = state.fields.diagnoses.map((row) =>
        row.id === action.id ? { ...row, ...action.patch, id: row.id } : row,
      );
      const promoteId =
        action.patch.kind === "primary" ? action.id : undefined;
      const diagnoses = sortDiagnosesPrimaryFirst(
        enforceSinglePrimary(patched, promoteId),
      );
      return {
        ...state,
        fields: {
          ...state.fields,
          diagnoses,
          provisionalDiagnosis: derivePrimaryDiagnosis(diagnoses),
          differentialDiagnosis: deriveDifferentialDiagnosis(diagnoses),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "REMOVE_DIAGNOSIS": {
      const remaining = state.fields.diagnoses.filter((row) => row.id !== action.id);
      const diagnoses = sortDiagnosesPrimaryFirst(enforceSinglePrimary(remaining));
      return {
        ...state,
        fields: {
          ...state.fields,
          diagnoses,
          provisionalDiagnosis: derivePrimaryDiagnosis(diagnoses),
          differentialDiagnosis: deriveDifferentialDiagnosis(diagnoses),
        },
        isDirty: true,
        submitError: null,
      };
    }
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
        fields: hydrateRxFormFields(action.initialFields),
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
  /** Latest request to open + scroll a structured exam system card (e.g. from Vitals). */
  focusExamSystemRequest: { systemId: string; token: number } | null;
  requestFocusExamSystem: (systemId: string) => void;
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
  /** Appointment modality — not persisted; drives teleconsult exam preset (tc-01). */
  consultationType?: string | null;
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
  consultationType = null,
  autosaveEnabled,
  prescriptionIdRef,
  onPrescriptionCreated,
  children,
}: RxFormProviderProps): JSX.Element {
  const [reducerState, dispatch] = useReducer(rxFormReducer, {
    fields: hydrateRxFormFields(initialFields),
    isDirty: false,
    isSaving: false,
    isSubmitting: false,
    lastSavedAt: null,
    submitError: null,
  });

  const state: RxFormState = useMemo(
    () => ({ ...reducerState, consultationType }),
    [reducerState, consultationType],
  );

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

  const [focusExamSystemRequest, setFocusExamSystemRequest] = useState<
    { systemId: string; token: number } | null
  >(null);
  const requestFocusExamSystem = useCallback((systemId: string) => {
    setFocusExamSystemRequest({ systemId, token: Date.now() });
  }, []);

  const fieldsRef = useRef(state.fields);
  fieldsRef.current = state.fields;

  // tc-03: thread the readable modality into the exam derivation on save so a
  // teleconsult scopes the normal line + appends the limitation caveat.
  const consultationTypeRef = useRef(consultationType);
  consultationTypeRef.current = consultationType;

  const buildPayload = useCallback(
    () => buildRxPayload(fieldsRef.current, { consultationType: consultationTypeRef.current }),
    [],
  );

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
      const payload = buildRxPayload(fieldsRef.current, {
        consultationType: consultationTypeRef.current,
      });
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
      focusExamSystemRequest,
      requestFocusExamSystem,
      isDirty: state.isDirty,
      submitDisabled,
      buildPayload,
      autoSave,
    }),
    [appointmentId, patientId, token, autoSave, buildPayload, setField, setFamilyHistoryStructured, setSocialHistoryStructured, setPastSurgicalHistoryStructured, focusExamSystemRequest, requestFocusExamSystem, state, submitDisabled],
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

/** Appointment `consultation_type` from RX form state (tc-01). */
export function useConsultationType(): string | null {
  return useRxForm().state.consultationType;
}

/** True when the visit is a teleconsult (not `in_clinic`) — tc-01 / TC-D6. */
export function useIsTeleconsult(): boolean {
  return isTeleconsult(useConsultationType());
}

export { isTeleconsult };
