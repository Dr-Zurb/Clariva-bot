import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  mergeTrendSeriesToRows,
  SingleMetricTrendChart,
  TrendChart,
} from "@/components/cockpit/rx/objective/TrendChart";
import {
  WeightBmiTrendChart,
  weightBmiTrendPreview,
} from "@/components/cockpit/rx/objective/WeightBmiTrendChart";
import type { VitalTrendPoint, VitalTrendSeries } from "@/lib/cockpit/vitals-trends";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="trend-chart">{children}</div>
    ),
  };
});

const pts = (values: number[], startDay = 1): VitalTrendPoint[] =>
  values.map((value, i) => ({
    value,
    at: `2026-06-${String(startDay + i).padStart(2, "0")}T10:00:00.000Z`,
  }));

const emptyWeight: VitalTrendSeries = { metric: "vitalsWtKg", unit: "kg", points: [] };
const emptyBmi: VitalTrendSeries = { metric: "bmi", unit: "kg/m²", points: [] };

describe("mergeTrendSeriesToRows (obj-27)", () => {
  it("merges metrics by visit timestamp and sorts oldest → newest", () => {
    const rows = mergeTrendSeriesToRows([
      { dataKey: "weight", points: pts([70, 72]) },
      { dataKey: "bmi", points: [{ value: 24.2, at: "2026-06-02T10:00:00.000Z" }] },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].weight).toBe(70);
    expect(rows[1].weight).toBe(72);
    expect(rows[1].bmi).toBe(24.2);
  });
});

describe("TrendChart shell (obj-27)", () => {
  it("renders an empty state with accessible description", () => {
    render(
      <TrendChart
        title="Heart rate"
        ariaDescription="Pulse rate trend. No prior readings."
        data={[]}
        lines={[{ dataKey: "value", name: "HR", unit: "bpm", stroke: "#3b82f6" }]}
      />,
    );
    expect(screen.getByText(/No prior readings to chart/i)).toBeInTheDocument();
    expect(screen.getByText(/Pulse rate trend\. No prior readings\./i)).toBeInTheDocument();
  });

  it("renders axes and chart for multi-point data", () => {
    render(
      <TrendChart
        title="Heart rate"
        data={mergeTrendSeriesToRows([{ dataKey: "value", points: pts([72, 74, 76]) }])}
        lines={[{ dataKey: "value", name: "HR", unit: "bpm", stroke: "#3b82f6" }]}
      />,
    );
    expect(screen.getByRole("img", { name: /Heart rate/i })).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart")).toBeInTheDocument();
  });

  it("announces single-point sparse state without implying a trend line", () => {
    render(
      <TrendChart
        title="Weight"
        data={mergeTrendSeriesToRows([{ dataKey: "weight", points: pts([70]) }])}
        lines={[{ dataKey: "weight", name: "Weight", unit: "kg", stroke: "#3b82f6" }]}
      />,
    );
    expect(screen.getByText(/Single prior reading/i)).toBeInTheDocument();
  });
});

describe("SingleMetricTrendChart (obj-27)", () => {
  it("plots one metric via the shared shell", () => {
    render(
      <SingleMetricTrendChart
        title="SpO₂"
        unit="%"
        stroke="#3b82f6"
        points={pts([98, 97])}
      />,
    );
    expect(screen.getByRole("img", { name: /SpO₂\. 2 visit readings/i })).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart")).toBeInTheDocument();
  });
});

describe("WeightBmiTrendChart (obj-27)", () => {
  it("plots weight and BMI on dual axes", () => {
    render(
      <WeightBmiTrendChart
        weightSeries={{ metric: "vitalsWtKg", unit: "kg", points: pts([68, 70, 72]) }}
        bmiSeries={{ metric: "bmi", unit: "kg/m²", points: pts([23.5, 24.2, 24.8]) }}
      />,
    );
    expect(
      screen.getByRole("img", { name: /Weight and BMI trend chart across 3 visits/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Weight & BMI over visits/i)).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart")).toBeInTheDocument();
  });

  it("shows loading state without throwing", () => {
    render(
      <WeightBmiTrendChart weightSeries={emptyWeight} bmiSeries={emptyBmi} isLoading />,
    );
    expect(screen.getByText(/Loading trend history/i)).toBeInTheDocument();
  });

  it("degrades gracefully with no history", () => {
    render(<WeightBmiTrendChart weightSeries={emptyWeight} bmiSeries={emptyBmi} />);
    expect(screen.getByText(/No prior readings to chart/i)).toBeInTheDocument();
  });
});

describe("weightBmiTrendPreview (obj-27)", () => {
  it("summarises visit count for the expand affordance", () => {
    expect(weightBmiTrendPreview(emptyWeight, emptyBmi)).toBe("No prior readings");
    expect(
      weightBmiTrendPreview(
        { ...emptyWeight, points: pts([70]) },
        { ...emptyBmi, points: pts([24]) },
      ),
    ).toBe("1 prior visit");
    expect(
      weightBmiTrendPreview(
        { ...emptyWeight, points: pts([68, 70]) },
        { ...emptyBmi, points: pts([23, 24]) },
      ),
    ).toBe("2 prior visits");
  });
});
