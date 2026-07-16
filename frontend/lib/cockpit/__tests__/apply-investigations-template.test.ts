import { describe, expect, it } from "vitest";
import {
  buildInvestigationsTemplateApplyActions,
  buildInvestigationsTemplateSavePayload,
  defaultInvestigationsSaveName,
  INVESTIGATIONS_TEMPLATE_SCOPE,
  investigationsScopeHasContent,
  templateInvestigationsHasContent,
} from "@/lib/cockpit/apply-investigations-template";
import { createEmptyRxFormFields } from "@/components/cockpit/rx/RxFormContext";
import type { DoctorRxTemplate } from "@/types/rx-template";

function makeTemplate(investigations: string | null): DoctorRxTemplate {
  return {
    id: "tpl-1",
    doctor_id: "doc-1",
    name: "Fever workup",
    description: null,
    scope: INVESTIGATIONS_TEMPLATE_SCOPE,
    medicines_json: [],
    cc: null,
    hopi: null,
    provisional_diagnosis: null,
    investigations,
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
    created_at: "2026-07-13T00:00:00Z",
    updated_at: "2026-07-13T00:00:00Z",
  };
}

describe("apply-investigations-template", () => {
  it("detects content from non-empty order lists", () => {
    expect(
      investigationsScopeHasContent({
        ...createEmptyRxFormFields(),
        investigationsOrders: "CBC; LFT",
      }),
    ).toBe(true);
    expect(
      investigationsScopeHasContent({
        ...createEmptyRxFormFields(),
        investigationsOrders: "  ",
      }),
    ).toBe(false);
    expect(templateInvestigationsHasContent(makeTemplate("CBC"))).toBe(true);
    expect(templateInvestigationsHasContent(makeTemplate(""))).toBe(false);
  });

  it("builds a scoped save payload on the investigations TEXT column", () => {
    const payload = buildInvestigationsTemplateSavePayload({
      ...createEmptyRxFormFields(),
      investigationsOrders: " CBC ; LFT ",
    });
    expect(payload).toEqual({
      scope: INVESTIGATIONS_TEMPLATE_SCOPE,
      investigations: "CBC ; LFT",
      medicines: [],
    });
  });

  it("applies by replacing investigationsOrders", () => {
    const actions = buildInvestigationsTemplateApplyActions(
      makeTemplate("Chest X-ray: PA, Lateral; ECG"),
    );
    expect(actions).toEqual([
      {
        type: "SET_FIELD",
        key: "investigationsOrders",
        value: "Chest X-ray: PA, Lateral; ECG",
      },
    ]);
  });

  it("seeds a short save name from the order list", () => {
    expect(
      defaultInvestigationsSaveName({
        ...createEmptyRxFormFields(),
        investigationsOrders: "CBC",
      }),
    ).toBe("CBC");
    expect(
      defaultInvestigationsSaveName({
        ...createEmptyRxFormFields(),
        investigationsOrders: "CBC; LFT; KFT",
      }),
    ).toBe("Investigations (3)");
  });
});
