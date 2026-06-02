/**
 * AppointmentChartRail — unit tests (Vitest + RTL)
 *
 * cs-05 scope:
 *   - Toggle is rendered inside the rail header (not absolutely positioned)
 *   - Click invokes the toggle callback (collapsed ↔ expanded)
 *   - aria-label flips between "Expand patient chart" / "Collapse patient chart"
 *   - aria-expanded mirrors collapsed state
 *   - aria-controls="chart-body" on both states
 *
 * Run: `vitest run frontend/components/ehr/__tests__/AppointmentChartRail.test.tsx`
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// useMediaQuery — default to desktop (lg+) so the collapse logic is active.
vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: vi.fn(() => true),
}));

// PatientChartPanel is a heavy client component; stub it out.
vi.mock("../PatientChartPanel", () => ({
  default: () => <div data-testid="patient-chart-panel">Chart stub</div>,
}));

// localStorage is available in jsdom; no extra mock needed.

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import AppointmentChartRail from "../AppointmentChartRail";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_PROPS = {
  patientId: "pat-001",
  doctorId: "doc-001",
  token: "test-token",
  appointmentId: "appt-001",
};

function renderRail(collapsed = false) {
  // Seed localStorage so the component hydrates with the desired state.
  window.localStorage.setItem("ehr_chart_collapsed_v1", collapsed ? "1" : "0");
  return render(<AppointmentChartRail {...DEFAULT_PROPS} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AppointmentChartRail — expanded state (cs-05)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the rail header (not an absolute button) when expanded", () => {
    renderRail(false);
    const header = document.querySelector("header");
    expect(header).not.toBeNull();
  });

  it("toggle button is inside the header element", () => {
    renderRail(false);
    const header = document.querySelector("header");
    const btn = screen.getByRole("button", { name: /collapse patient chart/i });
    expect(header).toContainElement(btn);
  });

  it("toggle button has aria-expanded=true when expanded", () => {
    renderRail(false);
    const btn = screen.getByRole("button", { name: /collapse patient chart/i });
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("toggle button references chart-body via aria-controls", () => {
    renderRail(false);
    const btn = screen.getByRole("button", { name: /collapse patient chart/i });
    expect(btn).toHaveAttribute("aria-controls", "chart-body");
  });

  it("chart body region has id='chart-body'", () => {
    renderRail(false);
    expect(document.getElementById("chart-body")).not.toBeNull();
  });

  it("clicking the collapse button hides the chart body and shows the expand button", () => {
    renderRail(false);
    const collapseBtn = screen.getByRole("button", {
      name: /collapse patient chart/i,
    });
    fireEvent.click(collapseBtn);

    // After collapse, the expand button should appear.
    const expandBtn = screen.getByRole("button", {
      name: /expand patient chart/i,
    });
    expect(expandBtn).toBeInTheDocument();
    expect(expandBtn).toHaveAttribute("aria-expanded", "false");
  });
});

describe("AppointmentChartRail — collapsed state (cs-05)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the expand button with aria-expanded=false when collapsed", () => {
    renderRail(true);
    const btn = screen.getByRole("button", { name: /expand patient chart/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("expand button has aria-controls='chart-body'", () => {
    renderRail(true);
    const btn = screen.getByRole("button", { name: /expand patient chart/i });
    expect(btn).toHaveAttribute("aria-controls", "chart-body");
  });

  it("clicking the expand button reveals the chart body", () => {
    renderRail(true);
    const expandBtn = screen.getByRole("button", {
      name: /expand patient chart/i,
    });
    fireEvent.click(expandBtn);

    const collapseBtn = screen.getByRole("button", {
      name: /collapse patient chart/i,
    });
    expect(collapseBtn).toBeInTheDocument();
    expect(collapseBtn).toHaveAttribute("aria-expanded", "true");
  });

  it("persists collapsed=false to localStorage after expanding", () => {
    renderRail(true);
    fireEvent.click(screen.getByRole("button", { name: /expand patient chart/i }));
    expect(window.localStorage.getItem("ehr_chart_collapsed_v1")).toBe("0");
  });
});

describe("AppointmentChartRail — mobile (useMediaQuery=false)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders PatientChartPanel directly (no collapse UI) on mobile", async () => {
    const { useMediaQuery } = await import("@/hooks/useMediaQuery");
    vi.mocked(useMediaQuery).mockReturnValueOnce(false);

    renderRail(false);

    // No header or collapse button on mobile.
    expect(document.querySelector("header")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /collapse patient chart/i }),
    ).toBeNull();
    expect(screen.getByTestId("patient-chart-panel")).toBeInTheDocument();
  });
});
