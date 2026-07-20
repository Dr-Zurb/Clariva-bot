/**
 * BookingFunnel — insights-v1 · ins-03.
 *
 * Covers: stage counts + conversion %, loading/empty states, review SLA.
 */

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { BookingFunnelOverview } from "@/lib/api";
import {
  BookingFunnel,
  buildFunnelStages,
  formatConversion,
} from "../BookingFunnel";
import {
  InsightsRangeProvider,
  insightsRangeFromDays,
} from "../InsightsRangeControl";

const useBookingFunnelQueryMock = vi.fn();

vi.mock("@/hooks/queries/useBookingFunnelQuery", () => ({
  useBookingFunnelQuery: (...args: unknown[]) =>
    useBookingFunnelQueryMock(...args),
}));

const SAMPLE: BookingFunnelOverview = {
  range: { from: "2026-06-21", to: "2026-07-20" },
  funnel: {
    slotsSelected: 20,
    slotsConsumed: 16,
    paymentsCaptured: 12,
    appointmentsConfirmed: 10,
  },
  review: {
    pending: 3,
    medianResolutionSeconds: 900,
    breachedSla: 2,
  },
};

function renderFunnel(
  queryState: {
    data?: BookingFunnelOverview;
    isLoading?: boolean;
    isFetching?: boolean;
  } = {},
) {
  useBookingFunnelQueryMock.mockReturnValue({
    data: queryState.data,
    isLoading: queryState.isLoading ?? false,
    isFetching: queryState.isFetching ?? false,
    isError: false,
    error: null,
  });

  return render(
    <InsightsRangeProvider initialDays={30}>
      <BookingFunnel token="test-token" />
    </InsightsRangeProvider>,
  );
}

describe("buildFunnelStages / formatConversion", () => {
  it("computes step-to-step conversion rates", () => {
    const stages = buildFunnelStages(SAMPLE.funnel);
    expect(stages).toHaveLength(4);
    expect(stages[0]!.conversionFromPrev).toBeNull();
    expect(stages[1]!.conversionFromPrev).toBeCloseTo(0.8, 5); // 16/20
    expect(stages[2]!.conversionFromPrev).toBeCloseTo(0.75, 5); // 12/16
    expect(stages[3]!.conversionFromPrev).toBeCloseTo(10 / 12, 5);
  });

  it("formats conversion percentages", () => {
    expect(formatConversion(0.8)).toBe("80%");
    expect(formatConversion(null)).toBe("—");
  });

  it("guards divide-by-zero on empty previous stage", () => {
    const stages = buildFunnelStages({
      slotsSelected: 0,
      slotsConsumed: 0,
      paymentsCaptured: 0,
      appointmentsConfirmed: 0,
    });
    expect(stages[1]!.conversionFromPrev).toBeNull();
  });
});

describe("BookingFunnel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders stage counts and conversion percentages", () => {
    renderFunnel({ data: SAMPLE });

    const list = screen.getByLabelText("Booking funnel stages");
    expect(within(list).getByText("Slots selected")).toBeInTheDocument();
    expect(within(list).getByText("20")).toBeInTheDocument();
    expect(within(list).getByText("Slots consumed")).toBeInTheDocument();
    expect(within(list).getByText("16")).toBeInTheDocument();
    expect(within(list).getByText("← 80%")).toBeInTheDocument();
    expect(within(list).getByText("Payments captured")).toBeInTheDocument();
    expect(within(list).getByText("12")).toBeInTheDocument();
    expect(within(list).getByText("← 75%")).toBeInTheDocument();

    const sla = screen.getByLabelText("Booking review SLA");
    expect(within(sla).getByText("Pending")).toBeInTheDocument();
    expect(within(sla).getByText("3")).toBeInTheDocument();
    expect(within(sla).getByText("SLA breached")).toBeInTheDocument();
    expect(within(sla).getByText("2")).toBeInTheDocument();
    expect(within(sla).getByText("15:00")).toBeInTheDocument(); // 900s
  });

  it("shows loading skeletons before data arrives", () => {
    const { container } = renderFunnel({ isLoading: true });
    expect(
      container.querySelectorAll('[class*="animate-pulse"]').length,
    ).toBeGreaterThan(0);
  });

  it("shows empty state when all funnel stages are zero", () => {
    renderFunnel({
      data: {
        ...SAMPLE,
        funnel: {
          slotsSelected: 0,
          slotsConsumed: 0,
          paymentsCaptured: 0,
          appointmentsConfirmed: 0,
        },
        review: { pending: 0, medianResolutionSeconds: 0, breachedSla: 0 },
      },
    });

    expect(screen.getByTestId("funnel-empty-state")).toHaveTextContent(
      "No booking activity in the last 30 days",
    );
  });

  it("passes the shared range into the query hook", () => {
    renderFunnel({ data: SAMPLE });
    const expected = insightsRangeFromDays(30);
    expect(useBookingFunnelQueryMock).toHaveBeenCalledWith("test-token", {
      from: expected.from,
      to: expected.to,
    });
  });
});
