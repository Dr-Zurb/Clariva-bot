import { describe, it, expect } from "vitest";
import {
  deriveTestResults,
  normalizeTestResults,
} from "@/lib/cockpit/test-results";
import type { TestResultRow } from "@/types/prescription";

const HBA1C: TestResultRow = {
  id: "r1",
  source: "patient_report",
  name: "HbA1c",
  value: "7.8",
  unit: "%",
  date: "2026-06-10",
  interpretation: "high",
  notes: "fasting",
};

const RBS: TestResultRow = {
  id: "r2",
  source: "in_clinic_poc",
  name: "RBS",
  value: "180",
  unit: "mg/dL",
};

describe("normalizeTestResults (obj-20)", () => {
  it("drops rows with empty name or bad source and collapses empty strings to null", () => {
    const result = normalizeTestResults([
      { id: "a", source: "patient_report", name: "  " },
      { id: "b", source: "bogus", name: "X" } as unknown as TestResultRow,
      {
        id: " r1 ",
        source: "in_clinic_poc",
        name: " RBS ",
        value: " 180 ",
        unit: "",
        date: "  ",
        interpretation: "weird" as unknown as TestResultRow["interpretation"],
        notes: "  high  ",
      },
    ]);
    expect(result).toEqual([
      {
        id: "r1",
        source: "in_clinic_poc",
        name: "RBS",
        value: "180",
        unit: null,
        date: null,
        interpretation: null,
        notes: "high",
      },
    ]);
  });

  it("returns [] for non-array input", () => {
    expect(normalizeTestResults(null)).toEqual([]);
    expect(normalizeTestResults(undefined)).toEqual([]);
  });

  it("preserves row order", () => {
    const result = normalizeTestResults([RBS, HBA1C]);
    expect(result.map((r) => r.id)).toEqual(["r2", "r1"]);
  });
});

describe("deriveTestResults (OBJ-D2)", () => {
  it("renders rows in array order with name/value/unit/interpretation/date/notes", () => {
    expect(deriveTestResults([HBA1C, RBS])).toBe(
      [
        "HbA1c: 7.8 % (High) [2026-06-10] — fasting",
        "RBS: 180 mg/dL",
      ].join("\n"),
    );
  });

  it("renders a name-only row when no measurement is present", () => {
    expect(
      deriveTestResults([
        { id: "x", source: "in_clinic_poc", name: "Urine dipstick" },
      ]),
    ).toBe("Urine dipstick");
  });

  it("returns an empty string for an empty / all-dropped list", () => {
    expect(deriveTestResults([])).toBe("");
    expect(
      deriveTestResults([
        { id: "x", source: "bogus", name: "X" } as unknown as TestResultRow,
      ]),
    ).toBe("");
  });
});
