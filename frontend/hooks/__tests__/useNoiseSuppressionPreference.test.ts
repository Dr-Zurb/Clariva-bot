/**
 * Unit tests for `frontend/hooks/useNoiseSuppressionPreference.ts` (voice-C9).
 *
 * Coverage:
 *   - Defaults to ON on first mount when storage is empty.
 *   - Rehydrates the persisted value on mount.
 *   - `setEnabled` + `toggle` persist + update state.
 *   - Cross-tab `storage` events update state from sibling tabs.
 *   - Equal `setEnabled` calls do not churn state.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useNoiseSuppressionPreference } from "@/hooks/useNoiseSuppressionPreference";
import { NOISE_SUPPRESSION_STORAGE_KEY } from "@/lib/audio/noise-suppression";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useNoiseSuppressionPreference", () => {
  it("defaults to ON when storage is empty", () => {
    const { result } = renderHook(() => useNoiseSuppressionPreference());
    expect(result.current.enabled).toBe(true);
  });

  it("rehydrates the persisted OFF value after mount", () => {
    window.localStorage.setItem(NOISE_SUPPRESSION_STORAGE_KEY, "false");
    const { result } = renderHook(() => useNoiseSuppressionPreference());
    expect(result.current.enabled).toBe(false);
  });

  it("setEnabled persists and updates state", () => {
    const { result } = renderHook(() => useNoiseSuppressionPreference());
    act(() => {
      result.current.setEnabled(false);
    });
    expect(result.current.enabled).toBe(false);
    expect(window.localStorage.getItem(NOISE_SUPPRESSION_STORAGE_KEY)).toBe(
      "false",
    );
  });

  it("toggle flips and persists", () => {
    const { result } = renderHook(() => useNoiseSuppressionPreference());
    act(() => {
      result.current.toggle();
    });
    expect(result.current.enabled).toBe(false);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.enabled).toBe(true);
    expect(window.localStorage.getItem(NOISE_SUPPRESSION_STORAGE_KEY)).toBe(
      "true",
    );
  });

  it("no-ops when setEnabled is called with the existing value", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useNoiseSuppressionPreference());
    act(() => {
      result.current.setEnabled(true);
    });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("syncs across tabs via the storage event", () => {
    const { result } = renderHook(() => useNoiseSuppressionPreference());
    expect(result.current.enabled).toBe(true);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: NOISE_SUPPRESSION_STORAGE_KEY,
          newValue: "false",
        }),
      );
    });
    expect(result.current.enabled).toBe(false);
  });

  it("ignores storage events for unrelated keys", () => {
    const { result } = renderHook(() => useNoiseSuppressionPreference());
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "some-other-key",
          newValue: "false",
        }),
      );
    });
    expect(result.current.enabled).toBe(true);
  });
});
