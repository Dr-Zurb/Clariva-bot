import { describe, it, expect } from "vitest";
import { computeBmi } from "../bmi";

describe("computeBmi", () => {
  it("returns null when height missing", () => {
    expect(computeBmi(null, 65)).toBeNull();
  });

  it("returns null when weight missing", () => {
    expect(computeBmi(170, null)).toBeNull();
  });

  it("classifies underweight", () => {
    expect(computeBmi(170, 50)?.category).toBe("underweight");
  });

  it("classifies normal", () => {
    expect(computeBmi(170, 65)?.category).toBe("normal");
  });

  it("classifies overweight", () => {
    expect(computeBmi(170, 80)?.category).toBe("overweight");
  });

  it("classifies obese", () => {
    expect(computeBmi(170, 95)?.category).toBe("obese");
  });

  it("rounds to 1 decimal", () => {
    const result = computeBmi(175, 70);
    expect(result?.value).toBeCloseTo(22.9, 1);
  });

  it("returns null for zero/negative inputs", () => {
    expect(computeBmi(0, 65)).toBeNull();
    expect(computeBmi(170, -5)).toBeNull();
  });

  it("returns null for absurd BMI range", () => {
    expect(computeBmi(30, 500)).toBeNull();
  });
});
