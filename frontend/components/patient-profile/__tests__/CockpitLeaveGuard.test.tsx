/**
 * CockpitLeaveGuard — intercept leave; Stay / resume later / continue after finish.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

import {
  CockpitLeaveGuard,
  type CockpitLeaveExit,
} from "@/components/patient-profile/CockpitLeaveGuard";
import {
  clearConsultSteppedAway,
  isConsultSteppedAway,
} from "@/lib/cockpit/consult-stepped-away";

describe("CockpitLeaveGuard", () => {
  beforeEach(() => {
    push.mockReset();
    clearConsultSteppedAway("appt-1");
    window.history.replaceState(
      null,
      "",
      "/dashboard/appointments/appt-1?from=opd-today"
    );
  });

  afterEach(() => {
    clearConsultSteppedAway("appt-1");
    vi.restoreAllMocks();
  });

  it("does not intercept when inactive", () => {
    const onLeaveIntent = vi.fn();
    render(
      <CockpitLeaveGuard
        appointmentId="appt-1"
        active={false}
        onLeaveIntent={onLeaveIntent}
      />
    );
    expect(onLeaveIntent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        stay: expect.any(Function),
      })
    );
  });

  it("holds a same-origin click and notifies the shell", async () => {
    const onLeaveIntent = vi.fn();
    render(
      <>
        <a href="/dashboard/opd-today">Back to OPD</a>
        <CockpitLeaveGuard
          appointmentId="appt-1"
          active
          onLeaveIntent={onLeaveIntent}
        />
      </>
    );

    fireEvent.click(screen.getByRole("link", { name: "Back to OPD" }));

    await waitFor(() => {
      expect(onLeaveIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          stay: expect.any(Function),
          resumeLater: expect.any(Function),
          continueAfterFinish: expect.any(Function),
        })
      );
    });
    expect(screen.queryByText("Leave this consult?")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("Stay clears the intent without navigating", async () => {
    let exit: CockpitLeaveExit | null = null;
    render(
      <>
        <a href="/dashboard/opd-today">Back to OPD</a>
        <CockpitLeaveGuard
          appointmentId="appt-1"
          active
          onLeaveIntent={(next) => {
            exit = next;
          }}
        />
      </>
    );

    fireEvent.click(screen.getByRole("link", { name: "Back to OPD" }));
    await waitFor(() => {
      expect(exit).not.toBeNull();
    });
    exit!.stay();

    await waitFor(() => {
      expect(exit).toBeNull();
    });
    expect(push).not.toHaveBeenCalled();
    expect(isConsultSteppedAway("appt-1")).toBe(false);
  });

  it("Leave — resume later marks incomplete and navigates without finishing", async () => {
    let exit: CockpitLeaveExit | null = null;
    render(
      <>
        <a href="/dashboard/opd-today">Back to OPD</a>
        <CockpitLeaveGuard
          appointmentId="appt-1"
          active
          onLeaveIntent={(next) => {
            exit = next;
          }}
        />
      </>
    );

    fireEvent.click(screen.getByRole("link", { name: "Back to OPD" }));
    await waitFor(() => {
      expect(exit).not.toBeNull();
    });
    exit!.resumeLater();

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/dashboard/opd-today");
    });
    expect(isConsultSteppedAway("appt-1")).toBe(true);
  });

  it("continueAfterFinish navigates and clears stepped-away", async () => {
    let exit: CockpitLeaveExit | null = null;
    render(
      <>
        <a href="/dashboard/appointments/appt-2?from=opd-today">Next patient</a>
        <CockpitLeaveGuard
          appointmentId="appt-1"
          active
          onLeaveIntent={(next) => {
            exit = next;
          }}
        />
      </>
    );

    fireEvent.click(screen.getByRole("link", { name: "Next patient" }));
    await waitFor(() => {
      expect(exit).not.toBeNull();
    });
    exit!.continueAfterFinish();

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(
        "/dashboard/appointments/appt-2?from=opd-today"
      );
    });
    expect(isConsultSteppedAway("appt-1")).toBe(false);
  });
});
