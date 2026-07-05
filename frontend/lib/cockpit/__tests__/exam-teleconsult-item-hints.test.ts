import { describe, expect, it } from "vitest";
import {
  resolveExamChipTeleconsultFlags,
  resolveExamStructuredTeleconsultHint,
  resolveExamSubsectionTeleconsultNote,
} from "@/lib/cockpit/exam-teleconsult-item-hints";

describe("exam teleconsult item hints", () => {
  it("flags CVS pulse palpation chips as in-person-only", () => {
    for (const chip of ["Radio-radial delay", "Radio-femoral delay", "Weak or absent pulses"]) {
      const flags = resolveExamChipTeleconsultFlags("cvs", "pulse", chip);
      expect(flags?.inPersonOnly, chip).toBe(true);
      expect(flags?.hint.toLowerCase(), chip).toMatch(/palpation|remotely|teleconsult/i);
    }
  });

  it("flags CNS motor tone chips as in-person-only", () => {
    const flags = resolveExamChipTeleconsultFlags("cns", "motor", "Spasticity");
    expect(flags?.inPersonOnly).toBe(true);
    expect(flags?.hint).toMatch(/passive movement/i);
  });

  it("covers mixed structured cards across systems", () => {
    expect(resolveExamStructuredTeleconsultHint("cvs", "pulse")).toBeDefined();
    expect(resolveExamStructuredTeleconsultHint("general", "edema")).toBeDefined();
    expect(resolveExamStructuredTeleconsultHint("general", "lymphadenopathy")).toBeDefined();
    expect(resolveExamStructuredTeleconsultHint("general", "dehydration")).toBeDefined();
    expect(resolveExamStructuredTeleconsultHint("cns", "weakness")).toBeDefined();
    expect(resolveExamStructuredTeleconsultHint("cns", "cn_facial")).toBeUndefined();
    expect(resolveExamStructuredTeleconsultHint("general", "pallor")).toBeUndefined();
  });

  it("exposes subsection banners for mixed subsections", () => {
    expect(resolveExamSubsectionTeleconsultNote("cvs", "pulse")).toMatch(/teleconsult/i);
    expect(resolveExamSubsectionTeleconsultNote("cns", "motor")).toMatch(/teleconsult/i);
    expect(resolveExamSubsectionTeleconsultNote("general", "volume")).toMatch(/teleconsult/i);
    expect(resolveExamSubsectionTeleconsultNote("general", "demeanor")).toBeUndefined();
  });

  it("never uses video in hint copy", () => {
    const samples = [
      resolveExamChipTeleconsultFlags("cns", "cranial", "Absent gag")?.hint,
      resolveExamStructuredTeleconsultHint("general", "edema"),
      resolveExamSubsectionTeleconsultNote("cvs", "pulse"),
    ].filter(Boolean) as string[];
    for (const hint of samples) {
      expect(hint.toLowerCase()).not.toContain("video");
    }
  });
});
