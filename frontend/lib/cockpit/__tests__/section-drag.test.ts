import { describe, expect, it } from "vitest";
import {
  moveSectionInOrder,
  reorderSectionInOrder,
  resolveSectionDropIntent,
} from "@/lib/cockpit/section-drag";
import type { SubjectiveSectionId } from "@/lib/cockpit/subjective-section-order";

const ORDER: SubjectiveSectionId[] = [
  "chief_complaints",
  "past_surgical",
  "family_history",
  "social_history",
  "free_text_notes",
  "custom_subsections",
];

describe("section-drag (subj-25)", () => {
  it("resolves before/after from pointer position", () => {
    const rect = { top: 100, height: 80 };
    expect(resolveSectionDropIntent(120, rect)).toBe("before");
    expect(resolveSectionDropIntent(160, rect)).toBe("after");
  });

  it("defaults to before when clientY is missing", () => {
    expect(resolveSectionDropIntent(Number.NaN, { top: 0, height: 40 })).toBe("before");
  });

  it("moveSectionInOrder swaps adjacent slots", () => {
    expect(moveSectionInOrder(ORDER, 2, "down")).toEqual([
      "chief_complaints",
      "past_surgical",
      "social_history",
      "family_history",
      "free_text_notes",
      "custom_subsections",
    ]);
    expect(moveSectionInOrder(ORDER, 0, "up")).toEqual(ORDER);
    expect(moveSectionInOrder(ORDER, ORDER.length - 1, "down")).toEqual(ORDER);
  });

  it("reorderSectionInOrder inserts before/after target index", () => {
    expect(reorderSectionInOrder(ORDER, 4, 1, "before")).toEqual([
      "chief_complaints",
      "free_text_notes",
      "past_surgical",
      "family_history",
      "social_history",
      "custom_subsections",
    ]);
    expect(reorderSectionInOrder(ORDER, 0, 2, "after")).toEqual([
      "past_surgical",
      "family_history",
      "chief_complaints",
      "social_history",
      "free_text_notes",
      "custom_subsections",
    ]);
  });
});
