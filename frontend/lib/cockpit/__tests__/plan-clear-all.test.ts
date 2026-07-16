import { describe, expect, it } from "vitest";
import {
  buildPlanClearAllActions,
  rxFormHasClearablePlanContent,
} from "@/lib/cockpit/apply-plan-template";
import { createEmptyRxFormFields } from "@/components/cockpit/rx/RxFormContext";

describe("plan clear-all helpers", () => {
  it("detects clearable plan content", () => {
    expect(rxFormHasClearablePlanContent(createEmptyRxFormFields())).toBe(false);
    expect(
      rxFormHasClearablePlanContent({
        ...createEmptyRxFormFields(),
        advice: "Rest",
      }),
    ).toBe(true);
  });

  it("detects clearable custom plan section bodies", () => {
    expect(
      rxFormHasClearablePlanContent({
        ...createEmptyRxFormFields(),
        planCustomSections: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
            title: "Diet",
            body: "Low salt",
            children: [],
          },
        ],
      }),
    ).toBe(true);
  });

  it("builds clear actions for all plan fields", () => {
    const actions = buildPlanClearAllActions(createEmptyRxFormFields());
    const keys = actions.map((a) =>
      a.type === "SET_FIELD" ? a.key : a.type,
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        "investigationsOrders",
        "SET_MEDICINES",
        "advice",
        "followUp",
        "followUpValue",
        "followUpUnit",
        "referral",
        "referralUrgency",
        "referralSpecialties",
        "referralReason",
        "clinicalNotes",
      ]),
    );
  });

  it("clear-all wipes custom plan section bodies but keeps titles", () => {
    const fields = {
      ...createEmptyRxFormFields(),
      planCustomSections: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
          title: "Diet",
          body: "Low salt",
          children: [
            { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002", title: "Salt", body: "<2g" },
          ],
        },
      ],
    };
    const setCustom = buildPlanClearAllActions(fields).find(
      (a) => a.type === "SET_PLAN_CUSTOM_SECTIONS",
    );
    expect(setCustom).toEqual({
      type: "SET_PLAN_CUSTOM_SECTIONS",
      sections: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
          title: "Diet",
          body: null,
          children: [
            { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002", title: "Salt", body: null },
          ],
        },
      ],
    });
  });
});
