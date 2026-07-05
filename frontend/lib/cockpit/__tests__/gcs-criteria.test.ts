import { describe, expect, it } from "vitest";
import {
  GCS_CRITERIA_SECTIONS,
  gcsCriteriaForComponent,
  gcsCriteriaSections,
} from "@/lib/cockpit/gcs-criteria";
import { GCS_COMPONENT_KEYS } from "@/lib/cockpit/gcs-subscore";
import { resolveVital } from "@/lib/cockpit/vitals-schema";

describe("gcs-criteria", () => {
  it("defines adult criteria for each GCS component", () => {
    expect(GCS_CRITERIA_SECTIONS).toHaveLength(3);
    for (const key of GCS_COMPONENT_KEYS) {
      expect(gcsCriteriaForComponent(key).componentKey).toBe(key);
    }
  });

  it("aligns row score bounds with the vitals registry", () => {
    for (const section of GCS_CRITERIA_SECTIONS) {
      const def = resolveVital(section.componentKey);
      const scores = section.rows.map((row) => row.score);
      expect(Math.min(...scores)).toBe(def.hardMin);
      expect(Math.max(...scores)).toBe(def.hardMax);
      expect(scores).toHaveLength(def.hardMax - def.hardMin + 1);
    }
  });

  it("returns all sections or a single component slice", () => {
    expect(gcsCriteriaSections()).toHaveLength(3);
    expect(gcsCriteriaSections("vitalsGcsE")).toHaveLength(1);
    expect(gcsCriteriaSections("vitalsGcsE")[0]?.title).toBe("Eye (E)");
  });
});
