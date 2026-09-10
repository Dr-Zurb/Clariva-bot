-- ============================================================================
-- 207_merge_patients_function.sql
-- ============================================================================
-- Date: 2026-08-23
-- Batch: receptionist-portal (merge completeness)
-- Status: PARKED — not wired. mergePatients still moves appointments +
--   conversations in Node. Apply this only when merge is the work.
-- Description:
--   Atomic doctor-scoped patient merge. The Node merge used to re-point
--   appointments and conversations only, then anonymize the source — leaving
--   prescriptions, chart rows, and notes on a [Merged] row.
--
--   One plpgsql function so every move + tag union + anonymize commits
--   together (same pattern as assign_patient_mrn in 046).
--
--   Collision tables (PRIMARY KEY doctor_id+patient_id, or patient_id):
--     notes → concat_ws both sides, then drop source
--     video_otp_window → keep the newer last_otp_verified_at
--
--   Left on source on purpose: video_replay_otp_attempts (OTP audit trail).
--
-- Hard-rules:
--   - Additive function only. No column / RLS change.
--   - Service-role execute only. SECURITY DEFINER + pinned search_path.
--
-- Rollback (document only):
--   DROP FUNCTION IF EXISTS merge_patients_into(UUID, UUID, UUID);
-- ============================================================================

CREATE OR REPLACE FUNCTION merge_patients_into(
  p_doctor_id UUID,
  p_source_patient_id UUID,
  p_target_patient_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_tags TEXT[];
  v_target_tags TEXT[];
  v_merged_tags TEXT[];
  v_src_otp RECORD;
  v_tgt_otp RECORD;
BEGIN
  IF p_source_patient_id = p_target_patient_id THEN
    RAISE EXCEPTION 'source and target patient must be different'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM patients WHERE id = p_source_patient_id) THEN
    RAISE EXCEPTION 'source patient not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM patients WHERE id = p_target_patient_id) THEN
    RAISE EXCEPTION 'target patient not found' USING ERRCODE = 'P0002';
  END IF;

  -- Stable lock order so two concurrent merges cannot deadlock.
  PERFORM 1
  FROM patients
  WHERE id IN (p_source_patient_id, p_target_patient_id)
  ORDER BY id
  FOR UPDATE;

  -- Tag union: target first, then source; case-insensitive dedupe; cap 8.
  SELECT
    CASE
      WHEN patient_tags IS NOT NULL AND cardinality(patient_tags) > 0 THEN patient_tags
      WHEN patient_tag IS NOT NULL AND btrim(patient_tag) <> '' THEN ARRAY[btrim(patient_tag)]
      ELSE ARRAY[]::TEXT[]
    END
  INTO v_source_tags
  FROM patients
  WHERE id = p_source_patient_id;

  SELECT
    CASE
      WHEN patient_tags IS NOT NULL AND cardinality(patient_tags) > 0 THEN patient_tags
      WHEN patient_tag IS NOT NULL AND btrim(patient_tag) <> '' THEN ARRAY[btrim(patient_tag)]
      ELSE ARRAY[]::TEXT[]
    END
  INTO v_target_tags
  FROM patients
  WHERE id = p_target_patient_id;

  SELECT COALESCE(array_agg(label ORDER BY ord), ARRAY[]::TEXT[])
  INTO v_merged_tags
  FROM (
    SELECT label, ord
    FROM (
      SELECT DISTINCT ON (lower(label)) label, ord
      FROM (
        SELECT left(btrim(t), 64) AS label, u.ord
        FROM unnest(COALESCE(v_target_tags, ARRAY[]::TEXT[]) || COALESCE(v_source_tags, ARRAY[]::TEXT[]))
          WITH ORDINALITY AS u(t, ord)
        WHERE length(btrim(t)) > 0
      ) raw
      ORDER BY lower(label), ord
    ) firsts
    ORDER BY ord
    LIMIT 8
  ) capped;

  UPDATE patients
  SET
    patient_tags = v_merged_tags,
    patient_tag = v_merged_tags[1],
    updated_at = now()
  WHERE id = p_target_patient_id;

  UPDATE appointments
  SET patient_id = p_target_patient_id
  WHERE doctor_id = p_doctor_id
    AND patient_id = p_source_patient_id;

  UPDATE conversations
  SET patient_id = p_target_patient_id
  WHERE doctor_id = p_doctor_id
    AND patient_id = p_source_patient_id;

  UPDATE prescriptions
  SET patient_id = p_target_patient_id
  WHERE doctor_id = p_doctor_id
    AND patient_id = p_source_patient_id;

  UPDATE care_episodes
  SET patient_id = p_target_patient_id
  WHERE doctor_id = p_doctor_id
    AND patient_id = p_source_patient_id;

  UPDATE patient_allergies
  SET patient_id = p_target_patient_id
  WHERE doctor_id = p_doctor_id
    AND patient_id = p_source_patient_id;

  UPDATE patient_chronic_conditions
  SET patient_id = p_target_patient_id
  WHERE doctor_id = p_doctor_id
    AND patient_id = p_source_patient_id;

  UPDATE patient_vitals
  SET patient_id = p_target_patient_id
  WHERE doctor_id = p_doctor_id
    AND patient_id = p_source_patient_id;

  UPDATE patient_medications
  SET patient_id = p_target_patient_id
  WHERE doctor_id = p_doctor_id
    AND patient_id = p_source_patient_id;

  UPDATE condition_medications
  SET patient_id = p_target_patient_id
  WHERE doctor_id = p_doctor_id
    AND patient_id = p_source_patient_id;

  UPDATE service_staff_review_requests
  SET patient_id = p_target_patient_id
  WHERE doctor_id = p_doctor_id
    AND patient_id = p_source_patient_id;

  -- Section notes: PK (doctor_id, patient_id) — concat when both exist.
  UPDATE patient_medical_background_notes AS t
  SET
    notes = NULLIF(
      concat_ws(
        E'\n\n',
        NULLIF(btrim(t.notes), ''),
        NULLIF(btrim(s.notes), '')
      ),
      ''
    ),
    updated_at = now()
  FROM patient_medical_background_notes AS s
  WHERE t.doctor_id = p_doctor_id
    AND t.patient_id = p_target_patient_id
    AND s.doctor_id = p_doctor_id
    AND s.patient_id = p_source_patient_id;

  DELETE FROM patient_medical_background_notes
  WHERE doctor_id = p_doctor_id
    AND patient_id = p_source_patient_id
    AND EXISTS (
      SELECT 1
      FROM patient_medical_background_notes
      WHERE doctor_id = p_doctor_id
        AND patient_id = p_target_patient_id
    );

  UPDATE patient_medical_background_notes
  SET patient_id = p_target_patient_id
  WHERE doctor_id = p_doctor_id
    AND patient_id = p_source_patient_id;

  UPDATE patient_allergies_section_notes AS t
  SET
    notes = NULLIF(
      concat_ws(
        E'\n\n',
        NULLIF(btrim(t.notes), ''),
        NULLIF(btrim(s.notes), '')
      ),
      ''
    ),
    updated_at = now()
  FROM patient_allergies_section_notes AS s
  WHERE t.doctor_id = p_doctor_id
    AND t.patient_id = p_target_patient_id
    AND s.doctor_id = p_doctor_id
    AND s.patient_id = p_source_patient_id;

  DELETE FROM patient_allergies_section_notes
  WHERE doctor_id = p_doctor_id
    AND patient_id = p_source_patient_id
    AND EXISTS (
      SELECT 1
      FROM patient_allergies_section_notes
      WHERE doctor_id = p_doctor_id
        AND patient_id = p_target_patient_id
    );

  UPDATE patient_allergies_section_notes
  SET patient_id = p_target_patient_id
  WHERE doctor_id = p_doctor_id
    AND patient_id = p_source_patient_id;

  -- OTP window: one row per patient. Keep the newer verification.
  SELECT * INTO v_src_otp FROM video_otp_window WHERE patient_id = p_source_patient_id;
  SELECT * INTO v_tgt_otp FROM video_otp_window WHERE patient_id = p_target_patient_id;

  IF v_src_otp.patient_id IS NOT NULL AND v_tgt_otp.patient_id IS NOT NULL THEN
    IF v_src_otp.last_otp_verified_at > v_tgt_otp.last_otp_verified_at THEN
      UPDATE video_otp_window
      SET
        last_otp_verified_at = v_src_otp.last_otp_verified_at,
        last_otp_verified_via = v_src_otp.last_otp_verified_via,
        correlation_id = v_src_otp.correlation_id
      WHERE patient_id = p_target_patient_id;
    END IF;
    DELETE FROM video_otp_window WHERE patient_id = p_source_patient_id;
  ELSIF v_src_otp.patient_id IS NOT NULL THEN
    UPDATE video_otp_window
    SET patient_id = p_target_patient_id
    WHERE patient_id = p_source_patient_id;
  END IF;

  -- Anonymize last so a failed move cannot leave a blank source.
  UPDATE patients
  SET
    name = '[Merged]',
    phone = 'merged-' || p_source_patient_id::text,
    email = NULL,
    date_of_birth = NULL,
    age = NULL,
    gender = NULL,
    platform = NULL,
    platform_external_id = NULL,
    updated_at = now()
  WHERE id = p_source_patient_id;
END;
$$;

REVOKE ALL ON FUNCTION merge_patients_into(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION merge_patients_into(UUID, UUID, UUID) TO service_role;

COMMENT ON FUNCTION merge_patients_into(UUID, UUID, UUID) IS
  'Doctor-scoped atomic merge of source into target. Moves clinical rows, '
  'unions tags, concatenates section notes, keeps the newer OTP window, '
  'then anonymizes source. video_replay_otp_attempts stay on source.';
