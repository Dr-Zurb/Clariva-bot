import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateDoctorDay } from "@/lib/query/invalidate";
import { queryKeys } from "@/lib/query/keys";

describe("invalidateDoctorDay", () => {
  it("invalidates appointments, both OPD session keys, and desk", async () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateDoctorDay(queryClient, "2026-09-16");

    expect(spy).toHaveBeenCalledWith({
      queryKey: queryKeys.dashboard.appointments(),
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: queryKeys.opd.session("2026-09-16"),
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: queryKeys.opd.queueSession("2026-09-16"),
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: queryKeys.desk.all,
    });
  });
});
