import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOCIAL_HISTORY_THRESHOLDS,
  SOCIAL_HISTORY_THRESHOLDS,
} from "@/lib/cockpit/social-history-thresholds";
import {
  DEFAULT_CLINICAL_REGION,
  parseClinicalRegionCode,
  resolveClinicalRegion,
} from "@/lib/config/clinical-region";
import { INDIA_SOCIAL_HISTORY_THRESHOLDS } from "@/lib/config/regions/IN";
import { UK_SOCIAL_HISTORY_THRESHOLDS } from "@/lib/config/regions/UK";
import { applyIndiaClinicalRegion } from "@/lib/config/regions/IN";
import { applyUkClinicalRegion } from "@/lib/config/regions/UK";
import { alcoholClinicalHints } from "@/lib/cockpit/social-history-alcohol-drinks";

describe("clinical region resolver", () => {
  it("parses known region aliases", () => {
    expect(parseClinicalRegionCode("in")).toBe("IN");
    expect(parseClinicalRegionCode("INDIA")).toBe("IN");
    expect(parseClinicalRegionCode("gb")).toBe("UK");
    expect(parseClinicalRegionCode("unknown")).toBeNull();
  });

  it("defaults to India when env is unset", () => {
    expect(DEFAULT_CLINICAL_REGION).toBe("IN");
    expect(resolveClinicalRegion()).toBe("IN");
  });
});

describe("India clinical region pack", () => {
  it("raises hazardous units/week above UK reference", () => {
    expect(INDIA_SOCIAL_HISTORY_THRESHOLDS.hazardousUnitsPerWeek).toBe(21);
    expect(UK_SOCIAL_HISTORY_THRESHOLDS.hazardousUnitsPerWeek).toBe(14);
  });

  it("applyIndiaClinicalRegion updates runtime thresholds", () => {
    const original = { ...SOCIAL_HISTORY_THRESHOLDS };
    try {
      applyIndiaClinicalRegion();
      expect(SOCIAL_HISTORY_THRESHOLDS.hazardousUnitsPerWeek).toBe(21);
      expect(alcoholClinicalHints(20, null).intakeHint).toBeNull();
      expect(alcoholClinicalHints(22, null).intakeHint).toContain("High intake");
    } finally {
      Object.assign(SOCIAL_HISTORY_THRESHOLDS, original);
    }
  });

  it("applyUkClinicalRegion restores UK reference thresholds", () => {
    const original = { ...SOCIAL_HISTORY_THRESHOLDS };
    try {
      applyIndiaClinicalRegion();
      applyUkClinicalRegion();
      expect(SOCIAL_HISTORY_THRESHOLDS).toEqual(DEFAULT_SOCIAL_HISTORY_THRESHOLDS);
    } finally {
      Object.assign(SOCIAL_HISTORY_THRESHOLDS, original);
    }
  });
});
