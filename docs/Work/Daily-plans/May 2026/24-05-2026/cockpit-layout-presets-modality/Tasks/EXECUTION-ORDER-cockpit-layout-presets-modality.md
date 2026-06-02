# cockpit-layout-presets-modality — execution order

> Wave matrix for the [cockpit-layout-presets-modality batch plan](../plan-cockpit-layout-presets-modality-batch.md). 6 tasks across 4 waves. One Opus-eligible task (clpm-04).

---

## Visual sequence

```
Wave 1 ────►
  α  clpm-01 (110 migration: layout_tree column)
            │
Wave 2 ────►
  α  clpm-02 (layout-tree API client + built-ins registry)
  β  clpm-03 (PaneContextMenu component + shell wire)
            │
Wave 3 ────►
  α  clpm-04 (tree mutation engine — Opus)
            │
Wave 4 ────►
  α  clpm-05 (preset picker + apply)
  β  clpm-06 (verify + close-out)   ← β actually depends on α; shown as parallel lane for diagram clarity
```
```

Note: clpm-06 lives in Wave 4 but is strictly sequential after clpm-05. Diagram shows them as adjacent for clarity but the actual order is clpm-05 → clpm-06.

---

## Task table

| # | Task | Size | Model | Wave | Depends on | Files touched |
|---|---|---|---|---|---|---|
| 1 | [clpm-01: 112 layout_tree migration](./task-clpm-01-layout-tree-migration.md) | XS | Auto | 1 | — | `backend/migrations/112_doctor_settings_cockpit_layout_tree.sql` (new); `backend/tests/unit/migrations/112-...-migration.test.ts` (new); `backend/src/services/doctor-settings-service.ts` (mod, read/write paths); `backend/src/types/doctor-settings.ts` (mod) |
| 2 | [clpm-02: Tree API client + built-ins registry](./task-clpm-02-layout-tree-api-client.md) | S | Auto | 2 | clpm-01 | `backend/src/api/routes/cockpit-layout-presets.ts` (mod, accept tree shape); `frontend/lib/api/cockpit-layout-presets-tree.ts` (new); `frontend/lib/patient-profile/layout-presets-builtin.ts` (new) |
| 3 | [clpm-03: PaneContextMenu + shell wire](./task-clpm-03-pane-context-menu.md) | M | Auto | 2 | — (no DB dep) | `frontend/components/patient-profile/PaneContextMenu.tsx` (new, ~140 LOC); `frontend/components/patient-profile/Shell.tsx` (mod, onContextMenu on pane header); `frontend/components/patient-profile/__tests__/PaneContextMenu.test.tsx` (new) |
| 4 | [clpm-04: Tree mutation engine (Opus)](./task-clpm-04-layout-tree-mutations.md) | M-L | **claude-opus-4-7-thinking-xhigh** | 3 | clpm-02 (built-ins) — useful but not strict; clpm-03 (action wiring) | `frontend/lib/patient-profile/layout-tree-mutations.ts` (new, ~250 LOC); `frontend/lib/patient-profile/__tests__/layout-tree-mutations.test.ts` (new, ~400 LOC of truth tables); `frontend/lib/patient-profile/types.ts` (mod, add `LayoutNode` type) |
| 5 | [clpm-05: Preset picker + apply](./task-clpm-05-preset-picker-and-apply.md) | S | Auto | 4 | clpm-04, clpm-02 | `frontend/components/patient-profile/PatientProfileHeader.tsx` (or PresetPicker component, mod); `frontend/components/patient-profile/Shell.tsx` (mod, setLayoutTree handler) |
| 6 | [clpm-06: Verification + close-out](./task-clpm-06-verification-and-close-out.md) | XS | Composer 2 Fast | 4 | clpm-05 | `frontend/lib/patient-profile/telemetry.ts` (mod, +4 events); COCKPIT.md; roadmap; capture-inbox |
| **Totals** | **6** | — | **4 Auto · 1 Composer · 1 Opus** | — | — | — |

---

## Critical path

`clpm-01 → clpm-02 → clpm-04 → clpm-05 → clpm-06`. clpm-03 runs alongside Wave 2 without extending critical path.

Single-engineer wall-clock: ~16-22h.

---

## Wave gates

After Wave 1: migration up + down clean; service round-trips tree JSONB.
After Wave 2: API endpoints handle tree shape; context menu opens on right-click.
After Wave 3: every tree mutation has a green truth-table row.
After Wave 4: end-to-end flow — right-click → split → save preset → reload page → preset restored.

---

## Anti-goals

- ❌ Don't drop the legacy `layout` column in this batch (capture-inbox).
- ❌ Don't add hard cap on splits (DL-6 — toast only).
- ❌ Don't allow deleting built-in presets (DL-12).
- ❌ Don't add cross-doctor preset sharing (capture-inbox).
- ❌ Don't add drag-handle resize logic — already exists in the shell; this batch doesn't touch it.
