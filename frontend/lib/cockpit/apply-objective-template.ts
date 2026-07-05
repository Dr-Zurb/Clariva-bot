/**
 * Apply / save objective-only Rx templates (obj-17).
 *
 * Pure form-state engine — apply dispatches reducer actions only (no server
 * chart writes, no doctor_settings layout writes). Mirrors
 * `apply-subjective-template.ts` discipline.
 */

import type { RxFormAction, RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import {
  hasCustomSubsectionsContent,
  sanitizeCustomSubsectionForStorage,
  serializeCustomSubsectionsForPayload,
  type CustomSubsection,
} from "@/lib/cockpit/custom-subsections";
import { resolveExamSystem } from "@/lib/cockpit/exam-schema";
import { normalizeExamFindingEntries } from "@/lib/cockpit/exam-finding-utils";
import { resolvePrimaryBpForPayload } from "@/lib/cockpit/bp-readings";
import { normalizeTestResults } from "@/lib/cockpit/test-results";
import type {
  CreateRxTemplatePayload,
  DoctorRxTemplate,
  RxTemplateObjective,
  RxTemplateScope,
} from "@/types/rx-template";
import type { ExamSystemFinding, TestResultRow, TestResultSource } from "@/types/prescription";

/** Objective scopes wired through the form-state template engine (obj-17 / obj-23). */
export type FormStateObjectiveTemplateScope = Extract<
  RxTemplateScope,
  | "vitals"
  | "exam_systemic"
  | "exam_general"
  | "exam_cvs"
  | "exam_resp"
  | "exam_abd"
  | "exam_cns"
  | "test_results"
  | "point_of_care"
  | "objective_custom_block"
  | "objective_full"
>;

export const FORM_STATE_OBJECTIVE_TEMPLATE_SCOPES: FormStateObjectiveTemplateScope[] = [
  "vitals",
  "exam_systemic",
  "exam_general",
  "exam_cvs",
  "exam_resp",
  "exam_abd",
  "exam_cns",
  "test_results",
  "point_of_care",
  "objective_custom_block",
  "objective_full",
];

/** obj-23: the two RESULT scopes map 1:1 to a `test_results_json` row source. */
type ResultTemplateScope = Extract<
  FormStateObjectiveTemplateScope,
  "test_results" | "point_of_care"
>;

const RESULT_SCOPE_TO_SOURCE: Record<ResultTemplateScope, TestResultSource> = {
  test_results: "patient_report",
  point_of_care: "in_clinic_poc",
};

function isResultScope(scope: FormStateObjectiveTemplateScope): scope is ResultTemplateScope {
  return scope === "test_results" || scope === "point_of_care";
}

/** Normalized result rows for one source, in entry order. */
function resultRowsForSource(rows: TestResultRow[], source: TestResultSource): TestResultRow[] {
  return normalizeTestResults(rows).filter((row) => row.source === source);
}

/**
 * Normalize a preset's result rows for apply. Ids are preserved (not re-minted)
 * so apply-vs-hand stays byte-identical through `buildRxPayload` (OBJ-D2): a
 * scoped apply replaces only its own source's rows and `objective_full` replaces
 * the whole set, so preserved ids never accumulate or collide.
 */
function applyTemplateResultRows(rows: TestResultRow[] | undefined): TestResultRow[] {
  return normalizeTestResults(rows);
}

/**
 * Merge a result scope's applied rows onto the current form: drop the scope's own
 * source rows, keep the other source's rows, then append the freshly-id'd preset
 * rows. With no `fields` (no current form) it falls back to a plain replace.
 */
function mergeResultRowsForSource(
  fields: RxFormFields | undefined,
  source: TestResultSource,
  appliedRows: TestResultRow[],
): TestResultRow[] {
  const existingOtherSource = fields
    ? normalizeTestResults(fields.testResultsStructured).filter((row) => row.source !== source)
    : [];
  return [...existingOtherSource, ...appliedRows];
}

type PerSystemExamScope = Extract<
  FormStateObjectiveTemplateScope,
  "exam_general" | "exam_cvs" | "exam_resp" | "exam_abd" | "exam_cns"
>;

const PER_SYSTEM_EXAM_SCOPE_TO_SYSTEM_ID: Record<PerSystemExamScope, string> = {
  exam_general: "general",
  exam_cvs: "cvs",
  exam_resp: "resp",
  exam_abd: "abd",
  exam_cns: "cns",
};

const VITALS_FORM_KEYS = [
  "vitalsBpSystolic",
  "vitalsBpDiastolic",
  "vitalsHr",
  "vitalsTempC",
  "vitalsSpo2",
  "vitalsWtKg",
  "vitalsHtCm",
  "vitalsRr",
  "vitalsPainScore",
  "vitalsGlucoseMgDl",
  "vitalsGcsTotal",
  "vitalsBpPosture",
  "vitalsBpLimb",
  "vitalsHeadCircumferenceCm",
  "vitalsMuacCm",
  "vitalsWaistCm",
] as const satisfies readonly (keyof RxFormFields)[];

type VitalsFormKey = (typeof VITALS_FORM_KEYS)[number];

function isPerSystemExamScope(scope: FormStateObjectiveTemplateScope): scope is PerSystemExamScope {
  return scope in PER_SYSTEM_EXAM_SCOPE_TO_SYSTEM_ID;
}

export function templateObjective(template: DoctorRxTemplate): RxTemplateObjective {
  return template.objective_json ?? {};
}

function findExamFinding(
  findings: ExamSystemFinding[],
  systemId: string,
): ExamSystemFinding | undefined {
  return findings.find((f) => f.systemId === systemId);
}

function normalizeExamFindingForPayload(finding: ExamSystemFinding): ExamSystemFinding {
  return {
    systemId: finding.systemId.trim(),
    status: finding.status,
    findings: normalizeExamFindingEntries(finding.findings as unknown[]),
    notes: finding.notes?.trim() || null,
  };
}

function pickVitalsFromFields(fields: RxFormFields): RxTemplateObjective {
  const primaryBp = resolvePrimaryBpForPayload(fields);
  return {
    vitalsBpSystolic: primaryBp.systolic,
    vitalsBpDiastolic: primaryBp.diastolic,
    vitalsHr: fields.vitalsHr,
    vitalsTempC: fields.vitalsTempC,
    vitalsSpo2: fields.vitalsSpo2,
    vitalsWtKg: fields.vitalsWtKg,
    vitalsHtCm: fields.vitalsHtCm,
    vitalsRr: fields.vitalsRr,
    vitalsPainScore: fields.vitalsPainScore,
    vitalsGlucoseMgDl: fields.vitalsGlucoseMgDl,
    vitalsGcsTotal: fields.vitalsGcsTotal,
    vitalsBpPosture: primaryBp.posture,
    vitalsBpLimb: primaryBp.limb,
    vitalsHeadCircumferenceCm: fields.vitalsHeadCircumferenceCm,
    vitalsMuacCm: fields.vitalsMuacCm,
    vitalsWaistCm: fields.vitalsWaistCm,
  };
}

function vitalsHasContent(fields: RxFormFields): boolean {
  return VITALS_FORM_KEYS.some((key) => fields[key] != null);
}

function examFindingsHaveContent(findings: ExamSystemFinding[]): boolean {
  return findings.length > 0;
}

export function objectiveCustomBlockSectionHasContent(section: CustomSubsection): boolean {
  if (section.body?.trim()) return true;
  return (section.children ?? []).some((child) => child.title.trim() || child.body?.trim());
}

export function templateHasObjectiveContent(template: DoctorRxTemplate): boolean {
  const objective = templateObjective(template);
  if (vitalsObjectiveHasContent(objective)) return true;
  if ((objective.examinationJson ?? []).length > 0) return true;
  if (objective.testResults?.trim()) return true;
  if (normalizeTestResults(objective.testResultsJson).length > 0) return true;
  if (hasCustomSubsectionsContent(objective.customSections ?? [])) return true;
  return false;
}

export function rxFormHasObjectiveContent(fields: RxFormFields): boolean {
  if (vitalsHasContent(fields)) return true;
  if (examFindingsHaveContent(fields.examFindings)) return true;
  if (fields.testResults.trim()) return true;
  if (normalizeTestResults(fields.testResultsStructured).length > 0) return true;
  if (hasCustomSubsectionsContent(fields.objectiveCustomSections)) return true;
  return false;
}

function vitalsObjectiveHasContent(objective: RxTemplateObjective): boolean {
  return VITALS_FORM_KEYS.some((key) => objective[key] != null);
}

export function objectiveScopeHasContent(
  scope: FormStateObjectiveTemplateScope,
  fields: RxFormFields,
  options?: { sectionId?: string },
): boolean {
  switch (scope) {
    case "vitals":
      return vitalsHasContent(fields);
    case "exam_systemic":
      return examFindingsHaveContent(fields.examFindings);
    case "exam_general":
    case "exam_cvs":
    case "exam_resp":
    case "exam_abd":
    case "exam_cns":
      return findExamFinding(fields.examFindings, PER_SYSTEM_EXAM_SCOPE_TO_SYSTEM_ID[scope]) != null;
    case "test_results":
    case "point_of_care":
      return (
        resultRowsForSource(fields.testResultsStructured, RESULT_SCOPE_TO_SOURCE[scope]).length > 0
      );
    case "objective_custom_block": {
      const sectionId = options?.sectionId;
      if (!sectionId) return false;
      const section = fields.objectiveCustomSections.find((s) => s.id === sectionId);
      return section != null && objectiveCustomBlockSectionHasContent(section);
    }
    case "objective_full":
      return rxFormHasObjectiveContent(fields);
  }
}

export function buildObjectiveTemplateSavePayload(
  scope: FormStateObjectiveTemplateScope,
  fields: RxFormFields,
  options?: { sectionId?: string },
): Pick<CreateRxTemplatePayload, "objective" | "medicines" | "scope"> {
  const full = buildFullObjectiveTemplateSavePayload(fields);

  switch (scope) {
    case "vitals":
      return { scope, medicines: [], objective: pickVitalsFromFields(fields) };
    case "exam_systemic":
      return {
        scope,
        medicines: [],
        objective: {
          examinationJson: fields.examFindings.map(normalizeExamFindingForPayload),
        },
      };
    case "exam_general":
    case "exam_cvs":
    case "exam_resp":
    case "exam_abd":
    case "exam_cns": {
      const systemId = PER_SYSTEM_EXAM_SCOPE_TO_SYSTEM_ID[scope];
      const finding = findExamFinding(fields.examFindings, systemId);
      return {
        scope,
        medicines: [],
        objective: {
          examinationJson: finding ? [normalizeExamFindingForPayload(finding)] : [],
        },
      };
    }
    case "test_results":
    case "point_of_care":
      return {
        scope,
        medicines: [],
        objective: {
          testResultsJson: resultRowsForSource(
            fields.testResultsStructured,
            RESULT_SCOPE_TO_SOURCE[scope],
          ),
        },
      };
    case "objective_custom_block": {
      const sectionId = options?.sectionId;
      if (!sectionId) {
        return { scope, medicines: [], objective: {} };
      }
      const payload = buildObjectiveCustomBlockTemplateSavePayload(sectionId, fields);
      return payload ?? { scope, medicines: [], objective: {} };
    }
    case "objective_full":
      return full;
  }
}

export function buildFullObjectiveTemplateSavePayload(
  fields: RxFormFields,
): Pick<CreateRxTemplatePayload, "objective" | "medicines" | "scope"> {
  const objective: RxTemplateObjective = {
    ...pickVitalsFromFields(fields),
    examinationJson: fields.examFindings.map(normalizeExamFindingForPayload),
    testResults: fields.testResults.trim() || null,
    testResultsJson: normalizeTestResults(fields.testResultsStructured),
  };

  const customSnapshots = serializeCustomSubsectionsForPayload(fields.objectiveCustomSections);
  if (customSnapshots.length > 0) {
    objective.customSections = customSnapshots;
  }

  return {
    scope: "objective_full",
    medicines: [],
    objective,
  };
}

function buildVitalsApplyActions(objective: RxTemplateObjective): RxFormAction[] {
  const actions: RxFormAction[] = [];
  for (const key of VITALS_FORM_KEYS) {
    actions.push({ type: "SET_FIELD", key, value: objective[key] ?? null });
  }
  actions.push({
    type: "SET_FIELD",
    key: "vitalsBpReadings",
    value: [
      {
        systolic: objective.vitalsBpSystolic ?? null,
        diastolic: objective.vitalsBpDiastolic ?? null,
        posture: objective.vitalsBpPosture ?? null,
        limb: objective.vitalsBpLimb ?? null,
        sequenceLabel: null,
      },
    ],
  });
  return actions;
}

function buildExamSystemApplyAction(finding: ExamSystemFinding): RxFormAction {
  return {
    type: "SET_EXAM_SYSTEM",
    systemId: finding.systemId,
    status: finding.status,
    findings: finding.findings ?? [],
    notes: finding.notes ?? null,
  };
}

export function buildObjectiveTemplateApplyActions(
  scope: FormStateObjectiveTemplateScope,
  template: DoctorRxTemplate,
  fields?: RxFormFields,
  options?: { sectionId?: string },
): RxFormAction[] {
  const objective = templateObjective(template);

  switch (scope) {
    case "vitals":
      return buildVitalsApplyActions(objective);
    case "exam_systemic":
      return [
        {
          type: "SET_EXAM_FINDINGS",
          examFindings: (objective.examinationJson ?? []).map(normalizeExamFindingForPayload),
        },
      ];
    case "exam_general":
    case "exam_cvs":
    case "exam_resp":
    case "exam_abd":
    case "exam_cns": {
      const systemId = PER_SYSTEM_EXAM_SCOPE_TO_SYSTEM_ID[scope];
      const finding = findExamFinding(objective.examinationJson ?? [], systemId);
      return finding ? [buildExamSystemApplyAction(finding)] : [];
    }
    case "test_results":
    case "point_of_care": {
      const source = RESULT_SCOPE_TO_SOURCE[scope];
      const applied = applyTemplateResultRows(objective.testResultsJson).filter(
        (row) => row.source === source,
      );
      return [
        {
          type: "SET_TEST_RESULTS",
          testResults: mergeResultRowsForSource(fields, source, applied),
        },
      ];
    }
    case "objective_custom_block": {
      const sectionId = options?.sectionId;
      if (!sectionId || !fields) return [];
      return buildObjectiveCustomBlockTemplateApplyActions(sectionId, template, fields);
    }
    case "objective_full": {
      const actions: RxFormAction[] = [
        ...buildVitalsApplyActions(objective),
        {
          type: "SET_EXAM_FINDINGS",
          examFindings: (objective.examinationJson ?? []).map(normalizeExamFindingForPayload),
        },
        { type: "SET_FIELD", key: "testResults", value: objective.testResults?.trim() ?? "" },
        // obj-23: whole-objective bundle replaces the structured result set too
        // (mirrors SET_EXAM_FINDINGS' full replace). Empty preset clears the rows.
        { type: "SET_TEST_RESULTS", testResults: applyTemplateResultRows(objective.testResultsJson) },
      ];
      if (fields) {
        actions.push(
          ...buildFullObjectiveCustomSectionsApplyActions(objective.customSections, fields),
        );
      }
      return actions;
    }
  }
}

/** First well-formed custom section carried by an `objective_custom_block` template. */
export function templateObjectiveCustomBlockSection(
  template: DoctorRxTemplate,
): CustomSubsection | null {
  const sections = templateObjective(template).customSections ?? [];
  const titled = sections.find(
    (section) => typeof section?.title === "string" && section.title.trim(),
  );
  return titled ?? sections[0] ?? null;
}

/** Stable id stamped on an `objective_custom_block` template's primary section. */
export function templateObjectiveCustomBlockSourceSectionId(
  template: DoctorRxTemplate,
): string | null {
  const section = templateObjectiveCustomBlockSection(template);
  return typeof section?.id === "string" && section.id.trim() ? section.id : null;
}

export function buildObjectiveCustomBlockTemplateSavePayload(
  sectionId: string,
  fields: RxFormFields,
): Pick<CreateRxTemplatePayload, "objective" | "medicines" | "scope"> | null {
  const section = fields.objectiveCustomSections.find((s) => s.id === sectionId);
  if (!section || !objectiveCustomBlockSectionHasContent(section)) return null;

  const snapshot = sanitizeCustomSubsectionForStorage(section);
  return {
    scope: "objective_custom_block",
    medicines: [],
    objective: { customSections: [snapshot] },
  };
}

export function buildObjectiveCustomBlockTemplateApplyActions(
  targetSectionId: string,
  template: DoctorRxTemplate,
  fields: RxFormFields,
): RxFormAction[] {
  const source = templateObjectiveCustomBlockSection(template);
  if (!source || !objectiveCustomBlockSectionHasContent(source)) return [];

  const body = source.body ?? null;
  const children = (source.children ?? []).map((child) => ({
    id: child.id,
    title: child.title,
    body: child.body ?? null,
  }));

  const targetIndex = fields.objectiveCustomSections.findIndex(
    (section) => section.id === targetSectionId,
  );
  if (targetIndex >= 0) {
    const patch: Partial<CustomSubsection> = { body, children };
    if (source.id === targetSectionId) {
      patch.title = source.title;
    }
    return [{ type: "UPDATE_OBJECTIVE_CUSTOM_SECTION", index: targetIndex, patch }];
  }

  return [
    {
      type: "ADD_OBJECTIVE_CUSTOM_SECTION",
      section: {
        id: source.id,
        title: source.title,
        body,
        children,
      },
    },
  ];
}

export function buildFullObjectiveCustomSectionsApplyActions(
  templateSections: CustomSubsection[] | undefined,
  fields: RxFormFields,
): RxFormAction[] {
  if (!templateSections?.length) return [];

  const actions: RxFormAction[] = [];
  let working = [...fields.objectiveCustomSections];

  for (const raw of templateSections) {
    if (!raw || typeof raw.id !== "string" || !raw.id.trim()) continue;
    if (typeof raw.title !== "string" || !raw.title.trim()) continue;

    const section = sanitizeCustomSubsectionForStorage({
      id: raw.id,
      title: raw.title,
      body: raw.body ?? null,
      children: (raw.children ?? []).map((child) => ({
        id: child.id,
        title: child.title ?? "",
        body: child.body ?? null,
      })),
    });

    const index = working.findIndex((existing) => existing.id === section.id);
    if (index >= 0) {
      actions.push({
        type: "UPDATE_OBJECTIVE_CUSTOM_SECTION",
        index,
        patch: {
          title: section.title,
          body: section.body,
          children: section.children,
        },
      });
      working[index] = { ...working[index]!, ...section };
    } else {
      actions.push({ type: "ADD_OBJECTIVE_CUSTOM_SECTION", section });
      working.push(section);
    }
  }

  return actions;
}

export function templateObjectiveScopeHasContent(
  template: DoctorRxTemplate,
  scope: FormStateObjectiveTemplateScope,
): boolean {
  const objective = templateObjective(template);

  switch (scope) {
    case "vitals":
      return vitalsObjectiveHasContent(objective);
    case "exam_systemic":
      return (objective.examinationJson ?? []).length > 0;
    case "exam_general":
    case "exam_cvs":
    case "exam_resp":
    case "exam_abd":
    case "exam_cns":
      return (
        findExamFinding(
          objective.examinationJson ?? [],
          PER_SYSTEM_EXAM_SCOPE_TO_SYSTEM_ID[scope],
        ) != null
      );
    case "test_results":
    case "point_of_care":
      return (
        resultRowsForSource(objective.testResultsJson ?? [], RESULT_SCOPE_TO_SOURCE[scope]).length >
        0
      );
    case "objective_custom_block":
      return hasCustomSubsectionsContent(objective.customSections ?? []);
    case "objective_full":
      return templateHasObjectiveContent(template);
  }
}

export function defaultObjectiveSaveName(
  scope: FormStateObjectiveTemplateScope,
  fields: RxFormFields,
  options?: { sectionId?: string; sectionTitle?: string },
): string {
  switch (scope) {
    case "vitals":
      if (fields.vitalsBpSystolic != null && fields.vitalsBpDiastolic != null) {
        return `${fields.vitalsBpSystolic}/${fields.vitalsBpDiastolic}`;
      }
      if (fields.vitalsHr != null) return `HR ${fields.vitalsHr}`;
      return "Vitals";
    case "exam_systemic":
      return "Structured exam";
    case "exam_general":
    case "exam_cvs":
    case "exam_resp":
    case "exam_abd":
    case "exam_cns":
      return resolveExamSystem(PER_SYSTEM_EXAM_SCOPE_TO_SYSTEM_ID[scope]).label;
    case "test_results": {
      const [first] = resultRowsForSource(fields.testResultsStructured, "patient_report");
      return first?.name ?? "Patient-brought results";
    }
    case "point_of_care": {
      const [first] = resultRowsForSource(fields.testResultsStructured, "in_clinic_poc");
      return first?.name ?? "Point-of-care results";
    }
    case "objective_custom_block":
      return options?.sectionTitle?.trim() || "Custom section";
    case "objective_full":
      return "Objective bundle";
  }
}
