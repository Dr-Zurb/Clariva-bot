/**
 * @vitest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatQualitySampler } from "../use-chat-quality-sampler";

vi.mock("@/lib/api", () => ({
  postConsultationTextQualitySample: vi.fn().mockResolvedValue(undefined),
}));

import { postConsultationTextQualitySample } from "@/lib/api";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

describe("useChatQualitySampler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(postConsultationTextQualitySample).mockClear();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("posts aggregated sample every 30s and resets counters", async () => {
    const { result } = renderHook(() =>
      useChatQualitySampler({
        sessionId: SESSION_ID,
        role: "doctor",
        accessToken: "jwt",
      }),
    );

    act(() => {
      result.current.onOptimisticSend("msg-1");
      result.current.onMessageAck("msg-1");
      result.current.onRealtimeReconnect();
      result.current.onPresenceFlap();
    });

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(postConsultationTextQualitySample).toHaveBeenCalledTimes(1);
    expect(postConsultationTextQualitySample).toHaveBeenCalledWith(
      "jwt",
      SESSION_ID,
      expect.objectContaining({
        session_id: SESSION_ID,
        realtime_reconnects: 1,
        presence_flaps: 1,
        messages_in_window: 1,
        roundtrip_p95_ms: expect.any(Number),
      }),
    );
  });

  it("does not post while the tab is hidden", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });

    renderHook(() =>
      useChatQualitySampler({
        sessionId: SESSION_ID,
        role: "patient",
        accessToken: "jwt",
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(postConsultationTextQualitySample).not.toHaveBeenCalled();
  });
});
