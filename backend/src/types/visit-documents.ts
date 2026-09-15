/**
 * Appointment-scoped clinical documents captured at the front desk (dvp P1).
 * PHI: the files. API responses omit file_path.
 */

export const VISIT_DOCUMENT_TYPES = [
  'lab_report',
  'imaging',
  'discharge_summary',
  'old_prescription',
  'referral_letter',
  'other',
] as const;

export type VisitDocumentType = (typeof VISIT_DOCUMENT_TYPES)[number];

export const VISIT_DOCUMENT_ORDERED_BY = ['us', 'outside'] as const;
export type VisitDocumentOrderedBy = (typeof VISIT_DOCUMENT_ORDERED_BY)[number];

export const VISIT_DOCUMENT_SOURCES = ['front_desk', 'patient'] as const;
export type VisitDocumentSource = (typeof VISIT_DOCUMENT_SOURCES)[number];

export interface VisitDocumentPage {
  id: string;
  document_id: string;
  file_type: string;
  page_index: number;
  created_at: string;
}

/** One staff-confirmed lab panel, keyed by the visit page it was read from. */
export interface VisitExtractedLabPanel {
  pageId: string;
  report: {
    id: string;
    kind: 'lab';
    title: string;
    reportDate: string | null;
    labName: string | null;
    attachmentIds: string[];
    findings: string | null;
    entryMethod: 'extracted';
  };
  rows: Array<{
    id: string;
    source: 'patient_report';
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
}

export interface VisitDocument {
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
  extracted_results: VisitExtractedLabPanel[];
}

export interface VisitExtractedLabPanelInput {
  pageId: string;
  report: VisitExtractedLabPanel['report'];
  rows: VisitExtractedLabPanel['rows'];
}

export interface CreateVisitDocumentInput {
  documentType: VisitDocumentType;
  reportDate?: string | null;
  orderedBy?: VisitDocumentOrderedBy;
  filePath: string;
  fileType: string;
}

export interface AddVisitDocumentPageInput {
  filePath: string;
  fileType: string;
}

export interface UpdateVisitDocumentInput {
  documentType?: VisitDocumentType;
  reportDate?: string | null;
  orderedBy?: VisitDocumentOrderedBy;
}
