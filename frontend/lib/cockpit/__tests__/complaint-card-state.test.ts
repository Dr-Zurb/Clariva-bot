import { describe, expect, it } from "vitest";
import {
  buildComplaintAssociatedSuffix,
  buildComplaintSummary,
  complaintHasNotes,
  formatComplaintSeverityLabel,
  isScoreInSeverityBand,
  listAssociatedComplaintNames,
  painScoreToSeverityBand,
  severityBandToScore,
} from "@/lib/cockpit/complaint-card-state";
import { createEmptyComplaint } from "@/components/cockpit/rx/RxFormContext";
import type { Complaint } from "@/types/prescription";

const base: Complaint = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Chest pain",
};

describe("buildComplaintAssociatedSuffix", () => {
  it("lists a single associated symptom by name", () => {
    const parent = {
      ...base,
      associatedComplaints: [
        { ...createEmptyComplaint(), name: "Breathlessness" },
      ],
    };
    expect(buildComplaintAssociatedSuffix(parent)).toBe("Breathlessness");
    expect(listAssociatedComplaintNames(parent)).toEqual(["Breathlessness"]);
  });

  it("joins two names with a comma", () => {
    const parent = {
      ...base,
      associatedComplaints: [
        { ...createEmptyComplaint(), name: "Breathlessness" },
        { ...createEmptyComplaint(), name: "Sweating" },
      ],
    };
    expect(buildComplaintAssociatedSuffix(parent)).toBe("Breathlessness, Sweating");
  });

  it("joins all associated names for tooltips (width-based UI truncates)", () => {
    const parent = {
      ...base,
      associatedComplaints: [
        { ...createEmptyComplaint(), name: "Breathlessness" },
        { ...createEmptyComplaint(), name: "Sweating" },
        { ...createEmptyComplaint(), name: "Palpitations" },
        { ...createEmptyComplaint(), name: "Nausea" },
      ],
    };
    expect(buildComplaintAssociatedSuffix(parent)).toBe(
      "Breathlessness, Sweating, Palpitations, Nausea",
    );
    expect(listAssociatedComplaintNames(parent)).toEqual([
      "Breathlessness",
      "Sweating",
      "Palpitations",
      "Nausea",
    ]);
  });
});

describe("buildComplaintSummary", () => {
  it("returns empty when no detail fields are filled", () => {
    expect(buildComplaintSummary(base)).toBe("");
  });

  it("shows severity alone on row 2 when no other details exist", () => {
    expect(buildComplaintSummary({ ...base, severity: "severe" })).toBe("Severe");
  });

  it("leads with severity and excludes duration from row 2", () => {
    expect(
      buildComplaintSummary({
        ...base,
        duration: "4 days",
        severity: "mild",
        character: "sharp",
      }),
    ).toBe("Mild · sharp");
  });

  it("joins filled SOCRATES fields after severity (schema order)", () => {
    expect(
      buildComplaintSummary({
        ...base,
        severity: "moderate",
        character: "sharp",
        location: "central",
        onset: "sudden",
        radiation: "left arm",
        timing: "constant",
      }),
    ).toBe("Moderate · central · sudden · sharp · → left arm · constant");
  });

  it("keeps radiation text when it already includes radiating", () => {
    expect(
      buildComplaintSummary({
        ...base,
        radiation: "radiating to left arm",
      }),
    ).toBe("radiating to left arm");
  });

  it("includes exacerbating and relieving factors with directional prefixes", () => {
    expect(
      buildComplaintSummary({
        ...base,
        character: "sharp",
        aggravating: "bending",
        relieving: "standing",
      }),
    ).toBe("sharp · ↑ bending · ↓ standing");
  });

  it("excludes notes from the inline summary (shown as icon instead)", () => {
    expect(
      buildComplaintSummary({
        ...base,
        notes: "its chronically present",
        character: "sharp",
      }),
    ).toBe("sharp");
    expect(
      complaintHasNotes({
        ...base,
        notes: "its chronically present",
      }),
    ).toBe(true);
  });
});

describe("severity ⇄ pain score binding (subj-14 refine)", () => {
  it("maps a 0-10 score onto the right band (0 = no pain)", () => {
    expect(painScoreToSeverityBand(0)).toBeNull();
    expect(painScoreToSeverityBand(2)).toBe("mild");
    expect(painScoreToSeverityBand(3)).toBe("mild");
    expect(painScoreToSeverityBand(4)).toBe("moderate");
    expect(painScoreToSeverityBand(6)).toBe("moderate");
    expect(painScoreToSeverityBand(7)).toBe("severe");
    expect(painScoreToSeverityBand(8)).toBe("severe");
    expect(painScoreToSeverityBand(9)).toBe("very_severe");
    expect(painScoreToSeverityBand(10)).toBe("very_severe");
  });

  it("returns a representative score for each band (minimal folds to mild)", () => {
    expect(severityBandToScore("mild")).toBe(2);
    expect(severityBandToScore("moderate")).toBe(5);
    expect(severityBandToScore("severe")).toBe(8);
    expect(severityBandToScore("very_severe")).toBe(10);
    expect(severityBandToScore("minimal")).toBe(2);
    expect(severityBandToScore(7)).toBeNull();
    expect(severityBandToScore(null)).toBeNull();
  });

  it("knows when a score already sits inside a band (so a chip tap won't snap it)", () => {
    expect(isScoreInSeverityBand(7, "severe")).toBe(true);
    expect(isScoreInSeverityBand(8, "severe")).toBe(true);
    expect(isScoreInSeverityBand(5, "severe")).toBe(false);
    expect(isScoreInSeverityBand(2, "mild")).toBe(true);
    expect(isScoreInSeverityBand(null, "mild")).toBe(false);
  });

  it("labels very_severe and legacy minimal correctly", () => {
    expect(formatComplaintSeverityLabel("very_severe")).toBe("Very severe");
    expect(formatComplaintSeverityLabel("minimal")).toBe("Minimal");
    expect(formatComplaintSeverityLabel("mild")).toBe("Mild");
    expect(formatComplaintSeverityLabel(7)).toBe("7/10");
    expect(formatComplaintSeverityLabel(null)).toBeNull();
  });
});
