import { describe, expect, it, vi } from "vitest";
import {
  AUTO_PUBLISH_VIDEO_CONSTRAINTS,
  CONSULT_PREFERRED_VIDEO_CODECS,
  consultVideoBandwidthProfile,
  pinRemoteVideoQuality,
} from "../twilio-connect-profile";

describe("consult video connect profile", () => {
  it("prefers H.264 then VP8 without simulcast", () => {
    expect(CONSULT_PREFERRED_VIDEO_CODECS[0]).toBe("H264");
    expect(CONSULT_PREFERRED_VIDEO_CODECS[1]).toEqual({
      codec: "VP8",
      simulcast: false,
    });
  });

  it("publishes Auto at 720p30", () => {
    expect(AUTO_PUBLISH_VIDEO_CONSTRAINTS).toEqual({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    });
  });

  it("uses grid mode so the non-speaking party keeps full quality", () => {
    expect(consultVideoBandwidthProfile(2_000_000).video.mode).toBe("grid");
  });

  it("takes manual control of content preferences and track switch-off", () => {
    expect(consultVideoBandwidthProfile(2_000_000)).toEqual({
      video: {
        mode: "grid",
        maxSubscriptionBitrate: 2_000_000,
        contentPreferencesMode: "manual",
        clientTrackSwitchOffControl: "manual",
      },
    });
  });
});

describe("pinRemoteVideoQuality", () => {
  it("switches the track on and raises its priority", () => {
    const switchOn = vi.fn();
    const setPriority = vi.fn();

    pinRemoteVideoQuality({ kind: "video", switchOn, setPriority });

    expect(switchOn).toHaveBeenCalledOnce();
    expect(setPriority).toHaveBeenCalledWith("high");
  });

  it("ignores non-video tracks", () => {
    const switchOn = vi.fn();
    pinRemoteVideoQuality({ kind: "audio", switchOn });
    expect(switchOn).not.toHaveBeenCalled();
  });

  it("tolerates SDKs missing either method", () => {
    expect(() => pinRemoteVideoQuality({ kind: "video" })).not.toThrow();
  });

  it("survives a throwing switchOn and still sets priority", () => {
    const setPriority = vi.fn();
    pinRemoteVideoQuality({
      kind: "video",
      switchOn: () => {
        throw new Error("already on");
      },
      setPriority,
    });
    expect(setPriority).toHaveBeenCalledWith("high");
  });
});
