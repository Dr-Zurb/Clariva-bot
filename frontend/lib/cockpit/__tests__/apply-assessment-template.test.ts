import { describe, expect, it } from "vitest";
import { createEmptyRxFormFields } from "@/components/cockpit/rx/RxFormContext";
import {
  buildAssessmentClearAllActions,
  buildAssessmentTemplateApplyActions,
  buildAssessmentTemplateSavePayload,
  assessmentScopeHasContent,
  defaultAssessmentSaveName,
  rxFormHasClearableAssessmentContent,
} from "@/lib/cockpit/apply-assessment-template";
import type { DoctorRxTemplate } from "@/types/rx-template";
import type { DiagnosisRow } from "@/types/prescription";

const PRIMARY: DiagnosisRow = {
  id: "dx-1",
  label: "Viral URI",
  kind: "primary",
  certainty: "provisional",
  status: "new",
  note: null,
  acuity: null,
  conditionId: null,
  code: null,
  codeTitle: null,
};

function makeTemplate(overrides: Partial<DoctorRxTemplate> = {}): DoctorRxTemplate {
  return {
    id: "tpl-1",
    doctor_id: "doc-1",
    name: "Test",
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
    scope: "assessment_full",
    use_count: 0,
    last_used_at: null,
    archived_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("apply-assessment-template", () => {
  it("saves diagnoses into assessment_json", () => {
    const fields = createEmptyRxFormFields();
    fields.diagnoses = [PRIMARY];
    const payload = buildAssessmentTemplateSavePayload("diagnoses", fields);
    expect(payload.scope).toBe("diagnoses");
    expect(payload.assessment?.diagnoses).toHaveLength(1);
    expect(payload.assessment?.diagnoses?.[0]?.label).toBe("Viral URI");
    expect(payload.assessment?.diagnoses?.[0]?.conditionId).toBeNull();
  });

  it("saves notes + acuity into assessment_json", () => {
    const fields = createEmptyRxFormFields();
    fields.assessmentNote = "Likely viral";
    fields.assessmentAcuity = "improving";
    const payload = buildAssessmentTemplateSavePayload("assessment_notes", fields);
    expect(payload.assessment).toEqual({
      assessmentNote: "Likely viral",
      assessmentAcuity: "improving",
    });
  });

  it("assessment_full save bundles diagnoses and notes", () => {
    const fields = createEmptyRxFormFields();
    fields.diagnoses = [PRIMARY];
    fields.assessmentNote = "Notes";
    const payload = buildAssessmentTemplateSavePayload("assessment_full", fields);
    expect(payload.assessment?.diagnoses).toHaveLength(1);
    expect(payload.assessment?.assessmentNote).toBe("Notes");
  });

  it("apply diagnoses replaces form diagnoses with fresh ids", () => {
    const actions = buildAssessmentTemplateApplyActions(
      "diagnoses",
      makeTemplate({
        assessment_json: { diagnoses: [PRIMARY] },
      }),
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "SET_DIAGNOSES" });
    if (actions[0]?.type === "SET_DIAGNOSES") {
      expect(actions[0].diagnoses[0]?.label).toBe("Viral URI");
      expect(actions[0].diagnoses[0]?.id).not.toBe("dx-1");
      expect(actions[0].diagnoses[0]?.conditionId).toBeNull();
    }
  });

  it("apply assessment_notes sets note + acuity", () => {
    const actions = buildAssessmentTemplateApplyActions(
      "assessment_notes",
      makeTemplate({
        assessment_json: {
          assessmentNote: "Rest",
          assessmentAcuity: "stable",
        },
      }),
    );
    expect(actions).toEqual([
      { type: "SET_FIELD", key: "assessmentNote", value: "Rest" },
      { type: "SET_FIELD", key: "assessmentAcuity", value: "stable" },
    ]);
  });

  it("scopeHasContent + clear helpers", () => {
    const empty = createEmptyRxFormFields();
    expect(assessmentScopeHasContent("assessment_full", empty)).toBe(false);
    expect(rxFormHasClearableAssessmentContent(empty)).toBe(false);

    empty.diagnoses = [PRIMARY];
    expect(assessmentScopeHasContent("diagnoses", empty)).toBe(true);
    expect(rxFormHasClearableAssessmentContent(empty)).toBe(true);
    expect(defaultAssessmentSaveName("diagnoses", empty)).toBe("Viral URI");

    const clear = buildAssessmentClearAllActions(empty);
    expect(clear).toEqual([
      { type: "SET_DIAGNOSES", diagnoses: [] },
      { type: "SET_FIELD", key: "assessmentNote", value: "" },
      { type: "SET_FIELD", key: "assessmentAcuity", value: null },
    ]);
  });

  it("clear-all wipes custom section bodies but keeps titles/structure", () => {
    const fields = createEmptyRxFormFields();
    fields.assessmentCustomSections = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
        title: "Risk",
        body: "High",
        children: [
          { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002", title: "Score", body: "12%" },
        ],
      },
    ];
    expect(rxFormHasClearableAssessmentContent(fields)).toBe(true);

    const clear = buildAssessmentClearAllActions(fields);
    const setCustom = clear.find(
      (a) => a.type === "SET_ASSESSMENT_CUSTOM_SECTIONS",
    );
    expect(setCustom).toBeDefined();
    expect(setCustom).toEqual({
      type: "SET_ASSESSMENT_CUSTOM_SECTIONS",
      sections: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
          title: "Risk",
          body: null,
          children: [
            { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002", title: "Score", body: null },
          ],
        },
      ],
    });
  });
});
