import { describe, expect, it } from "vitest";
import { ageYearsFromIsoDate } from "@/lib/desk/age";
import {
  deskSearchAgeYears,
  isDeskIdentitySearchReady,
  mergeDeskPatientIds,
  resolveDeskLookup,
} from "@/lib/desk/identity-search";

describe("isDeskIdentitySearchReady", () => {
  it("starts after a 3-letter name", () => {
    expect(isDeskIdentitySearchReady({ name: "Su" })).toBe(false);
    expect(isDeskIdentitySearchReady({ name: "Sun" })).toBe(true);
    expect(isDeskIdentitySearchReady({ name: "Sunita" })).toBe(true);
  });
});

describe("deskSearchAgeYears", () => {
  it("uses years, months under one year as 0, and DOB", () => {
    expect(deskSearchAgeYears("years", "62", "")).toBe(62);
    expect(deskSearchAgeYears("months", "8", "")).toBe(0);
    expect(deskSearchAgeYears("months", "18", "")).toBe(1);
    expect(deskSearchAgeYears("days", "10", "")).toBe(0);
    expect(deskSearchAgeYears("dob", "", "1995-08-23")).toBe(ageYearsFromIsoDate("1995-08-23"));
  });
});

describe("resolveDeskLookup", () => {
  it("prefers explicit search, then live hits, then empty or idle", () => {
    expect(resolveDeskLookup([{ id: "s" }], [{ id: "l" }])).toEqual({
      source: "search",
      rows: [{ id: "s" }],
    });
    expect(resolveDeskLookup([], [{ id: "l" }])).toEqual({
      source: "live",
      rows: [{ id: "l" }],
    });
    expect(resolveDeskLookup([], [])).toEqual({ source: "empty-search", rows: [] });
    expect(resolveDeskLookup(null, [])).toEqual({ source: "idle", rows: [] });
  });
});

describe("mergeDeskPatientIds", () => {
  it("keeps the first row for a repeated id", () => {
    expect(
      mergeDeskPatientIds(
        [{ id: "a", name: "One" }],
        [
          { id: "a", name: "Dup" },
          { id: "b", name: "Two" },
        ]
      )
    ).toEqual([
      { id: "a", name: "One" },
      { id: "b", name: "Two" },
    ]);
  });
});
