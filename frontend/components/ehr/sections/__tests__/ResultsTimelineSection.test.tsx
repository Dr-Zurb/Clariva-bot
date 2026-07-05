/**
 * ResultsTimelineSection — unit tests (soap-data-placement P3 · sdp-06)
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { ResultsTimelineEntry } from "@/types/patient-chart";

vi.mock("@/lib/api/patient-chart", () => ({
  getPatientResultsTimeline: vi.fn(),
}));

import { getPatientResultsTimeline } from "@/lib/api/patient-chart";
import ResultsTimelineSection, {
  formatResultDisplayLine,
} from "../ResultsTimelineSection";

const mockedFetch = vi.mocked(getPatientResultsTimeline);

const DEFAULT_PROPS = {
  patientId: "pat-001",
  token: "test-token",
  layout: "desktop" as const,
  mode: "default" as const,
};

const VISIT_NEWER: ResultsTimelineEntry = {
  prescriptionId: "rx-new",
  appointmentId: "apt-new",
  visitDate: "2026-05-01T00:00:00.000Z",
  ordered: "CBC, LFT",
  resulted: [
    {
      id: "tr-1",
      source: "in_clinic_poc",
      name: "RBS",
      value: "110",
      unit: "mg/dL",
      interpretation: "high",
    },
  ],
  mediaCount: 2,
};

const VISIT_OLDER: ResultsTimelineEntry = {
  prescriptionId: "rx-old",
  appointmentId: "apt-old",
  visitDate: "2026-04-01T00:00:00.000Z",
  ordered: "Chest X-ray",
  resulted: [],
  mediaCount: 0,
};

function mockTimeline(entries: ResultsTimelineEntry[]) {
  mockedFetch.mockResolvedValue({
    success: true,
    data: { results: entries },
  });
}

describe("ResultsTimelineSection (sdp-06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders visits in API order (date-desc)", async () => {
    mockTimeline([VISIT_NEWER, VISIT_OLDER]);
    render(<ResultsTimelineSection {...DEFAULT_PROPS} />);

    const list = await waitFor(() => screen.getByTestId("results-timeline-list"));
    const visitNodes = list.querySelectorAll("[data-testid^='results-timeline-visit-']");
    expect(visitNodes).toHaveLength(2);
    expect(visitNodes[0]).toHaveAttribute("data-testid", "results-timeline-visit-rx-new");
    expect(visitNodes[1]).toHaveAttribute("data-testid", "results-timeline-visit-rx-old");
  });

  it("renders ordered text, resulted rows, and media indicator", async () => {
    mockTimeline([VISIT_NEWER]);
    render(<ResultsTimelineSection {...DEFAULT_PROPS} />);

    await waitFor(() => expect(screen.getByText(/Ordered:/)).toBeInTheDocument());
    expect(screen.getByText(/CBC, LFT/)).toBeInTheDocument();
    expect(screen.getByText(formatResultDisplayLine(VISIT_NEWER.resulted[0]))).toBeInTheDocument();
    expect(screen.getByTestId("results-timeline-media-rx-new")).toHaveTextContent(
      "2 report scans",
    );
  });

  it("shows empty state when timeline is empty", async () => {
    mockTimeline([]);
    render(<ResultsTimelineSection {...DEFAULT_PROPS} />);

    expect(
      await screen.findByText("No investigations or results recorded."),
    ).toBeInTheDocument();
  });

  it("reports count via onCountChange", async () => {
    mockTimeline([VISIT_NEWER, VISIT_OLDER]);
    const onCountChange = vi.fn();
    render(<ResultsTimelineSection {...DEFAULT_PROPS} onCountChange={onCountChange} />);

    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(2));
  });

  it("reports zero count on load error", async () => {
    mockedFetch.mockRejectedValue(new Error("Forbidden"));
    const onCountChange = vi.fn();
    render(<ResultsTimelineSection {...DEFAULT_PROPS} onCountChange={onCountChange} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
    expect(onCountChange).toHaveBeenCalledWith(0);
  });
});

describe("formatResultDisplayLine", () => {
  it("joins name, value, unit, and interpretation", () => {
    expect(
      formatResultDisplayLine({
        id: "tr-1",
        source: "patient_report",
        name: "HbA1c",
        value: "6.2",
        unit: "%",
        interpretation: "high",
      }),
    ).toBe("HbA1c · 6.2 % · High");
  });
});

describe("sdp-07 close-gate · projection + edge states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ORDER_ONLY: ResultsTimelineEntry = {
    prescriptionId: "rx-order",
    appointmentId: "apt-order",
    visitDate: "2026-04-01T00:00:00.000Z",
    ordered: "Chest X-ray",
    resulted: [],
    mediaCount: 0,
  };

  const RESULT_ONLY: ResultsTimelineEntry = {
    prescriptionId: "rx-result",
    appointmentId: "apt-result",
    visitDate: "2026-03-01T00:00:00.000Z",
    ordered: null,
    resulted: [
      {
        id: "tr-only",
        source: "patient_report",
        name: "TSH",
        value: "2.1",
        unit: "mIU/L",
        interpretation: "normal",
      },
    ],
    mediaCount: 0,
  };

  it("renders order-only visit without resulted rows", async () => {
    mockTimeline([ORDER_ONLY]);
    render(<ResultsTimelineSection {...DEFAULT_PROPS} />);

    await waitFor(() => expect(screen.getByText(/Chest X-ray/)).toBeInTheDocument());
    expect(screen.getByText(/Ordered:/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Resulted investigations")).not.toBeInTheDocument();
  });

  it("renders result-only visit without ordered text", async () => {
    mockTimeline([RESULT_ONLY]);
    render(<ResultsTimelineSection {...DEFAULT_PROPS} />);

    await waitFor(() =>
      expect(screen.getByText(formatResultDisplayLine(RESULT_ONLY.resulted[0]))).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Ordered:/)).not.toBeInTheDocument();
  });
});

describe("sdp-07 close-gate · read-only across layouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTimeline([VISIT_NEWER]);
  });

  it.each([
    ["desktop", "default"],
    ["desktop", "readonly"],
    ["in-call", "default"],
    ["in-call", "readonly"],
    ["mobile", "default"],
    ["mobile", "readonly"],
  ] as const)("layout=%s mode=%s exposes no write affordances", async (layout, mode) => {
    render(
      <ResultsTimelineSection
        patientId="pat-001"
        token="test-token"
        layout={layout}
        mode={mode}
      />,
    );

    await waitFor(() => screen.getByTestId("results-timeline-list"));

    const timeline = screen.getByTestId("results-timeline-list");
    expect(timeline.querySelector("button")).toBeNull();
    expect(timeline.querySelector("input")).toBeNull();
    expect(timeline.querySelector("textarea")).toBeNull();
    expect(timeline.querySelector("[contenteditable='true']")).toBeNull();
  });

  it("lazy-loads on mobile when onExpand is provided", async () => {
    mockTimeline([VISIT_NEWER]);
    const onExpand = vi.fn();
    render(
      <ResultsTimelineSection
        {...DEFAULT_PROPS}
        layout="mobile"
        onExpand={onExpand}
      />,
    );

    expect(mockedFetch).not.toHaveBeenCalled();
    expect(onExpand).toHaveBeenCalledTimes(1);

    const loadFn = onExpand.mock.calls[0][0];
    await loadFn();

    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("results-timeline-list")).toBeInTheDocument();
  });
});

describe("sdp-07 close-gate · a11y", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTimeline([VISIT_NEWER, VISIT_OLDER]);
  });

  it("exposes a labelled timeline list operable by assistive tech", async () => {
    render(<ResultsTimelineSection {...DEFAULT_PROPS} />);

    const timeline = await waitFor(() =>
      screen.getByRole("list", { name: "Investigations and results timeline" }),
    );
    expect(timeline.tagName).toBe("OL");

    const visitItems = within(timeline).getAllByTestId(/^results-timeline-visit-/);
    expect(visitItems).toHaveLength(2);
    expect(visitItems[0]).toHaveAttribute("aria-labelledby", "results-timeline-date-label-rx-new");
    expect(within(visitItems[0]).getByRole("list", { name: "Resulted investigations" })).toBeInTheDocument();
  });

  it("uses generic aria labels that do not embed investigation or result values", async () => {
    render(<ResultsTimelineSection {...DEFAULT_PROPS} />);

    await waitFor(() => screen.getByTestId("results-timeline-list"));

    const labelled = Array.from(document.querySelectorAll("[aria-label]"));
    expect(labelled.length).toBeGreaterThan(0);

    for (const el of labelled) {
      const label = el.getAttribute("aria-label") ?? "";
      expect(label).not.toMatch(/CBC|LFT|RBS|Chest X-ray|110|mg\/dL/i);
      expect(label).not.toMatch(/pat-001|John/i);
    }

    expect(
      screen.getByLabelText("Investigations and results timeline"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("2 report scans attached to this visit")).toBeInTheDocument();
  });

  it("announces empty state via role=status", async () => {
    mockTimeline([]);
    render(<ResultsTimelineSection {...DEFAULT_PROPS} />);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "No investigations or results recorded.",
    );
  });
});
