-- ============================================================================
-- Care episodes + appointment linkage (SFU-02)
-- ============================================================================
-- Migration: 036_care_episodes.sql
-- Date: 2026-03-29
-- Description:
--   care_episodes: patient + doctor + catalog_service_key course of care with
--   locked price snapshot, follow-up counters, eligibility window.
--   appointments: nullable episode_id + catalog_service_key for visit matching.
--   index_appointment_id is added after episode_id on appointments (FK cycle).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. care_episodes (without index_appointment_id — added in step 3)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_episodes (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_id              UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    catalog_service_key     TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'active' CHECK (
                              status IN ('active', 'exhausted', 'expired', 'closed')
                            ),
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    eligibility_ends_at     TIMESTAMPTZ NULL,
    followups_used          INTEGER NOT NULL DEFAULT 0 CHECK (followups_used >= 0),
    max_followups           INTEGER NOT NULL CHECK (max_followups >= 0),
    price_snapshot_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE care_episodes IS
  'SFU: Course of care per patient+doctor+service_key; locked fee snapshot at index completion; lifecycle in SFU-04.';
COMMENT ON COLUMN care_episodes.catalog_service_key IS
  'Slug matching doctor_settings.service_offerings_json service_key.';
COMMENT ON COLUMN care_episodes.status IS
  'active | exhausted | expired | closed';
COMMENT ON COLUMN care_episodes.followups_used IS
  'Count of follow-up visits consumed under this episode.';
COMMENT ON COLUMN care_episodes.max_followups IS
  'Copy of policy max_followups at episode creation.';
COMMENT ON COLUMN care_episodes.price_snapshot_json IS
  'Per-modality prices (minor units) locked when index visit completes; see SFU-04.';
COMMENT ON COLUMN care_episodes.eligibility_ends_at IS
  'End of follow-up eligibility window; NULL if not set from policy.';

CREATE INDEX IF NOT EXISTS idx_care_episodes_patient_id ON care_episodes(patient_id);

CREATE INDEX IF NOT EXISTS idx_care_episodes_active_lookup
    ON care_episodes(doctor_id, patient_id, catalog_service_key)
    WHERE status = 'active';

CREATE TRIGGER update_care_episodes_updated_at
    BEFORE UPDATE ON care_episodes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. appointments — link to episode + service key
-- ----------------------------------------------------------------------------
ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS episode_id UUID NULL REFERENCES care_episodes(id) ON DELETE SET NULL;

ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS catalog_service_key TEXT NULL;

COMMENT ON COLUMN appointments.episode_id IS
  'SFU-02: care episode this visit belongs to; SET NULL if episode deleted.';
COMMENT ON COLUMN appointments.catalog_service_key IS
  'SFU-02: catalog service_key for completed-visit / pricing matching.';

CREATE INDEX IF NOT EXISTS idx_appointments_episode_id ON appointments(episode_id);

-- ----------------------------------------------------------------------------
-- 3. Index appointment (one episode → one index visit); after episode_id exists
-- ----------------------------------------------------------------------------
ALTER TABLE care_episodes
    ADD COLUMN IF NOT EXISTS index_appointment_id UUID NULL
    REFERENCES appointments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_care_episodes_index_appointment_id_unique
    ON care_episodes(index_appointment_id)
    WHERE index_appointment_id IS NOT NULL;

COMMENT ON COLUMN care_episodes.index_appointment_id IS
  'Appointment that opened this episode (index / initial paid visit); UNIQUE when set.';

-- ----------------------------------------------------------------------------
-- 4. RLS (mirror appointments / prescriptions: doctor owns via doctor_id)
-- ----------------------------------------------------------------------------
ALTER TABLE care_episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own care episodes"
ON care_episodes FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can insert own care episodes"
ON care_episodes FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can update own care episodes"
ON care_episodes FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can delete own care episodes"
ON care_episodes FOR DELETE
USING (auth.uid() = doctor_id);

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Workers/Cron: use service_role (bypasses RLS). Dashboard: JWT policies above.
-- ============================================================================
