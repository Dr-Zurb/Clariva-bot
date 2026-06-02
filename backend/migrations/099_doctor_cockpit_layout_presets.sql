-- ============================================================================
-- 099_doctor_cockpit_layout_presets.sql
-- Cockpit customization batch · Phase D · Lane α step 0 (task cc-08)
-- Date:    2026-05-10
-- ============================================================================
-- Purpose:
--   Per-doctor storage for user-saved cockpit layout presets. Adds a JSONB
--   array column to doctor_settings that holds up to 5 named layout
--   configurations (the hard cap from CC-D6).
--
--   Built-in presets (Triage / Consult / Document) are bundled in the
--   frontend (frontend/lib/consultation/cockpit-layout.ts) and are NOT
--   persisted here. This column stores custom presets only.
--
-- Column introduced (additive only — existing rows default to empty array):
--
--   cockpit_layout_presets  JSONB NOT NULL DEFAULT '[]'::jsonb
--     · Each element must have shape:
--         {
--           id:         text           (client-generated UUID)
--           name:       text           (user-supplied label, max enforced in API)
--           created_at: text           (ISO-8601 timestamptz serialised as string)
--           layout: {
--             slots:     text[3]       (e.g. ["chart","body","rx"])
--             widths:    numeric[3]    (percentage widths summing to 100)
--             collapsed: {
--               chart: bool
--               rx:    bool
--             }
--           }
--         }
--     · Max 5 elements enforced by CHECK constraint below. Backend (cc-09)
--       validates the same invariants in application code and returns 400
--       before the row ever reaches the DB — this CHECK is a backstop.
--
-- Safety:
--   · Additive only — no column dropped or tightened.
--   · ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS → idempotent
--     re-run on dev without errors. Matches the project convention from 098.
--   · NOT NULL DEFAULT '[]' eliminates null-vs-empty branching in the read
--     path: every doctor row returns an array, even before saving any preset.
--   · Postgres 11+ ADD COLUMN with a literal DEFAULT is metadata-only (no
--     table rewrite), so this is safe to ship in a normal deploy window even
--     on a large doctor_settings table.
--   · RLS on doctor_settings is already enforced via ownership predicates
--     (migration 009). Additive columns inherit those policies — no new
--     policies needed here.
--   · Postgres forbids subqueries inside CHECK constraints (error 0A000).
--     Per-element shape validation (id/name/created_at/layout fields) is
--     therefore enforced exclusively in the backend service (cc-09) via Zod,
--     which returns a clean 400 before the row reaches the DB. The CHECK here
--     guards only the scalar invariants that Postgres can evaluate inline.
--
-- Rollback:
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_cockpit_layout_presets_check;
--   ALTER TABLE doctor_settings
--     DROP COLUMN IF EXISTS cockpit_layout_presets;
-- ============================================================================

-- ── Column ───────────────────────────────────────────────────────────────────

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS cockpit_layout_presets JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── Column comment ────────────────────────────────────────────────────────────

COMMENT ON COLUMN doctor_settings.cockpit_layout_presets IS
  'CC-08: User-saved cockpit layout presets (max 5). Each element is
   { id: text, name: text, created_at: timestamptz, layout: {
     slots: text[3], widths: numeric[3], collapsed: { chart: bool, rx: bool }
   } }. Built-in presets are NOT persisted here; this is custom presets only.';

-- ── CHECK constraint (drop-then-add → idempotent re-run) ─────────────────────

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_cockpit_layout_presets_check;

ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_cockpit_layout_presets_check CHECK (
    -- Postgres 0A000: subqueries are forbidden in CHECK constraints.
    -- Scalar invariants only here; per-element shape is validated by the
    -- backend service (cc-09 / Zod) before the row is written.
    jsonb_typeof(cockpit_layout_presets) = 'array'
    AND jsonb_array_length(cockpit_layout_presets) <= 5
  );

-- ============================================================================
-- Reverse (documented only; kept in-file so the reverse op is one grep away).
--
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_cockpit_layout_presets_check;
--   ALTER TABLE doctor_settings
--     DROP COLUMN IF EXISTS cockpit_layout_presets;
-- ============================================================================
