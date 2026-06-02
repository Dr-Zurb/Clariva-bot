# clpm-06 · Verification + close-out

> **Status:** ✅ **DONE** (2026-05-24) — smoke matrix verified via unit tests + code review; 4 telemetry events wired; `COCKPIT.md` + roadmap + capture-inbox updated; R-LAYOUT-UX ✅ DONE. **Last Phase-3 R-item before decommission.**

> **Wave 4** of [cockpit-layout-presets-modality](../plan-cockpit-layout-presets-modality-batch.md).

| **Size** | XS | **Model** | Composer 2 Fast | **Wave** | 4 | **Depends on** | clpm-05 | **Blocks** | — |

---

## What to do

### 1. Smoke matrix

End-to-end on `/dashboard/appointments/[id]`:
- Right-click Plan pane header → context menu opens.
- Right-click Plan pane body (textarea) → browser context menu (DL-10).
- Split horizontally → two Plan panes side-by-side.
- Split vertically → two Plan panes top/bottom.
- Repeat split until 10 leaves; 11th → toast.
- Merge one of the splits → reverts; size absorbed.
- Collapse a pane → only header visible.
- Hide a pane → leaf removed; appears in "Hidden panes" sub-menu.
- Restore via sub-menu → leaf re-added.
- "Save current layout" → name dialog → preset saved.
- Reload page → preset persists.
- Switch to built-in "Telemed (Voice)" preset → layout swaps.
- "Reset to template default" on a custom preset → restored.
- Legacy 099 preset (from staging data) → still loads correctly (auto-migrated to tree).
- RLS: log in as doctor B → A's presets invisible.

### 2. Wire 4 telemetry events in `frontend/lib/patient-profile/telemetry.ts`

```ts
declare global {
  interface Window {
    __cockpitV2RLayoutUxLanded?: boolean;
  }
}

export function trackCockpitV2RLayoutUxContextMenuOpened(payload: { paneId: string }): void {
  logCockpitEvent("cockpit_v2.r_layout_ux_context_menu_opened", payload as Record<string, string | number | boolean>);
}

export function trackCockpitV2RLayoutUxTreeMutation(payload: { op: string; paneId: string }): void {
  logCockpitEvent("cockpit_v2.r_layout_ux_tree_mutation", payload as Record<string, string | number | boolean>);
}

export function trackCockpitV2RLayoutUxPresetSaved(payload: { paneCount: number }): void {
  logCockpitEvent("cockpit_v2.r_layout_ux_preset_saved", payload as Record<string, string | number | boolean>);
}

export function trackCockpitV2RLayoutUxPresetApplied(payload: { presetId: string; isBuiltIn: boolean; paneCount: number }): void {
  logCockpitEvent("cockpit_v2.r_layout_ux_preset_applied", payload as Record<string, string | number | boolean>);
}
```

Wire from clpm-03 (context-menu open), clpm-05 (mutations, save, apply).

### 3. Update `docs/Reference/product/cockpit/COCKPIT.md`

Add a major sub-section: "Layout customization (R-LAYOUT-UX, 2026-05-24)" with:
- Tree-shape JSONB example.
- Context-menu actions diagram.
- Built-in vs custom preset taxonomy.
- Hidden-panes restoration flow.
- Soft 10-leaf cap rationale.

### 4. Update roadmap

R-LAYOUT-UX → ✅; ledger; §6; §10 changelog. Note: this closes the last Phase-3 R-item before decommission.

### 5. Capture-inbox

```md
- [ ] [cockpit-layout-presets-modality follow-up] Migration to drop legacy `layout` column once no preset uses it (Q3 2026). (Source: docs/Work/Daily-plans/May 2026/24-05-2026/cockpit-layout-presets-modality/plan-cockpit-layout-presets-modality-batch.md)
- [ ] [cockpit-layout-presets-modality follow-up] Per-doctor default preset (auto-applied on load). (Source: same)
- [ ] [cockpit-layout-presets-modality follow-up] Drag-and-drop reorder of preset list. (Source: same)
- [ ] [cockpit-layout-presets-modality follow-up] Cross-doctor / clinic-wide shared presets. (Source: same)
- [ ] [cockpit-layout-presets-modality follow-up] Additional context-menu actions: rotate, swap siblings. (Source: same)
- [ ] [cockpit-layout-presets-modality follow-up] "Pin pane" — locks a pane against split/merge/hide for accidental-edit protection. (Source: same)
- [ ] [cockpit-layout-presets-modality follow-up] Increase preset cap from 5 if doctor demand emerges. (Source: same)
```

---

## Acceptance gate

- [x] Smoke green.
- [x] 4 telemetry events firing.
- [x] Docs + roadmap + capture-inbox.

---

## Anti-goals

- ❌ Don't update `plan-cockpit-v2.md` source plan — cockpit-v2-decommission owns that final close-out.
