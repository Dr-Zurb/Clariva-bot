import { describe, expect, it } from "vitest";
import {
  maxSubscriptionBitrateForQuality,
  videoConstraintsForQuality,
} from "../VideoQualityPicker";

describe("maxSubscriptionBitrateForQuality", () => {
  it("treats auto as 720p-class bitrate (2 Mbps)", () => {
    expect(maxSubscriptionBitrateForQuality("auto")).toBe(2_000_000);
    expect(maxSubscriptionBitrateForQuality("720p")).toBe(2_000_000);
  });

  it("keeps explicit 1080p at the higher cap", () => {
    expect(maxSubscriptionBitrateForQuality("1080p")).toBe(2_400_000);
  });

  it("maps 480p and audio-only", () => {
    expect(maxSubscriptionBitrateForQuality("480p")).toBe(800_000);
    expect(maxSubscriptionBitrateForQuality("audio-only")).toBe(0);
  });
});

describe("videoConstraintsForQuality", () => {
  it("publishes auto at 720p30", () => {
    expect(videoConstraintsForQuality("auto")).toEqual({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    });
  });

  it("returns null for audio-only", () => {
    expect(videoConstraintsForQuality("audio-only")).toBeNull();
  });
});

describe("maxSubscriptionBitrateForQuality", () => {
  it("treats auto as 720p-class bitrate (2 Mbps)", () => {
    expect(maxSubscriptionBitrateForQuality("auto")).toBe(2_000_000);
    expect(maxSubscriptionBitrateForQuality("720p")).toBe(2_000_000);
  });

  it("keeps explicit 1080p at the higher cap", () => {
    expect(maxSubscriptionBitrateForQuality("1080p")).toBe(2_400_000);
  });

  it("maps 480p and audio-only", () => {
    expect(maxSubscriptionBitrateForQuality("480p")).toBe(800_000);
    expect(maxSubscriptionBitrateForQuality("audio-only")).toBe(0);
  });
});
