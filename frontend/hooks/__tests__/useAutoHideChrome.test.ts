import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutoHideChrome } from "../useAutoHideChrome";

describe("useAutoHideChrome", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides after idle delay and reveals on reveal()", () => {
    const { result } = renderHook(() =>
      useAutoHideChrome({ hideDelayMs: 1000 }),
    );
    expect(result.current.visible).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.visible).toBe(false);
    act(() => {
      result.current.reveal();
    });
    expect(result.current.visible).toBe(true);
  });

  it("stays visible when forceVisible", () => {
    const { result } = renderHook(() =>
      useAutoHideChrome({ hideDelayMs: 500, forceVisible: true }),
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.visible).toBe(true);
  });
});
