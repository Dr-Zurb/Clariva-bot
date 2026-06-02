import { describe, expect, it } from "vitest";
import {
  computeP95,
  deriveConnectionQualityTier,
} from "../chat-quality-utils";

describe("computeP95", () => {
  it("returns null for an empty window", () => {
    expect(computeP95([])).toBeNull();
  });

  it("computes nearest-rank p95", () => {
    expect(computeP95([100, 200, 300, 400, 500])).toBe(500);
    expect(computeP95([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])).toBe(100);
  });
});

describe("deriveConnectionQualityTier", () => {
  it("classifies excellent / fair / poor per spec thresholds", () => {
    expect(
      deriveConnectionQualityTier({
        roundtrip_p95_ms: 400,
        realtime_reconnects: 0,
        presence_flaps: 1,
      }),
    ).toBe("excellent");

    expect(
      deriveConnectionQualityTier({
        roundtrip_p95_ms: 1500,
        realtime_reconnects: 1,
        presence_flaps: 2,
      }),
    ).toBe("fair");

    expect(
      deriveConnectionQualityTier({
        roundtrip_p95_ms: 2500,
        realtime_reconnects: 0,
        presence_flaps: 0,
      }),
    ).toBe("poor");
  });
});
