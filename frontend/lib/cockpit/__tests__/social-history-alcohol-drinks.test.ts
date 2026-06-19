import { describe, expect, it } from "vitest";
import {
  alcoholClinicalActionHint,
  alcoholClinicalHints,
  bingeSessionClinicalHint,
  createAlcoholDrink,
  amountUnitsForDrinkType,
  abvAffectsUnits,
  formatAlcoholDrinkClause,
  formatAlcoholDrinkFrequencyPhrase,
  formatAlcoholDrinkPreviewSentence,
  formatMaxPerSessionClause,
  maxAmountForUnit,
  normalizeAlcoholSection,
  parseAlcoholDrinkClause,
  parseMaxPerSessionClause,
  SPIRITS_ML_PER_UNIT,
  STANDARD_BEER_CONTAINER_ML,
  STANDARD_BEER_CONTAINER_UNITS,
  STANDARD_SPIRITS_ABV,
  STANDARD_SPIRITS_BOTTLE_ML,
  defaultAbvPercentForDrink,
  strengthDefaultLabel,
  strengthDefaultTooltip,
  strengthPresetsForDrink,
  standardUnitsForDrink,
  standardUnitsPerWeekFromDrinks,
  ukUnitsFromVolumeMl,
  unitsPerSessionFromMax,
} from "@/lib/cockpit/social-history-alcohol-drinks";

describe("social-history-alcohol-drinks", () => {
  it("formats weekly and daily drink clauses", () => {
    expect(
      formatAlcoholDrinkClause(
        createAlcoholDrink("spirits", {
          amount: 2,
          amountUnit: "peg",
          frequency: 3,
          frequencyUnit: "week",
          years: 10,
        }),
      ),
    ).toBe("spirits 2 pegs × 3/wk, 10 yr");

    expect(
      formatAlcoholDrinkClause(
        createAlcoholDrink("beer", {
          amount: 1,
          amountUnit: "bottle",
          frequency: 1,
          frequencyUnit: "day",
        }),
      ),
    ).toBe("beer 1 bottles/day");
  });

  it("round-trips drink clauses with past quit", () => {
    const clause = "spirits 2 pegs × 3/wk, 10 yr (past; quit 2 yr ago)";
    const parsed = parseAlcoholDrinkClause(clause);
    expect(parsed).toMatchObject({
      type: "spirits",
      amount: 2,
      frequency: 3,
      frequencyUnit: "week",
      years: 10,
      phase: "past",
      quitYearsAgo: 2,
    });
    expect(formatAlcoholDrinkClause(parsed!)).toBe(clause);
  });

  it("migrates legacy types and unitsPerWeek to drinks", () => {
    const normalized = normalizeAlcoholSection({
      status: "current",
      types: ["spirits", "beer"],
      unitsPerWeek: 14,
    });
    expect(normalized?.drinks).toHaveLength(2);
    expect(normalized?.drinks.map((d) => d.type)).toEqual(["spirits", "beer"]);
  });

  it("migrates section quit to drinks for ex-drinkers", () => {
    const normalized = normalizeAlcoholSection({
      status: "ex",
      types: ["spirits"],
      quitYearsAgo: 18,
      quitYearsUnit: "months",
    });
    expect(normalized?.drinks[0]).toMatchObject({
      type: "spirits",
      quitYearsAgo: 18,
      quitYearsUnit: "months",
    });
    expect(normalized?.quitYearsAgo).toBeUndefined();
  });

  it("computes standard units per week from drink rows", () => {
    const { unitsPerWeek } = standardUnitsPerWeekFromDrinks([
      createAlcoholDrink("spirits", {
        amount: 2,
        amountUnit: "peg",
        frequency: 3,
        frequencyUnit: "week",
      }),
    ]);
    expect(unitsPerWeek).toBe(7.2);
  });

  it("excludes bottle from spirits amount units", () => {
    const units = amountUnitsForDrinkType("spirits").map((u) => u.value);
    expect(units).toEqual(["peg", "ml", "other"]);
    expect(units).not.toContain("bottle");
  });

  it("coerces legacy spirits bottle to ml on normalize", () => {
    const normalized = normalizeAlcoholSection({
      status: "current",
      drinks: [
        createAlcoholDrink("spirits", {
          amount: 1,
          amountUnit: "bottle",
          frequency: 1,
          frequencyUnit: "day",
        }),
      ],
    });
    expect(normalized?.drinks[0]).toMatchObject({
      amount: STANDARD_SPIRITS_BOTTLE_ML,
      amountUnit: "ml",
    });
    const rowUnits = standardUnitsForDrink(normalized!.drinks[0]);
    expect(rowUnits).toBe(
      Math.round(
        ukUnitsFromVolumeMl(STANDARD_SPIRITS_BOTTLE_ML, STANDARD_SPIRITS_ABV) * 7 * 10,
      ) / 10,
    );
  });

  it("computes wine bottle units from standard bottle size", () => {
    const rowUnits = standardUnitsForDrink(
      createAlcoholDrink("wine", {
        amount: 1,
        amountUnit: "bottle",
        frequency: 1,
        frequencyUnit: "week",
      }),
    );
    expect(rowUnits).toBe(9);
  });

  it("allows spirits ml above legacy 200 cap", () => {
    expect(maxAmountForUnit("ml")).toBe(5000);
    expect(maxAmountForUnit("peg")).toBe(50);
    const rowUnits = standardUnitsForDrink(
      createAlcoholDrink("spirits", {
        amount: 750,
        amountUnit: "ml",
        frequency: 1,
        frequencyUnit: "day",
      }),
    );
    expect(rowUnits).toBe(
      Math.round(ukUnitsFromVolumeMl(750, STANDARD_SPIRITS_ABV) * 7 * 10) / 10,
    );
  });

  it("includes can for beer and uses container shortcut units", () => {
    expect(amountUnitsForDrinkType("beer").map((u) => u.value)).toContain("can");
    const bottleUnits = standardUnitsForDrink(
      createAlcoholDrink("beer", {
        amount: 1,
        amountUnit: "bottle",
        frequency: 1,
        frequencyUnit: "day",
      }),
    );
    expect(STANDARD_BEER_CONTAINER_UNITS).toBe(
      ukUnitsFromVolumeMl(STANDARD_BEER_CONTAINER_ML, 0.05),
    );
    expect(bottleUnits).toBe(Math.round(STANDARD_BEER_CONTAINER_UNITS * 7 * 10) / 10);
    expect(
      standardUnitsForDrink(
        createAlcoholDrink("beer", {
          amount: 2,
          amountUnit: "can",
          frequency: 3,
          frequencyUnit: "week",
        }),
      ),
    ).toBe(Math.round(2 * STANDARD_BEER_CONTAINER_UNITS * 3 * 10) / 10);
  });

  it("computes beer ml using assumed ABV not spirits peg ratio", () => {
    expect(
      standardUnitsForDrink(
        createAlcoholDrink("beer", {
          amount: 330,
          amountUnit: "ml",
          frequency: 1,
          frequencyUnit: "week",
        }),
      ),
    ).toBe(STANDARD_BEER_CONTAINER_UNITS);
  });

  it("round-trips beer can clauses", () => {
    const clause = "beer 2 cans × 3/wk";
    const parsed = parseAlcoholDrinkClause(clause);
    expect(parsed).toMatchObject({
      type: "beer",
      amount: 2,
      amountUnit: "can",
      frequency: 3,
      frequencyUnit: "week",
    });
    expect(formatAlcoholDrinkClause(parsed!)).toBe(clause);
  });

  it("round-trips fortnightly drink clauses and units per week", () => {
    const clause = "spirits 2 pegs × 1/2wk";
    const parsed = parseAlcoholDrinkClause(clause);
    expect(parsed).toMatchObject({
      type: "spirits",
      amount: 2,
      frequency: 1,
      frequencyUnit: "fortnight",
    });
    expect(formatAlcoholDrinkClause(parsed!)).toBe(clause);
    expect(standardUnitsForDrink(parsed!)).toBe(1.2);
  });

  it("round-trips monthly drink clauses and units per week", () => {
    const clause = "spirits 3 pegs × 1/mo";
    const parsed = parseAlcoholDrinkClause(clause);
    expect(parsed).toMatchObject({
      type: "spirits",
      amount: 3,
      frequency: 1,
      frequencyUnit: "month",
    });
    expect(formatAlcoholDrinkClause(parsed!)).toBe(clause);
    expect(standardUnitsForDrink(parsed!)).toBeCloseTo(0.8, 1);
  });

  it("round-trips interval drink clauses (every N days) and units per week", () => {
    const clause = "spirits 2 pegs × 1/10d";
    const parsed = parseAlcoholDrinkClause(clause);
    expect(parsed).toMatchObject({
      type: "spirits",
      amount: 2,
      frequency: 10,
      frequencyUnit: "interval",
    });
    expect(formatAlcoholDrinkClause(parsed!)).toBe(clause);
    expect(standardUnitsForDrink(parsed!)).toBeCloseTo(1.7, 1);
  });

  it("builds plain-language drink preview sentences", () => {
    expect(
      formatAlcoholDrinkPreviewSentence({
        id: "d1",
        type: "spirits",
        amount: 2,
        amountUnit: "peg",
        frequency: 3,
        frequencyUnit: "week",
        years: 5,
      }),
    ).toBe("Spirits · 2 pegs · 3 times per week · for 5 years");

    expect(
      formatAlcoholDrinkPreviewSentence({
        id: "d1b",
        type: "spirits",
        amount: 2,
        amountUnit: "peg",
        abv: 42,
        frequency: 3,
        frequencyUnit: "week",
      }),
    ).toBe("Spirits · 2 pegs @ 42% · 3 times per week");

    expect(
      formatAlcoholDrinkPreviewSentence({
        id: "d1c",
        type: "beer",
        amount: 2,
        amountUnit: "can",
        abv: 42,
        frequency: 1,
        frequencyUnit: "week",
      }),
    ).toBe("Beer · 2 cans @ 42% · 1 time per week");

    expect(
      formatAlcoholDrinkFrequencyPhrase({
        id: "d2",
        type: "beer",
        frequencyUnit: "day",
      }),
    ).toBe("every day");
  });

  it("describes default strength chip and assumed ABV tooltips", () => {
    expect(strengthDefaultLabel("spirits", "peg")).toBe("Default");
    expect(strengthDefaultLabel("beer", "can")).toBe("Default");
    expect(defaultAbvPercentForDrink("spirits")).toBe(40);
    expect(defaultAbvPercentForDrink("beer")).toBe(5);
    expect(defaultAbvPercentForDrink("wine")).toBe(12);
    expect(strengthDefaultTooltip("spirits", "peg")).toContain("40% ABV");
    expect(strengthDefaultTooltip("spirits", "peg")).toContain(`${SPIRITS_ML_PER_UNIT} ml`);
    expect(strengthDefaultTooltip("beer", "can")).toContain("5% ABV");
  });

  it("applies peg strength to spirits units math when ABV is set", () => {
    const defaultPeg = standardUnitsForDrink(
      createAlcoholDrink("spirits", {
        amount: 1,
        amountUnit: "peg",
        frequency: 1,
        frequencyUnit: "day",
      }),
    );
    const strongPeg = standardUnitsForDrink(
      createAlcoholDrink("spirits", {
        amount: 1,
        amountUnit: "peg",
        abv: 42,
        frequency: 1,
        frequencyUnit: "day",
      }),
    );
    expect(defaultPeg).toBe(8.4);
    expect(strongPeg).toBeCloseTo(9.1, 1);
    expect(abvAffectsUnits(createAlcoholDrink("spirits", { amount: 1 }))).toBe(false);
    expect(
      abvAffectsUnits(
        createAlcoholDrink("spirits", { amount: 1, amountUnit: "peg", abv: 42 }),
      ),
    ).toBe(true);
    expect(strengthPresetsForDrink("spirits")).toEqual([40, 42, 43, 48]);
  });

  it("fires binge hint from max per session independent of weekly average", () => {
    expect(bingeSessionClinicalHint({ amount: 6, amountUnit: "peg" })).toContain("binge-pattern");
    expect(bingeSessionClinicalHint({ amount: 2, amountUnit: "peg" })).toBeNull();
    expect(unitsPerSessionFromMax({ amount: 8, amountUnit: "units" })).toBe(8);
  });

  it("round-trips max per session clause", () => {
    const clause = "max 8 pegs/session";
    const parsed = parseMaxPerSessionClause(clause);
    expect(parsed).toMatchObject({ amount: 8, amountUnit: "peg" });
    expect(formatMaxPerSessionClause(parsed!)).toBe(clause);
  });

  it("builds alcohol clinical action hints from units and CAGE", () => {
    expect(alcoholClinicalHints(15, { positive: false }).intakeHint).toContain("High intake");
    expect(alcoholClinicalHints(10, { positive: true }).cageHint).toContain("CAGE positive");
    expect(alcoholClinicalHints(15, { positive: true }).intakeHint).toContain("High intake");
    expect(alcoholClinicalHints(15, { positive: true }).cageHint).toContain("CAGE positive");
    expect(alcoholClinicalHints(10, { positive: false })).toEqual({
      intakeHint: null,
      cageHint: null,
    });
    expect(alcoholClinicalActionHint(15, { positive: false })).toContain("brief intervention");
  });
});
