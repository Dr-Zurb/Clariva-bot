import { describe, expect, it } from "vitest";
import {
  normalizePatientsListFilters,
  patientsListQueryOptions,
} from "@/lib/query/prefetch/patients-list";

describe("normalizePatientsListFilters", () => {
  it("always sets page and pageSize", () => {
    expect(normalizePatientsListFilters({})).toEqual({
      page: 1,
      pageSize: 50,
    });
  });

  it("keeps segment and trims q", () => {
    expect(
      normalizePatientsListFilters({
        q: "  akash  ",
        segment: "has-allergies",
        sort: "name-asc",
      }),
    ).toEqual({
      q: "akash",
      segment: "has-allergies",
      sort: "name-asc",
      page: 1,
      pageSize: 50,
    });
  });
});

describe("patientsListQueryOptions", () => {
  it("uses the same key for equivalent filters", () => {
    const a = patientsListQueryOptions("tok", { segment: "active-90d" });
    const b = patientsListQueryOptions("tok", {
      segment: "active-90d",
      page: 1,
      pageSize: 50,
    });
    expect(a.queryKey).toEqual(b.queryKey);
  });
});
