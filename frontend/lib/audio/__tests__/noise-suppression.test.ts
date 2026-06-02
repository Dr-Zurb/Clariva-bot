/**
 * Unit tests for `frontend/lib/audio/noise-suppression.ts` (voice-C9).
 *
 * Coverage:
 *   - Default preference is ON (decision §9).
 *   - localStorage round-trip — read/write with valid + malformed values.
 *   - Runtime config — env-driven assets path + vendor validation.
 *   - `buildNoiseCancellationOptions` returns `undefined` when path is unset.
 *   - `applyNoiseSuppressionPreference` is a graceful no-op when the
 *     track lacks a `noiseCancellation` processor (failure path the
 *     task acceptance criteria explicitly call out).
 *   - `applyNoiseSuppressionPreference` only calls enable()/disable()
 *     when the state actually changes (no churn on identical state).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalAudioTrack, NoiseCancellation } from "twilio-video";
import {
  NOISE_SUPPRESSION_DEFAULT_ENABLED,
  NOISE_SUPPRESSION_STORAGE_KEY,
  applyNoiseSuppressionPreference,
  buildNoiseCancellationOptions,
  isNoiseSuppressionAvailable,
  readNoiseSuppressionPreference,
  resolveNoiseSuppressionConfig,
  writeNoiseSuppressionPreference,
} from "../noise-suppression";

function makeTrack(
  noiseCancellation?: Partial<NoiseCancellation>,
): LocalAudioTrack {
  return { noiseCancellation: noiseCancellation as NoiseCancellation | undefined } as unknown as LocalAudioTrack;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("default preference", () => {
  it("ships with default ON per decision §9", () => {
    expect(NOISE_SUPPRESSION_DEFAULT_ENABLED).toBe(true);
  });
});

describe("readNoiseSuppressionPreference", () => {
  it("returns the default when the key is missing", () => {
    expect(readNoiseSuppressionPreference()).toBe(
      NOISE_SUPPRESSION_DEFAULT_ENABLED,
    );
  });

  it("returns true for stored 'true'", () => {
    window.localStorage.setItem(NOISE_SUPPRESSION_STORAGE_KEY, "true");
    expect(readNoiseSuppressionPreference()).toBe(true);
  });

  it("returns false for stored 'false'", () => {
    window.localStorage.setItem(NOISE_SUPPRESSION_STORAGE_KEY, "false");
    expect(readNoiseSuppressionPreference()).toBe(false);
  });

  it("falls back to default on malformed values", () => {
    window.localStorage.setItem(NOISE_SUPPRESSION_STORAGE_KEY, "yes please");
    expect(readNoiseSuppressionPreference()).toBe(
      NOISE_SUPPRESSION_DEFAULT_ENABLED,
    );
  });
});

describe("writeNoiseSuppressionPreference", () => {
  it("persists the value", () => {
    writeNoiseSuppressionPreference(false);
    expect(window.localStorage.getItem(NOISE_SUPPRESSION_STORAGE_KEY)).toBe(
      "false",
    );
    writeNoiseSuppressionPreference(true);
    expect(window.localStorage.getItem(NOISE_SUPPRESSION_STORAGE_KEY)).toBe(
      "true",
    );
  });

  it("does not throw when storage rejects (quota / private mode)", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota");
      });
    expect(() => writeNoiseSuppressionPreference(true)).not.toThrow();
    setItem.mockRestore();
  });
});

describe("resolveNoiseSuppressionConfig", () => {
  it("returns null path + default vendor when env is empty", () => {
    const config = resolveNoiseSuppressionConfig({});
    expect(config.sdkAssetsPath).toBeNull();
    expect(config.vendor).toBe("krisp");
  });

  it("trims the env path", () => {
    const config = resolveNoiseSuppressionConfig({
      NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH: "  /krisp  ",
    });
    expect(config.sdkAssetsPath).toBe("/krisp");
  });

  it("accepts 'rnnoise' as a valid vendor", () => {
    const config = resolveNoiseSuppressionConfig({
      NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH: "/rnnoise",
      NEXT_PUBLIC_NOISE_SUPPRESSION_VENDOR: "rnnoise",
    });
    expect(config.vendor).toBe("rnnoise");
  });

  it("falls back to 'krisp' on unknown vendor strings", () => {
    const config = resolveNoiseSuppressionConfig({
      NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH: "/foo",
      NEXT_PUBLIC_NOISE_SUPPRESSION_VENDOR: "nuance",
    });
    expect(config.vendor).toBe("krisp");
  });
});

describe("isNoiseSuppressionAvailable", () => {
  it("is false when no assets path is configured", () => {
    expect(isNoiseSuppressionAvailable({ sdkAssetsPath: null, vendor: "krisp" })).toBe(
      false,
    );
  });

  it("is true when the assets path is configured", () => {
    expect(
      isNoiseSuppressionAvailable({ sdkAssetsPath: "/krisp", vendor: "krisp" }),
    ).toBe(true);
  });
});

describe("buildNoiseCancellationOptions", () => {
  it("returns undefined when no path is configured", () => {
    expect(
      buildNoiseCancellationOptions({ sdkAssetsPath: null, vendor: "krisp" }),
    ).toBeUndefined();
  });

  it("returns the Twilio-ready shape when configured", () => {
    expect(
      buildNoiseCancellationOptions({
        sdkAssetsPath: "/krisp",
        vendor: "krisp",
      }),
    ).toEqual({ sdkAssetsPath: "/krisp", vendor: "krisp" });
  });
});

describe("applyNoiseSuppressionPreference", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("is a no-op on a null track", async () => {
    await expect(
      applyNoiseSuppressionPreference(null, true),
    ).resolves.toBeUndefined();
  });

  it("gracefully warns when the track has no noiseCancellation processor", async () => {
    await applyNoiseSuppressionPreference(makeTrack(undefined), true);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("calls enable() when preference is on and processor is off", async () => {
    const enable = vi.fn().mockResolvedValue(undefined);
    const disable = vi.fn();
    await applyNoiseSuppressionPreference(
      makeTrack({ vendor: "krisp", isEnabled: false, enable, disable }),
      true,
    );
    expect(enable).toHaveBeenCalledOnce();
    expect(disable).not.toHaveBeenCalled();
  });

  it("calls disable() when preference is off and processor is on", async () => {
    const enable = vi.fn();
    const disable = vi.fn().mockResolvedValue(undefined);
    await applyNoiseSuppressionPreference(
      makeTrack({ vendor: "krisp", isEnabled: true, enable, disable }),
      false,
    );
    expect(disable).toHaveBeenCalledOnce();
    expect(enable).not.toHaveBeenCalled();
  });

  it("skips the call when state already matches", async () => {
    const enable = vi.fn();
    const disable = vi.fn();
    await applyNoiseSuppressionPreference(
      makeTrack({ vendor: "krisp", isEnabled: true, enable, disable }),
      true,
    );
    expect(enable).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
  });

  it("swallows enable() rejection (no throw to caller)", async () => {
    const enable = vi.fn().mockRejectedValue(new Error("krisp crash"));
    await expect(
      applyNoiseSuppressionPreference(
        makeTrack({
          vendor: "krisp",
          isEnabled: false,
          enable,
          disable: vi.fn(),
        }),
        true,
      ),
    ).resolves.toBeUndefined();
  });
});
