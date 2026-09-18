import { describe, expect, it } from "vitest";
import type { DoctorComplaintCombo } from "@/lib/api/doctor-complaint-combos";
import {
  formatComplaintComboHint,
  matchComplaintCombos,
} from "@/lib/cockpit/complaint-combos";

function combo(
  overrides: Partial<DoctorComplaintCombo> &
    Pick<DoctorComplaintCombo, "complaintName" | "nameKey">
): DoctorComplaintCombo {
  return {
    category: "pain",
    severityBand: "moderate",
    laterality: null,
    character: null,
    associatedNames: ["photophobia", "nausea"],
    useCount: 1,
    lastUsedAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("matchComplaintCombos", () => {
  const rows = [
    combo({
      complaintName: "Headache",
      nameKey: "headache",
      useCount: 24,
    }),
    combo({
      complaintName: "Headache",
      nameKey: "headache",
      severityBand: "severe",
      associatedNames: [],
      useCount: 4,
    }),
    combo({
      complaintName: "Heartburn",
      nameKey: "heartburn",
      category: "gi",
      severityBand: "mild",
      associatedNames: [],
    }),
  ];

  it("returns prefix matches for a complaint name, already-ranked order", () => {
    const matched = matchComplaintCombos(rows, "head");
    expect(matched.map((c) => c.severityBand)).toEqual(["moderate", "severe"]);
  });

  it("matches the doctor's typed shorthand", () => {
    expect(matchComplaintCombos(rows, "he").map((c) => c.nameKey)).toEqual([
      "headache",
      "headache",
      "heartburn",
    ]);
  });

  it("stays silent below two characters", () => {
    expect(matchComplaintCombos(rows, "h")).toEqual([]);
  });

  it("caps the list at three", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      combo({
        complaintName: "Headache",
        nameKey: "headache",
        severityBand: i % 2 === 0 ? "moderate" : "severe",
        useCount: 8 - i,
      })
    );
    expect(matchComplaintCombos(many, "head")).toHaveLength(3);
  });
});

describe("formatComplaintComboHint", () => {
  it("shows name, severity, and associated without a use count", () => {
    const hint = formatComplaintComboHint(
      combo({
        complaintName: "Headache",
        nameKey: "headache",
        useCount: 24,
      })
    );
    expect(hint).toBe("Headache · moderate · + photophobia, nausea");
    expect(hint).not.toMatch(/24|used|×/);
  });
});
