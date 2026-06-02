# clpm-01 · `112_doctor_settings_cockpit_layout_tree.sql` migration

> **Wave 1** of [cockpit-layout-presets-modality](../plan-cockpit-layout-presets-modality-batch.md). Extends the existing `cockpit_layout_presets` column shape; doesn't break legacy 099 presets.

| **Size** | XS | **Model** | Auto | **Wave** | 1 | **Depends on** | — | **Blocks** | clpm-02 |
| **Status** | ✅ Done (2026-05-24) — shipped as migration **112** (110/111 already allocated) |

---

## What to do

### 1. Migration `backend/migrations/112_doctor_settings_cockpit_layout_tree.sql`

> **Note:** Task spec said 110; shipped as **112** because `110_consultation_messages_rate_limit.sql` and `111_web_push_subscriptions.sql` already exist.

```sql
-- ============================================================================
-- 110_doctor_settings_cockpit_layout_tree.sql
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
  'CC-08 (099) + R-LAYOUT-UX (110): User-saved cockpit layout presets (max 5).
   Each element shape:
     {
       id:          text,
       name:        text,
       created_at:  timestamptz string,
       sourceTemplateId?: text,         -- 110: which built-in template to reset to (per DL-11)
       layout?:     { slots, widths, collapsed },  -- legacy flat (099)
       layout_tree?: LayoutNode                    -- 110: recursive tree (DL-1)
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
```

### 2. Backend service updates `backend/src/services/doctor-settings-service.ts`

- In the read path for presets, after deserializing, for each preset: if `layout_tree` is null but `layout` is present, call a helper `legacyFlatToTree(layout)` and attach `layout_tree` to the in-memory object (don't write back yet — clpm-02 covers write).
- In the write path (POST/PUT), accept either shape; Zod-validate.

### 3. Update `backend/src/types/doctor-settings.ts`

```ts
export type LegacyPresetLayout = {
  slots: [string, string, string];
  widths: [number, number, number];
  collapsed: { chart: boolean; rx: boolean };
};

export type LayoutNode =
  | { kind: "pane"; paneId: string; collapsed?: boolean }
  | { kind: "split"; direction: "horizontal" | "vertical"; children: LayoutNode[]; sizes: number[] };

export interface CockpitLayoutPreset {
  id: string;
  name: string;
  created_at: string;
  sourceTemplateId?: string;
  layout?: LegacyPresetLayout;
  layout_tree?: LayoutNode;
}
```

### 4. Migration test `backend/tests/unit/migrations/112-doctor-settings-cockpit-layout-tree-migration.test.ts`

- Apply migration; assert the new CHECK constraint permits both legacy and tree shapes.
- Insert a row with only `layout_tree` — accepted.
- Insert a row with only legacy `layout` — accepted (99 compat).
- Insert a row with neither — app layer will reject (this CHECK can't enforce; tested at service level).
- Down-migration restores the original CHECK and rejects pure tree-only rows.

### 5. Verify

```powershell
pnpm --filter backend migrate latest
pnpm --filter backend test tests/unit/migrations/112-doctor-settings-cockpit-layout-tree-migration.test.ts
pnpm --filter backend lint
```

---

## Acceptance gate

- [x] Migration applies idempotently up + down.
- [x] Types updated.
- [x] Service reads auto-converts legacy → tree (helper stub OK; full impl in clpm-04).
- [x] Migration test passes.

---

## Anti-goals

- ❌ Don't add a separate column — JSONB flexibility is the design intent.
- ❌ Don't drop the legacy `layout` shape support — backwards compat.
- ❌ Don't write the full `legacyFlatToTree` here — clpm-04 owns the full mutation engine including this helper. Stub returning `undefined` is fine for now (read path falls back to legacy rendering if tree unavailable).
- ❌ Don't increase the 5-preset cap — DL-8.
