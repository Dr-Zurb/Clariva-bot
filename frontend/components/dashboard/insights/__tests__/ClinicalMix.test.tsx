/**
 * ClinicalMix — insights-v1 · ins-04.
 *
 * Covers: three ranked lists, loading/empty states, no PHI leakage.
 */

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ClinicalMixOverview } from "@/lib/api";
import { ClinicalMix } from "../ClinicalMix";
import {
  InsightsRangeProvider,
  insightsRangeFromDays,
} from "../InsightsRangeControl";

const useClinicalMixQueryMock = vi.fn();

vi.mock("@/hooks/queries/useClinicalMixQuery", () => ({
  useClinicalMixQuery: (...args: unknown[]) =>
    useClinicalMixQueryMock(...args),
}));

const SAMPLE: ClinicalMixOverview = {
  range: { from: "2026-06-21", to: "2026-07-20" },
  topDiagnoses: [
    { label: "Hypertension", count: 4, code: "BA00" },
    { label: "Type 2 diabetes", count: 2, code: "5A11" },
  ],
  topMedicines: [
    { label: "Metformin", count: 5 },
    { label: "Amlodipine", count: 3 },
  ],
  topInvestigations: [
    { label: "HbA1c", count: 4 },
    { label: "ECG", count: 2 },
  ],
  diagnosesSource: "diagnoses_json",
};

function renderMix(
  queryState: {
    data?: ClinicalMixOverview;
    isLoading?: boolean;
    isFetching?: boolean;
  } = {},
) {
  useClinicalMixQueryMock.mockReturnValue({
    data: queryState.data,
    isLoading: queryState.isLoading ?? false,
    isFetching: queryState.isFetching ?? false,
    isError: false,
    error: null,
  });

  return render(
    <InsightsRangeProvider initialDays={30}>
      <ClinicalMix token="test-token" />
    </InsightsRangeProvider>,
  );
}

describe("ClinicalMix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders three ranked lists with counts and optional ICD codes", () => {
    renderMix({ data: SAMPLE });

    const dx = screen.getByLabelText("Top diagnoses");
    expect(within(dx).getByText("Hypertension")).toBeInTheDocument();
    expect(within(dx).getByText("(BA00)")).toBeInTheDocument();
    expect(within(dx).getByText("4")).toBeInTheDocument();

    const meds = screen.getByLabelText("Top medicines");
    expect(within(meds).getByText("Metformin")).toBeInTheDocument();
    expect(within(meds).getByText("5")).toBeInTheDocument();

    const inv = screen.getByLabelText("Top investigations");
    expect(within(inv).getByText("HbA1c")).toBeInTheDocument();
    expect(within(inv).getByText("4")).toBeInTheDocument();
  });

  it("shows loading skeletons before data arrives", () => {
    const { container } = renderMix({ isLoading: true });
    expect(
      container.querySelectorAll('[class*="animate-pulse"]').length,
    ).toBeGreaterThan(0);
  });

  it("shows empty state when all lists are empty", () => {
    renderMix({
      data: {
        ...SAMPLE,
        topDiagnoses: [],
        topMedicines: [],
        topInvestigations: [],
        diagnosesSource: "none",
      },
    });

    expect(screen.getByTestId("clinical-mix-empty-state")).toHaveTextContent(
      "No clinical activity in the last 30 days",
    );
  });

  it("passes the shared range into the query hook", () => {
    renderMix({ data: SAMPLE });
    const expected = insightsRangeFromDays(30);
    expect(useClinicalMixQueryMock).toHaveBeenCalledWith("test-token", {
      from: expected.from,
      to: expected.to,
    });
  });

  it("does not render patient identifiers or free-text notes", () => {
    renderMix({ data: SAMPLE });
    expect(screen.queryByText(/patient/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+\d{10,}/)).not.toBeInTheDocument();
    expect(screen.queryByText(/note/i)).not.toBeInTheDocument();
  });
});
