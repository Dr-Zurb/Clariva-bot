import { describe, expect, it } from "vitest";
import { digitsLast10, formatDeskPhone, isCompleteDeskPhone } from "@/lib/desk/phone";

describe("digitsLast10", () => {
  it("keeps a 10-digit mobile", () => {
    expect(digitsLast10("9814861579")).toBe("9814861579");
  });

  it("strips country code and punctuation", () => {
    expect(digitsLast10("+91 98148-61579")).toBe("9814861579");
  });

  it("returns a short tail when under 10 digits", () => {
    expect(digitsLast10("98148")).toBe("98148");
    expect(isCompleteDeskPhone("98148")).toBe(false);
    expect(isCompleteDeskPhone("+91 98148 61579")).toBe(true);
  });
});

describe("formatDeskPhone", () => {
  it("shows a complete mobile as 10 digits", () => {
    expect(formatDeskPhone("+91 98148-61579")).toBe("9814861579");
  });

  it("returns the digit tail when incomplete", () => {
    expect(formatDeskPhone("98148")).toBe("98148");
    expect(formatDeskPhone("")).toBe("");
  });
});
