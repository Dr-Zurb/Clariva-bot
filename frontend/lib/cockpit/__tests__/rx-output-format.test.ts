import { describe, expect, it } from "vitest";
import {
  formatAllergiesForOutput,
  formatVitalsForOutput,
} from "@/lib/cockpit/rx-output-format";

describe("formatAllergiesForOutput", () => {
  it("matches the PDF: empty chart omits the Allergies line", () => {
    expect(formatAllergiesForOutput([])).toBeNull();
  });

  it("matches the PDF: unknown severity prints allergen only", () => {
    expect(
      formatAllergiesForOutput([
        { allergen: "Penicillin", severity: "unknown", reaction: null },
      ])
    ).toBe("Penicillin");
  });

  it("matches the PDF: asserted nil-known is No known allergies", () => {
    expect(formatAllergiesForOutput([], { noKnownAllergies: true })).toBe(
      "No known allergies"
    );
    expect(
      formatAllergiesForOutput([], { noKnownAllergies: false })
    ).toBeNull();
  });

  it("matches the PDF: a recorded allergen outranks a stale assertion", () => {
    expect(
      formatAllergiesForOutput(
        [{ allergen: "Peanuts", severity: "severe", reaction: "anaphylaxis" }],
        { noKnownAllergies: true }
      )
    ).toBe("Peanuts (severe — anaphylaxis)");
  });
});

describe("formatVitalsForOutput", () => {
  it("matches the PDF: numbers only when there is no visit note", () => {
    expect(
      formatVitalsForOutput({
        vitalsBpSystolic: 120,
        vitalsBpDiastolic: 80,
      })
    ).toBe("BP 120/80");
  });

  it("matches the PDF: appends the visit-level vitals note after the numbers", () => {
    expect(
      formatVitalsForOutput({
        vitalsBpSystolic: 120,
        vitalsBpDiastolic: 80,
        note: "234234",
      })
    ).toBe("BP 120/80 — 234234");
  });

  it("matches the PDF: note-only when no numeric vitals are recorded", () => {
    expect(formatVitalsForOutput({ note: "sitting, post-walk" })).toBe(
      "sitting, post-walk"
    );
  });
});
