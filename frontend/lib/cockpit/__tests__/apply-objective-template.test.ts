/**
 * obj-17 — scoped objective template save/apply + derived-text parity.
 */

import { describe, expect, it } from "vitest";
import {
  buildObjectiveClearAllActions,
  buildObjectiveCustomBlockTemplateApplyActions,
  buildObjectiveCustomBlockTemplateSavePayload,
  buildObjectiveTemplateApplyActions,
  buildObjectiveTemplateSavePayload,
  objectiveCustomBlockSectionHasContent,
  objectiveScopeHasContent,
  rxFormHasClearableObjectiveContent,
  templateHasObjectiveContent,
  templateObjectiveScopeHasContent,
} from "@/lib/cockpit/apply-objective-template";
import type { DoctorRxTemplate } from "@/types/rx-template";
import {
  buildRxPayload,
  createEmptyRxFormFields,
  rxFormReducer,
  type ExamSystemFinding,
  type RxFormState,
} from "@/components/cockpit/rx/RxFormContext";
import type { CustomSubsection, TestResultRow } from "@/types/prescription";

function makeTemplate(overrides: Partial<DoctorRxTemplate> = {}): DoctorRxTemplate {
  return {
    id: "tpl-obj-1",
    doctor_id: "doc-1",
    name: "Baseline vitals",
    description: null,
    cc: null,
    hopi: null,
    provisional_diagnosis: null,
    investigations: null,
    follow_up: null,
    patient_education: null,
    clinical_notes: null,
    medicines_json: [],
    subjective_json: {},
    objective_json: {},
    plan_json: {},
    assessment_json: {},
    pmh_json: {},
    allergies_json: {},
    scope: "objective_full",
    use_count: 0,
    last_used_at: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const CVS_FINDING: ExamSystemFinding = {
  systemId: "cvs",
  status: "abnormal",
  findings: [
    {
      findingId: "murmur",
      attributes: { timing: "Systolic", grade: "3/6", area: "Mitral" },
    },
  ],
  notes: "grade 3/6",
};

const RESPIRATORY_FINDING: ExamSystemFinding = {
  systemId: "resp",
  status: "abnormal",
  findings: [{ findingId: "wheeze", attributes: {} }],
  notes: null,
};

const emptyFields = () => createEmptyRxFormFields();

function baseState(fields = emptyFields()): RxFormState {
  return {
    fields,
    isDirty: false,
    isSaving: false,
    isSubmitting: false,
    lastSavedAt: null,
    saveError: null,
    submitError: null,
  };
}

function applyActions(fields: ReturnType<typeof createEmptyRxFormFields>, actions: ReturnType<typeof buildObjectiveTemplateApplyActions>) {
  let state = baseState(fields);
  for (const action of actions) {
    state = rxFormReducer(state, action);
  }
  return state.fields;
}

describe("apply-objective-template (obj-17)", () => {
  it("objectiveScopeHasContent gates per scope", () => {
    const fields = emptyFields();
    expect(objectiveScopeHasContent("vitals", fields)).toBe(false);
    expect(objectiveScopeHasContent("exam_systemic", fields)).toBe(false);

    fields.vitalsHr = 72;
    expect(objectiveScopeHasContent("vitals", fields)).toBe(true);
    expect(objectiveScopeHasContent("exam_systemic", fields)).toBe(false);

    fields.examFindings = [CVS_FINDING];
    expect(objectiveScopeHasContent("exam_systemic", fields)).toBe(true);
    expect(objectiveScopeHasContent("exam_cvs", fields)).toBe(true);
    expect(objectiveScopeHasContent("exam_resp", fields)).toBe(false);
  });

  it("vitals save captures only the vitals subset", () => {
    const fields = emptyFields();
    fields.vitalsHr = 72;
    fields.vitalsBpSystolic = 120;
    fields.vitalsBpDiastolic = 80;
    fields.examFindings = [CVS_FINDING];
    fields.testResults = "ECG normal";

    const payload = buildObjectiveTemplateSavePayload("vitals", fields);
    expect(payload.scope).toBe("vitals");
    expect(payload.objective?.vitalsHr).toBe(72);
    expect(payload.objective?.examinationJson).toBeUndefined();
    expect(payload.objective?.testResults).toBeUndefined();
  });

  it("exam_additional_notes save/apply round-trips notes-only finding", () => {
    const fields = emptyFields();
    fields.examFindings = [
      {
        systemId: "additional_notes",
        status: "abnormal",
        findings: [],
        notes: "Deferred fundoscopy",
      },
    ];
    expect(objectiveScopeHasContent("exam_additional_notes", fields)).toBe(true);
    const payload = buildObjectiveTemplateSavePayload("exam_additional_notes", fields);
    expect(payload.scope).toBe("exam_additional_notes");
    expect(payload.objective?.examinationJson).toEqual([
      {
        systemId: "additional_notes",
        status: "abnormal",
        findings: [],
        notes: "Deferred fundoscopy",
      },
    ]);

    const template = makeTemplate({
      scope: "exam_additional_notes",
      objective_json: payload.objective,
    });
    const applied = applyActions(
      emptyFields(),
      buildObjectiveTemplateApplyActions("exam_additional_notes", template),
    );
    expect(applied.examFindings).toEqual(payload.objective?.examinationJson);
  });

  it("exam_systemic save captures all exam findings", () => {
    const fields = emptyFields();
    fields.vitalsHr = 72;
    fields.examFindings = [CVS_FINDING, RESPIRATORY_FINDING];

    const payload = buildObjectiveTemplateSavePayload("exam_systemic", fields);
    expect(payload.scope).toBe("exam_systemic");
    expect(payload.objective?.examinationJson).toHaveLength(2);
    expect(payload.objective?.vitalsHr).toBeUndefined();
  });

  it("per-system save captures only that system entry", () => {
    const fields = emptyFields();
    fields.examFindings = [CVS_FINDING, RESPIRATORY_FINDING];

    const payload = buildObjectiveTemplateSavePayload("exam_cvs", fields);
    expect(payload.scope).toBe("exam_cvs");
    expect(payload.objective?.examinationJson).toEqual([
      {
        systemId: "cvs",
        status: "abnormal",
        findings: [
          {
            findingId: "murmur",
            attributes: { timing: "Systolic", grade: "3/6", area: "Mitral" },
          },
        ],
        notes: "grade 3/6",
      },
    ]);
  });

  it("vitals apply fills only vitals — exam + test results untouched", () => {
    const fields = emptyFields();
    fields.vitalsHr = 60;
    fields.examFindings = [CVS_FINDING];
    fields.testResults = "Keep me";

    const template = makeTemplate({
      scope: "vitals",
      objective_json: { vitalsHr: 88, vitalsBpSystolic: 110, vitalsBpDiastolic: 70 },
    });

    const next = applyActions(fields, buildObjectiveTemplateApplyActions("vitals", template));
    expect(next.vitalsHr).toBe(88);
    expect(next.vitalsBpSystolic).toBe(110);
    expect(next.examFindings).toEqual([CVS_FINDING]);
    expect(next.testResults).toBe("Keep me");
  });

  it("exam_systemic apply replaces structured exam only", () => {
    const fields = emptyFields();
    fields.vitalsHr = 72;
    fields.examFindings = [CVS_FINDING];
    fields.testResults = "Labs";

    const template = makeTemplate({
      scope: "exam_systemic",
      objective_json: { examinationJson: [RESPIRATORY_FINDING] },
    });

    const next = applyActions(
      fields,
      buildObjectiveTemplateApplyActions("exam_systemic", template),
    );
    expect(next.vitalsHr).toBe(72);
    expect(next.testResults).toBe("Labs");
    expect(next.examFindings).toEqual([RESPIRATORY_FINDING]);
  });

  it("per-system apply upserts only that system entry", () => {
    const fields = emptyFields();
    fields.examFindings = [CVS_FINDING];

    const template = makeTemplate({
      scope: "exam_resp",
      objective_json: { examinationJson: [RESPIRATORY_FINDING] },
    });

    const next = applyActions(
      fields,
      buildObjectiveTemplateApplyActions("exam_resp", template),
    );
    expect(next.examFindings).toHaveLength(2);
    expect(next.examFindings.find((f) => f.systemId === "cvs")).toEqual(CVS_FINDING);
    expect(next.examFindings.find((f) => f.systemId === "resp")).toEqual(RESPIRATORY_FINDING);
  });

  it("apply → buildRxPayload derives identically to hand-entry (OBJ-D2)", () => {
    const handFields = emptyFields();
    handFields.examFindings = [CVS_FINDING, RESPIRATORY_FINDING];
    handFields.vitalsHr = 80;
    handFields.testResults = "ECG normal";

    const template = makeTemplate({
      scope: "objective_full",
      objective_json: {
        vitalsHr: 80,
        examinationJson: [CVS_FINDING, RESPIRATORY_FINDING],
        testResults: "ECG normal",
      },
    });

    const applied = applyActions(
      emptyFields(),
      buildObjectiveTemplateApplyActions("objective_full", template, emptyFields()),
    );

    expect(buildRxPayload(applied)).toEqual(buildRxPayload(handFields));
  });

  describe("objective custom block templates", () => {
    const sectionA: CustomSubsection = {
      id: "sec-a",
      title: "P/V notes",
      body: "Normal",
      children: [],
    };

    it("buildObjectiveCustomBlockTemplateSavePayload snapshots one section", () => {
      const fields = emptyFields();
      fields.objectiveCustomSections = [sectionA];

      const payload = buildObjectiveCustomBlockTemplateSavePayload("sec-a", fields);
      expect(payload).toEqual({
        scope: "objective_custom_block",
        medicines: [],
        objective: {
          customSections: [
            { id: "sec-a", title: "P/V notes", body: "Normal", children: [] },
          ],
        },
      });
    });

    it("apply overwrites the target custom section body", () => {
      const fields = emptyFields();
      fields.objectiveCustomSections = [{ ...sectionA, body: "Old", children: [] }];

      const template = makeTemplate({
        scope: "objective_custom_block",
        objective_json: {
          customSections: [
            {
              id: "sec-a",
              title: "P/V notes",
              body: "Updated",
              children: [{ id: "child-a", title: "Detail", body: "Clear" }],
            },
          ],
        },
      });

      const actions = buildObjectiveCustomBlockTemplateApplyActions("sec-a", template, fields);
      expect(actions).toEqual([
        {
          type: "UPDATE_OBJECTIVE_CUSTOM_SECTION",
          index: 0,
          patch: {
            title: "P/V notes",
            body: "Updated",
            children: [{ id: "child-a", title: "Detail", body: "Clear" }],
          },
        },
      ]);
    });

    it("objectiveCustomBlockSectionHasContent guards empty sections", () => {
      expect(objectiveCustomBlockSectionHasContent(sectionA)).toBe(true);
      expect(
        objectiveCustomBlockSectionHasContent({ id: "x", title: "X", body: null, children: [] }),
      ).toBe(false);
    });
  });

  it("template objective content helpers detect scoped payloads", () => {
    const template = makeTemplate({
      scope: "vitals",
      objective_json: { vitalsHr: 72 },
    });
    expect(templateHasObjectiveContent(template)).toBe(true);
    expect(templateObjectiveScopeHasContent(template, "vitals")).toBe(true);
    expect(templateObjectiveScopeHasContent(template, "exam_systemic")).toBe(false);
  });
});

describe("apply-objective-template result scopes (obj-23)", () => {
  const patientRow: TestResultRow = {
    id: "pr-1",
    source: "patient_report",
    name: "Hba1c",
    value: "7.2",
    unit: "%",
    date: null,
    interpretation: "high",
    notes: null,
  };
  const pocRow: TestResultRow = {
    id: "poc-1",
    source: "in_clinic_poc",
    name: "RBS",
    value: "180",
    unit: "mg/dL",
    date: null,
    interpretation: null,
    notes: null,
  };

  it("objectiveScopeHasContent gates Reports (all rows) vs legacy POC", () => {
    const fields = emptyFields();
    expect(objectiveScopeHasContent("test_results", fields)).toBe(false);
    expect(objectiveScopeHasContent("point_of_care", fields)).toBe(false);

    fields.testResultsStructured = [patientRow];
    expect(objectiveScopeHasContent("test_results", fields)).toBe(true);
    expect(objectiveScopeHasContent("point_of_care", fields)).toBe(false);

    fields.testResultsStructured = [pocRow];
    expect(objectiveScopeHasContent("test_results", fields)).toBe(true);
    expect(objectiveScopeHasContent("point_of_care", fields)).toBe(true);

    fields.testResultsStructured = [patientRow, pocRow];
    expect(objectiveScopeHasContent("point_of_care", fields)).toBe(true);
  });

  it("test_results save captures all structured rows (rpt-01)", () => {
    const fields = emptyFields();
    fields.testResultsStructured = [patientRow, pocRow];

    const payload = buildObjectiveTemplateSavePayload("test_results", fields);
    expect(payload.scope).toBe("test_results");
    expect(payload.objective?.testResultsJson).toHaveLength(2);
    expect(payload.objective?.testResultsJson?.map((r) => r.name).sort()).toEqual([
      "Hba1c",
      "RBS",
    ]);
    expect(payload.objective?.examinationJson).toBeUndefined();
  });

  it("point_of_care save captures only in_clinic_poc rows (legacy path)", () => {
    const fields = emptyFields();
    fields.testResultsStructured = [patientRow, pocRow];

    const payload = buildObjectiveTemplateSavePayload("point_of_care", fields);
    expect(payload.scope).toBe("point_of_care");
    expect(payload.objective?.testResultsJson).toHaveLength(1);
    expect(payload.objective?.testResultsJson?.[0]?.source).toBe("in_clinic_poc");
  });

  it("test_results apply replaces the whole structured set (rpt-01)", () => {
    const fields = emptyFields();
    fields.testResultsStructured = [pocRow, { ...patientRow, name: "Old report" }];

    const template = makeTemplate({
      scope: "test_results",
      objective_json: { testResultsJson: [patientRow] },
    });

    const next = applyActions(
      fields,
      buildObjectiveTemplateApplyActions("test_results", template, fields),
    );
    expect(next.testResultsStructured).toHaveLength(1);
    expect(next.testResultsStructured[0]?.name).toBe("Hba1c");
    expect(next.testResultsStructured[0]?.source).toBe("patient_report");
  });

  it("remapped point_of_care apply merges only POC rows (ids stable for OBJ-D2)", () => {
    const fields = emptyFields();
    fields.testResultsStructured = [patientRow];
    const template = makeTemplate({
      scope: "point_of_care",
      objective_json: { testResultsJson: [pocRow] },
    });
    const next = applyActions(
      fields,
      buildObjectiveTemplateApplyActions("point_of_care", template, fields),
    );
    expect(next.testResultsStructured.map((r) => r.source).sort()).toEqual([
      "in_clinic_poc",
      "patient_report",
    ]);
    expect(next.testResultsStructured.find((r) => r.source === "in_clinic_poc")?.name).toBe("RBS");
    expect(next.testResultsStructured.find((r) => r.source === "patient_report")?.name).toBe(
      "Hba1c",
    );
  });

  it("objective_full composes result rows and derives identically to hand-entry (OBJ-D2)", () => {
    const handFields = emptyFields();
    handFields.vitalsHr = 80;
    handFields.testResultsStructured = [patientRow, pocRow];

    const savePayload = buildObjectiveTemplateSavePayload("objective_full", handFields);
    expect(savePayload.objective?.testResultsJson).toHaveLength(2);

    const template = makeTemplate({
      scope: "objective_full",
      objective_json: {
        vitalsHr: 80,
        testResultsJson: [patientRow, pocRow],
      },
    });

    const applied = applyActions(
      emptyFields(),
      buildObjectiveTemplateApplyActions("objective_full", template, emptyFields()),
    );

    // Derived test_results text + structured rows match hand-entry (ids aside).
    expect(buildRxPayload(applied).testResults).toEqual(buildRxPayload(handFields).testResults);
    expect(buildRxPayload(applied).testResultsJson?.map((r) => r.name)).toEqual(
      buildRxPayload(handFields).testResultsJson?.map((r) => r.name),
    );
  });

  it("template result-scope content helpers detect scoped payloads", () => {
    const template = makeTemplate({
      scope: "point_of_care",
      objective_json: { testResultsJson: [pocRow] },
    });
    expect(templateHasObjectiveContent(template)).toBe(true);
    expect(templateObjectiveScopeHasContent(template, "point_of_care")).toBe(true);
    // rpt-01: Reports content check includes any structured rows (remap-on-read).
    expect(templateObjectiveScopeHasContent(template, "test_results")).toBe(true);
  });
});

describe("Objective clear-all (tab toolbar)", () => {
  it("clears vitals, exam, reports, and custom section bodies", () => {
    const fields = emptyFields();
    fields.vitalsHr = 88;
    fields.examFindings = [{ systemId: "general", status: "normal", findings: [], notes: null }];
    fields.testResults = "Hb 12";
    fields.testResultsStructured = [
      {
        id: "r1",
        name: "Hb",
        value: "12",
        unit: "g/dL",
        source: "patient_report",
        notes: null,
      },
    ];
    fields.objectiveCustomSections = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        title: "P/V",
        body: "notes",
        children: [],
      },
    ];
    expect(rxFormHasClearableObjectiveContent(fields)).toBe(true);
    const cleared = applyActions(fields, buildObjectiveClearAllActions(fields));
    expect(cleared.vitalsHr).toBeNull();
    expect(cleared.examFindings).toEqual([]);
    expect(cleared.testResults).toBe("");
    expect(cleared.testResultsStructured).toEqual([]);
    expect(cleared.objectiveCustomSections[0]?.title).toBe("P/V");
    expect(cleared.objectiveCustomSections[0]?.body).toBeNull();
  });
});
