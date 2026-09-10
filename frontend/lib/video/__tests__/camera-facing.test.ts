import { describe, expect, it } from "vitest";
import {
  annotateFacings,
  assignActiveCameraToTrackOptions,
  canFlipCameras,
  deriveFacingFromLabel,
  facingFromFacingMode,
  facingModeFor,
  isAlreadyOnRequestedDevice,
  nextFacingMode,
  oppositeFacing,
  resolveLiveCameraIdentity,
  videoConstraintsForCameraSwitch,
} from "../camera-facing";

describe("deriveFacingFromLabel", () => {
  it("maps common front-camera labels", () => {
    expect(deriveFacingFromLabel("Front Camera")).toBe("front");
    expect(deriveFacingFromLabel("FaceTime HD Camera")).toBe("front");
    expect(deriveFacingFromLabel("user-facing")).toBe("front");
  });

  it("maps common back-camera labels", () => {
    expect(deriveFacingFromLabel("Back Camera")).toBe("back");
    expect(deriveFacingFromLabel("Rear camera")).toBe("back");
    expect(deriveFacingFromLabel("camera2 0, facing environment")).toBe(
      "back",
    );
  });

  it("returns unknown for empty or cryptic labels", () => {
    expect(deriveFacingFromLabel("")).toBe("unknown");
    expect(deriveFacingFromLabel("USB Camera")).toBe("unknown");
  });
});

describe("facingMode helpers", () => {
  it("maps WebRTC facingMode strings", () => {
    expect(facingFromFacingMode("user")).toBe("front");
    expect(facingFromFacingMode("environment")).toBe("back");
    expect(facingFromFacingMode(undefined)).toBe("unknown");
  });

  it("round-trips facing → facingMode", () => {
    expect(facingModeFor("front")).toBe("user");
    expect(facingModeFor("back")).toBe("environment");
    expect(facingModeFor("unknown")).toBeNull();
  });

  it("flips unknown/front to back (derm default) and back to front", () => {
    expect(oppositeFacing("unknown")).toBe("back");
    expect(oppositeFacing("front")).toBe("back");
    expect(oppositeFacing("back")).toBe("front");
    expect(nextFacingMode("front")).toBe("environment");
    expect(nextFacingMode("back")).toBe("user");
    expect(nextFacingMode("unknown")).toBe("environment");
  });
});

describe("annotateFacings", () => {
  it("keeps labelled facings", () => {
    const result = annotateFacings([
      { label: "Front Camera" },
      { label: "Back Camera" },
    ]);
    expect(result.map((c) => c.facing)).toEqual(["front", "back"]);
  });

  it("falls back to index 0=front, 1=back when all labels are empty", () => {
    const result = annotateFacings([{ label: "" }, { label: "" }]);
    expect(result.map((c) => c.facing)).toEqual(["front", "back"]);
  });
});

describe("canFlipCameras", () => {
  const base = {
    cameraCount: 1,
    hasLiveVideo: true,
    liveFacing: "unknown" as const,
    isNarrowViewport: false,
  };

  it("is true when two cameras enumerate", () => {
    expect(canFlipCameras({ ...base, cameraCount: 2, hasLiveVideo: false })).toBe(
      true,
    );
  });

  it("is true on iOS single-device when the live track reports facingMode", () => {
    expect(
      canFlipCameras({ ...base, liveFacing: "front", isNarrowViewport: false }),
    ).toBe(true);
  });

  it("is true on a phone even before facingMode populates", () => {
    expect(canFlipCameras({ ...base, isNarrowViewport: true })).toBe(true);
  });

  it("stays hidden on a desktop laptop with one webcam", () => {
    expect(canFlipCameras(base)).toBe(false);
  });

  it("stays hidden with no cameras and no live track", () => {
    expect(
      canFlipCameras({
        cameraCount: 0,
        hasLiveVideo: false,
        liveFacing: "unknown",
        isNarrowViewport: true,
      }),
    ).toBe(false);
  });
});

describe("resolveLiveCameraIdentity", () => {
  it("prefers the live track over the pre-call id", () => {
    expect(
      resolveLiveCameraIdentity({
        liveDeviceId: "live-front",
        liveFacing: "front",
        initialDeviceId: "precall-back",
      }),
    ).toEqual({ deviceId: "live-front", facing: "front" });
  });

  it("falls back to the pre-call id only when the live track has none", () => {
    expect(
      resolveLiveCameraIdentity({
        liveDeviceId: null,
        liveFacing: "unknown",
        initialDeviceId: "precall-front",
      }),
    ).toEqual({ deviceId: "precall-front", facing: "unknown" });
  });
});

describe("isAlreadyOnRequestedDevice", () => {
  it("is false when a stale stored id matches the request but the live track does not", () => {
    expect(isAlreadyOnRequestedDevice("stored-back", "live-front")).toBe(false);
  });

  it("is true only when the live track is already the requested device", () => {
    expect(isAlreadyOnRequestedDevice("cam-2", "cam-2")).toBe(true);
  });

  it("is false when the live track has no deviceId (iOS)", () => {
    expect(isAlreadyOnRequestedDevice("cam-2", null)).toBe(false);
  });
});

describe("videoConstraintsForCameraSwitch", () => {
  it("always carries 720p30", () => {
    const c = videoConstraintsForCameraSwitch({ facingMode: "environment" });
    expect(c.width).toEqual({ ideal: 1280 });
    expect(c.height).toEqual({ ideal: 720 });
    expect(c.frameRate).toEqual({ ideal: 30 });
    expect(c.facingMode).toEqual({ ideal: "environment" });
  });

  it("uses exact facingMode when asked (iOS flip)", () => {
    const c = videoConstraintsForCameraSwitch({
      facingMode: "user",
      facingModeExact: true,
    });
    expect(c.facingMode).toEqual({ exact: "user" });
  });

  it("uses exact deviceId when asked (user-initiated flip)", () => {
    const c = videoConstraintsForCameraSwitch({
      deviceId: "cam-back",
      deviceIdExact: true,
    });
    expect(c.deviceId).toEqual({ exact: "cam-back" });
  });

  it("keeps ideal deviceId by default (connect / quality republish)", () => {
    const c = videoConstraintsForCameraSwitch({ deviceId: "cam-1" });
    expect(c.deviceId).toEqual({ ideal: "cam-1" });
  });
});

describe("assignActiveCameraToTrackOptions", () => {
  it("prefers deviceId when present", () => {
    const opts: { deviceId?: { ideal: string }; facingMode?: { ideal: string } } =
      {};
    assignActiveCameraToTrackOptions(opts, {
      deviceId: "cam-2",
      facing: "back",
    });
    expect(opts.deviceId).toEqual({ ideal: "cam-2" });
    expect(opts.facingMode).toBeUndefined();
  });

  it("falls back to facingMode when deviceId is missing (iOS)", () => {
    const opts: { deviceId?: { ideal: string }; facingMode?: { ideal: string } } =
      {};
    assignActiveCameraToTrackOptions(opts, {
      deviceId: null,
      facing: "back",
    });
    expect(opts.facingMode).toEqual({ ideal: "environment" });
  });
});
