import { describe, expect, it } from "vitest";
import {
  appendAllergyReaction,
  availableAllergyReactionQuickAdd,
} from "@/lib/cockpit/common-allergens";

describe("allergy reaction helpers", () => {
  it("appends a new reaction label", () => {
    expect(appendAllergyReaction("Rash", "Itching")).toBe("Rash, Itching");
    expect(appendAllergyReaction(null, "Rash")).toBe("Rash");
  });

  it("does not duplicate an existing reaction label", () => {
    expect(appendAllergyReaction("Rash, Itching", "Rash")).toBe("Rash, Itching");
  });

  it("filters quick-add labels already present", () => {
    expect(availableAllergyReactionQuickAdd("Rash")).not.toContain("Rash");
    expect(availableAllergyReactionQuickAdd("Rash")).toContain("Itching");
  });
});
