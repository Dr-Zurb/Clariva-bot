import { describe, expect, it } from "vitest";
import {
  edemaDerivedDetail,
  edemaPreviewParts,
  migrateEdemaAttributes,
  parseEdemaSites,
  patchEdemaSites,
  serializeEdemaSites,
  toggleEdemaSite,
} from "@/lib/cockpit/edema-sites";

describe("edema-sites", () => {
  it("toggles sites on and off in catalog order", () => {
    let sites = toggleEdemaSite([], "ankle");
    sites = toggleEdemaSite(sites, "pedal");
    expect(sites.map((entry) => entry.site)).toEqual(["pedal", "ankle"]);
    sites = toggleEdemaSite(sites, "ankle");
    expect(sites.map((entry) => entry.site)).toEqual(["pedal"]);
  });

  it("patches one site without affecting another", () => {
    const base = toggleEdemaSite(toggleEdemaSite([], "pedal"), "ankle");
    const updated = patchEdemaSites(base, "pedal", {
      laterality: "Left",
      grade: "G2",
    });
    expect(updated).toEqual([
      { site: "pedal", laterality: "Left", grade: "G2" },
      { site: "ankle" },
    ]);
  });

  it("migrates legacy flat attrs and maps pitting to grade", () => {
    const migrated = migrateEdemaAttributes({
      site: "Pedal",
      laterality: "Right",
      pitting: "+++",
    });
    expect(parseEdemaSites(migrated)).toEqual([
      { site: "pedal", laterality: "Right", grade: "G3" },
    ]);
  });

  it("builds collapsed and derived previews per site", () => {
    const attributes = {
      sitesJson: serializeEdemaSites([
        { site: "pedal", laterality: "Left", grade: "G2", context: ["Dependent"] },
        { site: "generalized", grade: "G3" },
      ]),
    };
    expect(edemaPreviewParts(attributes)).toEqual([
      "Pedal (Left, G2, Dependent)",
      "Generalized (G3)",
    ]);
    expect(edemaDerivedDetail(attributes)).toBe(
      "Pedal: left, G2, dependent; Generalized: G3",
    );
  });
});
