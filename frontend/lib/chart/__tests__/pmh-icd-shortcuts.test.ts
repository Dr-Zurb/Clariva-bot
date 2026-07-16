import { describe, expect, it } from "vitest";
import {
  isDuplicateCondition,
  findMatchingCondition,
  normalizeConditionKey,
  PMH_ICD_SHORTCUTS,
} from "@/lib/chart/pmh-icd-shortcuts";

describe("pmh-icd-shortcuts", () => {
  it("maps common chips to ICD-11 codes used in diagnosis_catalog", () => {
    expect(PMH_ICD_SHORTCUTS.find((s) => s.id === "htn")).toMatchObject({
      code: "BA00",
      title: "Essential hypertension",
    });
    expect(PMH_ICD_SHORTCUTS.find((s) => s.id === "dm")).toMatchObject({
      code: "5A11",
      title: "Type 2 diabetes mellitus",
    });
  });

  it("dedupes by code when present, else by normalized label", () => {
    const existing = [
      { condition: "Essential hypertension", code: "BA00" },
      { condition: "Gout", code: null },
    ];
    expect(isDuplicateCondition(existing, "Anything", "BA00")).toBe(true);
    expect(isDuplicateCondition(existing, "gout", null)).toBe(true);
    expect(isDuplicateCondition(existing, "Asthma", "CA23")).toBe(false);
    expect(normalizeConditionKey("  Type  2  ")).toBe("type 2");
  });

  it("findMatchingCondition prefers code then label", () => {
    const existing = [
      { id: "1", condition: "Essential hypertension", code: "BA00" },
      { id: "2", condition: "Gout", code: null },
    ];
    expect(findMatchingCondition(existing, "Hypertension", "BA00")?.id).toBe("1");
    expect(findMatchingCondition(existing, "gout", null)?.id).toBe("2");
    expect(findMatchingCondition(existing, "Asthma", "CA23")).toBeNull();
  });
});
