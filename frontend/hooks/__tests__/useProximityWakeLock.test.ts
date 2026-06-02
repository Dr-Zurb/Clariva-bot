/**
 * useProximityWakeLock — unit tests (Vitest).
 *
 * @see task-voice-C8-proximity-sensor.md
 *
 * Run: `pnpm --filter clariva-bot-frontend test hooks/__tests__/useProximityWakeLock`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  isSupportedProximityPlatform,
  resetProximityWakeLockDebugLog,
  useProximityWakeLock,
  type ProximitySensorLike,
  type WakeLockSentinel,
} from "@/hooks/useProximityWakeLock";

const CHROME_ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

function mockChromeAndroidPlatform(options?: {
  near?: boolean;
  wakeLockFails?: boolean;
}) {
  const near = options?.near ?? false;
  let releaseHandler: (() => void) | null = null;

  const sentinel: WakeLockSentinel = {
    release: vi.fn(async () => {
      releaseHandler = null;
    }),
    addEventListener: vi.fn((type: string, cb: () => void) => {
      if (type === "release") releaseHandler = cb;
    }),
    removeEventListener: vi.fn(),
  };

  const request = vi.fn(async () => {
    if (options?.wakeLockFails) throw new Error("denied");
    return sentinel;
  });

  class MockProximitySensor implements ProximitySensorLike {
    near: boolean | null = near;
    onreading: (() => void) | null = null;
    onerror: ((event: { error?: { name?: string } }) => void) | null = null;
    start = vi.fn(() => {
      queueMicrotask(() => this.onreading?.());
    });
    stop = vi.fn();
  }

  vi.stubGlobal("navigator", {
    userAgent: CHROME_ANDROID_UA,
    wakeLock: { request },
  });

  Object.defineProperty(window, "ProximitySensor", {
    value: MockProximitySensor,
    configurable: true,
    writable: true,
  });

  return { request, sentinel, MockProximitySensor };
}

function clearProximityPlatformMocks(): void {
  vi.unstubAllGlobals();
  delete (window as Window & { ProximitySensor?: unknown }).ProximitySensor;
}

describe("isSupportedProximityPlatform", () => {
  afterEach(() => {
    clearProximityPlatformMocks();
  });

  it("returns false on iOS Safari", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      wakeLock: { request: vi.fn() },
    });
    Object.defineProperty(window, "ProximitySensor", {
      value: class {},
      configurable: true,
      writable: true,
    });
    expect(isSupportedProximityPlatform()).toBe(false);
  });

  it("returns true on Chrome Android with wakeLock and ProximitySensor", () => {
    mockChromeAndroidPlatform();
    expect(isSupportedProximityPlatform()).toBe(true);
  });
});

describe("useProximityWakeLock", () => {
  beforeEach(() => {
    resetProximityWakeLockDebugLog();
  });

  afterEach(() => {
    clearProximityPlatformMocks();
  });

  it("is a noop on unsupported platforms", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    });

    const { result } = renderHook(() => useProximityWakeLock(true));

    expect(result.current.supported).toBe(false);
    expect(result.current.near).toBeNull();
  });

  it("acquires wakeLock when in call and phone is away from face", async () => {
    const { request } = mockChromeAndroidPlatform({ near: false });

    renderHook(() => useProximityWakeLock(true, true));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith("screen");
    });
  });

  it("releases wakeLock when proximity transitions to near", async () => {
    const { request, sentinel } = mockChromeAndroidPlatform({ near: false });

    class FlippingProximitySensor implements ProximitySensorLike {
      near: boolean | null = false;
      onreading: (() => void) | null = null;
      onerror: ((event: { error?: { name?: string } }) => void) | null = null;
      start = vi.fn(() => {
        queueMicrotask(() => {
          this.near = false;
          this.onreading?.();
          queueMicrotask(() => {
            this.near = true;
            this.onreading?.();
          });
        });
      });
      stop = vi.fn();
    }
    Object.defineProperty(window, "ProximitySensor", {
      value: FlippingProximitySensor,
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useProximityWakeLock(true, true));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith("screen");
    });

    await waitFor(() => {
      expect(result.current.near).toBe(true);
    });

    await waitFor(() => {
      expect(sentinel.release).toHaveBeenCalled();
    });
  });

  it("keeps wakeLock on speakerphone (proximity disabled)", async () => {
    const { request, sentinel } = mockChromeAndroidPlatform({ near: true });

    renderHook(() => useProximityWakeLock(true, false));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith("screen");
    });

    expect(sentinel.release).not.toHaveBeenCalled();
  });

  it("releases wakeLock when call ends", async () => {
    const { request, sentinel } = mockChromeAndroidPlatform({ near: false });

    const { rerender } = renderHook(
      ({ inCall }) => useProximityWakeLock(inCall, true),
      { initialProps: { inCall: true } },
    );

    await waitFor(() => expect(request).toHaveBeenCalled());

    await act(async () => {
      rerender({ inCall: false });
    });

    await waitFor(() => {
      expect(sentinel.release).toHaveBeenCalled();
    });
  });
});
