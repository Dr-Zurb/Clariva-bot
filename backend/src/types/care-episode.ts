/**
 * Care episode types (SFU-02)
 *
 * Represents patient + doctor + catalog_service_key course of care with locked
 * pricing snapshot and follow-up counters. Rows are created/updated by SFU-04
 * services when the index visit completes.
 */

/** care_episodes.status CHECK */
export type CareEpisodeStatus = 'active' | 'exhausted' | 'expired' | 'closed';

/** Database row for care_episodes (migration 036) */
export interface CareEpisodeRow {
  id: string;
  doctor_id: string;
  patient_id: string;
  catalog_service_key: string;
  /** SFU-11: matches `service_id` in service_offerings_json; preferred for quote/episode match */
  catalog_service_id?: string | null;
  status: CareEpisodeStatus;
  started_at: string;
  eligibility_ends_at: string | null;
  followups_used: number;
  max_followups: number;
  /** Locked per-modality fee snapshot (JSON); shape enforced in SFU-04 */
  price_snapshot_json: Record<string, unknown>;
  index_appointment_id: string | null;
  created_at: string;
  updated_at: string;
}
