export const VISIT_DOCUMENT_TYPES = [
  "lab_report",
  "imaging",
  "discharge_summary",
  "old_prescription",
  "referral_letter",
  "other",
] as const;

export type VisitDocumentType = (typeof VISIT_DOCUMENT_TYPES)[number];

export const VISIT_DOCUMENT_ORDERED_BY = ["us", "outside"] as const;
export type VisitDocumentOrderedBy = (typeof VISIT_DOCUMENT_ORDERED_BY)[number];

export type VisitDocumentSource = "front_desk" | "patient";

export type VisitDocumentPage = {
  id: string;
  document_id: string;
  file_type: string;
  page_index: number;
  created_at: string;
};

/** Staff-confirmed lab panel persisted on the visit document (migration 236). */
export type VisitExtractedLabPanel = {
  pageId: string;
  report: {
    id: string;
    kind: "lab";
    title: string;
    reportDate: string | null;
    labName: string | null;
    attachmentIds: string[];
    findings: string | null;
    entryMethod: "extracted";
  };
  rows: Array<{
    id: string;
    source: "patient_report";
    name: string;
    value: string | null;
    unit: string | null;
    date: string | null;
    interpretation: string | null;
    notes: string | null;
    reportId: string | null;
    refLow: number | null;
    refHigh: number | null;
    refText: string | null;
    method: string | null;
  }>;
  confirmed_at: string;
  confirmed_by: string;
};

export type VisitDocument = {
  id: string;
  doctor_id: string;
  patient_id: string;
  appointment_id: string;
  document_type: VisitDocumentType;
  report_date: string | null;
  ordered_by: VisitDocumentOrderedBy;
  source: VisitDocumentSource;
  actor_id: string;
  created_at: string;
  updated_at: string;
  pages: VisitDocumentPage[];
  extracted_results?: VisitExtractedLabPanel[];
};

export type ExtractVisitPageLabRow = {
  rawName: string;
  rawValue: string | null;
  rawUnit: string | null;
  rawRange: string | null;
  rawMethod: string | null;
  pageIndex: number;
  lineText: string;
};

export type ExtractVisitPageLabResult = {
  pageId: string;
  rows: ExtractVisitPageLabRow[];
  pageCount: number;
  skippedPageIndexes: number[];
  source: "pdf_text" | "vision";
};

export const VISIT_DOCUMENT_TYPE_LABEL: Record<VisitDocumentType, string> = {
  lab_report: "Lab report",
  imaging: "Imaging",
  discharge_summary: "Discharge summary",
  old_prescription: "Old prescription",
  referral_letter: "Referral letter",
  other: "Other",
};

export const VISIT_DOCUMENT_MAX_PAGES = 24;
export const VISIT_DOCUMENT_MAX_FILE_MB = 10;
export const VISIT_DOCUMENT_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export function isExtractableVisitPage(page: Pick<VisitDocumentPage, "file_type">): boolean {
  const mime = (page.file_type ?? "").toLowerCase();
  return mime === "application/pdf" || mime === "application/x-pdf" || mime.startsWith("image/");
}
