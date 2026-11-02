import { beforeEach, describe, expect, it, vi } from "vitest";

const getDashboardCounts = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  getDashboardCounts,
}));

import { dashboardCountsQueryOptions } from "@/lib/query/options";
import { queryKeys } from "@/lib/query/keys";

describe("dashboardCountsQueryOptions", () => {
  beforeEach(() => {
    getDashboardCounts.mockReset();
    getDashboardCounts.mockResolvedValue({
      data: {
        bookingReviewsUnconfirmed: 1,
        opdLive: 2,
        dashboardEventsUnread: 3,
      },
    });
  });

  it("reads the shared counts key and returns the response data", async () => {
    const options = dashboardCountsQueryOptions("tok");

    expect(options.queryKey).toEqual(queryKeys.dashboard.counts());
    await expect(options.queryFn()).resolves.toEqual({
      bookingReviewsUnconfirmed: 1,
      opdLive: 2,
      dashboardEventsUnread: 3,
    });
    expect(getDashboardCounts).toHaveBeenCalledWith("tok");
  });
});
