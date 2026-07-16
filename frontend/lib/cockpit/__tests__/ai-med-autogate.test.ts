import { describe, expect, it } from "vitest";
import { shouldAutoAcceptSingleAiMed } from "@/lib/cockpit/ai-med-autogate";

describe("shouldAutoAcceptSingleAiMed", () => {
  it("accepts a single autogate hit with the same name", () => {
    expect(
      shouldAutoAcceptSingleAiMed("autogate", [{ name: "Tolezomab" }], "tolezomab"),
    ).toBe(true);
  });

  it("rejects refine, multi-med, empty, or renamed hits", () => {
    expect(
      shouldAutoAcceptSingleAiMed("refine", [{ name: "Tolezomab" }], "Tolezomab"),
    ).toBe(false);
    expect(
      shouldAutoAcceptSingleAiMed(
        "autogate",
        [{ name: "A" }, { name: "B" }],
        "A",
      ),
    ).toBe(false);
    expect(shouldAutoAcceptSingleAiMed("autogate", [], "A")).toBe(false);
    expect(
      shouldAutoAcceptSingleAiMed("autogate", [{ name: "Metformin" }], "Amlodipine"),
    ).toBe(false);
  });
});
