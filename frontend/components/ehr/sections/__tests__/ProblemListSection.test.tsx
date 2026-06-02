/**
 * ProblemListSection — unit tests (Vitest + RTL) — cpv-07 problem-list wrapping
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { ProblemListItem } from "@/types/patient-chart";

vi.mock("@/lib/api/patient-chart", () => ({
  listPatientProblems: vi.fn(),
}));

import { listPatientProblems } from "@/lib/api/patient-chart";
import ProblemListSection from "../ProblemListSection";

const mockedList = vi.mocked(listPatientProblems);

const DEFAULT_PROPS = {
  patientId: "pat-001",
  token: "test-token",
  layout: "desktop" as const,
  mode: "read" as const,
};

function renderProblemList(problems: ProblemListItem[]) {
  mockedList.mockResolvedValue({
    success: true,
    data: { problems },
  });
  return render(<ProblemListSection {...DEFAULT_PROPS} />);
}

describe("Problem list wrapping (cpv-07 C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies break-words to each row", async () => {
    const longProblem =
      "Pyelonephritis with bilateral hydronephrosis pending urology follow-up scheduled for next week.";
    renderProblemList([
      {
        source: "chronic",
        label: longProblem,
        since_date: null,
        episode_status: null,
        followups_used: null,
        max_followups: null,
        occurrence_count: null,
      },
    ]);

    const li = await waitFor(() => screen.getByText(longProblem));
    expect(li.className).toMatch(/break-words/);
  });

  it("ul has overflow-x-hidden", async () => {
    renderProblemList([
      {
        source: "chronic",
        label: "Hypertension",
        since_date: null,
        episode_status: null,
        followups_used: null,
        max_followups: null,
        occurrence_count: null,
      },
    ]);
    const list = await waitFor(() => screen.getByRole("list"));
    expect(list.className).toMatch(/overflow-x-hidden/);
  });
});
