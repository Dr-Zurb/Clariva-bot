/**
 * crc-17 — lobby reconnect hook: backoff, offline banner, immediate recover.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import {
  LobbyReconnectNotice,
  useLobbyReconnect,
} from "@/hooks/useLobbyReconnect";
import { LOBBY_RECONNECT_BASE_MS } from "@/lib/consultation/lobby-reconnect";

let visibility: DocumentVisibilityState = "visible";
let online = true;

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
}

function setOnline(value: boolean) {
  online = value;
}

describe("useLobbyReconnect", () => {
  beforeEach(() => {
    visibility = "visible";
    online = true;
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => online,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks reconnecting after a failed tick and backs off past the healthy 5s cadence", async () => {
    const onTick = vi.fn().mockRejectedValue(new Error("net"));
    const { result } = renderHook(() =>
      useLobbyReconnect({ enabled: true, onTick })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.reconnecting).toBe(true);
    expect(onTick).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_RECONNECT_BASE_MS);
    });
    expect(onTick).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_RECONNECT_BASE_MS);
    });
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it("clears reconnecting and returns to the 5s cadence after a successful tick", async () => {
    const onTick = vi
      .fn()
      .mockRejectedValueOnce(new Error("net"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useLobbyReconnect({ enabled: true, onTick })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.reconnecting).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.reconnecting).toBe(false);

    onTick.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_RECONNECT_BASE_MS);
    });
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("refetches immediately on online, without waiting for the backoff timer", async () => {
    const onTick = vi.fn().mockRejectedValue(new Error("net"));
    const { result } = renderHook(() =>
      useLobbyReconnect({ enabled: true, onTick })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.reconnecting).toBe(true);
    onTick.mockClear();
    onTick.mockResolvedValue(undefined);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });

    expect(onTick).toHaveBeenCalledTimes(1);
    expect(result.current.reconnecting).toBe(false);
    expect(result.current.isOnline).toBe(true);
  });

  it("pauses while hidden and refetches immediately on visibilitychange → visible", async () => {
    const onTick = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useLobbyReconnect({ enabled: true, onTick }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(onTick).toHaveBeenCalledTimes(1);
    onTick.mockClear();

    setVisibility("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_RECONNECT_BASE_MS * 3);
    });
    expect(onTick).not.toHaveBeenCalled();

    setVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("sets isOnline false on offline so the presence channel can unmount", async () => {
    const onTick = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useLobbyReconnect({ enabled: true, onTick })
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current.isOnline).toBe(false);
    expect(result.current.reconnecting).toBe(true);
  });
});

describe("LobbyReconnectNotice", () => {
  it("renders a calm Reconnecting… status, not an error", () => {
    render(<LobbyReconnectNotice show />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Reconnecting…");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("renders nothing when hidden", () => {
    const { container } = render(<LobbyReconnectNotice show={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
