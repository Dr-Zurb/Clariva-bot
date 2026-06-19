import { describe, expect, it } from "vitest";
import {
  fitAssociatedNamesText,
  formatComplaintDisplayName,
} from "@/lib/cockpit/complaint-display";

describe("formatComplaintDisplayName", () => {
  it("capitalizes the first letter", () => {
    expect(formatComplaintDisplayName("headache")).toBe("Headache");
    expect(formatComplaintDisplayName("chest pain")).toBe("Chest pain");
    expect(formatComplaintDisplayName("")).toBe("");
  });
});

describe("fitAssociatedNamesText", () => {
  const measure = (text: string) => text.length * 8;

  it("shows all names when they fit", () => {
    expect(fitAssociatedNamesText(["vomiting", "Nausea"], 200, measure)).toBe(
      "Vomiting, Nausea",
    );
  });

  it("shows +N only when width is exceeded", () => {
    const names = ["Headache", "Nausea", "Vomiting"];
    expect(fitAssociatedNamesText(names, 400, measure)).toBe(
      "Headache, Nausea, Vomiting",
    );
    // Full suffix is longer than "Headache, Nausea +1" — unlike single-letter names.
    expect(fitAssociatedNamesText(names, 220, measure)).toBe("Headache, Nausea +1");
    expect(fitAssociatedNamesText(names, 40, measure)).toBe("+3");
  });
});
