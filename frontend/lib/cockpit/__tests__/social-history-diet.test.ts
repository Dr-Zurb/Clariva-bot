import {
  dietClinicalHints,
  dietHasContent,
  normalizeDietSection,
  parseDietTextWithLegacyCaffeine,
  serializeDietSection,
} from "@/lib/cockpit/social-history-diet";

describe("social-history-diet", () => {
  it("serializes diet type and notes only", () => {
    expect(
      serializeDietSection({
        type: "vegetarian",
        notes: "skips breakfast",
      }),
    ).toBe("Diet: Vegetarian, notes: skips breakfast");
  });

  it("parses diet tokens and extracts legacy caffeine separately", () => {
    expect(parseDietTextWithLegacyCaffeine("Vegetarian, 2 cups caffeine/day")).toEqual({
      diet: { type: "vegetarian" },
      legacyCaffeine: {
        status: "current",
        items: [
          {
            amount: 2,
            amountUnit: "cups",
            frequencyUnit: "day",
            frequency: 1,
            phase: "current",
            id: expect.any(String),
          },
        ],
      },
    });
    expect(parseDietTextWithLegacyCaffeine("Other (Jain) · notes: fasting")).toEqual({
      diet: { type: "other", typeOther: "Jain", notes: "fasting" },
      legacyCaffeine: null,
    });
  });

  it("detects diet content from type or notes only", () => {
    expect(dietHasContent({ type: "vegan" })).toBe(true);
    expect(dietHasContent({ notes: "low salt" })).toBe(true);
    expect(dietHasContent({})).toBe(false);
  });

  it("emits diet-only clinical hints for vegetarian and vegan", () => {
    expect(dietClinicalHints({ type: "vegetarian" })).toEqual([
      "Strict plant-based or vegetarian diet — consider B12/iron if clinically relevant.",
    ]);
  });

  it("strips deprecated regular type on normalize and ignores it when parsing", () => {
    expect(normalizeDietSection({ type: "regular" })).toBeNull();
    expect(normalizeDietSection({ type: "regular", notes: "no restrictions" })).toEqual({
      notes: "no restrictions",
    });
    expect(parseDietTextWithLegacyCaffeine("Regular / mixed")).toEqual({
      diet: {},
      legacyCaffeine: null,
    });
  });

  it("strips legacy nested caffeine fields on normalize", () => {
    expect(
      normalizeDietSection({
        type: "vegetarian",
        caffeineAmount: 2,
        caffeineCupsPerDay: 3,
      }),
    ).toEqual({ type: "vegetarian" });
  });
});
