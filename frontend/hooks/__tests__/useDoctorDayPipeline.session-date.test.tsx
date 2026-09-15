import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const searchParams = new URLSearchParams("from=opd-today&date=2026-09-10");
const snapshot = vi.fn();
const schedule = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

vi.mock("@/hooks/useOpdSnapshot", () => ({
  useOpdSnapshot: (...args: unknown[]) => snapshot(...args),
}));

vi.mock("@/components/dashboard/cockpit/useTodaysAppointments", () => ({
  useTodaysAppointments: (...args: unknown[]) => schedule(...args),
}));

import { useDoctorDayPipeline } from "@/hooks/useDoctorDayPipeline";

describe("useDoctorDayPipeline § session date", () => {
  it("loads the OPD snapshot for ?date=, not today", () => {
    snapshot.mockReturnValue({
      isOpdEnabled: true,
      active: [],
      activeAll: [],
      done: [
        {
          appointmentId: "appt-15",
          patientName: "Test Patient Fifteen",
          queueStatus: "completed",
          tokenNumber: 15,
          sessionDate: "2026-09-10",
          patientId: "pat-15",
          age: 62,
          gender: "M",
        },
      ],
      missed: [],
      totalActive: 0,
      totalInConsult: 0,
      totalDone: 1,
      totalMissed: 0,
      isLoading: false,
      error: null,
      retry: () => undefined,
      lastUpdatedAt: null,
      entries: [],
    });
    schedule.mockReturnValue({
      appointments: null,
      loading: false,
      error: null,
      refetch: () => undefined,
    });

    const { result } = renderHook(() =>
      useDoctorDayPipeline({
        token: "tok",
        currentAppointmentId: "appt-15",
        sessionDate: "2026-09-13",
      }),
    );

    expect(snapshot).toHaveBeenCalledWith("tok", "2026-09-10");
    expect(schedule).toHaveBeenCalledWith("tok", "2026-09-10");
    expect(result.current.sessionDate).toBe("2026-09-10");
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.entries[0]?.id).toBe("appt-15");
  });
});
