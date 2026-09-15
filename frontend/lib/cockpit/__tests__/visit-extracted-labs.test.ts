import { describe, expect, it } from "vitest";
import {
  visitExtractedPanelsToHydrate,
  visitPageExtracted,
} from "@/lib/cockpit/visit-extracted-labs";
import type { LabReport } from "@/types/prescription";
import type { VisitDocument, VisitExtractedLabPanel } from "@/types/visit-documents";

const PAGE_ID = "00000000-0000-0000-0000-0000000000aa";
const REPORT_ID = "00000000-0000-0000-0000-0000000000bb";

const panel: VisitExtractedLabPanel = {
  pageId: PAGE_ID,
  report: {
    id: REPORT_ID,
    kind: "lab",
    title: "Page 1",
    reportDate: "2026-09-13",
    labName: null,
    attachmentIds: [PAGE_ID],
    findings: null,
    entryMethod: "extracted",
  },
  rows: [
    {
      id: "00000000-0000-0000-0000-0000000000cc",
      source: "patient_report",
      name: "Haemoglobin",
      value: "11.8",
      unit: "g/dL",
      date: "2026-09-13",
      interpretation: null,
      notes: null,
      reportId: REPORT_ID,
      refLow: 12,
      refHigh: 15,
      refText: null,
      method: null,
    },
  ],
  confirmed_at: "2026-09-13T02:00:00.000Z",
  confirmed_by: "staff-1",
};

const document: VisitDocument = {
  id: "doc-1",
  doctor_id: "doc",
  patient_id: "pat",
  appointment_id: "apt",
  document_type: "lab_report",
  report_date: "2026-09-13",
  ordered_by: "outside",
  source: "front_desk",
  actor_id: "staff-1",
  created_at: "2026-09-13T01:00:00.000Z",
  updated_at: "2026-09-13T01:00:00.000Z",
  pages: [
    {
      id: PAGE_ID,
      document_id: "doc-1",
      file_type: "image/jpeg",
      page_index: 0,
      created_at: "2026-09-13T01:00:00.000Z",
    },
  ],
  extracted_results: [panel],
};

function report(overrides: Partial<LabReport> = {}): LabReport {
  return {
    id: "other",
    kind: "lab",
    title: "Manual",
    reportDate: null,
    labName: null,
    attachmentIds: [],
    findings: null,
    entryMethod: "manual",
    ...overrides,
  };
}

describe("visitExtractedPanelsToHydrate", () => {
  it("returns desk-confirmed panels that are not on the form", () => {
    expect(visitExtractedPanelsToHydrate([document], [])).toEqual([panel]);
  });

  it("skips a panel whose report id is already on the form", () => {
    expect(visitExtractedPanelsToHydrate([document], [report({ id: REPORT_ID })])).toEqual([]);
  });

  it("skips a panel whose page id is already an attachment", () => {
    expect(
      visitExtractedPanelsToHydrate([document], [report({ attachmentIds: [PAGE_ID] })])
    ).toEqual([]);
  });
});

describe("visitPageExtracted", () => {
  it("is true when the page has a confirmed panel", () => {
    expect(visitPageExtracted(document, PAGE_ID)).toBe(true);
    expect(visitPageExtracted(document, "missing")).toBe(false);
  });
});
