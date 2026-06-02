-- EHR Sub-batch D / T5.24
-- Link prescriptions to care episodes directly so episode-scoped reads
-- can query prescriptions without joining through appointments.

ALTER TABLE prescriptions
  ADD COLUMN episode_id UUID NULL REFERENCES care_episodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prescriptions_episode
  ON prescriptions (episode_id, created_at DESC) WHERE episode_id IS NOT NULL;

-- Backfill existing prescriptions from their parent appointments in the
-- same migration so reads can switch over immediately after deploy.
UPDATE prescriptions p
SET    episode_id = a.episode_id
FROM   appointments a
WHERE  p.appointment_id = a.id
  AND  p.episode_id IS NULL
  AND  a.episode_id IS NOT NULL;
