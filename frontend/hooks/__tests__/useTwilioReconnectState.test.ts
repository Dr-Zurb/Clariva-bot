/**
 * useTwilioReconnectState — unit tests (Vitest).
 *
 * @see task-voice-B1-reconnection-ux.md
 *
 * Run: `pnpm --filter clariva-bot-frontend test hooks/__tests__/useTwilioReconnectState`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useTwilioReconnectState,
  type ReconnectStatus,
} from "@/hooks/useTwilioReconnectState";
import type { Room } from "twilio-video";

type RoomHandler = (...args: unknown[]) => void;

function createMockRoom() {
  const listeners = new Map<string, Set<RoomHandler>>();
  const room = {
    on(event: string, handler: RoomHandler) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(handler);
      return room;
    },
    off(event: string, handler: RoomHandler) {
      listeners.get(event)?.delete(handler);
      return room;
    },
    emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach((handler) => handler(...args));
    },
  };
  return { room: room as unknown as Room, emit: room.emit.bind(room) };
}

describe("useTwilioReconnectState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts live with no countdown when room is null", () => {
    const { result } = renderHook(() =>
      useTwilioReconnectState({ room: null }),
    );
    expect(result.current.status).toBe("live");
    expect(result.current.countdownSeconds).toBeNull();
  });

  it("enters reconnecting with countdown on Twilio reconnecting event", () => {
    const { room, emit } = createMockRoom();
    const { result } = renderHook(() =>
      useTwilioReconnectState({ room, autoRetryWindowSeconds: 5 }),
    );

    act(() => {
      emit("reconnecting");
    });

    expect(result.current.status).toBe("reconnecting");
    expect(result.current.countdownSeconds).toBe(5);
  });

  it("returns to live when Twilio fires reconnected", () => {
    const { room, emit } = createMockRoom();
    const { result } = renderHook(() =>
      useTwilioReconnectState({ room, autoRetryWindowSeconds: 5 }),
    );

    act(() => {
      emit("reconnecting");
    });
    act(() => {
      emit("reconnected");
    });

    expect(result.current.status).toBe("live");
    expect(result.current.countdownSeconds).toBeNull();
  });

  it("flips to failed when the countdown reaches zero", () => {
    const { room, emit } = createMockRoom();
    const { result } = renderHook(() =>
      useTwilioReconnectState({ room, autoRetryWindowSeconds: 2 }),
    );

    act(() => {
      emit("reconnecting");
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.countdownSeconds).toBeNull();
  });

  it("invokes onRejoinRequested from tryNow and rejoinNow", () => {
    const { room } = createMockRoom();
    const onRejoinRequested = vi.fn();
    const { result } = renderHook(() =>
      useTwilioReconnectState({ room, onRejoinRequested }),
    );

    act(() => {
      result.current.tryNow();
    });
    act(() => {
      result.current.rejoinNow();
    });

    expect(onRejoinRequested).toHaveBeenCalledTimes(2);
  });

  it("resets to live when room becomes null", () => {
    const { room, emit } = createMockRoom();
    const { result, rerender } = renderHook(
      ({ activeRoom }: { activeRoom: Room | null }) =>
        useTwilioReconnectState({ room: activeRoom, autoRetryWindowSeconds: 3 }),
      { initialProps: { activeRoom: room } },
    );

    act(() => {
      emit("reconnecting");
    });
    expect(result.current.status).toBe("reconnecting");

    rerender({ activeRoom: null });
    expect(result.current.status).toBe("live");
    expect(result.current.countdownSeconds).toBeNull();
  });

  it("clears countdown interval on unmount", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const { room, emit } = createMockRoom();
    const { unmount } = renderHook(() =>
      useTwilioReconnectState({ room, autoRetryWindowSeconds: 10 }),
    );

    act(() => {
      emit("reconnecting");
    });
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it("resets to live on disconnected without entering failed", () => {
    const { room, emit } = createMockRoom();
    const { result } = renderHook(() =>
      useTwilioReconnectState({ room, autoRetryWindowSeconds: 30 }),
    );

    act(() => {
      emit("reconnecting");
    });
    act(() => {
      emit("disconnected");
    });

    const status: ReconnectStatus = result.current.status;
    expect(status).toBe("live");
  });
});
