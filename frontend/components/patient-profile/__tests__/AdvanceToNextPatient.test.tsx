import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { AdvanceToNextPatient } from "@/components/patient-profile/AdvanceToNextPatient";
import {
  beginPrintAdvanceHold,
  endPrintAdvanceHold,
  resetPrintAdvanceHoldForTests,
} from "@/lib/cockpit/rx-print-advance";

const push = vi.fn();
const routerPrefetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch: routerPrefetch }),
}));

const mockPrefetchNextConsult = vi.fn();

vi.mock("@/lib/query/prefetch/next-consult", () => ({
  prefetchNextConsult: (...args: unknown[]) => mockPrefetchNextConsult(...args),
}));

const mockUseNextAppointmentRoute = vi.fn();

vi.mock("@/hooks/useNextAppointmentRoute", () => ({
  useNextAppointmentRoute: (opts: unknown) => mockUseNextAppointmentRoute(opts),
}));

function renderAdvance() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ui = (
    <QueryClientProvider client={queryClient}>
      <AdvanceToNextPatient currentAppointmentId="appt-1" token="t" />
    </QueryClientProvider>
  );
  const result = render(ui);
  return { ...result, rerenderAdvance: () => result.rerender(ui) };
}

describe("AdvanceToNextPatient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    resetPrintAdvanceHoldForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("navigates to the next patient as soon as the pipeline resolves", async () => {
    mockUseNextAppointmentRoute.mockReturnValue({
      next: {
        appointmentId: "appt-2",
        patientId: "pat-2",
        url: "/dashboard/appointments/appt-2",
        label: "Mohit K (#5)",
        modality: "in_clinic",
        positionLabel: "#5 of 12",
      },
      isLoading: false,
      error: null,
      isLastInQueue: false,
    });

    renderAdvance();

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/dashboard/appointments/appt-2");
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Mohit K (#5)");
  });

  it("navigates again if the doctor clicks the next toast", async () => {
    mockUseNextAppointmentRoute.mockReturnValue({
      next: {
        appointmentId: "appt-2",
        patientId: "pat-2",
        url: "/dashboard/appointments/appt-2",
        label: "Mohit K (#5)",
        modality: "in_clinic",
        positionLabel: "#5 of 12",
      },
      isLoading: false,
      error: null,
      isLastInQueue: false,
    });

    renderAdvance();
    await waitFor(() => {
      expect(push).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("status"));
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("pushes only once across re-renders", async () => {
    mockUseNextAppointmentRoute.mockReturnValue({
      next: {
        appointmentId: "appt-2",
        patientId: "pat-2",
        url: "/dashboard/appointments/appt-2",
        label: "Mohit K (#5)",
        modality: "in_clinic",
        positionLabel: "#5 of 12",
      },
      isLoading: false,
      error: null,
      isLastInQueue: false,
    });

    const { rerenderAdvance } = renderAdvance();
    rerenderAdvance();

    await waitFor(() => {
      expect(push).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a searching pill while the pipeline loads", () => {
    mockUseNextAppointmentRoute.mockReturnValue({
      next: null,
      isLoading: true,
      error: null,
      isLastInQueue: false,
    });

    renderAdvance();

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Finding next patient…"
    );
  });

  it("reports an empty queue only when this visit is the last token", () => {
    mockUseNextAppointmentRoute.mockReturnValue({
      next: null,
      isLoading: false,
      error: null,
      isLastInQueue: true,
    });

    renderAdvance();

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "No more patients in the queue"
    );
  });

  it("stays silent when next is null but this is not the last token", () => {
    mockUseNextAppointmentRoute.mockReturnValue({
      next: null,
      isLoading: false,
      error: null,
      isLastInQueue: false,
    });

    renderAdvance();

    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("dismisses the empty-queue toast after a few seconds", () => {
    vi.useFakeTimers();
    mockUseNextAppointmentRoute.mockReturnValue({
      next: null,
      isLoading: false,
      error: null,
      isLastInQueue: true,
    });

    renderAdvance();
    expect(screen.getByRole("status")).toHaveTextContent(
      "No more patients in the queue"
    );

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("warms the next cockpit before pushing to it", async () => {
    mockUseNextAppointmentRoute.mockReturnValue({
      next: {
        appointmentId: "appt-2",
        patientId: "pat-2",
        url: "/dashboard/appointments/appt-2",
        label: "Mohit K (#5)",
        modality: "in_clinic",
        positionLabel: "#5 of 12",
      },
      isLoading: false,
      error: null,
      isLastInQueue: false,
    });

    renderAdvance();

    await waitFor(() => {
      expect(push).toHaveBeenCalledTimes(1);
    });
    expect(routerPrefetch).toHaveBeenCalledWith("/dashboard/appointments/appt-2");
    expect(mockPrefetchNextConsult).toHaveBeenCalledWith(
      expect.anything(),
      "t",
      { appointmentId: "appt-2", patientId: "pat-2" }
    );
    // In flight before the navigation, so the next patient's reads join them.
    expect(mockPrefetchNextConsult.mock.invocationCallOrder[0]!).toBeLessThan(
      push.mock.invocationCallOrder[0]!
    );
  });

  it("waits for an open print dialog before auto-advancing", async () => {
    beginPrintAdvanceHold();
    mockUseNextAppointmentRoute.mockReturnValue({
      next: {
        appointmentId: "appt-2",
        patientId: "pat-2",
        url: "/dashboard/appointments/appt-2",
        label: "Mohit K (#5)",
        modality: "in_clinic",
        positionLabel: "#5 of 12",
      },
      isLoading: false,
      error: null,
      isLastInQueue: false,
    });

    renderAdvance();

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Mohit K (#5)");

    act(() => {
      endPrintAdvanceHold();
    });

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/dashboard/appointments/appt-2");
    });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("lets the doctor leave while print is parked", async () => {
    beginPrintAdvanceHold();
    sessionStorage.setItem("pf11_cancelled_appt-1", "1");
    mockUseNextAppointmentRoute.mockReturnValue({
      next: {
        appointmentId: "appt-2",
        patientId: "pat-2",
        url: "/dashboard/appointments/appt-2",
        label: "Mohit K (#5)",
        modality: "in_clinic",
        positionLabel: "#5 of 12",
      },
      isLoading: false,
      error: null,
      isLastInQueue: false,
    });

    renderAdvance();
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("status"));

    expect(push).toHaveBeenCalledWith("/dashboard/appointments/appt-2");
    expect(sessionStorage.getItem("pf11_cancelled_appt-1")).toBeNull();
  });
});
