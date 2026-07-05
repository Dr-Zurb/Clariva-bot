/**
 * Unit tests for the consolidated All trends dialog (vitals-section · trend redesign).
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AllVitalTrendsDialog } from "@/components/cockpit/rx/objective/AllVitalTrendsDialog";
import { buildCategoricalVitalTimelines } from "@/lib/cockpit/categorical-vitals-timeline";
import {
  buildVitalsTrendSeries,
  indexVitalsTrendSeries,
} from "@/lib/cockpit/vitals-trends";
import type { PrescriptionWithRelations } from "@/types/prescription";

// Growth section fetches the patient — stub it to a no-op so the dialog stays self-contained.
vi.mock("@/components/cockpit/rx/objective/PediatricGrowthChartsSection", () => ({
  PediatricGrowthChartsSection: () => null,
}));

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="trend-chart-host">{children}</div>
    ),
  };
});

function rx(created_at: string, vitals: Partial<PrescriptionWithRelations>): PrescriptionWithRelations {
  return {
    id: `rx-${created_at}`,
    appointment_id: "appt-1",
    patient_id: "patient-1",
    doctor_id: "doctor-1",
    type: "standard",
    created_at,
    updated_at: created_at,
    ...vitals,
  } as PrescriptionWithRelations;
}

const richHistory = [
  rx("2026-06-01T10:00:00.000Z", {
    vitals_hr: 70,
    vitals_wt_kg: 60,
    vitals_json: { vitalsPulseRhythm: "regular" },
  }),
  rx("2026-06-05T10:00:00.000Z", {
    vitals_hr: 74,
    vitals_wt_kg: 61,
    vitals_json: { vitalsPulseRhythm: "irregular" },
  }),
];

function renderDialog(prescriptions: PrescriptionWithRelations[]) {
  const series = buildVitalsTrendSeries(prescriptions);
  return render(
    <AllVitalTrendsDialog
      byMetric={indexVitalsTrendSeries(series)}
      categoricalTimelines={buildCategoricalVitalTimelines(prescriptions)}
      token="tok"
      patientId="patient-1"
    />,
  );
}

describe("AllVitalTrendsDialog", () => {
  it("renders no trigger when no vital has prior history", () => {
    const { container } = renderDialog([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a history count on the trigger and opens grouped trends on click", async () => {
    renderDialog(richHistory);

    const trigger = screen.getByTestId("all-vital-trends-trigger");
    expect(trigger).toHaveTextContent(/All trends/i);
    fireEvent.click(trigger);

    expect(await screen.findByTestId("all-vital-trends-dialog")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: /Pulse Rate \(PR\) trend across 2 visits/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("region", { name: /Core vital trends/i })).toBeInTheDocument();
    expect(
      screen.getByRole("figure", { name: /Pulse Rhythm value timeline across 2 visits/i }),
    ).toBeInTheDocument();
  });

  it("surfaces the combined weight/BMI chart when weight history exists", async () => {
    renderDialog(richHistory);
    fireEvent.click(screen.getByTestId("all-vital-trends-trigger"));
    expect(
      await screen.findByRole("img", { name: /Weight and BMI trend chart across 2 visits/i }),
    ).toBeInTheDocument();
  });
});
