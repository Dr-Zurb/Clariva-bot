/**
 * useSessionOverrun hook tests (pdm-10).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import * as api from "@/lib/api";
import { useSessionOverrun } from "@/hooks/useSessionOverrun";
import type { OverrunRow } from "@/lib/api";

function makeRow(id: string): OverrunRow {
  return {
    id,
    status: "pending",
    appointment_date: "2026-05-16T10:00:00.000Z",
    opd_event_type: null,
    modality: "in_person",
    patients: {
      id: "p1",
      first_name: "Ravi",
      last_name: "Sharma",
      phone: "+911234567890",
    },
    services: { id: "svc1", name: "Consult", duration_min: 15 },
  };
}

describe("useSessionOverrun", () => {
  beforeEach(() => {
    vi.spyOn(api, "getOpdSessionOverrun").mockResolvedValue({
      success: true,
      data: {
        date: "2026-05-16",
        count: 2,
        rows: [makeRow("a1"), makeRow("a2")],
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: "req-1",
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns rows and count from the API", async () => {
    const { result } = renderHook(() =>
      useSessionOverrun("tok", "2026-05-16")
    );

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });

    expect(result.current.count).toBe(2);
    expect(result.current.error).toBeNull();
    expect(api.getOpdSessionOverrun).toHaveBeenCalledWith("tok", "2026-05-16");
  });

  it("refetch re-invokes the API", async () => {
    const { result } = renderHook(() =>
      useSessionOverrun("tok", "2026-05-16")
    );

    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    vi.mocked(api.getOpdSessionOverrun).mockResolvedValueOnce({
      success: true,
      data: { date: "2026-05-16", count: 1, rows: [makeRow("a3")] },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: "req-2",
      },
    });

    await result.current.refetch();

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
      expect(result.current.count).toBe(1);
    });
    expect(api.getOpdSessionOverrun).toHaveBeenCalledTimes(2);
  });

  it("sets error when the API throws", async () => {
    vi.mocked(api.getOpdSessionOverrun).mockRejectedValue(
      new Error("network down")
    );

    const { result } = renderHook(() =>
      useSessionOverrun("tok", "2026-05-16")
    );

    await waitFor(() => {
      expect(result.current.error).toBe("network down");
    });
    expect(result.current.rows).toHaveLength(0);
  });
});
