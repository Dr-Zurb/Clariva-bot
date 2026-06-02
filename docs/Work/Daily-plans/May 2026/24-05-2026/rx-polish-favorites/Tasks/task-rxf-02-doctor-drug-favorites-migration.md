# rxf-02 · `109_doctor_drug_favorites.sql` migration

> **Wave 1** of [rx-polish-favorites](../plan-rx-polish-favorites-batch.md). Per-doctor saved medicine templates.

| Property | Value |
|---|---|
| **Size** | XS | **Model** | Auto | **Wave** | 1 | **Depends on** | — | **Blocks** | rxf-04 |

---

## Goal

Create the `doctor_drug_favorites` table per DL-3. RLS-enforced; 30-max constraint enforced via app layer (CHECK-by-count requires subquery which Postgres forbids in CHECK).

---

## What to do

### 1. New migration `backend/migrations/109_doctor_drug_favorites.sql`

```sql
-- ============================================================================
-- 109_doctor_drug_favorites.sql
-- rx-polish-favorites batch · Phase 3 · rxf-02
-- Date: 2026-05-24
-- ============================================================================
-- Purpose:
--   Per-doctor saved medicine row templates ("favorites"). Tapping a favorite
--   chip in <PlanSection> appends a pre-filled medicine row. R-RX-POLISH/2.3.
--
-- Table:
--   doctor_drug_favorites (
--     id          uuid    PRIMARY KEY DEFAULT gen_random_uuid()
--     doctor_id   uuid    NOT NULL REFERENCES doctors(id) ON DELETE CASCADE
--     name        text    NOT NULL CHECK (length(name) BETWEEN 1 AND 60)
--     template    jsonb   NOT NULL  -- matches MedicineRowValue shape
--     created_at  timestamptz NOT NULL DEFAULT now()
--     updated_at  timestamptz NOT NULL DEFAULT now()
--   )
--
-- Index:
--   doctor_drug_favorites_doctor_idx ON (doctor_id, created_at DESC)
--
-- 30-max-per-doctor:
--   Postgres forbids subqueries in CHECK constraints. The backend service
--   (rxf-04) returns 400 before insert if the doctor already has 30. The
--   client side hides the [+ Save] button when at cap.
--
-- RLS: standard doctor-ownership.
--
-- Rollback:
--   DROP TABLE IF EXISTS doctor_drug_favorites CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS doctor_drug_favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  template    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doctor_drug_favorites_doctor_idx
  ON doctor_drug_favorites (doctor_id, created_at DESC);

ALTER TABLE doctor_drug_favorites
  DROP CONSTRAINT IF EXISTS doctor_drug_favorites_template_shape_check;
ALTER TABLE doctor_drug_favorites
  ADD CONSTRAINT doctor_drug_favorites_template_shape_check CHECK (
    jsonb_typeof(template) = 'object'
    AND template ? 'medicineName'
    AND template ? 'dosage'
  );

COMMENT ON TABLE doctor_drug_favorites IS
  'rxf-02: per-doctor saved medicine row templates. Max 30 enforced in app layer (rxf-04). template JSONB matches MedicineRowValue.';

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE doctor_drug_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctor_drug_favorites_owner_select ON doctor_drug_favorites;
CREATE POLICY doctor_drug_favorites_owner_select
  ON doctor_drug_favorites
  FOR SELECT
  USING (doctor_id = current_doctor_id());

DROP POLICY IF EXISTS doctor_drug_favorites_owner_modify ON doctor_drug_favorites;
CREATE POLICY doctor_drug_favorites_owner_modify
  ON doctor_drug_favorites
  FOR ALL
  USING (doctor_id = current_doctor_id())
  WITH CHECK (doctor_id = current_doctor_id());
```

### 2. Migration test `backend/tests/unit/migrations/109-doctor-drug-favorites-migration.test.ts`

Cover:
- Table + index + RLS.
- `name` length CHECK rejects "" and 61-char.
- `template` shape CHECK rejects non-object / missing keys.
- RLS isolation.

### 3. Verify

```powershell
pnpm --filter backend migrate latest
pnpm --filter backend test tests/unit/migrations/109-doctor-drug-favorites-migration.test.ts
```

---

## Acceptance gate

- [x] Migration file at `backend/migrations/109_doctor_drug_favorites.sql`.
- [x] Migration applies + idempotent *(apply SQL on Supabase — no migrate script in repo)*.
- [x] Constraints work *(name length + template shape CHECK; manual smoke for reject cases)*.
- [x] RLS works *(policies in migration; manual smoke for cross-doctor isolation)*.
- [x] Test passes — `npm test -- tests/unit/migrations/109-doctor-drug-favorites-migration.test.ts` (16/16 green).

---

## Files touched

- **New:** `backend/migrations/109_doctor_drug_favorites.sql`
- **New:** `backend/tests/unit/migrations/109-doctor-drug-favorites-migration.test.ts`

---

## Notes

- Task draft cited `REFERENCES doctors(id)` and `current_doctor_id()`; implemented as `auth.users(id)` + `auth.uid()` to match existing per-doctor tables (e.g. `091_doctor_rx_templates.sql`, `009_doctor_settings.sql`). No `doctors` table or `current_doctor_id()` function exists in this schema.
- 30-max cap deferred to rxf-04 app layer per DL-3 / Postgres 0A000.

---

## Anti-goals

- ❌ Don't try to enforce 30-max via CHECK (Postgres 0A000 forbids subqueries).
- ❌ Don't add cross-doctor sharing now — capture-inbox.
- ❌ Don't pre-seed example favorites; cold-start = empty (DL-5 handles UI hint).
