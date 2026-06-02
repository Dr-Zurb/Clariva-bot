/**
 * useAudioOutputDevice — unit tests (Vitest).
 *
 * @see task-voice-A5-audio-output-device-picker.md
 *
 * Run: `pnpm --filter clariva-bot-frontend test hooks/__tests__/useAudioOutputDevice`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/lib/video/screen-share-support", () => ({
  isIOSUserAgent: () => false,
}));
import {
  ANDROID_EARPIECE_SINK_ID,
  ANDROID_SPEAKER_SINK_ID,
  inferRouteFromDeviceId,
  isAudioOutputSelectionSupported,
  pickEarpieceDevice,
  pickSpeakerDevice,
  resolveEarpieceSinkId,
  resolveSpeakerSinkId,
  useAudioOutputDevice,
  VOICE_OUTPUT_DEVICE_STORAGE_KEY,
} from "@/hooks/useAudioOutputDevice";

function makeOutputDevice(
  deviceId: string,
  label: string,
): MediaDeviceInfo {
  return {
    deviceId,
    kind: "audiooutput",
    label,
    groupId: "g1",
    toJSON: () => ({}),
  } as MediaDeviceInfo;
}

describe("isAudioOutputSelectionSupported", () => {
  it("returns false when setSinkId is missing from the prototype", () => {
    const proto = HTMLMediaElement.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, "setSinkId");
    // @ts-expect-error — test shim
    delete proto.setSinkId;
    expect(isAudioOutputSelectionSupported()).toBe(false);
    if (original) {
      Object.defineProperty(proto, "setSinkId", original);
    }
  });
});

describe("device heuristics", () => {
  const devices = [
    makeOutputDevice("d-ear", "Phone — Earpiece"),
    makeOutputDevice("d-spk", "Speaker — Built-in Audio"),
  ];

  it("picks speaker and earpiece by label", () => {
    expect(pickSpeakerDevice(devices)?.deviceId).toBe("d-spk");
    expect(pickEarpieceDevice(devices)?.deviceId).toBe("d-ear");
  });

  it("falls back to Android special sink ids", () => {
    expect(resolveSpeakerSinkId([])).toBe(ANDROID_SPEAKER_SINK_ID);
    expect(resolveEarpieceSinkId([])).toBe(ANDROID_EARPIECE_SINK_ID);
  });

  it("infers route from stored sink id", () => {
    expect(inferRouteFromDeviceId(ANDROID_EARPIECE_SINK_ID, devices)).toBe(
      "earpiece",
    );
    expect(inferRouteFromDeviceId("d-spk", devices)).toBe("speaker");
  });
});

describe("useAudioOutputDevice", () => {
  const enumerateDevices = vi.fn();
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  let setSinkIdMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setSinkIdMock = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.setSinkId = setSinkIdMock;

    enumerateDevices.mockResolvedValue([
      makeOutputDevice("out-1", "Default Speaker"),
      makeOutputDevice("out-2", "USB Headphones"),
    ]);

    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices,
        addEventListener,
        removeEventListener,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enumerates audio outputs and restores localStorage preference", async () => {
    localStorage.setItem(VOICE_OUTPUT_DEVICE_STORAGE_KEY, "out-2");

    const { result } = renderHook(() => useAudioOutputDevice());

    await waitFor(() => {
      expect(result.current.enumerated).toBe(true);
    });

    expect(result.current.devices).toHaveLength(2);
    expect(result.current.current?.deviceId).toBe("out-2");
    expect(result.current.isSupported).toBe(true);
    expect(addEventListener).toHaveBeenCalledWith(
      "devicechange",
      expect.any(Function),
    );
  });

  it("setOutput persists choice and applies setSinkId on registered sinks", async () => {
    const { result } = renderHook(() => useAudioOutputDevice());
    await waitFor(() => expect(result.current.enumerated).toBe(true));

    const audio = document.createElement("audio");
    let unregister: (() => void) | undefined;
    act(() => {
      unregister = result.current.registerSinkElement(audio);
    });

    await act(async () => {
      await result.current.setOutput("out-2");
    });

    expect(localStorage.getItem(VOICE_OUTPUT_DEVICE_STORAGE_KEY)).toBe("out-2");
    expect(setSinkIdMock).toHaveBeenCalledWith("out-2");
    expect(result.current.current?.deviceId).toBe("out-2");

    act(() => unregister?.());
  });

  it("applyToElement routes a single element", async () => {
    const { result } = renderHook(() => useAudioOutputDevice());
    await waitFor(() => expect(result.current.enumerated).toBe(true));

    const audio = document.createElement("audio");
    await act(async () => {
      await result.current.setOutput("out-1");
      await result.current.applyToElement(audio);
    });

    expect(setSinkIdMock).toHaveBeenCalledWith("out-1");
  });

  it("refresh re-enumerates when devicechange fires", async () => {
    let deviceChangeHandler: (() => void) | undefined;
    addEventListener.mockImplementation((_evt, handler) => {
      deviceChangeHandler = handler;
    });

    const { result } = renderHook(() => useAudioOutputDevice());
    await waitFor(() => expect(result.current.enumerated).toBe(true));

    enumerateDevices.mockResolvedValue([
      makeOutputDevice("out-1", "Default Speaker"),
      makeOutputDevice("out-3", "Bluetooth Headset"),
    ]);

    await act(async () => {
      deviceChangeHandler?.();
    });

    await waitFor(() => {
      expect(result.current.devices.some((d) => d.deviceId === "out-3")).toBe(
        true,
      );
    });
  });

  it("surfaces newDeviceJustConnected when a Bluetooth output is added", async () => {
    let deviceChangeHandler: (() => void) | undefined;
    addEventListener.mockImplementation((_evt, handler) => {
      deviceChangeHandler = handler;
    });

    const { result } = renderHook(() => useAudioOutputDevice());
    await waitFor(() => expect(result.current.enumerated).toBe(true));
    expect(result.current.newDeviceJustConnected).toBeNull();

    enumerateDevices.mockResolvedValue([
      makeOutputDevice("out-1", "Built-in Speaker"),
      makeOutputDevice("out-air", "AirPods Pro"),
    ]);

    await act(async () => {
      deviceChangeHandler?.();
    });

    await waitFor(() => {
      expect(result.current.newDeviceJustConnected?.deviceId).toBe("out-air");
    });
  });

  it("dismissNewDevice clears the connected-device hint", async () => {
    let deviceChangeHandler: (() => void) | undefined;
    addEventListener.mockImplementation((_evt, handler) => {
      deviceChangeHandler = handler;
    });

    const { result } = renderHook(() => useAudioOutputDevice());
    await waitFor(() => expect(result.current.enumerated).toBe(true));

    enumerateDevices.mockResolvedValue([
      makeOutputDevice("out-1", "Speaker"),
      makeOutputDevice("out-bt", "Bluetooth Headset"),
    ]);

    await act(async () => {
      deviceChangeHandler?.();
    });

    await waitFor(() =>
      expect(result.current.newDeviceJustConnected).not.toBeNull(),
    );

    act(() => {
      result.current.dismissNewDevice();
    });

    expect(result.current.newDeviceJustConnected).toBeNull();
  });
});
