import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PediatricGrowthCharts,
  shouldOfferGrowthCharts,
} from "@/components/cockpit/rx/objective/GrowthChart";
import type { VitalTrendSeries } from "@/lib/cockpit/vitals-trends";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="trend-chart">{children}</div>
    ),
  };
});

const emptySeries = (metric: VitalTrendSeries["metric"]): VitalTrendSeries => ({
  metric,
  unit: "kg",
  points: [],
});

describe("shouldOfferGrowthCharts (obj-28)", () => {
  it("is false without DOB or unsupported sex", () => {
    expect(shouldOfferGrowthCharts(null, "male")).toBe(false);
    expect(shouldOfferGrowthCharts("2024-01-01", "other")).toBe(false);
    expect(shouldOfferGrowthCharts("2024-01-01", "male")).toBe(true);
  });
});

describe("PediatricGrowthCharts (obj-28)", () => {
  it("renders weight chart with a11y description when data present", () => {
    render(
      <PediatricGrowthCharts
        dateOfBirth="2024-01-01"
        sex="male"
        series={{
          weight: {
            metric: "vitalsWtKg",
            unit: "kg",
            points: [{ value: 7.8, at: "2024-07-01T10:00:00.000Z" }],
          },
          height: emptySeries("vitalsHtCm"),
          headCircumference: emptySeries("vitalsHeadCircumferenceCm"),
        }}
      />,
    );
    expect(
      screen.getByRole("img", { name: /Weight for age growth chart by age/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/who-iap-v1/i).length).toBeGreaterThan(0);
  });

  it("shows per-metric empty state without throwing", () => {
    expect(() =>
      render(
        <PediatricGrowthCharts
          dateOfBirth="2024-01-01"
          sex="female"
          series={{
            weight: emptySeries("vitalsWtKg"),
            height: emptySeries("vitalsHtCm"),
            headCircumference: emptySeries("vitalsHeadCircumferenceCm"),
          }}
        />,
      ),
    ).not.toThrow();
    expect(screen.getAllByText(/No prior readings/i).length).toBeGreaterThan(0);
  });
});
