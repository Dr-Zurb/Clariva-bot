/**
 * NextPatientCountdown — park guard.
 *
 * The pf-11 advance is queue flow only. Reopening a completed visit to
 * revise the Rx parks the token, and the park can land after this
 * component has already mounted, so every fire path re-reads it.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  NextPatientCountdown,
  cancelStorageKey,
} from "@/components/consultation/cockpit/NextPatientCountdown";

const push = vi.fn();
const routerPrefetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch: routerPrefetch }),
}));

vi.mock("@/lib/query/prefetch/next-consult", () => ({
  prefetchNextConsult: vi.fn(),
}));

const mockUseNextAppointmentRoute = vi.fn();

vi.mock("@/hooks/useNextAppointmentRoute", () => ({
  useNextAppointmentRoute: (opts: unknown) => mockUseNextAppointmentRoute(opts),
}));

const mockGetDoctorSettings = vi.fn();

vi.mock("@/lib/api", () => ({
  getDoctorSettings: (token: string) => mockGetDoctorSettings(token),
}));

vi.mock("@/components/consultation/cockpit/EndOfDayCard", () => ({
  EndOfDayCard: () => <div data-testid="end-of-day" />,
}));

const NEXT_ROUTE = {
  appointmentId: "appt-2",
  patientId: "pat-2",
  url: "/dashboard/appointments/appt-2",
  label: "Mohit K (#5)",
  modality: "in_clinic" as const,
  positionLabel: "#5 of 12",
};

function renderCountdown() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextPatientCountdown currentAppointmentId="appt-1" token="t" />
    </QueryClientProvider>
  );
}

function setFlowAdvance(mode: "instant" | "countdown" | "manual") {
  mockGetDoctorSettings.mockResolvedValue({
    data: { settings: { patient_flow_advance: mode } },
  });
}

describe("NextPatientCountdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockUseNextAppointmentRoute.mockReturnValue({
      next: NEXT_ROUTE,
      isLoading: false,
      error: null,
      isLastInQueue: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances instantly in queue flow", async () => {
    setFlowAdvance("instant");

    renderCountdown();

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/dashboard/appointments/appt-2");
    });
  });

  it("stays put in instant mode when the token is parked", async () => {
    setFlowAdvance("instant");
    sessionStorage.setItem(cancelStorageKey("appt-1"), "1");

    renderCountdown();

    await waitFor(() => {
      expect(mockGetDoctorSettings).toHaveBeenCalled();
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("renders no countdown for a token parked before mount", async () => {
    setFlowAdvance("countdown");
    sessionStorage.setItem(cancelStorageKey("appt-1"), "1");

    renderCountdown();

    await waitFor(() => {
      expect(mockGetDoctorSettings).toHaveBeenCalled();
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not advance when the token is parked mid-countdown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setFlowAdvance("countdown");

    renderCountdown();

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    // The doctor reopened this visit to edit the Rx while the timer ran.
    sessionStorage.setItem(cancelStorageKey("appt-1"), "1");

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    expect(push).not.toHaveBeenCalled();
  });

  it("advances at zero when the token is not parked", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setFlowAdvance("countdown");

    renderCountdown();

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    expect(push).toHaveBeenCalledWith("/dashboard/appointments/appt-2");
  });
});
