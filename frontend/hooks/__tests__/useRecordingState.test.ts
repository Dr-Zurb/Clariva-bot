import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRecordingState } from "../useRecordingState";
import { getRecordingState } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getRecordingState: vi.fn(),
}));

const mockedGet = vi.mocked(getRecordingState);

const META = { timestamp: "2026-08-18T00:00:00.000Z", requestId: "req-1" };

describe("useRecordingState · rec-15 transport", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedGet.mockResolvedValue({
      success: true,
      data: { sessionId: "sess-1", paused: false },
      meta: META,
    });
  });

  it("refreshes GET /recording/state after a recording_paused event", async () => {
    mockedGet
      .mockResolvedValueOnce({
        success: true,
        data: { sessionId: "sess-1", paused: false },
        meta: META,
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          sessionId: "sess-1",
          paused: true,
          pauseReason: "administrative",
        },
        meta: META,
      });

    const { result } = renderHook(() =>
      useRecordingState({ sessionId: "sess-1", token: "tok-1" }),
    );

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });
    expect(mockedGet).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.applyIncomingMessage({
        senderRole: "system",
        systemEvent: "recording_paused",
        body: "Doctor paused recording at 14:00.",
      });
    });

    expect(result.current.state.paused).toBe(true);
    expect(result.current.state.pauseReason).toBeUndefined();

    await waitFor(() => {
      expect(result.current.state.pauseReason).toBe("administrative");
    });
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("rehydrates the countdown from GET /recording/state after a pause", async () => {
    mockedGet
      .mockResolvedValueOnce({
        success: true,
        data: { sessionId: "sess-1", paused: false },
        meta: META,
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          sessionId: "sess-1",
          paused: true,
          autoResumeAt: "2026-08-18T10:15:00.000Z",
          autoResumeExtensionsUsed: 0,
          autoResumeBoundMs: 300000,
        },
        meta: META,
      });

    const { result } = renderHook(() =>
      useRecordingState({ sessionId: "sess-1", token: "tok-1" }),
    );
    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    act(() => {
      result.current.applyIncomingMessage({
        senderRole: "system",
        systemEvent: "recording_paused",
        body: "Doctor paused recording at 10:10.",
      });
    });

    await waitFor(() => {
      expect(result.current.state.autoResumeAt?.toISOString()).toBe(
        "2026-08-18T10:15:00.000Z",
      );
    });
    expect(result.current.state.paused).toBe(true);
  });
});
