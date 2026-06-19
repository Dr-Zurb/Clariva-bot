/**
 * Complaint master frontend types (subjective-tab · subj-06).
 */

export type ComplaintMasterCategory = "pain" | "fever" | "cough" | "default";

export interface ComplaintMasterRow {
  id: string;
  name: string;
  synonyms: string[];
  category: ComplaintMasterCategory;
  created_at: string;
  updated_at: string;
}
