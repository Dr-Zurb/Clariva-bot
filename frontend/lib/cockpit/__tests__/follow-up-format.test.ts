import { describe, expect, it } from "vitest";
import {
  formatStructuredFollowUp,
  hydrateFollowUpNotes,
  resolveFollowUpForOutput,
} from "@/lib/cockpit/follow-up-format";
import {
  buildRxPayload,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";

describe("follow-up-format (plan-p1 / follow-up polish)", () => {
  it("formats structured value+unit", () => {
    expect(formatStructuredFollowUp(5, "days")).toBe("in 5 days");
    expect(formatStructuredFollowUp(1, "weeks")).toBe("in 1 week");
    expect(formatStructuredFollowUp(null, "as_needed")).toBe("as needed");
    expect(formatStructuredFollowUp(null, "days")).toBeNull();
    expect(formatStructuredFollowUp(0, "days")).toBeNull();
  });

  it("merges structured interval with notes", () => {
    expect(resolveFollowUpForOutput("Call if worse", 5, "days")).toBe(
      "in 5 days — Call if worse",
    );
    expect(resolveFollowUpForOutput("  bring labs  ", 5, "days")).toBe(
      "in 5 days — bring labs",
    );
  });

  it("derives from structured when notes empty", () => {
    expect(resolveFollowUpForOutput("", 2, "months")).toBe("in 2 months");
    expect(resolveFollowUpForOutput(null, null, "as_needed")).toBe("as needed");
    expect(resolveFollowUpForOutput("   ", null, null)).toBeNull();
  });

  it("uses notes alone when structured empty", () => {
    expect(resolveFollowUpForOutput("PRN SOS clinic", null, null)).toBe(
      "PRN SOS clinic",
    );
  });

  it("dedupes persisted output echo in follow_up TEXT", () => {
    expect(resolveFollowUpForOutput("in 5 days", 5, "days")).toBe("in 5 days");
    expect(
      resolveFollowUpForOutput("in 5 days — bring labs", 5, "days"),
    ).toBe("in 5 days — bring labs");
  });

  it("hydrateFollowUpNotes strips echoes for the notes field", () => {
    expect(hydrateFollowUpNotes("in 5 days", 5, "days")).toBe("");
    expect(hydrateFollowUpNotes("in 5 days — bring labs", 5, "days")).toBe(
      "bring labs",
    );
    expect(hydrateFollowUpNotes("bring labs", 5, "days")).toBe("bring labs");
    expect(hydrateFollowUpNotes("1 week", null, null)).toBe("1 week");
  });
});

describe("buildRxPayload follow-up notes-only persist", () => {
  it("persists notes only when free-text set (not the merged output)", () => {
    const fields = {
      ...createEmptyRxFormFields(),
      followUp: "PRN SOS clinic",
      followUpValue: 7,
      followUpUnit: "days" as const,
    };
    expect(buildRxPayload(fields).followUp).toBe("PRN SOS clinic");
    expect(buildRxPayload(fields).followUpValue).toBe(7);
    expect(buildRxPayload(fields).followUpUnit).toBe("days");
  });

  it("persists null followUp when notes empty; keeps structured fields", () => {
    const fields = {
      ...createEmptyRxFormFields(),
      followUp: "",
      followUpValue: 3,
      followUpUnit: "weeks" as const,
    };
    expect(buildRxPayload(fields).followUp).toBeNull();
    expect(buildRxPayload(fields).followUpValue).toBe(3);
    expect(buildRxPayload(fields).followUpUnit).toBe("weeks");
  });
});
