import { describe, expect, it } from "vitest";
import { cmToFtIn, ftInToCm } from "@/lib/cockpit/vitals-units";

describe("height ft/in converters", () => {
  it("cmToFtIn splits into whole feet and inches", () => {
    expect(cmToFtIn(170)).toEqual({ feet: 5, inches: 7 });
    expect(cmToFtIn(180.34)).toEqual({ feet: 5, inches: 11 });
  });

  it("ftInToCm converts feet and inches to canonical cm", () => {
    expect(ftInToCm(5, 7)).toBeCloseTo(170.18, 2);
    expect(ftInToCm(0, 0)).toBe(0);
  });

  it("round-trips common heights within one inch", () => {
    for (const cm of [150, 165, 170, 182, 195]) {
      const { feet, inches } = cmToFtIn(cm);
      const back = ftInToCm(feet, inches);
      expect(Math.abs(back - cm)).toBeLessThan(2.54);
    }
  });
});
