# Task cc-08: Migration `099_doctor_cockpit_layout_presets.sql`

## 10 May 2026 — Batch [Cockpit customization](../plan-cockpit-customization-batch.md) — Phase D, Lane α step 0 — **XS, ~30min**

---

## Task overview

Layout presets need to sync across browsers (the user explicitly asked for this — "save it and reuse it later"). That requires a backend store. The simplest shape is a JSONB column on `doctor_settings` keyed by the doctor's user id (which is the table's primary key).

cc-08 ships exactly one migration:

```
backend/migrations/099_doctor_cockpit_layout_presets.sql
```

It adds a `cockpit_layout_presets JSONB NOT NULL DEFAULT '[]'::jsonb` column to `doctor_settings`, with a `CHECK` constraint that:

1. The value is a JSON array.
2. Length ≤ 5.
3. Each element has the required preset shape (`id`, `name`, `created_at`, `layout` with `slots` / `widths` / `collapsed`).

The hard cap at 5 (CC-D6) is enforced at the DB layer so a misbehaving client can't store 100 presets and bloat the row. The backend service (cc-09) catches the CHECK violation and returns a 400.

**Migration number check:** highest existing is `098_doctor_patient_flow_advance.sql` (verified 2026-05-10). Next is **099**. (An earlier draft of this batch said `095` — that's already taken.)

**Estimated time:** ~30 min (10 min SQL, 10 min running on dev DB, 10 min rollback rehearsal).

**Status:** Done (migration file created 2026-05-10; apply on dev DB + smoke-test checkboxes remain for runtime verification).

**Hard deps:** none on the cc-NN tasks. cc-09 / cc-10 depend on this; if the migration doesn't ship, neither do they.

**Source:** [plan-cockpit-customization-batch.md § CC-D5, § CC-D6](../plan-cockpit-customization-batch.md#decision-lock-locked-2026-05-10-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- `backend/migrations/098_doctor_patient_flow_advance.sql` — most recent migration; precedent for adding a column to `doctor_settings`.
- `backend/migrations/025_doctor_settings_payout.sql` — earlier example of adding payout JSONB-ish data to `doctor_settings`.
- `backend/migrations/035_service_offerings_json.sql` — example of a CHECK constraint on a JSONB column shape.
- `backend/migrations/039_service_catalog_templates_json.sql` — another JSONB-with-CHECK example.

**Estimated turns:** 1 turn.

---

## Acceptance criteria

### Migration file

- [x] Create `backend/migrations/099_doctor_cockpit_layout_presets.sql`. Suggested content:

  ```sql
  -- 099_doctor_cockpit_layout_presets.sql
  -- CC-08 (2026-05-10): cockpit layout presets per doctor.
  -- Stores up to 5 user-saved cockpit layout configurations as a JSONB array
  -- on doctor_settings. Built-in presets (Triage / Consult / Document) are
  -- bundled in the frontend (frontend/lib/consultation/cockpit-layout.ts) and
  -- do NOT live here. Custom presets only.

  ALTER TABLE doctor_settings
    ADD COLUMN IF NOT EXISTS cockpit_layout_presets JSONB NOT NULL DEFAULT '[]'::jsonb;

  COMMENT ON COLUMN doctor_settings.cockpit_layout_presets IS
    'CC-08: User-saved cockpit layout presets (max 5). Each element is
     { id: text, name: text, created_at: timestamptz, layout: {
       slots: text[3], widths: numeric[3], collapsed: { chart: bool, rx: bool }
     } }. Built-in presets are NOT persisted here; this is custom presets only.';

  -- Defensive shape check at the DB level. Backend (cc-09) does its own
  -- validation and surfaces a clean 400; this CHECK is a backstop against
  -- a misbehaving client bypassing the API and writing directly.
  ALTER TABLE doctor_settings
    DROP CONSTRAINT IF EXISTS doctor_settings_cockpit_layout_presets_check;
  ALTER TABLE doctor_settings
    ADD CONSTRAINT doctor_settings_cockpit_layout_presets_check CHECK (
      jsonb_typeof(cockpit_layout_presets) = 'array'
      AND jsonb_array_length(cockpit_layout_presets) <= 5
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(cockpit_layout_presets) p
        WHERE NOT (
          p ? 'id' AND jsonb_typeof(p->'id') = 'string'
          AND p ? 'name' AND jsonb_typeof(p->'name') = 'string'
          AND p ? 'created_at' AND jsonb_typeof(p->'created_at') = 'string'
          AND p ? 'layout' AND jsonb_typeof(p->'layout') = 'object'
          AND (p->'layout') ? 'slots'
          AND jsonb_typeof((p->'layout')->'slots') = 'array'
          AND jsonb_array_length((p->'layout')->'slots') = 3
          AND (p->'layout') ? 'widths'
          AND jsonb_typeof((p->'layout')->'widths') = 'array'
          AND jsonb_array_length((p->'layout')->'widths') = 3
          AND (p->'layout') ? 'collapsed'
          AND jsonb_typeof((p->'layout')->'collapsed') = 'object'
        )
      )
    );
  ```

- [x] **Idempotent shape**: `ADD COLUMN IF NOT EXISTS` and `DROP CONSTRAINT IF EXISTS` so the migration can re-run on dev without errors. Matches the project's existing migration conventions (e.g. `098_doctor_patient_flow_advance.sql`).

### Apply on dev DB

- [ ] Run the migration on the dev Supabase project. Confirm the column exists:

  ```sql
  SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
   WHERE table_name = 'doctor_settings' AND column_name = 'cockpit_layout_presets';
  -- Expect: cockpit_layout_presets | jsonb | NO | '[]'::jsonb
  ```

- [ ] Confirm the CHECK constraint exists:

  ```sql
  SELECT con.conname, pg_get_constraintdef(con.oid)
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'doctor_settings'
     AND con.conname = 'doctor_settings_cockpit_layout_presets_check';
  -- Expect: 1 row with the CHECK definition above
  ```

- [ ] Smoke test the constraint by attempting an invalid write:

  ```sql
  -- Should succeed (empty array, default)
  UPDATE doctor_settings SET cockpit_layout_presets = '[]'::jsonb WHERE doctor_id = '<some uuid>';

  -- Should succeed (1 valid preset)
  UPDATE doctor_settings SET cockpit_layout_presets = '[
    {"id":"p1","name":"My layout","created_at":"2026-05-10T12:00:00Z",
     "layout":{"slots":["chart","body","rx"],"widths":[26,48,26],"collapsed":{"chart":false,"rx":false}}}
  ]'::jsonb WHERE doctor_id = '<some uuid>';

  -- Should fail (6 presets — over cap)
  UPDATE doctor_settings SET cockpit_layout_presets = (
    SELECT jsonb_agg(p) FROM jsonb_array_elements('[
      {"id":"p1","name":"a","created_at":"2026-05-10T12:00:00Z","layout":{"slots":["chart","body","rx"],"widths":[26,48,26],"collapsed":{"chart":false,"rx":false}}},
      {"id":"p2","name":"b","created_at":"2026-05-10T12:00:00Z","layout":{"slots":["chart","body","rx"],"widths":[26,48,26],"collapsed":{"chart":false,"rx":false}}},
      {"id":"p3","name":"c","created_at":"2026-05-10T12:00:00Z","layout":{"slots":["chart","body","rx"],"widths":[26,48,26],"collapsed":{"chart":false,"rx":false}}},
      {"id":"p4","name":"d","created_at":"2026-05-10T12:00:00Z","layout":{"slots":["chart","body","rx"],"widths":[26,48,26],"collapsed":{"chart":false,"rx":false}}},
      {"id":"p5","name":"e","created_at":"2026-05-10T12:00:00Z","layout":{"slots":["chart","body","rx"],"widths":[26,48,26],"collapsed":{"chart":false,"rx":false}}},
      {"id":"p6","name":"f","created_at":"2026-05-10T12:00:00Z","layout":{"slots":["chart","body","rx"],"widths":[26,48,26],"collapsed":{"chart":false,"rx":false}}}
    ]'::jsonb) p
  ) WHERE doctor_id = '<some uuid>';
  -- Expect: ERROR: new row for relation "doctor_settings" violates check constraint "doctor_settings_cockpit_layout_presets_check"

  -- Should fail (preset missing required field)
  UPDATE doctor_settings SET cockpit_layout_presets = '[{"id":"x","name":"x"}]'::jsonb WHERE doctor_id = '<some uuid>';
  -- Expect: same CHECK violation
  ```

  (Run these in a transaction with `ROLLBACK;` at the end — never persist the test data on dev.)

### Rollback rehearsal

- [ ] Document the rollback in the migration's docstring header (already shown above, but call it out explicitly):

  ```sql
  -- ROLLBACK:
  --   ALTER TABLE doctor_settings DROP CONSTRAINT IF EXISTS doctor_settings_cockpit_layout_presets_check;
  --   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS cockpit_layout_presets;
  ```

- [ ] Rehearse on dev. Apply rollback, confirm `psql \d doctor_settings` no longer shows the column. Re-apply the forward migration. Confirm column re-appears, default `'[]'::jsonb`.

### `pnpm tsc --noEmit` not affected

- [ ] No backend TypeScript changes in this task. Skip.

---

## Out of scope

- **TypeScript types** for `CockpitLayoutPresetRow` / `CockpitLayoutPreset` — that's cc-09's job (lives in `backend/src/types/doctor-settings.ts`).
- **Service helpers** to read / write the column — cc-09.
- **HTTP endpoints** — cc-09.
- **Built-in presets** — they live in the frontend bundle (`frontend/lib/consultation/cockpit-layout.ts`); never persisted server-side.

---

## Files expected to touch

**Modified:** none.

**New:**
- `backend/migrations/099_doctor_cockpit_layout_presets.sql` (~50 LOC).

---

## Notes / open decisions

1. **Why a JSONB column instead of a separate `doctor_cockpit_presets` table?** A separate table is overkill for a max-5 collection of opaque blobs. JSONB on `doctor_settings` keeps the read path single-row (no JOIN), the write path single-statement (no transaction), and cardinality bounded by the CHECK. If the cap ever grows past ~20 or queries need to filter ON preset content, revisit and migrate to a side table — until then YAGNI.
2. **Why `NOT NULL DEFAULT '[]'`?** Eliminates the "is the column null or empty?" branching in the read path. Doctor with no presets reads `[]`, no nullability checks needed.
3. **Why 5 in the CHECK and not 10?** CC-D6 lock — soft cap is 5 with eviction prompt; hard cap matches. If a doctor wants more, they delete an old one first (and probably never wanted 10 anyway — recall friction past 5 is significant).
4. **What about RLS?** `doctor_settings` already has RLS scoping rows to the owning doctor (set up in earlier migrations). The new column inherits that policy — no extra RLS work needed.
5. **Migration timing safety.** This migration adds a column with a literal default — Postgres 11+ uses the fast-path (metadata-only, no table rewrite). Even on a large `doctor_settings` table this completes in milliseconds. Safe to ship in a normal deploy window.
6. **Why no GIN index on `cockpit_layout_presets`?** We never query inside the JSONB — just read the whole row by `doctor_id`. A GIN index would be wasted disk and slower writes. If a future feature wants "find all doctors with a 'Triage' preset", revisit.

---

## References

- **Affected files:**
  - new `backend/migrations/099_doctor_cockpit_layout_presets.sql`
- **Style precedent:** `backend/migrations/035_service_offerings_json.sql` — JSONB column with CHECK constraint on shape.
- **Successor:** [`task-cc-09-presets-backend-service-endpoints.md`](./task-cc-09-presets-backend-service-endpoints.md).

---

**Owner:** TBD
**Created:** 2026-05-10
**Status:** Done (migration file created; DB apply + smoke-test pending runtime)
