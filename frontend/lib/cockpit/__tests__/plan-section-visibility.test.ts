import { describe, expect, it } from "vitest";
import {
  CORE_PLAN_DEFAULT_VISIBLE_IDS,
  resolveDefaultPlanLayout,
  resolveEffectivePlanHidden,
} from "@/lib/cockpit/plan-section-visibility";

describe("factory lean default (plan)", () => {
  const DEFAULT_LAYOUT = resolveDefaultPlanLayout();

  it("hides advice / referral / notes and keeps investigations + medications + follow-up", () => {
    expect(DEFAULT_LAYOUT.defaultHidden).toEqual([
      "advice",
      "referral",
      "clinical_notes",
    ]);
    expect(CORE_PLAN_DEFAULT_VISIBLE_IDS).toEqual([
      "investigations",
      "medications",
      "follow_up",
    ]);
  });

  it("uses factory default when stored set is empty", () => {
    expect(resolveEffectivePlanHidden({ storedHidden: [] })).toEqual({
      hidden: [...DEFAULT_LAYOUT.defaultHidden],
    });
  });

  it("doctor stored set wins wholesale when present", () => {
    expect(resolveEffectivePlanHidden({ storedHidden: ["medications"] })).toEqual({
      hidden: ["medications"],
    });
  });

  it("drops unknown keys", () => {
    expect(
      resolveEffectivePlanHidden({
        storedHidden: ["bogus_section", "advice", "advice"],
      }),
    ).toEqual({ hidden: ["advice"] });
  });
});
