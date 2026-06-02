import { describe, expect, it } from "vitest";
import {
  formatCountSummary,
  summarizeSnapshotPane,
  summarizeSnapshotVitals,
} from "../snapshot-pane-summary";

describe("snapshot-pane-summary", () => {
  it("summarizeSnapshotVitals joins height and weight", () => {
    expect(
      summarizeSnapshotVitals({ heightCm: "172.0", weightKg: "65.0" }),
    ).toBe("172cm · 65kg");
  });

  it("summarizeSnapshotVitals returns empty copy when no vitals", () => {
    expect(summarizeSnapshotVitals({ heightCm: null, weightKg: null })).toBe(
      "No vitals on file",
    );
  });

  it("formatCountSummary pluralizes", () => {
    expect(formatCountSummary(3, "allergy", "allergies", "No allergies")).toBe(
      "3 allergies",
    );
  });

  it("summarizeSnapshotPane composes section summaries", () => {
    expect(
      summarizeSnapshotPane(2, 1, 0, 0, "172cm · 65kg"),
    ).toBe("2 allergies · 1 condition · 172cm · 65kg");
  });
});
