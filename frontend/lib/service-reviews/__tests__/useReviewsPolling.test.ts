import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { getServiceStaffReviews } from "@/lib/api";
import {
  REVIEWS_POLL_INTERVAL_MS,
  useReviewsPolling,
} from "@/lib/service-reviews/useReviewsPolling";

vi.mock("@/lib/api", () => ({
  getServiceStaffReviews: vi.fn(),
}));

const mockReviews = [{ id: "review-1" }];

describe("useReviewsPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getServiceStaffReviews).mockResolvedValue({
      data: { reviews: mockReviews },
    } as Awaited<ReturnType<typeof getServiceStaffReviews>>);
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("polls at the interval", async () => {
    renderHook(() =>
      useReviewsPolling({ token: "tok", tab: "pending", intervalMs: REVIEWS_POLL_INTERVAL_MS })
    );

    expect(getServiceStaffReviews).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVIEWS_POLL_INTERVAL_MS);
    });

    expect(getServiceStaffReviews).toHaveBeenCalledTimes(1);
    expect(getServiceStaffReviews).toHaveBeenCalledWith("tok", "pending");
  });

  it("stops polling while paused", async () => {
    const { rerender } = renderHook(
      ({ paused }: { paused: boolean }) =>
        useReviewsPolling({ token: "tok", tab: "pending", paused }),
      { initialProps: { paused: false } }
    );

    rerender({ paused: true });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVIEWS_POLL_INTERVAL_MS * 2);
    });

    expect(getServiceStaffReviews).not.toHaveBeenCalled();
  });

  it("refetches when unpaused", async () => {
    const { rerender } = renderHook(
      ({ paused }: { paused: boolean }) =>
        useReviewsPolling({ token: "tok", tab: "pending", paused }),
      { initialProps: { paused: true } }
    );

    vi.mocked(getServiceStaffReviews).mockClear();

    rerender({ paused: false });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(getServiceStaffReviews).toHaveBeenCalled();
    expect(getServiceStaffReviews).toHaveBeenCalledWith("tok", "pending");
  });

  it("refetches on visibility restore", async () => {
    renderHook(() => useReviewsPolling({ token: "tok", tab: "pending" }));

    vi.mocked(getServiceStaffReviews).mockClear();

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.runOnlyPendingTimersAsync();
    });

    expect(getServiceStaffReviews).toHaveBeenCalled();
    expect(getServiceStaffReviews).toHaveBeenCalledWith("tok", "pending");
  });
});
