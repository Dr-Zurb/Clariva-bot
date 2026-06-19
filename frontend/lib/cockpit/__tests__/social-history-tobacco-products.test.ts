import { describe, expect, it } from "vitest";
import {
  CIGAR_CIGARETTE_EQUIVALENT,
  HOOKAH_SESSION_CIGARETTE_EQUIVALENT,
  formatTobaccoProductClause,
  parseTobaccoProductClause,
  smokingCigaretteEquivalent,
  smokingPackYearsForProduct,
  smokingPackYearsFromProducts,
  VAPE_POD_CIGARETTE_EQUIVALENT,
} from "@/lib/cockpit/social-history-tobacco-products";

describe("smokingCigaretteEquivalent (sh-13)", () => {
  it("returns per-day count for cigarettes unchanged", () => {
    expect(smokingCigaretteEquivalent({ id: "p1", type: "cigarette", perDay: 10 })).toBe(10);
  });

  it("returns beedi equivalent unchanged", () => {
    expect(smokingCigaretteEquivalent({ id: "p1", type: "beedi", perDay: 8 })).toBe(8);
  });

  it("applies hookah session multiplier", () => {
    expect(smokingCigaretteEquivalent({ id: "p1", type: "hookah", perDay: 1 })).toBe(
      HOOKAH_SESSION_CIGARETTE_EQUIVALENT,
    );
  });

  it("applies cigar multiplier", () => {
    expect(smokingCigaretteEquivalent({ id: "p1", type: "cigar", perDay: 2 })).toBe(
      2 * CIGAR_CIGARETTE_EQUIVALENT,
    );
  });

  it("applies vape pod multiplier", () => {
    expect(smokingCigaretteEquivalent({ id: "p1", type: "vape", perDay: 1 })).toBe(
      VAPE_POD_CIGARETTE_EQUIVALENT,
    );
  });

  it("returns null for other products", () => {
    expect(smokingCigaretteEquivalent({ id: "p1", type: "other", perDay: 3 })).toBeNull();
  });
});

describe("smokingPackYearsFromProducts (sh-13)", () => {
  it("keeps cigarette-only pack-years byte-identical", () => {
    const result = smokingPackYearsFromProducts([
      { id: "p1", type: "cigarette", perDay: 20, years: 10 },
    ]);
    expect(result).toEqual({
      packYears: 10,
      hasNonConvertible: false,
      hasApproximateProducts: false,
    });
  });

  it("keeps beedi-only pack-years byte-identical", () => {
    const result = smokingPackYearsFromProducts([
      { id: "p1", type: "beedi", perDay: 10, years: 10 },
    ]);
    expect(result.packYears).toBe(5);
    expect(result.hasApproximateProducts).toBe(false);
  });

  it("includes hookah session equivalents in the sum", () => {
    const rowPy = smokingPackYearsForProduct({
      id: "p1",
      type: "hookah",
      perDay: 1,
      years: 10,
    });
    expect(rowPy).toBe(5);

    const result = smokingPackYearsFromProducts([
      { id: "p1", type: "hookah", perDay: 1, years: 10 },
    ]);
    expect(result.packYears).toBe(5);
    expect(result.hasApproximateProducts).toBe(true);
  });

  it("sums cigarette and approximate products together", () => {
    const result = smokingPackYearsFromProducts([
      { id: "p1", type: "cigarette", perDay: 20, years: 10 },
      { id: "p2", type: "vape", perDay: 1, years: 10 },
    ]);
    expect(result.packYears).toBe(20);
    expect(result.hasApproximateProducts).toBe(true);
    expect(result.hasNonConvertible).toBe(false);
  });

  it("flags non-convertible other products", () => {
    const result = smokingPackYearsFromProducts([
      { id: "p1", type: "cigarette", perDay: 10, years: 5 },
      { id: "p2", type: "other", typeOther: "Naswar", perDay: 2 },
    ]);
    expect(result.packYears).toBe(2.5);
    expect(result.hasNonConvertible).toBe(true);
    expect(result.hasApproximateProducts).toBe(false);
  });

  it("computes pack-years from weekly hookah sessions", () => {
    const rowPy = smokingPackYearsForProduct({
      id: "p1",
      type: "hookah",
      perDay: 2,
      frequencyUnit: "week",
      frequency: 2,
      years: 10,
    });
    expect(rowPy).toBeCloseTo(2.9, 1);

    const result = smokingPackYearsFromProducts([
      {
        id: "p1",
        type: "hookah",
        perDay: 2,
        frequencyUnit: "week",
        frequency: 2,
        years: 10,
      },
    ]);
    expect(result.packYears).toBeCloseTo(2.9, 1);
    expect(result.hasApproximateProducts).toBe(true);
  });

  it("round-trips weekly frequency in product clause TEXT", () => {
    const clause = formatTobaccoProductClause(
      {
        id: "p1",
        type: "hookah",
        perDay: 2,
        frequencyUnit: "week",
        frequency: 2,
        years: 5,
      },
      "smoking",
    );
    expect(clause).toContain("2 sessions × 2/wk");
    const parsed = parseTobaccoProductClause(clause, "smoking");
    expect(parsed?.frequencyUnit).toBe("week");
    expect(parsed?.frequency).toBe(2);
    expect(parsed?.perDay).toBe(2);
  });
});
