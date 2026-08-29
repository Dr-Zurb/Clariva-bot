/**
 * PracticeHealthOverview — insights-v1 · ins-02.
 *
 * Covers: tiles render mocked query data, range toggle refetches with new
 * params, loading skeletons, and the empty-state copy.
 */

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PracticeHealthOverview as PracticeHealthData } from "@/lib/api";
import {
  formatDurationSeconds,
  formatRatePercent,
  formatRevenueMinor,
  PracticeHealthOverview,
} from "../PracticeHealthOverview";

const usePracticeHealthQueryMock = vi.fn();
const useBookingFunnelQueryMock = vi.fn();
const useClinicalMixQueryMock = vi.fn();
const useTelehealthQualityQueryMock = vi.fn();

vi.mock("@/hooks/queries/usePracticeHealthQuery", () => ({
  usePracticeHealthQuery: (...args: unknown[]) =>
    usePracticeHealthQueryMock(...args),
}));

vi.mock("@/hooks/queries/useBookingFunnelQuery", () => ({
  useBookingFunnelQuery: (...args: unknown[]) =>
    useBookingFunnelQueryMock(...args),
}));

vi.mock("@/hooks/queries/useClinicalMixQuery", () => ({
  useClinicalMixQuery: (...args: unknown[]) =>
    useClinicalMixQueryMock(...args),
}));

vi.mock("@/hooks/queries/useTelehealthQualityQuery", () => ({
  useTelehealthQualityQuery: (...args: unknown[]) =>
    useTelehealthQualityQueryMock(...args),
}));

// Recharts needs a measurable container in jsdom.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 400, height: 200 }}>
        {children}
      </div>
    ),
  };
});

const SAMPLE: PracticeHealthData = {
  range: { from: "2026-06-21", to: "2026-07-20" },
  volume: {
    total: 10,
    byStatus: { completed: 7, confirmed: 2, no_show: 1 },
    byModality: { video: 5, in_clinic: 3, voice: 2 },
  },
  noShowRate: 0.1,
  revenueCapturedMinor: 125000,
  currency: "INR",
  consult: { completionRate: 0.8, medianDurationSeconds: 750 },
};

function renderOverview(
  queryState: {
    data?: PracticeHealthData;
    isLoading?: boolean;
    isFetching?: boolean;
  } = {},
) {
  usePracticeHealthQueryMock.mockReturnValue({
    data: queryState.data,
    isLoading: queryState.isLoading ?? false,
    isFetching: queryState.isFetching ?? false,
    isError: false,
    error: null,
  });
  useBookingFunnelQueryMock.mockReturnValue({
    data: {
      range: { from: "2026-06-21", to: "2026-07-20" },
      funnel: {
        slotsSelected: 0,
        slotsConsumed: 0,
        paymentsCaptured: 0,
        appointmentsConfirmed: 0,
      },
      review: { pending: 0, medianResolutionSeconds: 0, breachedSla: 0 },
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
  });
  useClinicalMixQueryMock.mockReturnValue({
    data: {
      range: { from: "2026-06-21", to: "2026-07-20" },
      topDiagnoses: [],
      topMedicines: [],
      topInvestigations: [],
      diagnosesSource: "none",
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
  });
  useTelehealthQualityQueryMock.mockReturnValue({
    data: {
      range: { from: "2026-06-21", to: "2026-07-20" },
      modalityMix: { text: 0, voice: 0, video: 0 },
      switches: { upgrades: 0, downgrades: 0 },
      joinSuccessRate: 0,
      quality: {
        video: { p50Rtt: null, p95Rtt: null, avgPacketLoss: null },
        voice: { p50Rtt: null, p95Rtt: null, avgPacketLoss: null },
      },
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
  });

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <PracticeHealthOverview token="test-token" />
    </QueryClientProvider>,
  );
}

describe("format helpers", () => {
  it("formats revenue from minor units", () => {
    expect(formatRevenueMinor(125000, "INR")).toMatch(/1,?250/);
  });

  it("formats rate as percent", () => {
    expect(formatRatePercent(0.125)).toBe("12.5%");
    expect(formatRatePercent(0)).toBe("0%");
  });

  it("formats duration as m:ss and returns null for empty", () => {
    expect(formatDurationSeconds(750)).toBe("12:30");
    expect(formatDurationSeconds(0)).toBeNull();
  });
});

describe("PracticeHealthOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Tier-1 tiles from mocked query data", () => {
    renderOverview({ data: SAMPLE });

    const region = screen.getByLabelText("Practice health summary");
    expect(within(region).getByText("Consults completed")).toBeInTheDocument();
    expect(within(region).getByText("7")).toBeInTheDocument();
    expect(within(region).getByText("No-show rate")).toBeInTheDocument();
    expect(within(region).getByText("10%")).toBeInTheDocument();
    expect(within(region).getByText("Revenue captured")).toBeInTheDocument();
    expect(within(region).getByText(/1,?250/)).toBeInTheDocument();
    expect(
      within(region).getByText("Median consult duration"),
    ).toBeInTheDocument();
    expect(within(region).getByText("12:30")).toBeInTheDocument();
  });

  it("shows loading skeletons before data arrives", () => {
    const { container } = renderOverview({ isLoading: true });
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText("Consults completed")).toBeInTheDocument();
  });

  it("shows empty state when volume is zero", () => {
    renderOverview({
      data: {
        ...SAMPLE,
        volume: { total: 0, byStatus: {}, byModality: {} },
        noShowRate: 0,
        revenueCapturedMinor: 0,
        consult: { completionRate: 0, medianDurationSeconds: 0 },
      },
    });

    expect(screen.getByTestId("insights-empty-state")).toHaveTextContent(
      "No activity in the last 30 days",
    );
  });

  it("refetches with a new range when the control is toggled", () => {
    renderOverview({ data: SAMPLE });

    // Initial mount uses the default 30-day window.
    expect(usePracticeHealthQueryMock).toHaveBeenCalled();
    const firstCall = usePracticeHealthQueryMock.mock.calls.at(-1)!;
    expect(firstCall[0]).toBe("test-token");
    const firstRange = firstCall[1] as { from: string; to: string };
    expect(firstRange.from).toBeTruthy();
    expect(firstRange.to).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "7d" }));

    const lastCall = usePracticeHealthQueryMock.mock.calls.at(-1)!;
    const nextRange = lastCall[1] as { from: string; to: string };
    // 7-day window is shorter than the default 30-day window.
    const firstSpan =
      Date.parse(`${firstRange.to}T00:00:00`) -
      Date.parse(`${firstRange.from}T00:00:00`);
    const nextSpan =
      Date.parse(`${nextRange.to}T00:00:00`) -
      Date.parse(`${nextRange.from}T00:00:00`);
    expect(nextSpan).toBeLessThan(firstSpan);
    expect(Math.round(nextSpan / 86_400_000)).toBe(6); // inclusive 7 days → 6-day delta
  });

  it("does not render patient identifiers", () => {
    renderOverview({ data: SAMPLE });
    expect(screen.queryByText(/patient/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+\d{10,}/)).not.toBeInTheDocument();
  });
});
