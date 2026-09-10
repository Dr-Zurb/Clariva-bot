-- ============================================================================
-- 200_clinic_staff.sql
-- ============================================================================
-- Date: 2026-08-22
-- Batch: receptionist-portal (rp-01 / P1)
-- Description:
--   Employment linkage between a doctor (tenant) and a staff auth user.
--   Enables the acting-doctor middleware: a receptionist JWT is resolved to
--   exactly one doctor via this row. Not a clinic/org entity (R5).
--
--   This table is NOT PHI (DL-9). It holds employment linkage plus an
--   optional staff display_name (personal data, never logged).
--
-- Hard-rules:
--   - New table + RLS (deny-all, service-role only). No PHI columns.
--   - Does NOT alter RLS on any existing table.
--
-- Rollback (document only):
--   DROP TRIGGER IF EXISTS update_clinic_staff_updated_at ON clinic_staff;
--   DROP INDEX IF EXISTS idx_clinic_staff_doctor_active;
--   DROP INDEX IF EXISTS idx_clinic_staff_staff_user_id;
--   DROP TABLE IF EXISTS clinic_staff;
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinic_staff (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'receptionist'
                  CHECK (role IN ('receptionist')),
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'suspended')),
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- DL-5: one staff member maps to exactly one doctor.
CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_staff_user_id
  ON clinic_staff (staff_user_id);

CREATE INDEX IF NOT EXISTS idx_clinic_staff_doctor_active
  ON clinic_staff (doctor_id) WHERE status = 'active';

COMMENT ON TABLE clinic_staff IS
  'receptionist-portal P1 (rp-01). Staff↔doctor employment link. NOT PHI. '
  'UNIQUE(staff_user_id) enforces one acting doctor per staff user (R5/DL-5). '
  'RLS enabled with no policies: anon/authenticated denied; service-role only.';

COMMENT ON COLUMN clinic_staff.doctor_id IS
  'Acting doctor (tenant) this staff member works for. ON DELETE CASCADE.';

COMMENT ON COLUMN clinic_staff.staff_user_id IS
  'auth.users id of the staff account. UNIQUE — one doctor per staff user.';

COMMENT ON COLUMN clinic_staff.role IS
  'Staff role claim counterpart. V1: receptionist only (DL-7).';

COMMENT ON COLUMN clinic_staff.status IS
  'active | suspended. Row is authoritative for access; JWT role is a hint (DL-4).';

COMMENT ON COLUMN clinic_staff.display_name IS
  'Optional staff label. Personal data, not PHI. Never log this value.';

-- DL-10: deny-all + service role. No permissive policies.
ALTER TABLE clinic_staff ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_clinic_staff_updated_at ON clinic_staff;
CREATE TRIGGER update_clinic_staff_updated_at
  BEFORE UPDATE ON clinic_staff
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
