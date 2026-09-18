-- ============================================================================
-- 212_clinic_branding_bucket.sql
-- clinic-branding-v1 · BRD-02 — private Storage bucket for clinic logos.
-- Date:    2026-08-24
-- ============================================================================
-- Purpose:
--   Private Supabase Storage bucket holding a doctor's clinic logo.
--   A logo is not PHI, but the object key is doctor_id-prefixed so we
--   keep the bucket private and never call getPublicUrl (repo invariant).
--
--   Path convention (load-bearing — letterhead-service MUST follow):
--
--       clinic-branding/{doctor_id}/logo.{png|jpg}
--
--     doctor_id-first prefix lets Storage RLS gate on the first folder
--     segment via `storage.foldername(name)[1] = auth.uid()::text`,
--     matching 184 / 092 / 068.
--
-- Access model:
--   · Upload   — service-role backend mints a short-lived SIGNED UPLOAD
--                URL. Doctors do NOT get a Storage INSERT policy.
--   · Read     — owning doctor SELECT-own (defense-in-depth) plus
--                service-role-minted signed URLs / byte downloads for
--                PDF render and the HMAC-gated public logo route.
--
-- Safety:
--   · Additive only — new bucket + new policy.
--   · ON CONFLICT (id) DO NOTHING (matches 068 / 092 / 184).
--   · DROP POLICY IF EXISTS + CREATE POLICY → idempotent re-runs.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES (
  'clinic-branding',
  'clinic-branding',
  false
)
ON CONFLICT (id) DO NOTHING;

-- File-size limit + MIME whitelist are applied via the Supabase Dashboard
-- or an ops-only query (column presence is version-dependent). The
-- letterhead-service ALSO validates type/size before minting and again
-- on register (magic-byte sniff, 512 KB).
--   UPDATE storage.buckets
--      SET file_size_limit    = 524288,   -- 512 KB
--          allowed_mime_types = ARRAY['image/jpeg', 'image/png']
--    WHERE id = 'clinic-branding';

DROP POLICY IF EXISTS clinic_branding_select_own ON storage.objects;
CREATE POLICY clinic_branding_select_own
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'clinic-branding'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- No INSERT / UPDATE / DELETE policies — only the backend service role
-- writes. Service-role bypasses RLS. Absence of write policies is the
-- escalation guard (same as 184).

-- ============================================================================
-- Reverse migration (manual):
--
--   DROP POLICY IF EXISTS clinic_branding_select_own ON storage.objects;
--   -- Bucket left in place — drop only after confirming zero objects:
--   --   DELETE FROM storage.buckets WHERE id = 'clinic-branding';
-- ============================================================================
