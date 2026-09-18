/**
 * Per-doctor chief-complaint habit (name + stable pack).
 * Aggregated from attested prescriptions.complaints — no patient fields.
 */

export interface DoctorComplaintCombo {
  complaintName: string;
  nameKey: string;
  category: string | null;
  severityBand: string | null;
  laterality: string | null;
  character: string | null;
  associatedNames: string[];
  useCount: number;
  lastUsedAt: string;
}
