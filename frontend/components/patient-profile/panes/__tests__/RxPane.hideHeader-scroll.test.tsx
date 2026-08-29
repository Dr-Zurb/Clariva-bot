/**
 * When the v3 shell owns the leaf chrome (`hideHeader`), RxPane must still
 * expose an h-full flex column so Plan content scrolls inside stacked leaves.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import RxPane from "../RxPane";
import type { Appointment } from "@/types/appointment";

vi.mock("@/components/consultation/cockpit/RxWorkspace", () => ({
  default: () => <div data-testid="rx-workspace" />,
}));

vi.mock("@/components/consultation/cockpit/PreviousRxPopover", () => ({
  default: () => null,
}));

vi.mock("@/lib/patient-profile/telemetry", () => ({
  trackCockpitPolishPlanPaneDedupLanded: vi.fn(),
}));

const appointment = {
  id: "appt-1",
  patient_id: "pat-1",
} as Appointment;

describe("RxPane — hideHeader scroll shell", () => {
  it("wraps the workspace in h-full min-h-0 flex-col when hideHeader", () => {
    const { container, getByTestId } = render(
      <RxPane
        appointment={appointment}
        token="t"
        state="ready"
        hideHeader
        cockpitMode
      />,
    );

    expect(getByTestId("rx-workspace")).toBeInTheDocument();
    const shell = container.firstElementChild;
    expect(shell).toHaveClass("flex");
    expect(shell).toHaveClass("h-full");
    expect(shell).toHaveClass("min-h-0");
    expect(shell).toHaveClass("flex-col");

    const scroll = shell?.firstElementChild;
    expect(scroll).toHaveClass("overflow-y-auto");
    expect(scroll).toHaveClass("touch-pan-y");
  });
});
