/**
 * Unit tests for the per-card vital trend trigger (vitals-section · trend redesign).
 */

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { VitalTrendButton } from "@/components/cockpit/rx/objective/VitalTrendButton";
import {
  indexVitalsTrendSeries,
  type VitalTrendMetricKey,
  type VitalTrendSeries,
} from "@/lib/cockpit/vitals-trends";

function seriesFor(
  metric: VitalTrendMetricKey,
  unit: string,
  values: number[],
): VitalTrendSeries {
  return {
    metric,
    unit,
    points: values.map((value, i) => ({
      at: `2026-0${i + 1}-01T00:00:00.000Z`,
      value,
    })),
  };
}

function byMetricWith(...series: VitalTrendSeries[]) {
  return indexVitalsTrendSeries(series);
}

describe("VitalTrendButton", () => {
  it("renders nothing when the metric has no prior readings", () => {
    const byMetric = byMetricWith(seriesFor("vitalsHr", "bpm", []));
    const { container } = render(
      <VitalTrendButton metric="vitalsHr" byMetric={byMetric} label="Pulse Rate (PR)" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while loading", () => {
    const byMetric = byMetricWith(seriesFor("vitalsHr", "bpm", [70, 80]));
    const { container } = render(
      <VitalTrendButton metric="vitalsHr" byMetric={byMetric} label="Pulse Rate (PR)" isLoading />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("opens a metric-aware popover chart and a full-history dialog", async () => {
    const byMetric = byMetricWith(seriesFor("vitalsHr", "bpm", [70, 80]));
    render(
      <VitalTrendButton metric="vitalsHr" byMetric={byMetric} label="Pulse Rate (PR)" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Pulse Rate \(PR\) trend/i }));
    expect(
      await screen.findByRole("img", { name: /Pulse Rate \(PR\) trend across 2 visits\./i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("vital-trend-expand-vitalsHr"));
    expect(await screen.findByTestId("vital-trend-dialog-vitalsHr")).toBeInTheDocument();
    expect(screen.getByTestId("vital-trend-value-table")).toBeInTheDocument();
  });

  it("opens a custom vital trend from a direct series", async () => {
    render(
      <VitalTrendButton
        customSeries={{
          id: "custom_girth",
          label: "Abdominal girth",
          unit: "cm",
          group: "metabolic",
          points: [
            { at: "2026-06-01T10:00:00.000Z", value: 90 },
            { at: "2026-06-05T10:00:00.000Z", value: 92 },
          ],
        }}
        label="Abdominal girth"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Abdominal girth trend/i }));
    expect(
      await screen.findByRole("img", { name: /Abdominal girth trend across 2 visits\./i }),
    ).toBeInTheDocument();
  });

  it("plots systolic, diastolic, and MAP together on the blood-pressure button", async () => {
    const byMetric = byMetricWith(
      seriesFor("vitalsBpSystolic", "mmHg", [120, 130]),
      seriesFor("vitalsBpDiastolic", "mmHg", [80, 85]),
      seriesFor("map", "mmHg", [93, 100]),
    );
    render(
      <VitalTrendButton
        metric="vitalsBpSystolic"
        byMetric={byMetric}
        label="Blood pressure"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Blood pressure trend/i }));
    fireEvent.click(await screen.findByTestId("vital-trend-expand-vitalsBpSystolic"));

    const table = await screen.findByTestId("vital-trend-value-table");
    expect(within(table).getByText("Systolic")).toBeInTheDocument();
    expect(within(table).getByText("Diastolic")).toBeInTheDocument();
    expect(within(table).getByText("MAP")).toBeInTheDocument();
  });
});
