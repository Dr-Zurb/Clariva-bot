import {
  caffeineClinicalHints,
  caffeineHasContent,
  caffeineStrengthTooltip,
  createCaffeineItem,
  liftLegacyNestedCaffeine,
  normalizeCaffeineSection,
  parseCaffeineText,
  serializeCaffeineSection,
} from "@/lib/cockpit/social-history-caffeine";
import { parseSocialHistoryAsStructured, serializeSocialHistory } from "@/lib/cockpit/social-history";

describe("social-history-caffeine", () => {
  it("normalizes legacy nested caffeine fields into a section item", () => {
    expect(liftLegacyNestedCaffeine({ caffeineCupsPerDay: 2 })).toMatchObject({
      status: "current",
      items: [
        {
          amount: 2,
          amountUnit: "cups",
          frequencyUnit: "day",
          frequency: 1,
          phase: "current",
        },
      ],
    });
  });

  it("migrates legacy flat section fields on normalize", () => {
    expect(
      normalizeCaffeineSection({
        items: [],
        amount: 3,
        source: "tea",
        strength: "strong",
        frequencyUnit: "day",
        frequency: 1,
      }),
    ).toMatchObject({
      status: "current",
      items: [{ type: "tea", amount: 3, strength: "strong", frequencyUnit: "day" }],
    });
  });

  it("serializes multi-item caffeine with status prefix", () => {
    const tea = createCaffeineItem("tea", {
      amount: 2,
      amountUnit: "mugs",
      strength: "strong",
      frequencyUnit: "day",
      frequency: 1,
    });
    const coffee = createCaffeineItem("coffee", {
      amount: 1,
      frequencyUnit: "week",
      frequency: 3,
    });
    expect(
      serializeCaffeineSection({
        status: "current",
        items: [tea, coffee],
      }),
    ).toBe(
      "Caffeine: Current use — Tea (2 mugs/day · strong · ~70 mg/serving); Coffee (1 cups × 3/wk · ~95 mg/serving)",
    );
  });

  it("serializes none and ex-user status", () => {
    expect(serializeCaffeineSection({ status: "never", items: [] })).toBe("Caffeine: None");
    expect(parseCaffeineText("None")).toEqual({ status: "never", items: [] });
    expect(parseCaffeineText("denies use")).toEqual({ status: "never", items: [] });
    expect(
      serializeCaffeineSection({
        status: "ex",
        items: [createCaffeineItem("tea", { phase: "past", quitYearsAgo: 2 })],
      }),
    ).toContain("Caffeine: Ex-user");
  });

  it("parses legacy flat tokens and new section TEXT", () => {
    expect(parseCaffeineText("3 strong tea/day")).toMatchObject({
      status: "current",
      items: [{ type: "tea", amount: 3, strength: "strong", frequencyUnit: "day" }],
    });
    expect(parseCaffeineText("Current use — Tea (2 mugs/day · strong)")).toMatchObject({
      status: "current",
      items: [{ type: "tea", amount: 2, amountUnit: "mugs", strength: "strong" }],
    });
    expect(parseCaffeineText("occasional tea, notes: rarely")).toMatchObject({
      status: "current",
      items: [{ type: "tea", frequencyUnit: "occasional" }],
      notes: "rarely",
    });
  });

  it("round-trips caffeine through social history TEXT", () => {
    const structured = {
      caffeine: normalizeCaffeineSection({
        status: "current",
        items: [
          createCaffeineItem("coffee", {
            amount: 5,
            frequencyUnit: "day",
            frequency: 1,
          }),
        ],
      }),
    };
    const text = serializeSocialHistory(structured);
    expect(text).toContain("Caffeine: Current use");
    expect(text).toContain("Coffee");
    expect(parseSocialHistoryAsStructured(text).caffeine).toMatchObject({
      status: "current",
      items: [{ type: "coffee", amount: 5, frequencyUnit: "day" }],
    });
  });

  it("migrates legacy diet-embedded caffeine on normalize", () => {
    const text = serializeSocialHistory({
      diet: { type: "vegetarian", caffeineCupsPerDay: 2 },
    });
    expect(text).toContain("Diet: Vegetarian");
    expect(text).toContain("Caffeine:");
    const parsed = parseSocialHistoryAsStructured(text);
    expect(parsed.diet).toEqual({ type: "vegetarian" });
    expect(parsed.caffeine).toMatchObject({
      status: "current",
      items: [{ amount: 2, frequencyUnit: "day" }],
    });
  });

  it("detects caffeine content from status and partial items", () => {
    expect(caffeineHasContent({ status: "never", items: [] })).toBe(true);
    expect(caffeineHasContent({ status: "current", items: [createCaffeineItem("tea")] })).toBe(
      true,
    );
    expect(caffeineHasContent({ status: "current", items: [], notes: "decaf" })).toBe(true);
    expect(caffeineHasContent({ items: [] })).toBe(false);
  });

  it("emits high-caffeine clinical hint from multi-item daily total", () => {
    expect(
      caffeineClinicalHints({
        status: "current",
        items: [
          createCaffeineItem("tea", {
            amount: 2,
            frequencyUnit: "times_per_day",
            frequency: 3,
          }),
        ],
      }),
    ).toEqual([
      "High caffeine intake — consider sleep, anxiety, or palpitations as contributors.",
    ]);
  });

  it("supports custom strength mg per serving", () => {
    const item = createCaffeineItem("coffee", { strength: "custom", caffeineMg: 200 });
    expect(serializeCaffeineSection({ status: "current", items: [item] })).toContain(
      "~200 mg/serving",
    );
    expect(parseCaffeineText("Current use — Coffee (~200 mg/serving)")).toMatchObject({
      status: "current",
      items: [{ type: "coffee", strength: "custom", caffeineMg: 200 }],
    });
  });

  it("exposes type-aware strength tooltips", () => {
    expect(caffeineStrengthTooltip("coffee", "strong")).toContain("150 mg");
    expect(caffeineStrengthTooltip("tea", "light")).toContain("30 mg");
  });

  it("clears empty caffeine on normalize", () => {
    expect(normalizeCaffeineSection({ items: [] })).toBeNull();
  });
});
