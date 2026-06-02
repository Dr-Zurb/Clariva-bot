# clpm-05 · Preset picker + apply

> **Wave 4** of [cockpit-layout-presets-modality](../plan-cockpit-layout-presets-modality-batch.md). Ties tree mutations into the existing preset picker.

| **Size** | S | **Model** | Auto | **Wave** | 4 | **Depends on** | clpm-04 | **Blocks** | clpm-06 |
| **Status** | ✅ Done (2026-05-24) |

---

## What to do

### 1. Modify the existing preset picker

Find: search `PresetPicker` or wherever the existing flat-preset list lives — likely in `PatientProfileHeader.tsx` or a small `cockpit-layout` component.

Render two sections:

```
─── Built-in ────────────────
☆ Telemed (Video)        ← active
☆ Telemed (Voice)
☆ Telemed (Text)
☆ Read-only Review

─── My presets ──────────────
★ Chronic care
★ Quick triage
[+ Save current layout]
[Reset to template default]

─── Hidden panes ────────────
[Restore: Subjective]
[Restore: Investigations]
```

Built-in section reads from `BUILT_IN_PRESETS` (clpm-02). My presets reads via `listPresetsTree` API client. Hidden panes computes the diff between the source template's pane ids and the currently-rendered tree's pane ids.

### 2. Apply preset handler

```ts
function handleApplyPreset(preset: BuiltInLayoutPreset | CockpitLayoutPresetTree) {
  const tree = preset.layoutTree;
  if (!tree) return;
  setLayoutTree(tree);
  trackCockpitV2RLayoutUxPresetApplied({
    presetId: preset.id,
    isBuiltIn: preset.id.startsWith("builtin-"),
    paneCount: countLeaves(tree),
  });
}
```

### 3. Save current layout handler

```ts
async function handleSaveCurrentLayout() {
  const name = window.prompt("Name this layout:")?.trim();
  if (!name) return;
  await savePresetTree(token, { name, sourceTemplateId: currentTemplateId, layoutTree });
  await refetchPresets();
  trackCockpitV2RLayoutUxPresetSaved({ paneCount: countLeaves(layoutTree) });
}
```

Inline `<input>` is nicer than `window.prompt`; use a small `<Popover>` with `<Input>` + Save/Cancel.

### 4. Reset to template default

```ts
function handleResetToTemplate(preset: CockpitLayoutPresetTree) {
  const builtin = BUILT_IN_PRESETS.find((p) => p.id === preset.sourceTemplateId);
  if (!builtin) return;
  setLayoutTree(builtin.layoutTree);
}
```

### 5. Wire mutation handlers in `<Shell>`

The handlers that clpm-03 stubbed (`handleSplit`, `handleMerge`, `handleToggleCollapsed`, `handleHide`) now call clpm-04's mutation functions:

```ts
function handleSplit(paneId: string, direction: "horizontal" | "vertical") {
  const result = splitLeaf(layoutTree, paneId, direction, `custom-${crypto.randomUUID()}`);
  if (!result.ok) {
    if (result.reason === "cap-reached") {
      toast.error("Layout limit reached (10 sub-panes max). Merge or hide a pane to add more.");
    }
    return;
  }
  setLayoutTree(result.tree);
  trackCockpitV2RLayoutUxTreeMutation({ op: `split-${direction}`, paneId });
}
// similarly merge / collapse / hide / restore
```

### 6. Hidden-panes sub-menu

Compute hidden = `template.allPaneIds - currentTree.allPaneIds`. List each as a `[Restore: ...]` action. Tapping calls `restoreLeaf` mutation.

### 7. Tests

- `PresetPicker.test.tsx` (mod or new): lists both sections; built-ins not deletable; apply fires mutation; save creates new preset.
- `Shell.test.tsx` (mod): split/merge/collapse/hide handlers route through clpm-04 + update tree.

### 8. Verify

```powershell
pnpm --filter frontend tsc --noEmit && pnpm --filter frontend lint && pnpm --filter frontend test
```

---

## Acceptance gate

- [x] Picker lists built-ins + custom + hidden-panes sub-menu.
- [x] Apply works for both built-ins and custom.
- [x] Save current layout works (max 5 enforced by backend; frontend hides button at cap).
- [x] Reset to template default works.
- [x] All 4 telemetry events firing.
- [x] Soft cap of 10 leaves: toast on 11th split.

---

## Anti-goals

- ❌ Don't allow renaming / deleting built-ins (DL-12).
- ❌ Don't persist active-preset to localStorage in v1 — server is the source of truth; client just defaults to template on fresh load.
- ❌ Don't add per-doctor default preset in v1 — capture-inbox.
