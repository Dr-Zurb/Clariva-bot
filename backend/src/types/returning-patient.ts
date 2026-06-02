/**
 * rcp-20: PHI-safe returning-patient profile types (DL-6 / DL-12).
 * Enums, booleans, opaque keys, and timestamps only — no names, phones, emails, or free text.
 */

import type { PatientCollectionField } from '../utils/validation';

export type ReturningRecencyBucket =
  | 'within_1_month'
  | 'within_3_months'
  | 'within_1_year'
  | 'over_1_year';

/** PHI-safe: no names, phones, emails, or free-text reasons. Enums/booleans/opaque keys/timestamps only (DL-6). */
export interface ReturningPatientProfile {
  isReturning: boolean;
  hasGrantedConsent: boolean;
  consentStatus: 'pending' | 'granted' | 'revoked';
  hasName: boolean;
  hasPhone: boolean;
  knownFieldKeys: PatientCollectionField[];
  priorVisits: {
    attendedCount: number;
    lastVisitAt?: string;
    lastServiceKey?: string;
    lastModality?: 'video' | 'in_clinic' | 'text' | 'voice';
    recencyBucket?: ReturningRecencyBucket;
  };
}
