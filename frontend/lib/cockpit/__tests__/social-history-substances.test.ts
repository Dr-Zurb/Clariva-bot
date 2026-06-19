import { describe, expect, it } from "vitest";
import {
  availableSubstanceAddChips,
  createSubstanceItem,
  normalizeSubstancesSection,
  parseSubstancesText,
  serializeSubstancesSection,
  substanceClinicalHints,
  substanceTypeOptions,
} from "@/lib/cockpit/social-history-substances";

describe("social-history-substances", () => {
  it("migrates legacy uses + shared route to items", () => {
    const normalized = normalizeSubstancesSection({
      uses: ["cannabis", "opioids"],
      route: "inhaled",
    });
    expect(normalized?.status).toBe("current");
    expect(normalized?.items).toHaveLength(2);
    expect(normalized?.items.every((i) => i.route === "inhaled")).toBe(true);
  });

  it("migrates legacy daily frequency to frequencyUnit day", () => {
    const normalized = normalizeSubstancesSection({
      status: "current",
      items: [
        {
          id: "s1",
          type: "opioids",
          frequency: "daily" as unknown as number,
        },
      ],
    });
    expect(normalized?.items[0].frequencyUnit).toBe("day");
    expect(normalized?.items[0].frequency).toBe(1);
  });

  it("serializes denies-use status", () => {
    expect(
      serializeSubstancesSection({ status: "never", items: [] }),
    ).toBe("Substances: Denies use");
  });

  it("serializes structured items with IV BBV hint", () => {
    const text = serializeSubstancesSection({
      status: "current",
      items: [
        createSubstanceItem("opioids", {
          route: "iv",
          frequencyUnit: "day",
          frequency: 1,
          years: 3,
        }),
      ],
    });
    expect(text).toContain("Current use");
    expect(text).toContain("Opioids");
    expect(text).toContain("BBV screen");
    expect(text).toContain("every day");
  });

  it("serializes amount and route other", () => {
    const text = serializeSubstancesSection({
      status: "current",
      items: [
        createSubstanceItem("sedatives", {
          amount: 2,
          amountUnit: "tablets",
          route: "other",
          routeOther: "sublingual",
          frequencyUnit: "week",
          frequency: 3,
        }),
      ],
    });
    expect(text).toContain("2 tablets/day");
    expect(text).toContain("other (sublingual)");
    expect(text).toContain("3 times per week");
  });

  it("round-trips legacy TEXT format", () => {
    const legacy = "Cannabis (inhaled)";
    const parsed = parseSubstancesText(legacy);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].type).toBe("cannabis");
    expect(parsed.items[0].route).toBe("inhaled");
  });

  it("round-trips new multi-item TEXT with frequency v2", () => {
    const original = serializeSubstancesSection({
      status: "current",
      items: [
        createSubstanceItem("cannabis", {
          route: "inhaled",
          frequencyUnit: "week",
          frequency: 2,
        }),
        createSubstanceItem("sedatives", { route: "oral", years: 2 }),
      ],
    });
    const body = original.replace(/^Substances:\s*/, "");
    const parsed = parseSubstancesText(body);
    expect(parsed.items.length).toBeGreaterThanOrEqual(2);
    expect(parsed.items[0].frequencyUnit).toBe("week");
    expect(parsed.items[0].frequency).toBe(2);
  });

  it("places Other last in add chip catalog", () => {
    const options = substanceTypeOptions();
    expect(options[options.length - 1]?.value).toBe("other");
  });

  it("serializes agent name for broad substance categories", () => {
    const text = serializeSubstancesSection({
      status: "current",
      items: [
        createSubstanceItem("sedatives", {
          typeOther: "Alprazolam",
          route: "oral",
          frequencyUnit: "week",
          frequency: 2,
        }),
      ],
    });
    expect(text).toContain("Sedatives");
    expect(text).toContain("Alprazolam");
    const parsed = parseSubstancesText(text.replace(/^Substances:\s*Current use — /, ""));
    expect(parsed.items[0]?.typeOther).toBe("Alprazolam");
  });

  it("serializes days duration token", () => {
    const text = serializeSubstancesSection({
      status: "current",
      items: [createSubstanceItem("cannabis", { years: 14, yearsUnit: "days" })],
    });
    expect(text).toContain("14 d");
  });

  it("dedupes add chips for types already on chart", () => {
    const chips = availableSubstanceAddChips([
      createSubstanceItem("cannabis"),
      createSubstanceItem("other", { typeOther: "Khat" }),
    ]);
    expect(chips.some((c) => c.value === "cannabis")).toBe(false);
    expect(chips.some((c) => c.value === "other")).toBe(false);
    expect(chips.some((c) => c.value === "sedatives")).toBe(true);
  });

  it("emits polysubstance and alcohol interaction hints", () => {
    const hints = substanceClinicalHints({
      substances: {
        status: "current",
        items: [
          createSubstanceItem("opioids", { frequencyUnit: "day", frequency: 1 }),
          createSubstanceItem("sedatives"),
        ],
      },
      alcoholStatus: "current",
    });
    expect(hints.some((h) => h.includes("Polysubstance"))).toBe(true);
    expect(hints.some((h) => h.includes("Opioids + current alcohol"))).toBe(true);
    expect(hints.some((h) => h.includes("Sedatives + current alcohol"))).toBe(true);
  });
});
