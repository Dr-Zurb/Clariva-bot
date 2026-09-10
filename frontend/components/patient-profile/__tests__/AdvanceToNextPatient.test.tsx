import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { AdvanceToNextPatient } from "@/components/patient-profile/AdvanceToNextPatient";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mockUseNextAppointmentRoute = vi.fn();

vi.mock("@/hooks/useNextAppointmentRoute", () => ({
  useNextAppointmentRoute: (opts: unknown) => mockUseNextAppointmentRoute(opts),
}));

describe("AdvanceToNextPatient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("navigates to the next patient as soon as the pipeline resolves", async () => {
    mockUseNextAppointmentRoute.mockReturnValue({
      next: {
        appointmentId: "appt-2",
        url: "/dashboard/appointments/appt-2",
        label: "Mohit K (#5)",
        modality: "in_clinic",
        positionLabel: "#5 of 12",
      },
      isLoading: false,
      error: null,
      isLastInQueue: false,
    });

    render(<AdvanceToNextPatient currentAppointmentId="appt-1" token="t" />);

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
        url: "/dashboard/appointments/appt-2",
        label: "Mohit K (#5)",
        modality: "in_clinic",
        positionLabel: "#5 of 12",
      },
      isLoading: false,
      error: null,
      isLastInQueue: false,
    });

    render(<AdvanceToNextPatient currentAppointmentId="appt-1" token="t" />);
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
        url: "/dashboard/appointments/appt-2",
        label: "Mohit K (#5)",
        modality: "in_clinic",
        positionLabel: "#5 of 12",
      },
      isLoading: false,
      error: null,
      isLastInQueue: false,
    });

    const { rerender } = render(
      <AdvanceToNextPatient currentAppointmentId="appt-1" token="t" />
    );
    rerender(<AdvanceToNextPatient currentAppointmentId="appt-1" token="t" />);

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

    render(<AdvanceToNextPatient currentAppointmentId="appt-1" token="t" />);

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

    render(<AdvanceToNextPatient currentAppointmentId="appt-1" token="t" />);

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

    render(<AdvanceToNextPatient currentAppointmentId="appt-1" token="t" />);

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

    render(<AdvanceToNextPatient currentAppointmentId="appt-1" token="t" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "No more patients in the queue"
    );

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
