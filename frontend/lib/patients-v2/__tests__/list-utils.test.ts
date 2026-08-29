import { describe, expect, it } from "vitest";
import { formatPatientDisplayName } from "@/lib/patients-v2/list-utils";

describe("formatPatientDisplayName", () => {
  it("leaves already title-cased names alone", () => {
    expect(formatPatientDisplayName("Ramesh Masih")).toBe("Ramesh Masih");
  });

  it("title-cases all-lowercase names", () => {
    expect(formatPatientDisplayName("akashdeep singh")).toBe("Akashdeep Singh");
  });

  it("title-cases ALL CAPS names", () => {
    expect(formatPatientDisplayName("AKASHDEEP SINGH")).toBe("Akashdeep Singh");
  });

  it("handles multi-word names", () => {
    expect(formatPatientDisplayName("mary anne smith")).toBe("Mary Anne Smith");
  });

  it("trims leading and trailing spaces", () => {
    expect(formatPatientDisplayName("  akashdeep singh  ")).toBe("Akashdeep Singh");
  });

  it("collapses internal whitespace", () => {
    expect(formatPatientDisplayName("akashdeep   singh")).toBe("Akashdeep Singh");
  });

  it("returns empty for blank input", () => {
    expect(formatPatientDisplayName("")).toBe("");
    expect(formatPatientDisplayName("   ")).toBe("");
  });
});
