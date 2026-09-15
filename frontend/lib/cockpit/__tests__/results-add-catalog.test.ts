import { describe, expect, it } from "vitest";
import {
  RESULTS_ADD_CATALOG_OPTIONS,
  filterResultsAddCatalog,
  parseResultsAddValue,
  resolveResultsAddCatalog,
} from "@/lib/cockpit/results-add-catalog";

describe("results-add-catalog", () => {
  it("lists panels and analytes, never imaging", () => {
    expect(
      RESULTS_ADD_CATALOG_OPTIONS.some((opt) =>
        opt.value.startsWith("panel:cbc")
      )
    ).toBe(true);
    expect(
      RESULTS_ADD_CATALOG_OPTIONS.some((opt) => opt.value === "analyte:hb")
    ).toBe(true);
    expect(
      RESULTS_ADD_CATALOG_OPTIONS.some((opt) =>
        opt.value.startsWith("imaging:")
      )
    ).toBe(false);
  });

  it("empty query returns panels only", () => {
    const empty = filterResultsAddCatalog(RESULTS_ADD_CATALOG_OPTIONS, "");
    expect(empty.length).toBeGreaterThan(0);
    expect(empty.every((opt) => opt.value.startsWith("panel:"))).toBe(true);
  });

  it("filters analytes by alias and caps the list", () => {
    const hits = filterResultsAddCatalog(RESULTS_ADD_CATALOG_OPTIONS, "hb");
    expect(hits.some((opt) => opt.value === "analyte:hb")).toBe(true);
    expect(hits.length).toBeLessThanOrEqual(32);
  });

  it("resolves panel and analyte tokens; ignores imaging", () => {
    expect(resolveResultsAddCatalog("CBC")).toBe("panel:cbc");
    expect(resolveResultsAddCatalog("haemoglobin")).toBe("analyte:hb");
    expect(parseResultsAddValue("panel:cbc")).toEqual({
      kind: "panel",
      id: "cbc",
    });
    expect(parseResultsAddValue("analyte:hb")).toEqual({
      kind: "analyte",
      id: "hb",
    });
    expect(resolveResultsAddCatalog("ECG")).toBeUndefined();
  });
});
