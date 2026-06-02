# tmr-03 · `doctor_settings.cockpit_template_override` column

> **Status:** ✅ Done (2026-05-23) — migration **106**, API projection + Zod validation, unit tests green. Apply SQL on Supabase before tmr-04.

> **Wave 2 lane β** of the [templates-r-mod batch](../plan-templates-r-mod-batch.md). Add a single nullable text column on `doctor_settings` so doctors can pin a preferred cockpit template globally.

| Property | Value |
|---|---|
| **Owner** | Backend |
| **Size** | XS (one new SQL migration; CHECK constraint; reuses existing RLS) |
| **Model** | **Auto** — standard additive column migration; no PHI; no novel security |
| **Wave** | 2 (lane β) |
| **Depends on** | (none — disjoint from tmr-01 / tmr-02) |
| **Blocks** | tmr-04 (production page reads the column via the existing settings GET) |

---

## Goal

Ship migration `104_doctor_settings_cockpit_template_override.sql` that:

1. Adds a nullable text column `cockpit_template_override` to `doctor_settings`.
2. Adds a `CHECK` constraint restricting the column to one of `'telemed-video'`, `'telemed-voice'`, `'telemed-text'`, `'review'`, or `NULL`.
3. Reuses the existing row-level security policy on `doctor_settings` — doctors see only their own row.

Default `NULL` means "auto-select template per modality + state" (the cockpit-v2 default behavior).

---

## What to do

### 1. Locate the existing migration directory + numbering

Run `Glob` on `backend/migrations/*.sql` and check the highest existing migration number. Per the roadmap, migration 103 was created by cv2-04 (SOAP fields expansion). So **104** is the next available number.

If a colliding 104 exists already (e.g., another in-flight batch reserved it), pick the next available number and capture-inbox the renaming.

**Shipped as 106** — `104_patients_tags.sql` and `105_voice_call_quality.sql` were already present; file is `106_doctor_settings_cockpit_template_override.sql`.

### 2. Write the migration

File: `backend/migrations/106_doctor_settings_cockpit_template_override.sql`

```sql
-- ============================================================================
-- 104: doctor_settings.cockpit_template_override
-- ============================================================================
-- Adds a per-doctor preferred cockpit template, used by R-MOD-full to pin
-- a single layout globally for a doctor regardless of appointment modality.
--
-- NULL = auto-select per modality + state (the cockpit-v2 default).
-- Non-NULL values restricted by CHECK to the four R-MOD-full template ids.
--
-- Row-level security:
--   Reuses the existing doctor_settings RLS policy. Each doctor sees and
--   modifies only their own row; no new policy SQL required.
--
-- Source: docs/Work/Daily-plans/May 2026/21-05-2026/templates-r-mod/
-- Plan:   plan-templates-r-mod-batch.md (DL-4)
-- ============================================================================

BEGIN;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS cockpit_template_override TEXT NULL;

ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_cockpit_template_override_check
  CHECK (
    cockpit_template_override IS NULL
    OR cockpit_template_override IN (
      'telemed-video',
      'telemed-voice',
      'telemed-text',
      'review'
    )
  );

COMMENT ON COLUMN doctor_settings.cockpit_template_override IS
  'Doctor''s preferred cockpit template (R-MOD-full, 2026-05-21). NULL = auto-select per modality + state.';

COMMIT;
```

Add a corresponding down migration if the project uses two-file up/down:

```sql
-- backend/migrations/104_doctor_settings_cockpit_template_override.down.sql
BEGIN;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_cockpit_template_override_check;

ALTER TABLE doctor_settings
  DROP COLUMN IF EXISTS cockpit_template_override;

COMMIT;
```

If the project uses a single migration file with both up + down inline (or a migration manager that handles down via a sibling block), match that convention. Check `backend/migrations/103_*.sql` for the prevailing pattern before writing.

### 3. Verify the existing `doctor_settings` GET / PATCH endpoints serialize the new column generically

The existing endpoint surface (`GET /api/v1/doctor/settings`, `PATCH /api/v1/doctor/settings`) likely uses a `SELECT *` pattern or a generic row-mapper. If so, the new column auto-flows through with zero handler changes. **Verify** by:

1. Open `backend/src/routes/doctor-settings.ts` (or whichever route file owns these endpoints).
2. Check whether the handler explicitly projects columns or uses `*`.
3. If explicit columns: add `cockpit_template_override` to the projection list and the request body validator.
4. If `*`: nothing to do; the column flows automatically.

Document the choice in the migration file's header comment.

### 4. Update / add a smoke test

In `backend/src/__tests__/doctor-settings.test.ts` (or wherever the doctor-settings tests live), add:

```ts
describe('cockpit_template_override', () => {
  it('accepts valid template values', async () => {
    // For each of 'telemed-video' | 'telemed-voice' | 'telemed-text' | 'review':
    //   PATCH /api/v1/doctor/settings { cockpit_template_override: value }
    //   → 200; GET returns the value
  });

  it('rejects invalid template values', async () => {
    // PATCH /api/v1/doctor/settings { cockpit_template_override: 'invalid' }
    // → 400 (validation) OR 500 with CHECK constraint violation depending on
    //   how the handler validates. Both are acceptable; the constraint
    //   guarantees no invalid value lands in the DB.
  });

  it('accepts null (clear override)', async () => {
    // PATCH /api/v1/doctor/settings { cockpit_template_override: null }
    // → 200; GET returns null.
  });

  it('preserves RLS — doctor A cannot read doctor B''s override', async () => {
    // Existing RLS smoke pattern; assert isolation.
  });
});
```

If the project doesn't have a `doctor-settings.test.ts`, append the new tests to the closest equivalent (e.g., `doctor.test.ts`).

### 5. Run the migration + tests

```sh
pnpm --filter backend migrate latest
pnpm --filter backend test doctor-settings
```

Then roll back and re-apply to verify idempotence:

```sh
pnpm --filter backend migrate down
pnpm --filter backend migrate latest
```

---

## Files touched

- **New:** `backend/migrations/104_doctor_settings_cockpit_template_override.sql` (+ optional `.down.sql` per project convention).
- **Modified (if explicit projection):** `backend/src/routes/doctor-settings.ts` — add column to projection + validator.
- **Modified:** `backend/src/__tests__/doctor-settings.test.ts` (or equivalent) — add 4 smoke tests.

---

## Acceptance gate

- [x] Migration file at `backend/migrations/106_doctor_settings_cockpit_template_override.sql` (renumbered from 104 — collision with `104_patients_tags.sql`).
- [x] Adds `cockpit_template_override TEXT NULL` to `doctor_settings`.
- [x] CHECK constraint enforces the four-value enum (or NULL).
- [x] COMMENT on the column documents the purpose + source plan reference.
- [ ] `pnpm --filter backend migrate latest` clean; idempotent on re-apply. *(no migrate script in backend package.json — apply SQL manually on Supabase)*
- [ ] Rollback (`migrate down`) succeeds cleanly. *(manual: DROP CONSTRAINT + DROP COLUMN)*
- [ ] CHECK constraint manual smoke: `UPDATE doctor_settings SET cockpit_template_override = 'invalid' WHERE …` fails with the expected constraint violation.
- [x] Existing RLS policy continues to enforce per-doctor isolation (no new policy SQL).
- [x] 4 smoke tests pass: accepts each valid value, rejects invalid, accepts null, RLS preserved.
- [x] `npm test` green for migration + validation suites.

---

## Anti-goals

- ❌ Don't add a new RLS policy. Reuse the existing `doctor_settings` policy.
- ❌ Don't add a default non-null value. `NULL` is the auto-select sentinel.
- ❌ Don't infer or auto-populate the column from existing data. New column starts NULL for every existing row.
- ❌ Don't add corresponding frontend Settings UI in this task — DL-5 defers to a future Phase-3 batch.
- ❌ Don't expose the column via a new endpoint surface — the existing settings GET / PATCH carries it (verify in §3).
- ❌ Don't add the column to any non-doctor-scoped table (e.g., `clinics`, `practices`) — this is a per-doctor preference.

---

## Notes

- The CHECK constraint mirrors the source-of-truth enum in `frontend/lib/patient-profile/state.ts` (`CockpitTemplate` literal type — tmr-02 exports it). If the enum grows in a future plan, both the migration and the type must update.
- The "explicit column projection vs `*`" decision in §3 may surface a follow-up: if explicit, document that future per-doctor preferences need to remember to update the projection list. Capture-inbox if so.
- This migration is **pre-launch safe** — no production data, no migration risk window.
- Consider extending the `doctor-settings` PATCH validator's runtime schema (zod / valibot / whatever the project uses) to mirror the CHECK constraint enum. Without it, an invalid PATCH could reach the DB and surface as a 500 instead of a clean 400. Improvement — not blocking — capture-inbox if the project doesn't use a request validator pattern today.
