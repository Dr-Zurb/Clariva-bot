import { describe, expect, it } from "vitest";
import {
  lymphDerivedDetail,
  lymphPreviewParts,
  migrateLymphadenopathyAttributes,
  parseLymphSites,
  patchLymphSites,
  serializeLymphSites,
  toggleLymphSite,
} from "@/lib/cockpit/lymphadenopathy-sites";

describe("lymphadenopathy-sites", () => {
  it("toggles sites and patches per-site attributes independently", () => {
    let sites = toggleLymphSite(toggleLymphSite([], "cervical"), "axillary");
    sites = patchLymphSites(sites, "cervical", {
      laterality: "Left",
      size: ">2 cm",
      character: ["Tender", "Fixed"],
    });
    sites = patchLymphSites(sites, "axillary", {
      laterality: "Bilateral",
      character: ["Mobile"],
    });
    expect(sites).toEqual([
      {
        site: "cervical",
        laterality: "Left",
        size: ">2 cm",
        character: ["Tender", "Fixed"],
      },
      { site: "axillary", laterality: "Bilateral", character: ["Mobile"] },
    ]);
  });

  it("migrates legacy flat attrs into sitesJson", () => {
    const migrated = migrateLymphadenopathyAttributes({
      sites: "Cervical, Axillary",
      character: "Mobile, Tender",
      notes: "2 cm",
    });
    expect(parseLymphSites(migrated)).toEqual([
      { site: "cervical", character: ["Mobile", "Tender"], notes: "2 cm" },
      { site: "axillary", character: ["Mobile", "Tender"], notes: "2 cm" },
    ]);
  });

  it("builds collapsed and derived previews per site", () => {
    const attributes = {
      sitesJson: serializeLymphSites([
        {
          site: "cervical",
          laterality: "Left",
          size: ">2 cm",
          character: ["Tender", "Fixed"],
        },
        { site: "generalized", character: ["Mobile"] },
      ]),
    };
    expect(lymphPreviewParts(attributes)).toEqual([
      "Cervical (Left, >2 cm, Tender, Fixed)",
      "Generalized (Mobile)",
    ]);
    expect(lymphDerivedDetail(attributes)).toBe(
      "Cervical: left, >2 cm, tender, fixed; Generalized: mobile",
    );
  });
});
