import { beforeEach, describe, expect, it, vi } from "vitest";

const getAppointments = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  getAppointments,
}));

import { appointmentsQueryOptions } from "@/lib/query/options";
import { queryKeys } from "@/lib/query/keys";

describe("appointmentsQueryOptions", () => {
  beforeEach(() => {
    getAppointments.mockReset();
    getAppointments.mockResolvedValue({ data: { appointments: [] } });
  });

  it("requests one clinic day and stays under the undated invalidation prefix", async () => {
    const options = appointmentsQueryOptions("tok", "2026-11-01");

    expect(options.queryKey).toEqual(queryKeys.dashboard.appointments("2026-11-01"));
    expect(options.queryKey.slice(0, 2)).toEqual([
      ...queryKeys.dashboard.appointments(),
    ]);

    await options.queryFn();
    expect(getAppointments).toHaveBeenCalledWith("tok", "2026-11-01");
  });
});
