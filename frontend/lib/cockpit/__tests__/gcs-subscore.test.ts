import { describe, expect, it } from "vitest";
import {
  computeGcsTotalFromComponents,
  GCS_SCORE_KEYS,
  isGcsClusterMenuKey,
  isGcsComponentOnlyKey,
  isGcsScoreKey,
} from "@/lib/cockpit/gcs-subscore";

describe("gcs-subscore", () => {
  it("sums E+V+M when all components are in range", () => {
    expect(computeGcsTotalFromComponents(4, 5, 6)).toBe(15);
    expect(computeGcsTotalFromComponents(1, 1, 1)).toBe(3);
  });

  it("returns null when any component is missing", () => {
    expect(computeGcsTotalFromComponents(4, 5, null)).toBeNull();
    expect(computeGcsTotalFromComponents(null, null, null)).toBeNull();
  });

  it("never returns an out-of-range total", () => {
    expect(computeGcsTotalFromComponents(0, 5, 6)).toBeNull();
    expect(computeGcsTotalFromComponents(4, 5, 7)).toBeNull();
  });

  it("identifies gcs score keys", () => {
    expect(isGcsScoreKey("vitalsGcsTotal")).toBe(true);
    expect(isGcsScoreKey("vitalsGcsE")).toBe(true);
    expect(isGcsScoreKey("vitalsHr")).toBe(false);
    expect(GCS_SCORE_KEYS).toHaveLength(4);
  });

  it("treats E/V/M as component-only menu keys", () => {
    expect(isGcsComponentOnlyKey("vitalsGcsE")).toBe(true);
    expect(isGcsComponentOnlyKey("vitalsGcsV")).toBe(true);
    expect(isGcsComponentOnlyKey("vitalsGcsM")).toBe(true);
    expect(isGcsComponentOnlyKey("vitalsGcsTotal")).toBe(false);
    expect(isGcsClusterMenuKey("vitalsGcsTotal")).toBe(true);
    expect(isGcsClusterMenuKey("vitalsGcsE")).toBe(true);
    expect(isGcsClusterMenuKey("vitalsHr")).toBe(false);
  });
});
