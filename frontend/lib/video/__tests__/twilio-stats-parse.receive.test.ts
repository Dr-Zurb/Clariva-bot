import { describe, expect, it } from "vitest";
import {
  readQualityLimitationReason,
  readRemoteFps,
  readRemoteFreezeCount,
  readRemoteResolution,
  readResolution,
  type LooseStatsReport,
} from "../twilio-stats-parse";

describe("receive-side stats parsers", () => {
  const report: LooseStatsReport = {
    localVideoTrackStats: [
      {
        dimensions: { width: 1280, height: 720 },
        qualityLimitationReason: "cpu",
      },
    ],
    remoteVideoTrackStats: [
      {
        dimensions: { width: 640, height: 360 },
        frameRate: 17.4,
        freezeCount: 3,
      },
    ],
  };

  it("keeps send and receive resolutions separate", () => {
    expect(readResolution(report)).toEqual({ width: 1280, height: 720 });
    expect(readRemoteResolution(report)).toEqual({ width: 640, height: 360 });
  });

  it("rounds incoming fps", () => {
    expect(readRemoteFps(report)).toBe(17);
  });

  it("reads the freeze count", () => {
    expect(readRemoteFreezeCount(report)).toBe(3);
  });

  it("surfaces the encoder limitation reason", () => {
    expect(readQualityLimitationReason(report)).toBe("cpu");
  });

  it("returns null when the SDK omits the fields", () => {
    const empty: LooseStatsReport = {
      localVideoTrackStats: [{}],
      remoteVideoTrackStats: [{}],
    };
    expect(readRemoteResolution(empty)).toBeNull();
    expect(readRemoteFps(empty)).toBeNull();
    expect(readRemoteFreezeCount(empty)).toBeNull();
    expect(readQualityLimitationReason(empty)).toBeNull();
  });

  it("returns null when there are no track stats at all", () => {
    expect(readRemoteResolution({})).toBeNull();
    expect(readQualityLimitationReason({})).toBeNull();
  });
});
