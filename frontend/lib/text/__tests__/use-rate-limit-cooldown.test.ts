/**
 * @vitest-environment jsdom
 *
 * Unit tests for text-D5 useRateLimitCooldown hook.
 *
 * Backend contract mirrored locally: 30 sends / minute (default cap).
 */

import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RATE_LIMIT_PER_MINUTE_CAP,
  RATE_LIMIT_WINDOW_MS,
  useRateLimitCooldown,
} from "../use-rate-limit-cooldown";

describe("useRateLimitCooldown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts idle (not rate-limited, zero cooldown)", () => {
    const { result } = renderHook(() => useRateLimitCooldown());
    expect(result.current.isRateLimited).toBe(false);
    expect(result.current.cooldownSecondsRemaining).toBe(0);
  });

  it("does NOT trip below the cap", () => {
    const t0 = 1_000_000;
    let clock = t0;
    const now = () => clock;
    const { result } = renderHook(() => useRateLimitCooldown(undefined, now));

    act(() => {
      for (let i = 0; i < RATE_LIMIT_PER_MINUTE_CAP - 1; i += 1) {
        result.current.recordOwnSend();
      }
    });

    expect(result.current.isRateLimited).toBe(false);
    expect(result.current.cooldownSecondsRemaining).toBe(0);
  });

  it("trips at the cap and derives a 60s cooldown from the oldest entry", () => {
    const t0 = 1_000_000;
    let clock = t0;
    const now = () => clock;
    const { result } = renderHook(() => useRateLimitCooldown(undefined, now));

    act(() => {
      for (let i = 0; i < RATE_LIMIT_PER_MINUTE_CAP; i += 1) {
        result.current.recordOwnSend();
      }
    });

    expect(result.current.isRateLimited).toBe(true);
    expect(result.current.cooldownSecondsRemaining).toBe(60);
  });

  it("counts down as time advances", () => {
    let clock = 1_000_000;
    const now = () => clock;
    const { result, rerender } = renderHook(() =>
      useRateLimitCooldown(undefined, now),
    );

    act(() => {
      for (let i = 0; i < RATE_LIMIT_PER_MINUTE_CAP; i += 1) {
        result.current.recordOwnSend();
      }
    });

    // 10s later the cooldown should be 50s.
    clock += 10_000;
    rerender();
    expect(result.current.cooldownSecondsRemaining).toBe(50);

    // 59s in total — only 1s left.
    clock = 1_000_000 + 59_000;
    rerender();
    expect(result.current.cooldownSecondsRemaining).toBe(1);

    // 60s — oldest entry rolls out → cap drops by one → no longer rate limited.
    clock = 1_000_000 + 60_001;
    rerender();
    expect(result.current.isRateLimited).toBe(false);
    expect(result.current.cooldownSecondsRemaining).toBe(0);
  });

  it("only counts entries inside the rolling 60s window", () => {
    let clock = 1_000_000;
    const now = () => clock;
    const { result, rerender } = renderHook(() =>
      useRateLimitCooldown(undefined, now),
    );

    // Burst 10 sends at t0.
    act(() => {
      for (let i = 0; i < 10; i += 1) {
        result.current.recordOwnSend();
      }
    });
    // Roll the clock 70s forward — all 10 should age out.
    clock += 70_000;
    rerender();

    // Now burst 30 fresh sends — should trip on the 30th, NOT on the 20th
    // (which it would if the old burst still counted).
    act(() => {
      for (let i = 0; i < 29; i += 1) {
        result.current.recordOwnSend();
      }
    });
    expect(result.current.isRateLimited).toBe(false);
    act(() => {
      result.current.recordOwnSend();
    });
    expect(result.current.isRateLimited).toBe(true);
  });

  it("honours an explicit timestamp override on recordOwnSend", () => {
    let clock = 2_000_000;
    const now = () => clock;
    const { result } = renderHook(() => useRateLimitCooldown(undefined, now));

    // Record a send 30s in the past.
    act(() => {
      for (let i = 0; i < RATE_LIMIT_PER_MINUTE_CAP; i += 1) {
        result.current.recordOwnSend(clock - 30_000);
      }
    });

    // Cooldown should be ~30s (the oldest is already 30s old).
    expect(result.current.isRateLimited).toBe(true);
    expect(result.current.cooldownSecondsRemaining).toBeLessThanOrEqual(30);
    expect(result.current.cooldownSecondsRemaining).toBeGreaterThanOrEqual(29);
  });

  it("reset() drops the window and restores idle state", () => {
    let clock = 3_000_000;
    const now = () => clock;
    const { result } = renderHook(() => useRateLimitCooldown(undefined, now));

    act(() => {
      for (let i = 0; i < RATE_LIMIT_PER_MINUTE_CAP; i += 1) {
        result.current.recordOwnSend();
      }
    });
    expect(result.current.isRateLimited).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.isRateLimited).toBe(false);
    expect(result.current.cooldownSecondsRemaining).toBe(0);
  });

  it("respects a custom cap", () => {
    const t0 = 4_000_000;
    let clock = t0;
    const now = () => clock;
    const { result } = renderHook(() => useRateLimitCooldown(5, now));

    act(() => {
      for (let i = 0; i < 4; i += 1) {
        result.current.recordOwnSend();
      }
    });
    expect(result.current.isRateLimited).toBe(false);
    act(() => {
      result.current.recordOwnSend();
    });
    expect(result.current.isRateLimited).toBe(true);
  });

  it("exposes the documented constants for callers", () => {
    expect(RATE_LIMIT_PER_MINUTE_CAP).toBe(30);
    expect(RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });
});
