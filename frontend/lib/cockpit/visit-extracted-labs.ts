/**
 * Decide which desk-confirmed lab panels should appear in Objective Reports.
 * Pure. Does not write the form.
 */

import type { LabReport, TestResultRow } from "@/types/prescription";
import type { VisitDocument, VisitExtractedLabPanel } from "@/types/visit-documents";

export function visitExtractedPanelToForm(panel: VisitExtractedLabPanel): {
  report: LabReport;
  rows: TestResultRow[];
} {
  return {
    report: {
      id: panel.report.id,
      kind: "lab",
      title: panel.report.title,
      reportDate: panel.report.reportDate,
      labName: panel.report.labName,
      attachmentIds: panel.report.attachmentIds,
      findings: panel.report.findings,
      entryMethod: "extracted",
    },
    rows: panel.rows.map((row) => ({
      id: row.id,
      source: "patient_report",
      name: row.name,
      value: row.value,
      unit: row.unit,
      date: row.date,
      interpretation: null,
      notes: row.notes,
      reportId: row.reportId,
      refLow: row.refLow,
      refHigh: row.refHigh,
      refText: row.refText,
      method: row.method,
    })),
  };
}

export function visitExtractedPanelsToHydrate(
  documents: readonly VisitDocument[],
  labReports: readonly LabReport[]
): VisitExtractedLabPanel[] {
  const reportIds = new Set(labReports.map((report) => report.id));
  const attachmentIds = new Set(labReports.flatMap((report) => report.attachmentIds));
  const out: VisitExtractedLabPanel[] = [];

  for (const doc of documents) {
    for (const panel of doc.extracted_results ?? []) {
      if (reportIds.has(panel.report.id)) continue;
      if (attachmentIds.has(panel.pageId)) continue;
      if (panel.report.attachmentIds.some((id) => attachmentIds.has(id))) continue;
      out.push(panel);
    }
  }
  return out;
}

export function visitPageExtracted(document: VisitDocument, pageId: string): boolean {
  return (document.extracted_results ?? []).some((panel) => panel.pageId === pageId);
}
