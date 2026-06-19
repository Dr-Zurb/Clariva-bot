import { describe, expect, it } from "vitest";
import {
  buildConfirmedDefaultsPatch,
  filterSuggestionsForEmptyFields,
  mergePriorComplaintPools,
  mostCommonAttributeValue,
  pickMatchingPriorComplaints,
  resolveComplaintAttributeDefaults,
} from "@/lib/cockpit/complaint-defaults";
import type { Complaint } from "@/types/prescription";

const priorHeadaches: Complaint[] = [
  {
    id: "p1",
    name: "Headache",
    duration: "2d",
    severity: "moderate",
    character: "throbbing",
    category: "pain",
  },
  {
    id: "p2",
    name: "Headache",
    duration: "2d",
    severity: "severe",
    character: "throbbing",
    category: "pain",
  },
  {
    id: "p3",
    name: "Headache",
    duration: "1wk",
    severity: "moderate",
    character: "dull",
    category: "pain",
  },
];

describe("complaint-defaults", () => {
  it("picks most common attribute values for matching complaint name", () => {
    const defaults = resolveComplaintAttributeDefaults({
      complaintName: "Headache",
      category: "pain",
      priorComplaints: priorHeadaches,
      attributeKeys: ["duration", "severity", "character"],
    });

    expect(defaults.duration).toBe("2d");
    expect(defaults.severity).toBe("moderate");
    expect(defaults.character).toBe("throbbing");
  });

  it("returns empty defaults when name has no prior match", () => {
    const defaults = resolveComplaintAttributeDefaults({
      complaintName: "Migraine",
      category: "pain",
      priorComplaints: priorHeadaches,
      attributeKeys: ["duration", "severity"],
    });

    expect(defaults).toEqual({});
  });

  it("returns empty defaults for unknown complaint with no priors", () => {
    const defaults = resolveComplaintAttributeDefaults({
      complaintName: "Unknown symptom",
      category: "default",
      priorComplaints: [],
      attributeKeys: ["duration", "onset"],
    });

    expect(defaults).toEqual({});
  });

  it("filters suggestions to empty fields only (explicit edit wins)", () => {
    const value: Complaint = {
      id: "c1",
      name: "Headache",
      duration: "Today",
    };
    const suggestions = {
      duration: "2d",
      severity: "moderate" as const,
      character: "throbbing",
    };

    const filtered = filterSuggestionsForEmptyFields(value, suggestions, [
      "duration",
      "severity",
      "character",
    ]);

    expect(filtered.duration).toBeUndefined();
    expect(filtered.severity).toBe("moderate");
    expect(filtered.character).toBe("throbbing");
  });

  it("builds confirm patch from suggestions", () => {
    const patch = buildConfirmedDefaultsPatch({
      duration: "2d",
      severity: "moderate",
    });

    expect(patch).toEqual({ duration: "2d", severity: "moderate" });
  });

  it("merges prior complaint pools without duplicate ids", () => {
    const merged = mergePriorComplaintPools(
      [{ id: "a", name: "Fever" }],
      [{ id: "a", name: "Fever" }, { id: "b", name: "Cough" }],
    );
    expect(merged).toHaveLength(2);
  });

  it("mostCommonAttributeValue picks the mode", () => {
    expect(mostCommonAttributeValue(["2d", "2d", "1wk"])).toBe("2d");
    expect(mostCommonAttributeValue([])).toBeUndefined();
  });

  it("pickMatchingPriorComplaints matches by name only", () => {
    const pool: Complaint[] = [
      { id: "1", name: "Fever", duration: "1d", category: "fever" },
      ...priorHeadaches,
    ];
    expect(pickMatchingPriorComplaints("Headache", pool)).toHaveLength(3);
    expect(pickMatchingPriorComplaints("Migraine", pool)).toHaveLength(0);
    expect(pickMatchingPriorComplaints("Fever", pool)).toHaveLength(1);
  });
});
