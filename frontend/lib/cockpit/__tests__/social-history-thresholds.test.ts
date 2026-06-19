import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOCIAL_HISTORY_THRESHOLDS,
  SOCIAL_HISTORY_THRESHOLDS,
} from "@/lib/cockpit/social-history-thresholds";
import { auditCScore, packYearsClinicalHint } from "@/lib/cockpit/social-history-indices";
import {
  alcoholClinicalHints,
  bingeSessionClinicalHint,
  standardUnitsForDrink,
  createAlcoholDrink,
  formatAlcoholDrinkClause,
  parseAlcoholDrinkClause,
  STANDARD_BEER_CONTAINER_UNITS,
} from "@/lib/cockpit/social-history-alcohol-drinks";

describe("SOCIAL_HISTORY_THRESHOLDS", () => {
  it("ships UK-style defaults", () => {
    expect(DEFAULT_SOCIAL_HISTORY_THRESHOLDS).toEqual({
      hazardousUnitsPerWeek: 14,
      bingeUnitsPerSession: 6,
      packYearsElevated: 20,
      packYearsLdct: 30,
      auditCPositive: 4,
      auditFullHazardous: 8,
      auditFullHarmful: 16,
      auditFullDependence: 20,
      cagePositive: 2,
    });
  });

  it("allows runtime overrides that hints read at call time", () => {
    const original = { ...SOCIAL_HISTORY_THRESHOLDS };
    try {
      SOCIAL_HISTORY_THRESHOLDS.hazardousUnitsPerWeek = 10;
      SOCIAL_HISTORY_THRESHOLDS.bingeUnitsPerSession = 4;
      SOCIAL_HISTORY_THRESHOLDS.packYearsElevated = 15;
      SOCIAL_HISTORY_THRESHOLDS.auditCPositive = 3;

      expect(alcoholClinicalHints(11, null).intakeHint).toContain("High intake");
      expect(alcoholClinicalHints(9, null).intakeHint).toBeNull();
      expect(bingeSessionClinicalHint({ amount: 4, amountUnit: "units" })).toContain("binge-pattern");
      expect(packYearsClinicalHint(16)).toContain("≥15 pack-years");
      expect(auditCScore({ frequency: 1, typicalQuantity: 1, bingeFrequency: 1 })?.positive).toBe(
        true,
      );
    } finally {
      Object.assign(SOCIAL_HISTORY_THRESHOLDS, original);
    }
  });
});

describe("ABV override", () => {
  it("leaves units unchanged when abv is absent", () => {
    const drink = createAlcoholDrink("beer", {
      amount: 1,
      amountUnit: "can",
      frequency: 1,
      frequencyUnit: "week",
    });
    expect(standardUnitsForDrink(drink)).toBe(STANDARD_BEER_CONTAINER_UNITS);
  });

  it("recalculates units when abv is set on ml/can/glass/bottle", () => {
    const strongBeer = createAlcoholDrink("beer", {
      amount: 330,
      amountUnit: "ml",
      abv: 8,
      frequency: 1,
      frequencyUnit: "week",
    });
    expect(standardUnitsForDrink(strongBeer)).toBeCloseTo(2.6, 1);

    const withoutAbv = createAlcoholDrink("beer", {
      amount: 330,
      amountUnit: "ml",
      frequency: 1,
      frequencyUnit: "week",
    });
    expect(standardUnitsForDrink(withoutAbv)).toBeCloseTo(STANDARD_BEER_CONTAINER_UNITS, 1);
    expect(standardUnitsForDrink(strongBeer)).not.toBe(standardUnitsForDrink(withoutAbv));
  });

  it("round-trips abv in drink clauses", () => {
    const clause = "beer 330 ml @8% × 3/wk";
    const parsed = parseAlcoholDrinkClause(clause);
    expect(parsed).toMatchObject({
      type: "beer",
      amount: 330,
      amountUnit: "ml",
      abv: 8,
      frequency: 3,
      frequencyUnit: "week",
    });
    expect(formatAlcoholDrinkClause(parsed!)).toBe(clause);
  });
});
