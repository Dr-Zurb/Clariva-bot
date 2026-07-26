/**
 * Consult surface host — portal retarget must preserve React state so a live
 * consult (Twilio Room inside BodyZone) survives Consult pane moves.
 */

import React, { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  ConsultSurfaceHost,
  ConsultSurfaceProvider,
  ConsultSurfaceSlot,
} from "@/components/patient-profile/ConsultSurfaceContext";

afterEach(() => {
  cleanup();
});

function StatefulConsultProbe() {
  const [count, setCount] = useState(0);
  return (
    <div data-testid="consult-probe">
      <span data-testid="consult-probe-count">{count}</span>
      <button
        type="button"
        data-testid="consult-probe-inc"
        onClick={() => setCount((n) => n + 1)}
      >
        inc
      </button>
    </div>
  );
}

describe("ConsultSurfaceContext", () => {
  it("portals host children into the active slot", () => {
    render(
      <ConsultSurfaceProvider>
        <div data-testid="slot-wrap">
          <ConsultSurfaceSlot />
        </div>
        <ConsultSurfaceHost>
          <StatefulConsultProbe />
        </ConsultSurfaceHost>
      </ConsultSurfaceProvider>,
    );

    const slot = screen.getByTestId("consult-surface-slot");
    expect(slot.querySelector('[data-testid="consult-probe"]')).toBeTruthy();
    expect(screen.getByTestId("consult-probe-count")).toHaveTextContent("0");
  });

  it("preserves host state when the slot unmounts and remounts (pane move)", () => {
    function Harness() {
      const [showSlot, setShowSlot] = useState(true);
      return (
        <ConsultSurfaceProvider>
          <button
            type="button"
            data-testid="toggle-slot"
            onClick={() => setShowSlot((v) => !v)}
          >
            toggle
          </button>
          {showSlot ? (
            <div data-testid="slot-a">
              <ConsultSurfaceSlot />
            </div>
          ) : (
            <div data-testid="slot-b">
              <ConsultSurfaceSlot />
            </div>
          )}
          <ConsultSurfaceHost>
            <StatefulConsultProbe />
          </ConsultSurfaceHost>
        </ConsultSurfaceProvider>
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByTestId("consult-probe-inc"));
    fireEvent.click(screen.getByTestId("consult-probe-inc"));
    expect(screen.getByTestId("consult-probe-count")).toHaveTextContent("2");

    // Simulate a layout move: old slot goes away, new slot appears. The host
    // briefly parks in the fallback, then portals into the new slot — React
    // identity of StatefulConsultProbe must survive.
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-slot"));
    });

    expect(screen.getByTestId("slot-b")).toBeInTheDocument();
    expect(screen.getByTestId("consult-probe-count")).toHaveTextContent("2");
    expect(
      screen
        .getByTestId("consult-surface-slot")
        .querySelector('[data-testid="consult-probe"]'),
    ).toBeTruthy();
  });

  it("keeps the host mounted (parked) when no slot is present", () => {
    render(
      <ConsultSurfaceProvider>
        <ConsultSurfaceHost>
          <StatefulConsultProbe />
        </ConsultSurfaceHost>
      </ConsultSurfaceProvider>,
    );

    fireEvent.click(screen.getByTestId("consult-probe-inc"));
    expect(screen.getByTestId("consult-probe-count")).toHaveTextContent("1");
    expect(screen.getByTestId("consult-surface-fallback")).toBeInTheDocument();
    expect(
      screen
        .getByTestId("consult-surface-fallback")
        .querySelector('[data-testid="consult-probe"]'),
    ).toBeTruthy();
  });
});
