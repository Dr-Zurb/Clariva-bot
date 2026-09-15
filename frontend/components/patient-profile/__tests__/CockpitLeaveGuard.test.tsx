/**
 * CockpitLeaveGuard — every in-app leave is resume-later (no Stay / preview).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

import { CockpitLeaveGuard } from "@/components/patient-profile/CockpitLeaveGuard";
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not intercept when inactive", () => {
    render(
      <>
        <a href="/dashboard/opd-today">Back to OPD</a>
        <CockpitLeaveGuard appointmentId="appt-1" active={false} />
      </>
    );

    fireEvent.click(screen.getByRole("link", { name: "Back to OPD" }));

    expect(push).not.toHaveBeenCalled();
    expect(isConsultSteppedAway("appt-1")).toBe(false);
  });

  it("same-origin click leaves immediately as resume later", async () => {
    render(
      <>
        <a href="/dashboard/opd-today">Back to OPD</a>
        <CockpitLeaveGuard appointmentId="appt-1" active />
      </>
    );

    fireEvent.click(screen.getByRole("link", { name: "Back to OPD" }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/dashboard/opd-today");
    });
    expect(isConsultSteppedAway("appt-1")).toBe(true);
    expect(screen.queryByText("Leave this consult?")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /leave — resume later/i })
    ).not.toBeInTheDocument();
  });

  it("flushes the draft before navigating", async () => {
    let resolveFlush: (() => void) | undefined;
    const beforeLeave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFlush = resolve;
        })
    );

    render(
      <>
        <a href="/dashboard/opd-today">Back to OPD</a>
        <CockpitLeaveGuard
          appointmentId="appt-1"
          active
          beforeLeave={beforeLeave}
        />
      </>
    );

    fireEvent.click(screen.getByRole("link", { name: "Back to OPD" }));

    await waitFor(() => {
      expect(beforeLeave).toHaveBeenCalledTimes(1);
    });
    expect(push).not.toHaveBeenCalled();
    expect(isConsultSteppedAway("appt-1")).toBe(false);

    resolveFlush?.();

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/dashboard/opd-today");
    });
    expect(isConsultSteppedAway("appt-1")).toBe(true);
  });

  it("still leaves when the draft flush rejects", async () => {
    const beforeLeave = vi.fn(() => Promise.reject(new Error("save failed")));

    render(
      <>
        <a href="/dashboard/appointments/appt-2?from=opd-today">Next patient</a>
        <CockpitLeaveGuard
          appointmentId="appt-1"
          active
          beforeLeave={beforeLeave}
        />
      </>
    );

    fireEvent.click(screen.getByRole("link", { name: "Next patient" }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(
        "/dashboard/appointments/appt-2?from=opd-today"
      );
    });
    expect(isConsultSteppedAway("appt-1")).toBe(true);
  });

  it("browser Back leaves immediately as resume later", async () => {
    const back = vi.spyOn(window.history, "back");

    render(<CockpitLeaveGuard appointmentId="appt-1" active />);

    fireEvent.popState(window);

    await waitFor(() => {
      expect(back).toHaveBeenCalled();
    });
    expect(isConsultSteppedAway("appt-1")).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("marks Incomplete on tab close", () => {
    render(<CockpitLeaveGuard appointmentId="appt-1" active />);

    window.dispatchEvent(new Event("beforeunload"));

    expect(isConsultSteppedAway("appt-1")).toBe(true);
  });

  it("href leave strips the dummy guard with replaceState, not go(-1)", async () => {
    const go = vi.spyOn(window.history, "go");

    render(
      <>
        <a href="/dashboard/opd-today">Back to OPD</a>
        <CockpitLeaveGuard appointmentId="appt-1" active />
      </>
    );
    expect(isGuardState(window.history.state)).toBe(true);

    fireEvent.click(screen.getByRole("link", { name: "Back to OPD" }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/dashboard/opd-today");
    });
    expect(go).not.toHaveBeenCalled();
  });

  it("leaves even if draft flush hangs", async () => {
    vi.useFakeTimers();
    const beforeLeave = vi.fn(() => new Promise<void>(() => {}));

    render(
      <>
        <a href="/dashboard/appointments/appt-2">Next patient</a>
        <CockpitLeaveGuard
          appointmentId="appt-1"
          active
          beforeLeave={beforeLeave}
        />
      </>
    );

    fireEvent.click(screen.getByRole("link", { name: "Next patient" }));
    expect(push).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1500);

    expect(push).toHaveBeenCalledWith("/dashboard/appointments/appt-2");
    expect(isConsultSteppedAway("appt-1")).toBe(true);
    vi.useRealTimers();
  });

  it("clears the guard with replaceState, not go(-1), when the visit ends", () => {
    const go = vi.spyOn(window.history, "go");
    const { rerender } = render(
      <CockpitLeaveGuard appointmentId="appt-1" active />
    );
    expect(isGuardState(window.history.state)).toBe(true);

    rerender(<CockpitLeaveGuard appointmentId="appt-1" active={false} />);

    expect(go).not.toHaveBeenCalled();
    expect(isGuardState(window.history.state)).toBe(false);
  });
});

function isGuardState(state: unknown): boolean {
  return typeof state === "object" && state !== null && "__cockpitLeave" in state;
}
