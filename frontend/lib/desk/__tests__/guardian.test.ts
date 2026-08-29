import { describe, expect, it } from "vitest";
import { deskGuardianNameLabel, formatDeskGuardian } from "@/lib/desk/guardian";

describe("formatDeskGuardian", () => {
  it("uses s/o for a father when sex is not female", () => {
    expect(formatDeskGuardian("Ram Prakash", "father", "male")).toBe("s/o Ram Prakash");
    expect(formatDeskGuardian("Ram Prakash", "father")).toBe("s/o Ram Prakash");
  });

  it("uses d/o for a father when the patient is female", () => {
    expect(formatDeskGuardian("Ram Prakash", "father", "female")).toBe("d/o Ram Prakash");
  });

  it("uses w/o for a spouse and c/o for other relations", () => {
    expect(formatDeskGuardian("Ram Prakash", "spouse")).toBe("w/o Ram Prakash");
    expect(formatDeskGuardian("Anita", "mother")).toBe("c/o Anita");
    expect(formatDeskGuardian("Amit", "son")).toBe("c/o Amit");
  });

  it("returns the bare name when relation is missing", () => {
    expect(formatDeskGuardian("Ram Prakash")).toBe("Ram Prakash");
    expect(formatDeskGuardian("  ")).toBe("");
  });
});

describe("deskGuardianNameLabel", () => {
  it("names the field after the selected relation", () => {
    expect(deskGuardianNameLabel("father")).toBe("Father's name");
    expect(deskGuardianNameLabel("spouse")).toBe("Spouse's name");
    expect(deskGuardianNameLabel("mother")).toBe("Mother's name");
  });
});
