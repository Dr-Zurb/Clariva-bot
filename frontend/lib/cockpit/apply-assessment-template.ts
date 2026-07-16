/**
 * Save / apply helpers for Assessment section + whole-tab templates.
 * Form-state scopes: diagnoses | assessment_notes | assessment_full.
 * Chart-backed scope: known_conditions (assessment_json.knownConditions).
 */

import type {
  RxFormAction,
  RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { normalizeDiagnoses } from "@/lib/cockpit/diagnoses";
import { knownConditionsTemplateHasContent } from "@/lib/chart/use-known-conditions-template-apply";
import type { CustomSubsection } from "@/lib/cockpit/custom-subsections";
import type {
  CreateRxTemplatePayload,
  DoctorRxTemplate,
  RxTemplateAssessment,
  RxTemplateKnownCondition,
  RxTemplateScope,
} from "@/types/rx-template";
import type { DiagnosisRow } from "@/types/prescription";

export type AssessmentTemplateScope = Extract<
  RxTemplateScope,
  "diagnoses" | "assessment_notes" | "assessment_full" | "known_conditions"
>;

export const ASSESSMENT_TEMPLATE_SCOPES: AssessmentTemplateScope[] = [
  "diagnoses",
  "assessment_notes",
  "known_conditions",
  "assessment_full",
];

export const ASSESSMENT_SECTION_TEMPLATE_SCOPES: Exclude<
  AssessmentTemplateScope,
  "assessment_full"
>[] = ["diagnoses", "assessment_notes", "known_conditions"];

function trimOrEmpty(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

function templateAssessment(template: DoctorRxTemplate): RxTemplateAssessment {
  return template.assessment_json ?? {};
}

/** Strip chart links and mint fresh ids for apply-into-form. */
function diagnosesForApply(rows: DiagnosisRow[] | undefined): DiagnosisRow[] {
  return normalizeDiagnoses(rows).map((row) => ({
    ...row,
    id: crypto.randomUUID(),
    conditionId: null,
  }));
}

/** Persistable diagnoses snapshot — drop chart condition links. */
function diagnosesForSave(rows: DiagnosisRow[]): DiagnosisRow[] {
  return normalizeDiagnoses(rows).map((row) => ({
    ...row,
    conditionId: null,
  }));
}

export function diagnosesScopeHasContent(
  fields: Pick<RxFormFields, "diagnoses">,
): boolean {
  return normalizeDiagnoses(fields.diagnoses).length > 0;
}

export function assessmentNotesScopeHasContent(
  fields: Pick<RxFormFields, "assessmentNote" | "assessmentAcuity">,
): boolean {
  return Boolean(fields.assessmentNote.trim() || fields.assessmentAcuity != null);
}

export function assessmentScopeHasContent(
  scope: AssessmentTemplateScope,
  fields: RxFormFields,
  knownConditions?: RxTemplateKnownCondition[] | null,
): boolean {
  switch (scope) {
    case "diagnoses":
      return diagnosesScopeHasContent(fields);
    case "assessment_notes":
      return assessmentNotesScopeHasContent(fields);
    case "known_conditions":
      return (knownConditions ?? []).some((c) => c.condition.trim());
    case "assessment_full":
      return (
        diagnosesScopeHasContent(fields) ||
        assessmentNotesScopeHasContent(fields) ||
        (knownConditions ?? []).some((c) => c.condition.trim())
      );
  }
}

export function templateAssessmentScopeHasContent(
  template: DoctorRxTemplate,
  scope: AssessmentTemplateScope,
): boolean {
  const assessment = templateAssessment(template);
  switch (scope) {
    case "diagnoses":
      return normalizeDiagnoses(assessment.diagnoses).length > 0;
    case "assessment_notes":
      return Boolean(
        trimOrEmpty(assessment.assessmentNote) || assessment.assessmentAcuity != null,
      );
    case "known_conditions":
      return knownConditionsTemplateHasContent(template);
    case "assessment_full":
      return (
        templateAssessmentScopeHasContent(template, "diagnoses") ||
        templateAssessmentScopeHasContent(template, "assessment_notes") ||
        templateAssessmentScopeHasContent(template, "known_conditions")
      );
  }
}

function buildDiagnosesAssessment(
  fields: Pick<RxFormFields, "diagnoses">,
): RxTemplateAssessment {
  return { diagnoses: diagnosesForSave(fields.diagnoses) };
}

function buildNotesAssessment(
  fields: Pick<RxFormFields, "assessmentNote" | "assessmentAcuity">,
): RxTemplateAssessment {
  return {
    assessmentNote: fields.assessmentNote.trim() || null,
    assessmentAcuity: fields.assessmentAcuity,
  };
}

function buildKnownConditionsAssessment(
  knownConditions: RxTemplateKnownCondition[],
): RxTemplateAssessment {
  return { knownConditions };
}

function buildFullAssessment(
  fields: RxFormFields,
  knownConditions?: RxTemplateKnownCondition[] | null,
): RxTemplateAssessment {
  return {
    ...buildDiagnosesAssessment(fields),
    ...buildNotesAssessment(fields),
    ...((knownConditions?.length ?? 0) > 0
      ? buildKnownConditionsAssessment(knownConditions!)
      : {}),
  };
}

export function buildAssessmentTemplateSavePayload(
  scope: AssessmentTemplateScope,
  fields: RxFormFields,
  knownConditions?: RxTemplateKnownCondition[] | null,
): Omit<CreateRxTemplatePayload, "name"> {
  switch (scope) {
    case "diagnoses":
      return { scope, assessment: buildDiagnosesAssessment(fields), medicines: [] };
    case "assessment_notes":
      return { scope, assessment: buildNotesAssessment(fields), medicines: [] };
    case "known_conditions":
      return {
        scope,
        assessment: buildKnownConditionsAssessment(knownConditions ?? []),
        medicines: [],
      };
    case "assessment_full":
      return {
        scope,
        assessment: buildFullAssessment(fields, knownConditions),
        medicines: [],
      };
  }
}

export function defaultAssessmentSaveName(
  scope: AssessmentTemplateScope,
  fields: RxFormFields,
  knownConditions?: RxTemplateKnownCondition[] | null,
): string {
  switch (scope) {
    case "diagnoses": {
      const rows = normalizeDiagnoses(fields.diagnoses);
      if (rows.length === 1) {
        const label = rows[0]!.label.trim();
        return label.length > 40 ? `${label.slice(0, 37)}…` : label;
      }
      if (rows.length > 1) return `Diagnoses (${rows.length})`;
      return "Diagnoses";
    }
    case "assessment_notes": {
      const t = fields.assessmentNote.trim();
      if (!t) return "Assessment notes";
      return t.length > 40 ? `${t.slice(0, 37)}…` : t;
    }
    case "known_conditions": {
      const rows = knownConditions ?? [];
      if (rows.length === 1) {
        const label = rows[0]!.condition.trim();
        return label.length > 40 ? `${label.slice(0, 37)}…` : label;
      }
      if (rows.length > 1) return `Known conditions (${rows.length})`;
      return "Known conditions";
    }
    case "assessment_full":
      return "Assessment";
  }
}

function setFieldAction<K extends keyof RxFormFields>(
  key: K,
  value: RxFormFields[K],
): RxFormAction {
  return { type: "SET_FIELD", key, value };
}

/**
 * Apply form-state actions for an Assessment scope.
 * `known_conditions` is chart-backed — no form actions (caller applies chart).
 */
export function buildAssessmentTemplateApplyActions(
  scope: AssessmentTemplateScope,
  template: DoctorRxTemplate,
): RxFormAction[] {
  const assessment = templateAssessment(template);
  const actions: RxFormAction[] = [];

  const applyDiagnoses = () => {
    if (assessment.diagnoses !== undefined) {
      actions.push({
        type: "SET_DIAGNOSES",
        diagnoses: diagnosesForApply(assessment.diagnoses),
      });
    }
  };
  const applyNotes = () => {
    if (assessment.assessmentNote !== undefined) {
      actions.push(
        setFieldAction("assessmentNote", assessment.assessmentNote ?? ""),
      );
    }
    if (assessment.assessmentAcuity !== undefined) {
      actions.push(
        setFieldAction("assessmentAcuity", assessment.assessmentAcuity ?? null),
      );
    }
  };

  switch (scope) {
    case "diagnoses":
      applyDiagnoses();
      break;
    case "assessment_notes":
      applyNotes();
      break;
    case "known_conditions":
      break;
    case "assessment_full":
      applyDiagnoses();
      applyNotes();
      break;
  }

  return actions;
}

export const SAVE_EMPTY_MESSAGES: Record<AssessmentTemplateScope, string> = {
  diagnoses: "Add diagnoses before saving a template.",
  assessment_notes: "Add assessment notes before saving a template.",
  known_conditions: "Add known conditions before saving a template.",
  assessment_full: "Add assessment content before saving a template.",
};

export const SAVE_PROMPT_LABELS: Record<AssessmentTemplateScope, string> = {
  diagnoses: "Save current diagnoses as template",
  assessment_notes: "Save current assessment notes as template",
  known_conditions: "Save current known conditions as template",
  assessment_full: "Save current assessment as template",
};

function assessmentCustomSectionHasVisitBody(section: CustomSubsection): boolean {
  if (section.body?.trim()) return true;
  return (section.children ?? []).some((child) => Boolean(child.body?.trim()));
}

export function rxFormHasClearableAssessmentContent(fields: RxFormFields): boolean {
  if (assessmentScopeHasContent("assessment_full", fields)) return true;
  // assessment-plan-custom-sections: clear-all also wipes custom visit bodies.
  return fields.assessmentCustomSections.some(assessmentCustomSectionHasVisitBody);
}

/** Strip visit bodies; keep custom section titles / child titles (mirrors subjective). */
function clearAssessmentCustomSectionVisitBodies(
  sections: readonly CustomSubsection[],
): CustomSubsection[] {
  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    body: null,
    children: (section.children ?? []).map((child) => ({
      id: child.id,
      title: child.title,
      body: null,
    })),
  }));
}

/**
 * Reducer actions that empty Assessment form fields (diagnoses, notes, acuity,
 * custom section visit bodies). Does NOT wipe chart Known conditions
 * (chart-backed like Subjective PMH) nor custom section structure/titles.
 */
export function buildAssessmentClearAllActions(
  fields: RxFormFields,
): RxFormAction[] {
  const actions: RxFormAction[] = [
    { type: "SET_DIAGNOSES", diagnoses: [] },
    { type: "SET_FIELD", key: "assessmentNote", value: "" },
    { type: "SET_FIELD", key: "assessmentAcuity", value: null },
  ];
  if (fields.assessmentCustomSections.length > 0) {
    actions.push({
      type: "SET_ASSESSMENT_CUSTOM_SECTIONS",
      sections: clearAssessmentCustomSectionVisitBodies(fields.assessmentCustomSections),
    });
  }
  return actions;
}
