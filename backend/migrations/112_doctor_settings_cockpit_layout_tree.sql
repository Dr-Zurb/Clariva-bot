-- ============================================================================
-- 112_doctor_settings_cockpit_layout_tree.sql
-- cockpit-layout-presets-modality batch · Phase 3 · clpm-01
-- Date: 2026-05-24
-- ============================================================================
-- Purpose:
--   Extend doctor_settings.cockpit_layout_presets element shape so each preset
--   can store a layout TREE (recursive split nodes), not just the flat
--   {slots, widths, collapsed} shape from migration 099. Required by
--   R-LAYOUT-UX (new shell uses tree layout, not flat slots).
--
-- Strategy:
--   099 introduced `cockpit_layout_presets` as a JSONB array of objects
--   shaped { id, name, created_at, layout: { slots, widths, collapsed } }.
--   We DO NOT add a new column. Instead, we relax the CHECK constraint to
--   allow elements to carry either:
--     (a) the legacy layout key, OR
--     (b) a new layout_tree key (recursive tree JSONB), AND optionally
--         sourceTemplateId for "Reset to template default" per DL-11.
--   Existing rows continue to validate.
--   Read path (in service layer) auto-converts legacy → tree on the fly
--   (clpm-02 helper). Write path serializes whichever shape is present.
--
-- Why no separate column:
--   Keeps the doctor_settings row narrow. JSONB is flexible enough; per-element
--   shape variance is a feature here.
--
-- Rollback:
--   Restore the original 099 CHECK constraint.
-- ============================================================================

-- Drop the 099 CHECK so we can replace with a more permissive variant.
ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_cockpit_layout_presets_check;

ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_cockpit_layout_presets_check CHECK (
    jsonb_typeof(cockpit_layout_presets) = 'array'
    AND jsonb_array_length(cockpit_layout_presets) <= 5
  );

-- ── Comment update ───────────────────────────────────────────────────────────

COMMENT ON COLUMN doctor_settings.cockpit_layout_presets IS
  'CC-08 (099) + R-LAYOUT-UX (112): User-saved cockpit layout presets (max 5).
   Each element shape:
     {
       id:          text,
       name:        text,
       created_at:  timestamptz string,
       sourceTemplateId?: text,         -- 112: which built-in template to reset to (per DL-11)
       layout?:     { slots, widths, collapsed },  -- legacy flat (099)
       layout_tree?: LayoutNode                    -- 112: recursive tree (DL-1)
     }
   Read path auto-converts legacy layout → layout_tree when only layout is set.
   At least one of layout / layout_tree must be present (enforced by app layer).';

-- ============================================================================
-- Reverse:
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_cockpit_layout_presets_check;
--   ALTER TABLE doctor_settings
--     ADD CONSTRAINT doctor_settings_cockpit_layout_presets_check CHECK (
--       jsonb_typeof(cockpit_layout_presets) = 'array'
--       AND jsonb_array_length(cockpit_layout_presets) <= 5
--     );
-- ============================================================================
