/**
 * TelehealthQuality — insights-v1 · ins-05.
 *
 * Covers: modality bars, join/switches, quality summary, empty/loading.
 */

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { TelehealthQualityOverview } from "@/lib/api";
import { TelehealthQuality } from "../TelehealthQuality";
import {
  InsightsRangeProvider,
  insightsRangeFromDays,
} from "../InsightsRangeControl";

const useTelehealthQualityQueryMock = vi.fn();

vi.mock("@/hooks/queries/useTelehealthQualityQuery", () => ({
  useTelehealthQualityQuery: (...args: unknown[]) =>
    useTelehealthQualityQueryMock(...args),
}));

const SAMPLE: TelehealthQualityOverview = {
  range: { from: "2026-06-21", to: "2026-07-20" },
  modalityMix: { text: 1, voice: 2, video: 5 },
  switches: { upgrades: 3, downgrades: 1 },
  joinSuccessRate: 0.8,
  quality: {
    video: { p50Rtt: 40, p95Rtt: 90, avgPacketLoss: 1.25 },
    voice: { p50Rtt: 30, p95Rtt: 55, avgPacketLoss: 0.5 },
  },
};

function renderWidget(
  queryState: {
    data?: TelehealthQualityOverview;
    isLoading?: boolean;
    isFetching?: boolean;
  } = {},
) {
  useTelehealthQualityQueryMock.mockReturnValue({
    data: queryState.data,
    isLoading: queryState.isLoading ?? false,
    isFetching: queryState.isFetching ?? false,
    isError: false,
    error: null,
  });

  return render(
    <InsightsRangeProvider initialDays={30}>
      <TelehealthQuality token="test-token" />
    </InsightsRangeProvider>,
  );
}

describe("TelehealthQuality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders modality mix, join success, switches, and quality", () => {
    renderWidget({ data: SAMPLE });

    const mix = screen.getByLabelText("Telehealth modality mix");
    expect(within(mix).getByText("Video")).toBeInTheDocument();
    expect(within(mix).getByText("5")).toBeInTheDocument();
    expect(within(mix).getByText("Voice")).toBeInTheDocument();
    expect(within(mix).getByText("2")).toBeInTheDocument();

    const join = screen.getByLabelText("Join success and switches");
    expect(within(join).getByText("80%")).toBeInTheDocument();
    expect(within(join).getByText("3")).toBeInTheDocument();
    expect(within(join).getByText("1")).toBeInTheDocument();

    const video = screen.getByLabelText("Video");
    expect(within(video).getByText("40 ms")).toBeInTheDocument();
    expect(within(video).getByText("90 ms")).toBeInTheDocument();
    expect(within(video).getByText("1.25%")).toBeInTheDocument();

    const voice = screen.getByLabelText("Voice");
    expect(within(voice).getByText("30 ms")).toBeInTheDocument();
  });

  it("shows loading skeletons before data arrives", () => {
    const { container } = renderWidget({ isLoading: true });
    expect(
      container.querySelectorAll('[class*="animate-pulse"]').length,
    ).toBeGreaterThan(0);
  });

  it("shows empty state when there are no telehealth sessions", () => {
    renderWidget({
      data: {
        ...SAMPLE,
        modalityMix: { text: 0, voice: 0, video: 0 },
        switches: { upgrades: 0, downgrades: 0 },
        joinSuccessRate: 0,
        quality: {
          video: { p50Rtt: null, p95Rtt: null, avgPacketLoss: null },
          voice: { p50Rtt: null, p95Rtt: null, avgPacketLoss: null },
        },
      },
    });

    expect(screen.getByTestId("telehealth-empty-state")).toHaveTextContent(
      "No telehealth sessions in range",
    );
  });

  it("passes the shared range into the query hook", () => {
    renderWidget({ data: SAMPLE });
    const expected = insightsRangeFromDays(30);
    expect(useTelehealthQualityQueryMock).toHaveBeenCalledWith("test-token", {
      from: expected.from,
      to: expected.to,
    });
  });

  it("does not render patient identifiers or session ids", () => {
    renderWidget({ data: SAMPLE });
    expect(screen.queryByText(/patient/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+\d{10,}/)).not.toBeInTheDocument();
    expect(screen.queryByText(/session/i)).not.toBeInTheDocument();
  });
});
