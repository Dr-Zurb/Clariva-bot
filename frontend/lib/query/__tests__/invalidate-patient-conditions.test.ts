import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidatePatientConditions } from "@/lib/query/invalidate";
import { queryKeys } from "@/lib/query/keys";

describe("invalidatePatientConditions", () => {
  it("active-refetches both keys when no acting surface is set", async () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await invalidatePatientConditions(queryClient, "pat-1");

    expect(spy).toHaveBeenCalledWith({
      queryKey: queryKeys.patient("pat-1").conditions(),
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: queryKeys.patient("pat-1").medicalBackground(),
    });
    expect(spy.mock.calls.every((c) => !("refetchType" in (c[0] ?? {})))).toBe(
      true,
    );
  });

  it("skips refetch on the acting Known-conditions surface", async () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await invalidatePatientConditions(queryClient, "pat-1", {
      actingSurface: "conditions",
    });

    expect(spy).toHaveBeenCalledWith({
      queryKey: queryKeys.patient("pat-1").conditions(),
      refetchType: "none",
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: queryKeys.patient("pat-1").medicalBackground(),
    });
  });

  it("skips refetch on both surfaces when actingSurface is all", async () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await invalidatePatientConditions(queryClient, "pat-1", {
      actingSurface: "all",
    });

    expect(spy).toHaveBeenCalledWith({
      queryKey: queryKeys.patient("pat-1").conditions(),
      refetchType: "none",
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: queryKeys.patient("pat-1").medicalBackground(),
      refetchType: "none",
    });
  });
});
