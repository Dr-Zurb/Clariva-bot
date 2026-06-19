import { describe, expect, it } from "vitest";
import {
  filterPastSurgicalProcedureCatalog,
  PAST_SURGICAL_PROCEDURE_CATALOG,
  resolvePastSurgicalCatalogProcedure,
} from "@/lib/cockpit/past-surgical-procedures";

describe("past-surgical-procedures", () => {
  it("includes a broad catalog for autocomplete", () => {
    expect(PAST_SURGICAL_PROCEDURE_CATALOG.length).toBeGreaterThanOrEqual(70);
  });

  it("resolves common synonyms and abbreviations", () => {
    expect(resolvePastSurgicalCatalogProcedure("c-section")).toBe("lscs");
    expect(resolvePastSurgicalCatalogProcedure("lap chole")).toBe("cholecystectomy");
    expect(resolvePastSurgicalCatalogProcedure("orif")).toBe("fracture-fixation");
    expect(resolvePastSurgicalCatalogProcedure("tka")).toBe("tkr");
    expect(resolvePastSurgicalCatalogProcedure("tha")).toBe("thr");
    expect(resolvePastSurgicalCatalogProcedure("ptca")).toBe("angioplasty");
    expect(resolvePastSurgicalCatalogProcedure("tubectomy")).toBe("tubal-ligation");
    expect(resolvePastSurgicalCatalogProcedure("d&c")).toBe("d-and-c");
    expect(resolvePastSurgicalCatalogProcedure("hemorrhoidectomy")).toBe("piles");
    expect(resolvePastSurgicalCatalogProcedure("fistulectomy")).toBe("anal-fistula");
    expect(resolvePastSurgicalCatalogProcedure("dns surgery")).toBe("septoplasty");
    expect(resolvePastSurgicalCatalogProcedure("i&d")).toBe("abscess-drainage");
  });

  it("filters catalog by partial query", () => {
    const kneeMatches = filterPastSurgicalProcedureCatalog("knee");
    expect(kneeMatches.some((def) => def.value === "tkr")).toBe(true);
    expect(kneeMatches.some((def) => def.value === "arthroscopy")).toBe(true);

    const heartMatches = filterPastSurgicalProcedureCatalog("heart");
    expect(heartMatches.some((def) => def.value === "cabg")).toBe(true);
    expect(heartMatches.some((def) => def.value === "valve-replacement")).toBe(true);
  });

  it("returns catalog entries sorted alphabetically by label", () => {
    const labels = filterPastSurgicalProcedureCatalog("").map((def) => def.label);
    const sorted = [...labels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    expect(labels).toEqual(sorted);

    const orthoLabels = filterPastSurgicalProcedureCatalog("ectomy").map((def) => def.label);
    const orthoSorted = [...orthoLabels].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    expect(orthoLabels).toEqual(orthoSorted);
  });
});
