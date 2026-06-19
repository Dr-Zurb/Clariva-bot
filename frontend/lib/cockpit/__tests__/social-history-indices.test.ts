import { describe, expect, it } from "vitest";
import {
  auditCClinicalHint,
  auditCScore,
  auditFullClinicalHint,
  auditFullScore,
  AUDIT_C_POSITIVE_THRESHOLD,
  cageScore,
  durationToYears,
  isAuditCPanelOpen,
  isAuditFullPanelOpen,
  isCagePanelOpen,
  packYears,
  packYearsClinicalHint,
} from "@/lib/cockpit/social-history-indices";

describe("durationToYears", () => {
  it("converts months to fractional years", () => {
    expect(durationToYears(6, "months")).toBe(0.5);
    expect(durationToYears(12, "months")).toBe(1);
  });

  it("converts days to fractional years", () => {
    expect(durationToYears(365, "days")).toBeCloseTo(0.999, 2);
  });

  it("passes through year values unchanged", () => {
    expect(durationToYears(10, "years")).toBe(10);
    expect(durationToYears(10)).toBe(10);
  });

  it("returns null for missing or non-positive values", () => {
    expect(durationToYears(undefined, "months")).toBeNull();
    expect(durationToYears(0, "years")).toBeNull();
  });
});

describe("packYears", () => {
  it("computes pack-years with one decimal place", () => {
    expect(packYears(20, 10)).toBe(10);
    expect(packYears(10, 20)).toBe(10);
    expect(packYears(15, 13)).toBe(9.8);
  });

  it("computes pack-years from month duration", () => {
    expect(packYears(20, 6, "months")).toBe(0.5);
    expect(packYears(2, 6, "months")).toBe(0.1);
  });

  it("returns null when either input is missing", () => {
    expect(packYears(undefined, 10)).toBeNull();
    expect(packYears(10, undefined)).toBeNull();
    expect(packYears(undefined, undefined)).toBeNull();
  });

  it("returns null for zero or negative inputs", () => {
    expect(packYears(0, 10)).toBeNull();
    expect(packYears(10, 0)).toBeNull();
    expect(packYears(-5, 10)).toBeNull();
  });
});

describe("cageScore", () => {
  it("counts yes answers and flags screen positive at ≥2", () => {
    expect(
      cageScore({ cutDown: true, annoyed: true, guilty: false, eyeOpener: false }),
    ).toEqual({ score: 2, positive: true });
    expect(
      cageScore({ cutDown: true, annoyed: false, guilty: false, eyeOpener: false }),
    ).toEqual({ score: 1, positive: false });
    expect(
      cageScore({ cutDown: true, annoyed: true, guilty: true, eyeOpener: true }),
    ).toEqual({ score: 4, positive: true });
  });

  it("returns null when cage is undefined", () => {
    expect(cageScore(undefined)).toBeNull();
  });
});

describe("auditCScore", () => {
  it("sums three 0–4 answers and flags screen positive at threshold", () => {
    expect(
      auditCScore({ frequency: 2, typicalQuantity: 1, bingeFrequency: 1 }),
    ).toEqual({ score: 4, positive: true });
    expect(
      auditCScore({ frequency: 1, typicalQuantity: 1, bingeFrequency: 1 }),
    ).toEqual({ score: 3, positive: false });
    expect(
      auditCScore({ frequency: 4, typicalQuantity: 4, bingeFrequency: 4 }),
    ).toEqual({ score: 12, positive: true });
  });

  it("returns null when any answer is missing", () => {
    expect(auditCScore({ frequency: 2, typicalQuantity: 1 })).toBeNull();
    expect(auditCScore(undefined)).toBeNull();
  });

  it("uses the configured positive threshold", () => {
    expect(AUDIT_C_POSITIVE_THRESHOLD).toBe(4);
    expect(
      auditCScore({ frequency: 2, typicalQuantity: 1, bingeFrequency: 0 })?.positive,
    ).toBe(false);
    expect(
      auditCScore({ frequency: 2, typicalQuantity: 1, bingeFrequency: 1 })?.positive,
    ).toBe(true);
  });
});

describe("auditCClinicalHint", () => {
  it("returns hint only when screen positive", () => {
    expect(auditCClinicalHint({ positive: true })).toContain("AUDIT-C positive");
    expect(auditCClinicalHint({ positive: false })).toBeNull();
    expect(auditCClinicalHint(null)).toBeNull();
  });
});

describe("alcohol screen panel open (expandable chips)", () => {
  it("opens CAGE on carry-forward when enabled is omitted", () => {
    expect(isCagePanelOpen({ cutDown: true, annoyed: false, guilty: false, eyeOpener: false })).toBe(
      true,
    );
  });

  it("keeps CAGE collapsed when explicitly disabled despite answers", () => {
    expect(
      isCagePanelOpen({
        cutDown: true,
        annoyed: true,
        guilty: false,
        eyeOpener: false,
        enabled: false,
      }),
    ).toBe(false);
  });

  it("opens AUDIT-C when enabled is true without answers yet", () => {
    expect(isAuditCPanelOpen({ enabled: true })).toBe(true);
  });
});

describe("auditFullScore", () => {
  const auditC = { frequency: 2, typicalQuantity: 2, bingeFrequency: 1 };
  const auditFull = {
    unableToStop: 1,
    failedExpectations: 1,
    morningDrink: 0,
    guiltRemorse: 2,
    blackout: 1,
    injury: 0,
    othersConcerned: 2,
  };

  it("sums Q1–Q10 and assigns WHO severity bands", () => {
    expect(auditFullScore(auditC, auditFull)).toEqual({
      score: 12,
      severity: "hazardous",
    });
    expect(
      auditFullScore(
        { frequency: 4, typicalQuantity: 4, bingeFrequency: 4 },
        {
          unableToStop: 1,
          failedExpectations: 1,
          morningDrink: 1,
          guiltRemorse: 1,
          blackout: 1,
          injury: 2,
          othersConcerned: 2,
        },
      ),
    ).toEqual({
      score: 21,
      severity: "dependence",
    });
  });

  it("returns null until all ten questions are answered", () => {
    expect(auditFullScore(auditC, { unableToStop: 1 })).toBeNull();
    expect(auditFullScore({ frequency: 1 }, auditFull)).toBeNull();
  });
});

describe("auditFullClinicalHint", () => {
  it("returns hint for elevated severity only", () => {
    expect(auditFullClinicalHint({ severity: "hazardous" })).toContain("hazardous");
    expect(auditFullClinicalHint({ severity: "low" })).toBeNull();
  });
});

describe("audit full panel open (expandable chip)", () => {
  it("opens on carry-forward when Q4+ answers exist", () => {
    expect(isAuditFullPanelOpen({ unableToStop: 1 }, undefined)).toBe(true);
  });

  it("stays collapsed when explicitly disabled", () => {
    expect(
      isAuditFullPanelOpen({ unableToStop: 2, enabled: false }, { frequency: 2, typicalQuantity: 1, bingeFrequency: 1 }),
    ).toBe(false);
  });
});

describe("packYearsClinicalHint", () => {
  it("returns null below elevated threshold", () => {
    expect(packYearsClinicalHint(10)).toBeNull();
    expect(packYearsClinicalHint(19.9)).toBeNull();
  });

  it("flags elevated risk at ≥20 pack-years", () => {
    expect(packYearsClinicalHint(20)).toContain("≥20 pack-years");
  });

  it("prefers LDCT hint at ≥30 pack-years", () => {
    expect(packYearsClinicalHint(30)).toContain("LDCT");
    expect(packYearsClinicalHint(30)).not.toContain("≥20");
  });
});
