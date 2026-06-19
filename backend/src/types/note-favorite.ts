/**
 * Doctor note favorites types (subjective-tab · subj-06).
 */

export const NOTE_FAVORITE_FIELD_KEYS = [
  'complaint_name',
  'family_history',
  'social_history',
  'past_surgical_history',
  'complaint_associated',
] as const;

export type NoteFavoriteFieldKey = (typeof NOTE_FAVORITE_FIELD_KEYS)[number];

export interface DoctorNoteFavoriteRow {
  id: string;
  doctor_id: string;
  field_key: NoteFavoriteFieldKey;
  value: string;
  use_count: number;
  last_used_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateDoctorNoteFavoriteInput {
  fieldKey: NoteFavoriteFieldKey;
  value: string;
}

export interface RecordDoctorNoteFavoriteUseInput {
  fieldKey: NoteFavoriteFieldKey;
  value: string;
}
