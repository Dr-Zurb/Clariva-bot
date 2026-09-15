/**
 * Shared types for patients list filtering (pr-02). Mirrors frontend/types/patient.ts.
 */

export type PatientSegmentId =
  | 'active-90d'
  | 'new-30d'
  | 'revisit-30d'
  | 'at-risk-followup'
  | 'no-show-prone'
  | 'has-allergies'
  | 'has-open-episodes'
  | 'incomplete-consult'
  | 'untagged';

export type PatientListSortId =
  | 'last-visit-desc'
  | 'last-visit-asc'
  | 'created-at-desc'
  | 'created-at-asc'
  | 'name-asc';

export interface PatientListFilters {
  q?: string;
  /** Desk identity — AND-ed with each other. Do not overload `q`. */
  name?: string;
  guardianName?: string;
  age?: number;
  gender?: string;
  segment?: PatientSegmentId;
  /** Case-insensitive membership on patients.patient_tags (ANY). */
  tag?: string;
  sort?: PatientListSortId;
  page?: number;
  pageSize?: number;
  /** Desk search only. Default false — archived rows stay hidden. */
  includeArchived?: boolean;
  /** Skip allergies / episodes / overdue-Rx enrichment. Desk search only. */
  lean?: boolean;
}
