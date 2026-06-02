import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ChartRailWithEmptyState } from "../ChartRailWithEmptyState";

vi.mock("@/hooks/use-chart-rail-empty-signals", () => ({
  useChartRailEmptySignals: () => ({
    signals: {
      allergiesEmpty: false,
      chronicEmpty: false,
      problemListEmpty: false,
      snapshotEmpty: false,
      historyEmpty: false,
    },
    isLoading: false,
  }),
}));

vi.mock("@/lib/patient-profile/telemetry", () => ({
  trackCockpitPolishChartDensityLanded: vi.fn(),
}));

describe("ChartRailWithEmptyState · flex-chain (csl-01)", () => {
  it("children container is a flex column so vertical ResizablePanelGroup can size", () => {
    const { container } = render(
      <ChartRailWithEmptyState
        appointmentId="apt_1"
        patientId="pt_1"
        token="tok"
      >
        <div data-testid="subtree">stub</div>
      </ChartRailWithEmptyState>,
    );

    const childrenWrap = container.querySelector('[data-testid="subtree"]')!
      .parentElement!;
    expect(childrenWrap.className).toMatch(/\bflex\b/);
    expect(childrenWrap.className).toMatch(/\bflex-col\b/);
    expect(childrenWrap.className).toMatch(/\bflex-1\b/);
    expect(childrenWrap.className).toMatch(/\bmin-h-0\b/);
  });
});
