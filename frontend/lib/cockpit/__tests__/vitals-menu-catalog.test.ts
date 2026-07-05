import { describe, expect, it } from "vitest";
import {
  buildVitalsMenuCatalog,
  sortVitalsMenuCatalogWithinGroups,
  VITAL_MENU_GROUP_ORDER,
} from "@/lib/cockpit/vitals-menu-catalog";

describe("vitals-menu-catalog (vit-08)", () => {
  it("sorts vitals alphabetically by label within each group", () => {
    const catalog = buildVitalsMenuCatalog();
    for (const group of VITAL_MENU_GROUP_ORDER) {
      const labels = catalog.filter((entry) => entry.group === group).map((entry) => entry.label);
      const sorted = [...labels].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      );
      expect(labels).toEqual(sorted);
    }
  });

  it("sortVitalsMenuCatalogWithinGroups preserves group order", () => {
    const shuffled = [
      { key: "vitalsRr" as const, label: "Respiratory Rate (RR)", group: "core" as const },
      { key: "vitalsHr" as const, label: "Pulse Rate (PR)", group: "core" as const },
      { key: "vitalsGcsTotal" as const, label: "GCS Total", group: "neuro" as const },
    ];
    const sorted = sortVitalsMenuCatalogWithinGroups(shuffled);
    expect(sorted.map((e) => e.label)).toEqual([
      "Pulse Rate (PR)",
      "Respiratory Rate (RR)",
      "GCS Total",
    ]);
  });
});
