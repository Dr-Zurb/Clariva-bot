/**
 * @vitest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExpiringMenu } from "../use-expiring-menu";
import type { ConsultationMessage } from "../types";

function message(createdAt: string): ConsultationMessage {
  return {
    id: "msg-1",
    sessionId: "sess-1",
    senderId: "user-1",
    senderRole: "doctor",
    body: "hello",
    createdAt,
    kind: "text",
  };
}

describe("useExpiringMenu", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T10:00:30.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows edit when inside the 60s window", () => {
    const { result } = renderHook(() =>
      useExpiringMenu(message("2026-04-28T10:00:00.000Z")),
    );
    expect(result.current.canEdit).toBe(true);
    expect(result.current.secondsRemaining).toBe(30);
  });

  it("closes the window after 60s and clears the timer", () => {
    const { result } = renderHook(() =>
      useExpiringMenu(message("2026-04-28T09:59:35.000Z")),
    );
    expect(result.current.canEdit).toBe(true);
    expect(result.current.secondsRemaining).toBe(5);
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(result.current.canEdit).toBe(false);
    expect(result.current.secondsRemaining).toBe(0);
  });

  it("never starts a timer for messages older than 60s", () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    renderHook(() => useExpiringMenu(message("2026-04-28T09:00:00.000Z")));
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });
});
