import { describe, expect, it } from "vitest";
import {
  CORE_ASSESSMENT_DEFAULT_VISIBLE_IDS,
  resolveDefaultAssessmentLayout,
  resolveEffectiveAssessmentHidden,
} from "@/lib/cockpit/assessment-section-visibility";

describe("factory lean default (assessment)", () => {
  const DEFAULT_LAYOUT = resolveDefaultAssessmentLayout();

  it("keeps every static assessment section visible", () => {
    expect(DEFAULT_LAYOUT.defaultHidden).toEqual([]);
    expect(CORE_ASSESSMENT_DEFAULT_VISIBLE_IDS).toEqual([
      "diagnoses",
      "known_conditions",
      "assessment_notes",
    ]);
  });

  it("uses factory default when stored set is empty", () => {
    expect(resolveEffectiveAssessmentHidden({ storedHidden: [] })).toEqual({
      hidden: [],
    });
  });

  it("doctor stored set wins wholesale when present", () => {
    expect(
      resolveEffectiveAssessmentHidden({ storedHidden: ["diagnoses"] }),
    ).toEqual({ hidden: ["diagnoses"] });
  });

  it("drops unknown keys", () => {
    expect(
      resolveEffectiveAssessmentHidden({
        storedHidden: ["bogus_section", "assessment_notes", "assessment_notes"],
      }),
    ).toEqual({ hidden: ["assessment_notes"] });
  });
});
