/**
 * @vitest-environment jsdom
 *
 * @see task-text-D2-multi-tab-kick.md
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  shouldEvictOnClaim,
  tabIdStorageKey,
  useTabPresenceClaim,
} from "../use-tab-presence-claim";

const SESSION_ID = "sess-text-d2";
const TOKEN = "jwt-scoped";

type SubscribeHandler = (status: string) => void;
type BroadcastHandler = (args: { payload?: { tab_id?: string; claimed_at?: number } }) => void;

let subscribeHandler: SubscribeHandler | null = null;
let broadcastHandler: BroadcastHandler | null = null;
const sendMock = vi.fn();
const removeChannelMock = vi.fn();

vi.mock("@/lib/supabase/scoped-client", () => ({
  createScopedRealtimeClient: vi.fn(() => ({
    channel: vi.fn(() => {
      const channel = {
        on: vi.fn(
          (
            type: string,
            filter: { event?: string },
            handler: BroadcastHandler,
          ) => {
            if (type === "broadcast" && filter.event === "chat-presence-claim") {
              broadcastHandler = handler;
            }
            return channel;
          },
        ),
        subscribe: vi.fn((handler: SubscribeHandler) => {
          subscribeHandler = handler;
          return channel;
        }),
        send: sendMock,
      };
      return channel;
    }),
    removeChannel: removeChannelMock,
  })),
}));

describe("shouldEvictOnClaim", () => {
  it("ignores self claims", () => {
    expect(
      shouldEvictOnClaim("tab-a", 100, { tab_id: "tab-a", claimed_at: 200 }),
    ).toBe(false);
  });

  it("evicts when another tab has a newer timestamp", () => {
    expect(
      shouldEvictOnClaim("tab-a", 100, { tab_id: "tab-b", claimed_at: 200 }),
    ).toBe(true);
  });

  it("does not evict on older competing claims", () => {
    expect(
      shouldEvictOnClaim("tab-a", 200, { tab_id: "tab-b", claimed_at: 100 }),
    ).toBe(false);
  });
});

describe("useTabPresenceClaim", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    subscribeHandler = null;
    broadcastHandler = null;
    sendMock.mockReset();
    removeChannelMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("returns inert shape for doctors", () => {
    const { result } = renderHook(() =>
      useTabPresenceClaim(SESSION_ID, "doctor", TOKEN, true),
    );

    expect(result.current.evicted).toBe(false);
    expect(subscribeHandler).toBeNull();
    act(() => {
      result.current.takeOver();
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns inert shape when disabled (readonly)", () => {
    const { result } = renderHook(() =>
      useTabPresenceClaim(SESSION_ID, "patient", TOKEN, false),
    );

    expect(result.current.evicted).toBe(false);
    expect(subscribeHandler).toBeNull();
  });

  it("persists tab id in sessionStorage across hook inits", () => {
    sessionStorage.setItem(tabIdStorageKey(SESSION_ID), "tab-persisted");

    renderHook(() => useTabPresenceClaim(SESSION_ID, "patient", TOKEN, true));

    act(() => {
      subscribeHandler?.("SUBSCRIBED");
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ tab_id: "tab-persisted" }),
      }),
    );
  });

  it("broadcasts an initial claim on SUBSCRIBED", () => {
    renderHook(() => useTabPresenceClaim(SESSION_ID, "patient", TOKEN, true));

    act(() => {
      subscribeHandler?.("SUBSCRIBED");
    });

    expect(sendMock).toHaveBeenCalledWith({
      type: "broadcast",
      event: "chat-presence-claim",
      payload: expect.objectContaining({
        tab_id: expect.any(String),
        claimed_at: expect.any(Number),
      }),
    });
  });

  it("sets evicted when a newer claim arrives from another tab", () => {
    const { result } = renderHook(() =>
      useTabPresenceClaim(SESSION_ID, "patient", TOKEN, true),
    );

    act(() => {
      subscribeHandler?.("SUBSCRIBED");
    });

    act(() => {
      broadcastHandler?.({
        payload: { tab_id: "other-tab", claimed_at: Date.now() + 10_000 },
      });
    });

    expect(result.current.evicted).toBe(true);
  });

  it("takeOver clears evicted and rebroadcasts a newer claim", () => {
    const { result } = renderHook(() =>
      useTabPresenceClaim(SESSION_ID, "patient", TOKEN, true),
    );

    act(() => {
      subscribeHandler?.("SUBSCRIBED");
    });

    const initialClaim = sendMock.mock.calls[0]?.[0]?.payload?.claimed_at as number;

    act(() => {
      broadcastHandler?.({
        payload: { tab_id: "other-tab", claimed_at: initialClaim + 1000 },
      });
    });
    expect(result.current.evicted).toBe(true);

    sendMock.mockClear();

    act(() => {
      vi.setSystemTime(Date.now() + 5000);
      result.current.takeOver();
    });

    expect(result.current.evicted).toBe(false);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          claimed_at: expect.any(Number),
        }),
      }),
    );
    const takeoverClaim = sendMock.mock.calls[0]?.[0]?.payload?.claimed_at as number;
    expect(takeoverClaim).toBeGreaterThan(initialClaim + 1000);
  });
});
