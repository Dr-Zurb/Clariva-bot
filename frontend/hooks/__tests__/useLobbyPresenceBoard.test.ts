/**
 * crc-15 — board presence hook: event → overlay; poll clears; subscribe fail is silent.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLobbyPresenceBoard } from "@/hooks/useLobbyPresenceBoard";
import { lobbyPresenceTopic } from "@/lib/consultation/lobby-presence";

type BroadcastHandler = (msg: { payload?: unknown }) => void;

const handlers = new Map<string, BroadcastHandler>();
const removeChannel = vi.fn();
const createClientMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => createClientMock(),
}));

function fakeClient() {
  return {
    channel(topic: string) {
      const channel = {
        on: (_type: string, _filter: unknown, cb: BroadcastHandler) => {
          handlers.set(topic, cb);
          return channel;
        },
        subscribe: vi.fn(),
      };
      return channel;
    },
    removeChannel,
  };
}

describe("useLobbyPresenceBoard", () => {
  beforeEach(() => {
    handlers.clear();
    removeChannel.mockReset();
    createClientMock.mockReset();
    createClientMock.mockImplementation(fakeClient);
  });

  it("presence broadcast adds the appointment to the overlay", async () => {
    const { result } = renderHook(() =>
      useLobbyPresenceBoard({
        appointmentIds: ["appt-1"],
        pollGeneration: 1,
        enabled: true,
      })
    );

    expect(result.current.size).toBe(0);
    const topic = lobbyPresenceTopic("appt-1");
    const handler = handlers.get(topic);
    expect(handler).toBeDefined();

    act(() => {
      handler?.({
        payload: { appointmentId: "appt-1", ts: 1_700_000_000_000 },
      });
    });

    expect(result.current.has("appt-1")).toBe(true);
  });

  it("poll generation clears optimistic overlay", () => {
    const { result, rerender } = renderHook(
      ({ gen }: { gen: number }) =>
        useLobbyPresenceBoard({
          appointmentIds: ["appt-1"],
          pollGeneration: gen,
          enabled: true,
        }),
      { initialProps: { gen: 1 } }
    );

    const handler = handlers.get(lobbyPresenceTopic("appt-1"));
    act(() => {
      handler?.({ payload: { appointmentId: "appt-1", ts: Date.now() } });
    });
    expect(result.current.has("appt-1")).toBe(true);

    rerender({ gen: 2 });
    expect(result.current.size).toBe(0);
  });

  it("subscribe failure leaves overlay empty (poll path intact)", () => {
    createClientMock.mockImplementation(() => {
      throw new Error("websockets blocked");
    });

    const { result } = renderHook(() =>
      useLobbyPresenceBoard({
        appointmentIds: ["appt-1"],
        pollGeneration: 1,
        enabled: true,
      })
    );

    expect(result.current.size).toBe(0);
    expect(handlers.size).toBe(0);
  });

  it("ignores PHI-bearing payloads", () => {
    const { result } = renderHook(() =>
      useLobbyPresenceBoard({
        appointmentIds: ["appt-1"],
        pollGeneration: 1,
      })
    );

    const handler = handlers.get(lobbyPresenceTopic("appt-1"));
    act(() => {
      handler?.({
        payload: {
          appointmentId: "appt-1",
          ts: Date.now(),
          name: "Ada",
        },
      });
    });
    expect(result.current.size).toBe(0);
  });
});
