import { describe, expect, it } from "vitest";
import {
  buildPlanTemplateApplyActions,
  buildPlanTemplateSavePayload,
  defaultPlanSaveName,
  planScopeHasContent,
  templatePlanScopeHasContent,
} from "@/lib/cockpit/apply-plan-template";
import { createEmptyRxFormFields } from "@/components/cockpit/rx/RxFormContext";
import type { DoctorRxTemplate } from "@/types/rx-template";

function makeTemplate(
  overrides: Partial<DoctorRxTemplate> = {},
): DoctorRxTemplate {
  return {
    id: "tpl-1",
    doctor_id: "doc-1",
    name: "Plan preset",
    description: null,
    scope: "advice",
    medicines_json: [],
    cc: null,
    hopi: null,
    provisional_diagnosis: null,
    investigations: null,
    follow_up: null,
    patient_education: null,
    clinical_notes: null,
    subjective_json: {},
    objective_json: {},
    plan_json: {},
    assessment_json: {},
    pmh_json: { conditions: [], medications: [] },
    allergies_json: { allergies: [] },
    use_count: 0,
    last_used_at: null,
    archived_at: null,
    created_at: "2026-07-14T00:00:00Z",
    updated_at: "2026-07-14T00:00:00Z",
    ...overrides,
  };
}

describe("apply-plan-template", () => {
  it("detects scoped content on the form", () => {
    const empty = createEmptyRxFormFields();
    expect(planScopeHasContent("advice", empty)).toBe(false);
    expect(
      planScopeHasContent("advice", { ...empty, advice: "Rest well" }),
    ).toBe(true);
    expect(
      planScopeHasContent("follow_up", {
        ...empty,
        followUpValue: 3,
        followUpUnit: "days",
      }),
    ).toBe(true);
    expect(
      planScopeHasContent("referral", {
        ...empty,
        referralSpecialties: ["Cardiology"],
      }),
    ).toBe(true);
    expect(
      planScopeHasContent("clinical_notes", {
        ...empty,
        clinicalNotes: "Private note",
      }),
    ).toBe(true);
  });

  it("saves advice into plan_json", () => {
    const payload = buildPlanTemplateSavePayload("advice", {
      ...createEmptyRxFormFields(),
      advice: " Hydrate ",
    });
    expect(payload).toEqual({
      scope: "advice",
      plan: { advice: "Hydrate" },
      medicines: [],
    });
  });

  it("saves follow-up structured fields into plan_json", () => {
    const payload = buildPlanTemplateSavePayload("follow_up", {
      ...createEmptyRxFormFields(),
      followUp: "If worse, sooner",
      followUpValue: 7,
      followUpUnit: "days",
    });
    expect(payload.scope).toBe("follow_up");
    expect(payload.plan).toEqual({
      followUp: "If worse, sooner",
      followUpValue: 7,
      followUpUnit: "days",
    });
    expect(payload.followUp).toBe("If worse, sooner");
  });

  it("saves referral chips into plan_json", () => {
    const payload = buildPlanTemplateSavePayload("referral", {
      ...createEmptyRxFormFields(),
      referralUrgency: "Urgent",
      referralSpecialties: ["Cardiology", "ENT"],
      referralReason: "Not improving",
      referral: "Please review",
    });
    expect(payload.plan).toEqual({
      referral: "Please review",
      referralUrgency: "Urgent",
      referralSpecialties: ["Cardiology", "ENT"],
      referralReason: "Not improving",
    });
  });

  it("applies referral by replacing chip fields", () => {
    const actions = buildPlanTemplateApplyActions(
      "referral",
      makeTemplate({
        scope: "referral",
        plan_json: {
          referralUrgency: "Routine",
          referralSpecialties: ["Internal Medicine"],
          referralReason: "Further evaluation",
          referral: "Notes here",
        },
      }),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        { type: "SET_FIELD", key: "referral", value: "Notes here" },
        { type: "SET_FIELD", key: "referralUrgency", value: "Routine" },
        {
          type: "SET_FIELD",
          key: "referralSpecialties",
          value: ["Internal Medicine"],
        },
        {
          type: "SET_FIELD",
          key: "referralReason",
          value: "Further evaluation",
        },
      ]),
    );
  });

  it("plan_full save bundles investigations, medicines, and plan_json", () => {
    const payload = buildPlanTemplateSavePayload("plan_full", {
      ...createEmptyRxFormFields(),
      investigationsOrders: "CBC; LFT",
      medicines: [
        {
          ...createEmptyRxFormFields().medicines[0]!,
          medicineName: "Paracetamol",
          dosage: "500mg",
        },
      ],
      advice: "Rest",
      followUpValue: 3,
      followUpUnit: "days",
      clinicalNotes: "Private",
    });
    expect(payload.scope).toBe("plan_full");
    expect(payload.investigations).toBe("CBC; LFT");
    expect(payload.medicines?.[0]?.medicineName).toBe("Paracetamol");
    expect(payload.plan?.advice).toBe("Rest");
    expect(payload.plan?.clinicalNotes).toBe("Private");
    expect(payload.plan?.followUpValue).toBe(3);
  });

  it("detects template content and default names", () => {
    expect(
      templatePlanScopeHasContent(
        makeTemplate({ plan_json: { advice: "Rest" } }),
        "advice",
      ),
    ).toBe(true);
    expect(
      defaultPlanSaveName("advice", {
        ...createEmptyRxFormFields(),
        advice: "Drink fluids",
      }),
    ).toBe("Drink fluids");
    expect(
      defaultPlanSaveName("follow_up", {
        ...createEmptyRxFormFields(),
        followUpValue: 3,
        followUpUnit: "days",
      }),
    ).toBe("in 3 days");
  });
});
