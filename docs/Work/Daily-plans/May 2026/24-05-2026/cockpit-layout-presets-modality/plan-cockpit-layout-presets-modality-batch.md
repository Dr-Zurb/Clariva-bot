# Cockpit layout presets + modality escape hatch — R-LAYOUT-UX — 24 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). **One Opus-eligible task** — clpm-04 (the recursive tree mutation engine for split/merge/collapse/hide). Otherwise Auto + Composer.
>
> **Source plan:** [`plan-cockpit-v2.md` §R-LAYOUT-UX](../../../Product%20plans/plan-cockpit-v2.md) (~line 480) — right-click pane context menu (split / merge / collapse / hide), saved layout presets storing the full tree, built-in modality presets in the picker.
>
> **Predecessor batches:** All Phase 2 + cv2-09 (aux-surfaces contracts). Migration 099 (`cockpit_layout_presets` JSONB) is the foundation; this batch extends it via migration 110 to store layout-tree JSON instead of just flat slot widths. **Conflict with cockpit-v2-decommission** on `PatientProfilePage.tsx` — execute this BEFORE decommission.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-cockpit-layout-presets-modality.md`](./Tasks/EXECUTION-ORDER-cockpit-layout-presets-modality.md).

---

## Why this batch

DL-18 of the source plan: **"Power-user freedom. Doctors who want a different arrangement can build one; most never will."** The shipped shell renders a fixed 8-pane Telemed-Video template. Most doctors are happy with it. A vocal minority — high-volume specialists, multi-monitor power users, doctors with chronic-disease cohorts — want to:

1. Split the Plan pane horizontally to compare two prior Rxes side-by-side.
2. Merge the Subjective + Objective panes into one tall scroll when triaging fast.
3. Hide the Investigations chip-row when not using it.
4. Save their custom layout per visit type and reload it next time.
5. Switch to a different built-in template (Telemed-Voice, Telemed-Text, Read-only Review) without page reload.

Today, none of these are possible. Migration 099 already stores flat preset shape `{slots, widths, collapsed}` — but the new shell (csf-* + ppr-*) uses a tree-based layout, not flat slots, so existing presets are incompatible with the new shell and effectively dead.

R-LAYOUT-UX ships:

1. **`<PaneContextMenu>` on right-click** of any pane header — Split horizontally, Split vertically, Merge with sibling, Collapse, Hide.
2. **`layout-presets.ts`** — pure mutation engine for tree operations. Tested to death (recursive tree mutations are easy to get wrong; this is the Opus-eligible scope).
3. **Migration 110** — extends `cockpit_layout_presets` from flat shape to layout-tree JSON. Forward-compatible: legacy 099 presets remain valid but get auto-migrated to tree form on first load.
4. **Built-in templates in the preset picker** — Telemed-Video, Telemed-Voice, Telemed-Text, Read-only Review all appear alongside doctor's custom presets.
5. **"Save current layout" + "Reset to template default"** actions in the preset picker header.
6. **Soft cap of 10 sub-panes** with a friendly tooltip on the 11th split attempt.

This batch closes R-LAYOUT-UX with **6 tasks across 4 waves**, **~16-22h wall-clock single-engineer (~2-3 dev-days)**, **one new migration (110)**, **one Opus task (clpm-04)**.

---

## Decision lock

**DL-1: Layout tree shape.** Recursive node = either a leaf (`{ kind: "pane", paneId: string, size: number }`) or a split (`{ kind: "split", direction: "horizontal" | "vertical", children: LayoutNode[], sizes: number[] }`). `sizes` are percentages summing to 100. Leaves have no children. Persisted as JSONB.

**DL-2: Split inserts a sibling of the same kind.** `Split horizontally` on a leaf: replaces the leaf with `{ kind: "split", direction: "horizontal", children: [origLeaf, newEmptyLeaf], sizes: [50, 50] }`. New leaf's `paneId` = a fresh `"custom-{uuid}"` paneId; the doctor can drag any pane content into it OR the shell renders a "Choose pane content" placeholder.

**DL-3: Merge with sibling collapses two sibling leaves into one.** Removes the doctor-chosen leaf; sibling absorbs its size. If the parent split has only one child after merge, the split degenerates back to a leaf.

**DL-4: Collapse hides content but keeps the pane structurally.** The leaf renders only its header strip (~32px tall); content area zero-height. Re-click the header expands. Per-pane state, persisted with the preset.

**DL-5: Hide removes the leaf entirely.** Parent split rebalances. Hidden panes can be restored via the preset picker's "Show hidden panes" sub-menu listing the original built-in pane ids that aren't currently in the tree.

**DL-6: Soft cap of 10 leaves.** 11th split attempt fires a toast: "Layout limit reached (10 sub-panes max). Merge or hide a pane to add more." NOT a hard error.

**DL-7: Migration 110 extends `cockpit_layout_presets` with a new JSONB column.** Add `layout_tree JSONB` column. Legacy `layout` (flat slot/width shape) remains; new presets write to `layout_tree`. Read-path: if `layout_tree` non-null, use it; else convert legacy `layout` to tree on the fly (a one-line helper). Eventually drop legacy column in a follow-up migration (capture-inbox).

**DL-8: 5-max custom presets per doctor stays.** Migration 099's CHECK constraint already enforces this; migration 110 doesn't change.

**DL-9: Built-in templates are NOT persisted in the DB.** They live in `frontend/lib/patient-profile/templates.tsx`. The preset picker just lists them alongside the doctor's custom rows.

**DL-10: Right-click handler scoped to pane HEADER, not body.** Right-clicking inside, e.g. a textarea, must show the default browser context menu (spellcheck, paste, etc.). Only the pane header's `onContextMenu` is preempted.

**DL-11: Reset-to-template-default is per-preset.** Each saved preset can be reset to its source template's default tree. Reset uses the modality of the preset's saved name (e.g. "My text-consult layout" maps via a `sourceTemplateId` field in the preset JSON).

**DL-12: Built-in modality presets are not deletable.** Custom presets are deletable from the picker. Built-ins are decoration / always-on.

**DL-13: Telemetry — four events.**
- `cockpit_v2.r_layout_ux_context_menu_opened` (per right-click; `{ paneId }`).
- `cockpit_v2.r_layout_ux_tree_mutation` (per split/merge/collapse/hide/restore; `{ op, paneId }`).
- `cockpit_v2.r_layout_ux_preset_saved` (per custom save; `{ paneCount }`).
- `cockpit_v2.r_layout_ux_preset_applied` (per preset apply; `{ presetId, isBuiltIn, paneCount }`).

---

## Phases

### Wave 1 — Backend foundation (1 task, ~2-3h)

- [`task-clpm-01-layout-tree-migration.md`](./Tasks/task-clpm-01-layout-tree-migration.md) — **XS, Auto** — Migration `110_doctor_settings_cockpit_layout_tree.sql`. Adds `layout_tree JSONB` column. Backend service updates: read-path falls back to legacy on null, write-path serializes tree. Unit test + migration test.

### Wave 2 — Layout engine + presets API client (2 tasks, ~6-8h, parallel-safe)

- [`task-clpm-02-layout-tree-api-client.md`](./Tasks/task-clpm-02-layout-tree-api-client.md) — **S, Auto** — Backend service for tree-shaped presets (list/save/delete/reset) extending the existing endpoint. Frontend API client `frontend/lib/api/cockpit-layout-presets-tree.ts`. Built-in template registry `frontend/lib/patient-profile/layout-presets-builtin.ts` listing the four modality defaults.
- [`task-clpm-03-pane-context-menu.md`](./Tasks/task-clpm-03-pane-context-menu.md) — **M, Auto** — New `frontend/components/patient-profile/PaneContextMenu.tsx`. shadcn `ContextMenu` primitive; lists Split H, Split V, Merge w/ sibling, Collapse / Expand, Hide. Wire `onContextMenu` on the pane header in `<Shell>`. Per DL-10 only header, not body.

### Wave 3 — Tree mutation engine (the careful one) (1 task, ~5-6h)

- [`task-clpm-04-layout-tree-mutations.md`](./Tasks/task-clpm-04-layout-tree-mutations.md) — **M-L, Opus-eligible** — New `frontend/lib/patient-profile/layout-tree-mutations.ts`. Pure functions: `splitLeaf(tree, paneId, direction)`, `mergeWithSibling(tree, paneId)`, `collapseLeaf(tree, paneId)`, `hideLeaf(tree, paneId)`, `restoreLeaf(tree, paneId)`. Plus migration helper `legacyFlatToTree(flat: LegacyPresetLayout): LayoutTree`. Tests covering tree depth 1/2/3, edge cases (only-child after merge, collapse on already-collapsed, hide last-visible leaf is rejected, cap-at-10 leaves). **This is the Opus task** — recursive tree mutation correctness is the kind of bug that ships and causes data loss.

### Wave 4 — Preset picker + apply + verification (2 tasks, ~3-4h)

- [`task-clpm-05-preset-picker-and-apply.md`](./Tasks/task-clpm-05-preset-picker-and-apply.md) — **S, Auto** — Modify `PatientProfileHeader.tsx` (or wherever the existing preset picker lives) to list built-in presets alongside custom. Add "Save current layout" + "Reset to template default" actions. Tap a preset → apply via `<PatientProfileShell>`'s setLayoutTree. Soft cap of 10 with toast (DL-6). "Show hidden panes" sub-menu lists missing built-in panes.
- [`task-clpm-06-verification-and-close-out.md`](./Tasks/task-clpm-06-verification-and-close-out.md) — **XS, Composer 2 Fast** — Smoke matrix, 4 telemetry events, COCKPIT.md, roadmap (R-LAYOUT-UX → ✅), capture-inbox.

---

## Cross-cutting acceptance gate

### Structural
- [ ] Migration 110 applied; `layout_tree` column exists.
- [ ] Backend service supports tree-shaped presets (CRUD).
- [ ] `<PaneContextMenu>` exists and is wired in shell.
- [ ] `layout-tree-mutations.ts` exports the five mutation functions + legacy converter.
- [ ] Preset picker lists built-ins + custom.

### Behavior
- [ ] Right-click pane header → context menu opens.
- [ ] Right-click pane body (textarea, etc.) → browser default menu (DL-10).
- [ ] Split H / Split V → tree updates; both children render.
- [ ] Merge → sibling absorbs; only-child split degenerates.
- [ ] Collapse → only header renders.
- [ ] Hide → leaf removed; restorable.
- [ ] 11th split blocked with toast (DL-6).
- [ ] "Save current layout" → POST writes new tree preset.
- [ ] "Reset to template default" → re-applies sourceTemplateId's tree.
- [ ] Switching built-in modality preset works without reload.
- [ ] Legacy 099 presets auto-migrated to tree on first read.
- [ ] Persistence: reload → same tree.

### Quality
- [ ] tsc / lint / test / build / migrate-latest all clean.
- [ ] 4 telemetry events firing.

### Documentation
- [ ] COCKPIT.md updated with tree-shape diagrams + context-menu screenshot description.
- [ ] Roadmap: R-LAYOUT-UX → ✅.
- [ ] Capture-inbox: drop legacy `layout` column (next year); doctor preference for default preset; reorder via drag.

---

## Cost estimate

| Wave | Tasks | Auto | Composer | Opus | Wall-clock |
|---|---|---|---|---|---|
| 1 | clpm-01 | 1 | 0 | 0 | ~2-3h |
| 2 | clpm-02, clpm-03 | 2 | 0 | 0 | ~6-8h (parallel) |
| 3 | clpm-04 | 0 | 0 | 1 | ~5-6h |
| 4 | clpm-05, clpm-06 | 1 | 1 | 0 | ~3-4h |
| **Total** | **6** | **4** | **1** | **1** | **~16-22h (~2-3 dev-days)** |

---

## References

- Source plan §R-LAYOUT-UX.
- Existing migration: [`backend/migrations/099_doctor_cockpit_layout_presets.sql`](../../../../../backend/migrations/099_doctor_cockpit_layout_presets.sql).
- Shell + tree: `frontend/components/patient-profile/Shell.tsx`, `frontend/lib/patient-profile/templates.tsx`.
- Aux-surfaces sentinel: [`frontend/lib/patient-profile/aux-surfaces.ts`](../../../../../frontend/lib/patient-profile/aux-surfaces.ts).
