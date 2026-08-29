/**
 * ibi-10 / ibi-16: Inbox list polling hook.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useInboxPolling } from "@/lib/inbox/useInboxPolling";
import { getInteractions } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getInteractions: vi.fn(),
  emptyInteractionStageCounts: () => ({
    all: 0,
    new_lead: 0,
    in_conversation: 0,
    booking_pending: 0,
    booked: 0,
    paid: 0,
    cancelled: 0,
    needs_review: 0,
  }),
}));

const mockGet = vi.mocked(getInteractions);

const sampleRow = {
  id: "c1",
  kind: "conversation" as const,
  channel: "instagram" as const,
  patient_id: null,
  patient_display_name: null,
  medical_record_number: null,
  lead_label: "Instagram chat",
  last_message_snippet: "hi",
  status: "in_conversation" as const,
  has_comment_lead: false,
  needs_review: false,
  appointment_id: null,
  appointment_patient_id: null,
  appointment_patient_display_name: null,
  appointment_patient_mrn: null,
  platform_external_id: "1234",
  platform_username: null,
  avatar_url: null,
  created_at: "2026-07-27T08:00:00.000Z",
  updated_at: "2026-07-27T08:00:00.000Z",
};

const sampleCounts = {
  all: 1,
  new_lead: 0,
  in_conversation: 1,
  booking_pending: 0,
  booked: 0,
  paid: 0,
  cancelled: 0,
  needs_review: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useInboxPolling", () => {
  it("fetches interactions on mount with filters and counts", async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        interactions: [sampleRow],
        nextCursor: null,
        counts: sampleCounts,
      },
      meta: { requestId: "t", timestamp: new Date().toISOString() },
    });

    const { result } = renderHook(() =>
      useInboxPolling({
        token: "tok",
        filters: {
          scope: "signal",
          dateFrom: "2026-06-27T00:00:00.000Z",
          statuses: ["booked", "paid"],
        },
      })
    );

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
    });
    expect(result.current.counts?.in_conversation).toBe(1);
    expect(result.current.nextCursor).toBeNull();
    expect(mockGet).toHaveBeenCalledWith("tok", {
      scope: "signal",
      channel: undefined,
      statuses: ["booked", "paid"],
      dateFrom: "2026-06-27T00:00:00.000Z",
      dateTo: undefined,
      limit: 50,
      includeCounts: true,
    });
  });

  it("polls without recomputing stage counts", async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        interactions: [sampleRow],
        nextCursor: null,
        counts: sampleCounts,
      },
      meta: { requestId: "t", timestamp: new Date().toISOString() },
    });

    const { result } = renderHook(() =>
      useInboxPolling({
        token: "tok",
        filters: { scope: "signal" },
        intervalMs: 1000,
      })
    );

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
    });
    expect(mockGet).toHaveBeenCalledTimes(1);

    mockGet.mockResolvedValueOnce({
      success: true,
      data: {
        interactions: [{ ...sampleRow, id: "c2" }],
        nextCursor: null,
        counts: null,
      },
      meta: { requestId: "t2", timestamp: new Date().toISOString() },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(2);
    });
    expect(mockGet).toHaveBeenLastCalledWith(
      "tok",
      expect.objectContaining({ includeCounts: false })
    );
    // Keep last known counts from the mount fetch.
    expect(result.current.counts?.in_conversation).toBe(1);
  });

  it("appends rows on loadMore when nextCursor is present", async () => {
    mockGet
      .mockResolvedValueOnce({
        success: true,
        data: {
          interactions: [sampleRow],
          nextCursor: "cursor-1",
          counts: {
            all: 2,
            new_lead: 0,
            in_conversation: 2,
            booking_pending: 0,
            booked: 0,
            paid: 0,
            cancelled: 0,
            needs_review: 0,
          },
        },
        meta: { requestId: "t", timestamp: new Date().toISOString() },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          interactions: [{ ...sampleRow, id: "c2" }],
          nextCursor: null,
          counts: null,
        },
        meta: { requestId: "t2", timestamp: new Date().toISOString() },
      });

    const { result } = renderHook(() =>
      useInboxPolling({
        token: "tok",
        filters: { scope: "signal" },
      })
    );

    await waitFor(() => {
      expect(result.current.nextCursor).toBe("cursor-1");
    });

    await act(async () => {
      await result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });
    expect(result.current.nextCursor).toBeNull();
    expect(mockGet).toHaveBeenLastCalledWith(
      "tok",
      expect.objectContaining({
        cursor: "cursor-1",
        limit: 50,
        includeCounts: false,
      })
    );
  });

  it("does not fetch when paused", async () => {
    const { result } = renderHook(() =>
      useInboxPolling({
        token: "tok",
        filters: { scope: "signal" },
        paused: true,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.rows).toBeNull();
  });
});
