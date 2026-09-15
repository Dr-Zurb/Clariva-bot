import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeskExtractedResultsTable } from "@/components/desk/DeskExtractedResultsTable";
import type { VisitExtractedLabPanel } from "@/types/visit-documents";

const PANEL: VisitExtractedLabPanel = {
  pageId: "page-1",
  report: {
    id: "report-1",
    kind: "lab",
    title: "Page 1",
    reportDate: "2026-09-13",
    labName: null,
    attachmentIds: ["page-1"],
    findings: null,
    entryMethod: "extracted",
  },
  rows: [
    {
      id: "row-hb",
      source: "patient_report",
      name: "Haemoglobin",
      value: "11.8",
      unit: "g/dL",
      date: "2026-09-13",
      interpretation: null,
      notes: null,
      reportId: "report-1",
      refLow: 12,
      refHigh: 15,
      refText: null,
      method: null,
    },
  ],
  confirmed_at: "2026-09-13T02:00:00.000Z",
  confirmed_by: "staff-1",
};

describe("DeskExtractedResultsTable", () => {
  it("renders cockpit columns for confirmed extract rows", () => {
    render(<DeskExtractedResultsTable panels={[PANEL]} />);
    const table = screen.getByTestId("desk-extracted-results");
    expect(table).toHaveTextContent("Haemoglobin");
    expect(table).toHaveTextContent("11.8");
    expect(table).toHaveTextContent("g/dL");
    expect(table).toHaveTextContent("12–15");
    expect(screen.getByRole("columnheader", { name: "Test" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Value" })).toBeInTheDocument();
  });

  it("renders nothing when there are no panels", () => {
    const { container } = render(<DeskExtractedResultsTable panels={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
