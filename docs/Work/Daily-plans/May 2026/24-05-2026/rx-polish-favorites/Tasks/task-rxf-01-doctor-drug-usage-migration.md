# rxf-01 · `108_doctor_drug_usage.sql` migration

> **Wave 1** of [rx-polish-favorites](../plan-rx-polish-favorites-batch.md). Per-doctor drug usage tracking table; powers personal frequency ranking in DrugAutocomplete (rxf-05).

| Property | Value |
|---|---|
| **Size** | XS | **Model** | Auto | **Wave** | 1 | **Depends on** | — | **Blocks** | rxf-03 (write-path), rxf-05 (read-path) |

---

## Goal

Create the `doctor_drug_usage` table per DL-1. RLS-enforced per DL-8.

---

## What to do

### 1. New migration `backend/migrations/108_doctor_drug_usage.sql`

Follow the file header style from `099_doctor_cockpit_layout_presets.sql` (purpose, rollback, RLS notes, idempotent CREATE IF NOT EXISTS).

```sql
-- ============================================================================
-- 108_doctor_drug_usage.sql
-- rx-polish-favorites batch · Phase 3 · rxf-01
-- Date: 2026-05-24
-- ============================================================================
-- Purpose:
--   Per-doctor drug-prescribing frequency. Powers R-RX-POLISH/2.2 personal
--   ranking in DrugAutocomplete. Incremented on Send Rx & finish (rxf-03);
--   never on draft save. Free-text drugs (no drug_master_id) NOT counted.
--
-- Table:
--   doctor_drug_usage (
--     doctor_id        uuid    NOT NULL REFERENCES doctors(id) ON DELETE CASCADE
--     drug_master_id   uuid    NOT NULL REFERENCES drug_master(id) ON DELETE CASCADE
--     usage_count      int     NOT NULL DEFAULT 0 CHECK (usage_count >= 0)
--     last_used_at     timestamptz NOT NULL DEFAULT now()
--     PRIMARY KEY (doctor_id, drug_master_id)
--   )
--
-- Index:
--   doctor_drug_usage_top_n_idx ON (doctor_id, usage_count DESC)
--     — supports fast top-N reads in /api/v1/doctors/me/drug-usage.
--
-- RLS:
--   Standard doctor-ownership predicate (matches 099). Doctor B can never
--   read or write doctor A's rows.
--
-- Rollback:
--   DROP TABLE IF EXISTS doctor_drug_usage CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS doctor_drug_usage (
  doctor_id      uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  drug_master_id uuid NOT NULL REFERENCES drug_master(id) ON DELETE CASCADE,
  usage_count    int  NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  last_used_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (doctor_id, drug_master_id)
);

CREATE INDEX IF NOT EXISTS doctor_drug_usage_top_n_idx
  ON doctor_drug_usage (doctor_id, usage_count DESC);

COMMENT ON TABLE doctor_drug_usage IS
  'rxf-01: per-doctor drug prescribing frequency. Powers R-RX-POLISH/2.2 personal autocomplete ranking. Incremented on Send Rx (not draft save). Free-text drugs not counted.';

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE doctor_drug_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctor_drug_usage_owner_select ON doctor_drug_usage;
CREATE POLICY doctor_drug_usage_owner_select
  ON doctor_drug_usage
  FOR SELECT
  USING (doctor_id = current_doctor_id());

DROP POLICY IF EXISTS doctor_drug_usage_owner_modify ON doctor_drug_usage;
CREATE POLICY doctor_drug_usage_owner_modify
  ON doctor_drug_usage
  FOR ALL
  USING (doctor_id = current_doctor_id())
  WITH CHECK (doctor_id = current_doctor_id());
```

### 2. Migration test `backend/tests/unit/migrations/108-doctor-drug-usage-migration.test.ts`

Follow the pattern of `106-doctor-settings-cockpit-template-override-migration.test.ts`. Cover:

- Table exists after migrate-up.
- PK enforced (insert two rows with same `(doctor_id, drug_master_id)` → conflict).
- `usage_count >= 0` CHECK enforced.
- Top-N index exists.
- RLS: as doctor B, `SELECT *` returns zero rows from A's data.
- Down-migration drops the table cleanly.

### 3. Verify

```powershell
pnpm --filter backend migrate latest
pnpm --filter backend test tests/unit/migrations/108-doctor-drug-usage-migration.test.ts
```

---

## Acceptance gate

- [x] Migration applies cleanly + idempotently.
- [x] Table + index + RLS policies all created.
- [x] Migration test passes.

---

## Anti-goals

- ❌ Don't add a per-row trigger or check; rxf-03 does the increment in app code (cheaper, more explicit).
- ❌ Don't add cross-doctor aggregate views — out of scope.
- ❌ Don't pre-seed any data; cold-start = empty.
