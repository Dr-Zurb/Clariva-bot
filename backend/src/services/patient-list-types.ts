/**
 * Shared types for patients list filtering (pr-02). Mirrors frontend/types/patient.ts.
 */

export type PatientSegmentId =
  | 'active-90d'
  | 'new-30d'
  | 'at-risk-followup'
  | 'no-show-prone'
  | 'has-allergies'
  | 'has-open-episodes'
  | 'untagged';

export type PatientListSortId =
  | 'last-visit-desc'
  | 'last-visit-asc'
  | 'created-at-desc'
  | 'created-at-asc'
  | 'name-asc';

export interface PatientListFilters {
  q?: string;
  segment?: PatientSegmentId;
  sort?: PatientListSortId;
  page?: number;
  pageSize?: number;
}
