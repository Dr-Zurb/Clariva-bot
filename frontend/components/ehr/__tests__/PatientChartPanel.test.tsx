/**
 * PatientChartPanel — investigations & results mount (soap-data-placement P3 · sdp-06)
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", () => ({
  listPatientAllergies: vi.fn().mockResolvedValue({ success: true, data: { allergies: [] } }),
  listPatientChronicConditions: vi
    .fn()
    .mockResolvedValue({ success: true, data: { conditions: [] } }),
  listRecentPrescriptionsByPatient: vi
    .fn()
    .mockResolvedValue({ success: true, data: { prescriptions: [] } }),
}));

vi.mock("@/lib/api/patient-chart", () => ({
  listPatientProblems: vi.fn().mockResolvedValue({ success: true, data: { problems: [] } }),
  listPatientVitals: vi.fn().mockResolvedValue({ success: true, data: { vitals: [] } }),
  getPatientResultsTimeline: vi.fn().mockResolvedValue({
    success: true,
    data: {
      results: [
        {
          prescriptionId: "rx-1",
          appointmentId: "apt-1",
          visitDate: "2026-05-01T00:00:00.000Z",
          ordered: "CBC",
          resulted: [],
          mediaCount: 0,
        },
      ],
    },
  }),
}));

import PatientChartPanel from "../PatientChartPanel";

const DEFAULT_PROPS = {
  patientId: "pat-001",
  token: "test-token",
  layout: "desktop" as const,
};

describe("PatientChartPanel — Investigations & Results (sdp-06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mounts the read-only section after Vitals and before Previous Rx", async () => {
    render(<PatientChartPanel {...DEFAULT_PROPS} />);

    await waitFor(() => document.getElementById("chart-section-vitals"));

    const vitals = document.getElementById("chart-section-vitals");
    const results = document.getElementById("chart-section-results-timeline");
    const previousRx = document.getElementById("chart-section-previous-rx");

    expect(vitals).not.toBeNull();
    expect(results).not.toBeNull();
    expect(previousRx).not.toBeNull();

    const panel = screen.getByTestId("patient-chart-panel");
    const sectionIds = Array.from(panel.querySelectorAll("section[id]")).map((el) => el.id);
    const vitalsIndex = sectionIds.indexOf("chart-section-vitals");
    const resultsIndex = sectionIds.indexOf("chart-section-results-timeline");
    const previousRxIndex = sectionIds.indexOf("chart-section-previous-rx");

    expect(vitalsIndex).toBeGreaterThan(-1);
    expect(resultsIndex).toBeGreaterThan(vitalsIndex);
    expect(previousRxIndex).toBeGreaterThan(resultsIndex);
  });

  it("shows the count badge and no add button for Investigations & Results", async () => {
    render(<PatientChartPanel {...DEFAULT_PROPS} mode="readonly" />);

    const section = await waitFor(() =>
      document.getElementById("chart-section-results-timeline"),
    );
    expect(section).not.toBeNull();
    expect(section).toHaveTextContent("Investigations & Results");
    expect(section).toHaveTextContent("1");

    const addButtons = Array.from(section?.querySelectorAll("button") ?? []).filter((btn) =>
      btn.textContent?.includes("+ Add"),
    );
    expect(addButtons).toHaveLength(0);
  });
});

describe("PatientChartPanel — sdp-07 close-gate · read-only across layouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["desktop", "default"],
    ["desktop", "readonly"],
    ["in-call", "default"],
    ["in-call", "readonly"],
    ["mobile", "default"],
    ["mobile", "readonly"],
  ] as const)("layout=%s mode=%s keeps Investigations & Results read-only", async (layout, mode) => {
    render(
      <PatientChartPanel
        patientId="pat-001"
        token="test-token"
        layout={layout}
        mode={mode}
      />,
    );

    const section = await waitFor(() =>
      document.getElementById("chart-section-results-timeline"),
    );
    expect(section).not.toBeNull();
    expect(section).toHaveTextContent("Investigations & Results");

    const addButtons = Array.from(section?.querySelectorAll("button") ?? []).filter((btn) =>
      btn.textContent?.includes("+ Add"),
    );
    expect(addButtons).toHaveLength(0);
  });
});
