import { describe, expect, it } from "vitest";
import { readFiltersFromUrl } from "@/hooks/usePatientsListFilters";
import { patientListFiltersKey } from "@/lib/patients-v2/client-list-filter";

describe("patientListFiltersKey", () => {
  it("treats missing page as page 1", () => {
    expect(patientListFiltersKey({})).toBe(
      patientListFiltersKey({ page: 1 }),
    );
  });

  it("distinguishes segments", () => {
    expect(patientListFiltersKey({ segment: "active-90d" })).not.toBe(
      patientListFiltersKey({ segment: "new-30d" }),
    );
  });
});

describe("readFiltersFromUrl", () => {
  it("reads a valid segment", () => {
    const params = new URLSearchParams("segment=has-allergies");
    expect(readFiltersFromUrl(params)).toEqual({ segment: "has-allergies" });
  });

  it("ignores unknown segments", () => {
    const params = new URLSearchParams("segment=nope");
    expect(readFiltersFromUrl(params)).toEqual({});
  });

  it("reads tag filter", () => {
    const params = new URLSearchParams("tag=VIP");
    expect(readFiltersFromUrl(params)).toEqual({ tag: "VIP" });
  });
});

describe("patientListFiltersKey tag", () => {
  it("distinguishes tags", () => {
    expect(patientListFiltersKey({ tag: "VIP" })).not.toBe(
      patientListFiltersKey({ tag: "Follow-up" }),
    );
  });
});
