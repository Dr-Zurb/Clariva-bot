import type { DoctorRxTemplate } from "@/types/rx-template";
import type { PatientChronicCondition } from "@/types/patient-chart";
import {
  knownConditionToCreatePayload,
  knownConditionsHasContent,
  knownConditionsTemplateHasContent,
  planKnownConditionsApply,
  snapshotKnownConditions,
} from "@/lib/chart/use-known-conditions-template-apply";

function makeCondition(
  overrides: Partial<PatientChronicCondition> & { condition: string },
): PatientChronicCondition {
  return {
    id: "c1",
    doctor_id: "d1",
    patient_id: "p1",
    status: "active",
    diagnosed_on: null,
    diagnosed_ago_value: null,
    diagnosed_ago_unit: null,
    resolved_ago_value: null,
    resolved_ago_unit: null,
    on_treatment: null,
    acuity: null,
    code: null,
    code_title: null,
    note: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeTemplate(
  knownConditions: NonNullable<
    DoctorRxTemplate["assessment_json"]
  >["knownConditions"],
): DoctorRxTemplate {
  return {
    id: "t1",
    doctor_id: "d1",
    name: "KC",
    scope: "known_conditions",
    description: null,
    medicines_json: [],
    investigations: null,
    advice: null,
    follow_up: null,
    clinical_notes: null,
    pmh_json: null,
    allergies_json: null,
    subjective_json: null,
    objective_json: null,
    plan_json: null,
    assessment_json: { knownConditions },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    last_used_at: null,
  };
}

describe("known conditions template helpers", () => {
  it("snapshots active chart conditions", () => {
    const snap = snapshotKnownConditions([
      makeCondition({
        condition: " Diabetes ",
        note: "on metformin",
        code: "E11",
        code_title: "T2DM",
      }),
      makeCondition({ condition: "  ", id: "empty" }),
    ]);
    expect(snap).toEqual([
      {
        condition: "Diabetes",
        status: "active",
        note: "on metformin",
        code: "E11",
        codeTitle: "T2DM",
      },
    ]);
  });

  it("detects content on chart and template", () => {
    expect(knownConditionsHasContent([])).toBe(false);
    expect(
      knownConditionsHasContent([makeCondition({ condition: "HTN" })]),
    ).toBe(true);
    expect(knownConditionsTemplateHasContent(makeTemplate([]))).toBe(false);
    expect(
      knownConditionsTemplateHasContent(
        makeTemplate([{ condition: "Asthma", status: "active" }]),
      ),
    ).toBe(true);
  });

  it("plans additive apply with name dedupe", () => {
    const plan = planKnownConditionsApply(
      makeTemplate([
        { condition: "HTN", status: "active" },
        { condition: "htn", status: "active" },
        { condition: "Asthma", status: "active" },
      ]),
      [{ condition: "HTN" }],
    );
    expect(plan.skipped).toBe(2);
    expect(plan.conditions.map((c) => c.condition)).toEqual(["Asthma"]);
  });

  it("maps template row to create payload", () => {
    expect(
      knownConditionToCreatePayload({
        condition: " CKD ",
        status: "active",
        note: "stage 3",
        code: "N18.3",
        codeTitle: "CKD stage 3",
      }),
    ).toEqual({
      condition: "CKD",
      status: "active",
      note: "stage 3",
      code: "N18.3",
      codeTitle: "CKD stage 3",
    });
  });
});
