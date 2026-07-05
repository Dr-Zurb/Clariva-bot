/**
 * vit-07 — vitals hidden-set resolver + view-only (buildRxPayload) parity.
 */

import { describe, expect, it } from "vitest";
import {
  CORE_CLASSIC_VITAL_KEYS,
  isVitalDefaultHidden,
  isVitalExplicitlyHidden,
  isVitalHidden,
  resolveDefaultVitalsLayout,
  resolveEffectiveVitalsHidden,
  resolveVisibleVitals,
  serializeVitalsHidden,
  vitalsHiddenOverridesToPersist,
} from "@/lib/cockpit/vitals-visibility";
import { VITAL_ORDER } from "@/lib/cockpit/vitals-schema";
import { buildRxPayload, createEmptyRxFormFields } from "@/components/cockpit/rx/RxFormContext";

const DEFAULT_LAYOUT = resolveDefaultVitalsLayout();

describe("resolveDefaultVitalsLayout (vit-07 / V3-D3)", () => {
  it("hides every non-classic-core vital at factory default", () => {
    const numericHidden = VITAL_ORDER.filter((key) => !CORE_CLASSIC_VITAL_KEYS.includes(key));
    expect(DEFAULT_LAYOUT.defaultHidden).toEqual(
      expect.arrayContaining(numericHidden),
    );
    expect(DEFAULT_LAYOUT.defaultHidden.length).toBeGreaterThan(numericHidden.length);
  });
});

describe("resolveEffectiveVitalsHidden (vit-07)", () => {
  it("uses factory default when stored set is empty", () => {
    expect(resolveEffectiveVitalsHidden({ storedHidden: [] })).toEqual({
      hidden: [...DEFAULT_LAYOUT.defaultHidden],
    });
  });

  it("doctor stored set wins wholesale when present", () => {
    expect(
      resolveEffectiveVitalsHidden({ storedHidden: ["vitalsHr", "vitalsGlucoseMgDl"] }),
    ).toEqual({
      hidden: ["vitalsHr", "vitalsGlucoseMgDl"],
    });
  });

  it("drops unknown and stale keys", () => {
    expect(
      resolveEffectiveVitalsHidden({
        storedHidden: ["bogus_vital", "vitalsHr", "vitalsHr"],
      }),
    ).toEqual({
      hidden: ["vitalsHr"],
    });
  });
});

describe("resolveVisibleVitals (vit-07 / V3-D3)", () => {
  it("default = classic core on", () => {
    const { hidden } = resolveEffectiveVitalsHidden({ storedHidden: [] });
    expect(resolveVisibleVitals({ hidden })).toEqual([...CORE_CLASSIC_VITAL_KEYS]);
  });

  it("hiding a core vital removes it from the render plan", () => {
    const { hidden: baseHidden } = resolveEffectiveVitalsHidden({ storedHidden: [] });
    const hidden = [...baseHidden, "vitalsHr"];
    expect(resolveVisibleVitals({ hidden })).not.toContain("vitalsHr");
    expect(resolveVisibleVitals({ hidden })).toEqual(
      CORE_CLASSIC_VITAL_KEYS.filter((key) => key !== "vitalsHr"),
    );
  });

  it("unhiding a non-core vital shows it", () => {
    const { hidden: baseHidden } = resolveEffectiveVitalsHidden({ storedHidden: [] });
    const hidden = baseHidden.filter((key) => key !== "vitalsGcsTotal");
    expect(resolveVisibleVitals({ hidden })).toContain("vitalsGcsTotal");
  });

  it("ignores unknown keys in the hidden set", () => {
    const { hidden: baseHidden } = resolveEffectiveVitalsHidden({ storedHidden: [] });
    expect(
      resolveVisibleVitals({ hidden: [...baseHidden, "bogus_vital"] }),
    ).toEqual(resolveVisibleVitals({ hidden: baseHidden }));
  });

  it("never surfaces vitalsPainScore in the Objective UI (captured on complaints)", () => {
    const { hidden: baseHidden } = resolveEffectiveVitalsHidden({ storedHidden: [] });
    const hidden = baseHidden.filter((key) => key !== "vitalsPainScore");
    expect(resolveVisibleVitals({ hidden })).not.toContain("vitalsPainScore");
    expect(resolveVisibleVitals({ hidden: baseHidden })).not.toContain("vitalsPainScore");
  });
});

describe("isVitalHidden / default vs explicit (vit-07)", () => {
  const { hidden: effectiveHidden } = resolveEffectiveVitalsHidden({ storedHidden: [] });

  it("reports non-core vitals as hidden at factory default", () => {
    expect(isVitalHidden("vitalsGcsTotal", effectiveHidden)).toBe(true);
    expect(isVitalDefaultHidden("vitalsGcsTotal")).toBe(true);
    expect(isVitalExplicitlyHidden("vitalsGcsTotal", [])).toBe(false);
  });

  it("reports core vitals as visible at factory default", () => {
    expect(isVitalHidden("vitalsHr", effectiveHidden)).toBe(false);
    expect(isVitalDefaultHidden("vitalsHr")).toBe(false);
    expect(isVitalHidden("vitalsGlucoseMgDl", effectiveHidden)).toBe(false);
    expect(isVitalDefaultHidden("vitalsGlucoseMgDl")).toBe(false);
  });

  it("distinguishes explicit doctor hides in stored override", () => {
    const stored = ["vitalsHr"];
    expect(isVitalExplicitlyHidden("vitalsHr", stored)).toBe(true);
    expect(isVitalExplicitlyHidden("vitalsGlucoseMgDl", stored)).toBe(false);
  });
});

describe("vitalsHiddenOverridesToPersist (vit-07)", () => {
  it("keeps only known keys and dedupes preserving first occurrence", () => {
    expect(
      vitalsHiddenOverridesToPersist([
        "vitalsGlucoseMgDl",
        "vitalsGlucoseMgDl",
        "bogus_vital",
        "vitalsHr",
      ]),
    ).toEqual(["vitalsGlucoseMgDl", "vitalsHr"]);
  });

  it("empty stored override at factory default is minimal", () => {
    expect(vitalsHiddenOverridesToPersist([])).toEqual([]);
  });
});

describe("serializeVitalsHidden (vit-07)", () => {
  it("is order-insensitive (sorted key)", () => {
    expect(serializeVitalsHidden(["vitalsGlucoseMgDl", "vitalsHr"])).toBe(
      serializeVitalsHidden(["vitalsHr", "vitalsGlucoseMgDl"]),
    );
  });
});

describe("vit-07 · visibility output parity (view-only V3-D5)", () => {
  it("buildRxPayload is identical whether a vital is hidden in the UI or not", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsHr = 72;
    fields.vitalsGlucoseMgDl = 110;

    const visiblePayload = buildRxPayload(fields);
    const hiddenPayload = buildRxPayload({ ...fields });

    expect(hiddenPayload).toEqual(visiblePayload);
    expect(hiddenPayload.vitalsHr).toBe(72);
    expect(hiddenPayload.vitalsGlucoseMgDl).toBe(110);
  });

  it("buildRxPayload source never references vitals_hidden", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(__dirname, "../../../components/cockpit/rx/RxFormContext.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/vitals_hidden/);
    expect(src).not.toMatch(/vitalsHidden/);
  });
});
