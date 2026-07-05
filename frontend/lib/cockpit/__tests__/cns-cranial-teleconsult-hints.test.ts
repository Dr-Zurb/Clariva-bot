import { describe, expect, it } from "vitest";
import {
  CNS_CRANIAL_CHIP_TELECONSULT_HINTS,
  CNS_CRANIAL_IN_PERSON_ONLY_CHIPS,
  CNS_CRANIAL_STRUCTURED_TELECONSULT_HINTS,
  CNS_EXAM_SUBSECTIONS,
  isCnsCranialChipInPersonOnly,
  resolveCnsCranialChipTeleconsultHint,
  resolveCnsCranialStructuredTeleconsultHint,
} from "@/lib/cockpit/cns-exam-finding-schema";

describe("CNS cranial teleconsult hints", () => {
  const cranial = CNS_EXAM_SUBSECTIONS.find((s) => s.id === "cranial");
  expect(cranial).toBeDefined();

  it("flags limited chips without marking the whole cranial subsection in_person_only", () => {
    expect(cranial!.remote).toBeUndefined();
    expect(Object.keys(CNS_CRANIAL_CHIP_TELECONSULT_HINTS).length).toBeGreaterThan(0);
    for (const chip of cranial!.chips) {
      const hint = resolveCnsCranialChipTeleconsultHint(chip);
      if (hint) {
        expect(hint.toLowerCase()).toMatch(/teleconsult|remotely|in-person|in person/i);
        expect(hint.toLowerCase()).not.toContain("video");
      }
    }
  });

  it("marks Absent gag as definite in-person-only", () => {
    expect(isCnsCranialChipInPersonOnly("Absent gag")).toBe(true);
    expect(CNS_CRANIAL_IN_PERSON_ONLY_CHIPS.has("Absent gag")).toBe(true);
    expect(isCnsCranialChipInPersonOnly("Facial droop")).toBe(false);
  });

  it("covers structured cranial cards with contact-dependent fields", () => {
    for (const findingId of [
      "cn_vision",
      "cn_trigeminal",
      "cn_vestibulocochlear",
      "cn_bulbar",
    ]) {
      const hint = resolveCnsCranialStructuredTeleconsultHint(findingId);
      expect(hint, findingId).toBeDefined();
      expect(hint!.toLowerCase()).not.toContain("video");
    }
    expect(resolveCnsCranialStructuredTeleconsultHint("cn_facial")).toBeUndefined();
    expect(resolveCnsCranialStructuredTeleconsultHint("cn_eom_pupils")).toBeUndefined();
    expect(resolveCnsCranialStructuredTeleconsultHint("cn_accessory")).toBeUndefined();
  });

  it("keeps observable cranial chips free of teleconsult hints", () => {
    for (const chip of ["Facial droop", "Ptosis", "Tongue deviation", "Anosmia"]) {
      expect(resolveCnsCranialChipTeleconsultHint(chip)).toBeUndefined();
    }
  });

  it("structured hint map keys stay aligned with cranial structuredFindingIds", () => {
    for (const findingId of Object.keys(CNS_CRANIAL_STRUCTURED_TELECONSULT_HINTS)) {
      expect(cranial!.structuredFindingIds).toContain(findingId);
    }
  });
});
