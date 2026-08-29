import { describe, expect, it } from "vitest";
import {
  ageYearsFromIsoDate,
  formatDeskAgeYears,
  isValidDeskAgeCount,
  isValidDeskDob,
} from "@/lib/desk/age";

describe("ageYearsFromIsoDate", () => {
  const now = new Date("2026-08-23T12:00:00+05:30");

  it("returns whole years and 0 under one year", () => {
    expect(ageYearsFromIsoDate("1995-08-23", now)).toBe(31);
    expect(ageYearsFromIsoDate("1995-08-24", now)).toBe(30);
    expect(ageYearsFromIsoDate("2026-05-23", now)).toBe(0);
  });

  it("rejects a future or empty date", () => {
    expect(ageYearsFromIsoDate("2026-08-24", now)).toBeNull();
    expect(isValidDeskDob("", now)).toBe(false);
  });
});

describe("isValidDeskAgeCount", () => {
  it("accepts years, months, and days in range", () => {
    expect(isValidDeskAgeCount("years", "31")).toBe(true);
    expect(isValidDeskAgeCount("months", "3")).toBe(true);
    expect(isValidDeskAgeCount("days", "10")).toBe(true);
    expect(isValidDeskAgeCount("months", "40")).toBe(false);
    expect(isValidDeskAgeCount("days", "100")).toBe(false);
  });
});

describe("formatDeskAgeYears", () => {
  it("shows <1 for infants", () => {
    expect(formatDeskAgeYears(0)).toBe("<1");
    expect(formatDeskAgeYears(31)).toBe("31");
    expect(formatDeskAgeYears(null)).toBe("—");
  });
});
