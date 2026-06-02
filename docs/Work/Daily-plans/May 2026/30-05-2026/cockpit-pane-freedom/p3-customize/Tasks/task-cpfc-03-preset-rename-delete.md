# cpfc-03 · Preset rename + delete (API client → hook → `<PresetPicker>`)

> **Wave 2** of [p3-cockpit-pane-freedom-customize](../plan-p3-cockpit-pane-freedom-customize-batch.md). Finishes the preset CRUD loop — rename + delete, surfaced in customize mode. Reuses shipped endpoints (P3-DL-4); no migration, no backend change.

| **Size** | M | **Model** | Auto | **Wave** | 2 | **Depends on** | cpfc-02 | **Blocks** | cpfc-04 |

---

## Why this task

Doctors can save, apply, and reset custom presets — but cannot **rename** a mistyped preset or **delete** one they no longer use. Both endpoints already ship:

- **Delete** — `deletePreset(token, id)` is already exported from `cockpit-layout-presets-tree.ts` and hits the live `DELETE /api/v1/settings/doctor/cockpit-presets/:id` route.
- **Rename** — there is no PATCH, but the **full-array `PUT`** route (`putWireRows`) is live. Rename is a read-modify-write: list → change the one row's `name` → `PUT` the whole array back (P3-DL-4).

This task adds `renamePreset` to the client, exposes `deletePreset` + `renamePreset` on `useLayoutTreePresets`, and surfaces rename/delete affordances on the "My presets" rows in `<PresetPicker>` — **only when `customizeMode` is on**.

---

## What to do

### 1. `renamePreset` in `frontend/lib/api/cockpit-layout-presets-tree.ts`

`fetchAllWireRows` and `putWireRows` are private in this module — the new exported fn reuses them:

```ts
/**
 * Rename a custom preset (read-modify-write through the full-array PUT).
 * There is no PATCH endpoint; the server replaces the whole array (P3-DL-4).
 * Trims + length-caps the name like savePresetTree.
 */
export async function renamePreset(
  token: string,
  id: string,
  name: string,
): Promise<CockpitLayoutPresetTree> {
  const trimmed = name.trim();
  if (!trimmed) {
    const err = new Error("Preset name cannot be empty") as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  const allRows = await fetchAllWireRows(token);
  const idx = allRows.findIndex((r) => r.id === id);
  if (idx < 0) {
    const err = new Error("Preset not found") as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  const next = allRows.map((r, i) => (i === idx ? { ...r, name: trimmed.slice(0, 60) } : r));
  const saved = await putWireRows(token, next);
  const persisted = saved.map(wireRowToPreset).find((p) => p?.id === id);
  if (!persisted) throw new Error("Renamed preset was not returned after upsert");
  return persisted;
}
```

> Preserves every other field on the row (`layout_tree`, `sourceTemplateId`, `created_at`) — only `name` changes. This is the key correctness property: a rename must not drop the layout or reset the template link.

### 2. Extend `frontend/hooks/useLayoutTreePresets.ts`

Add to `UseLayoutTreePresetsResult`:

```ts
deletePreset: (id: string) => Promise<void>;
renamePreset: (id: string, name: string) => Promise<CockpitLayoutPresetTree>;
```

Implement (import the two client fns; `getToken` + `refresh` already exist):

```ts
const deletePreset = useCallback(
  async (id: string): Promise<void> => {
    const token = await getToken();
    await deletePresetApi(token, id);
    await refresh();
  },
  [refresh],
);

const renamePreset = useCallback(
  async (id: string, name: string): Promise<CockpitLayoutPresetTree> => {
    const token = await getToken();
    const updated = await renamePresetApi(token, id, name);
    await refresh();
    return updated;
  },
  [refresh],
);
```

> Import as `deletePreset as deletePresetApi` / `renamePreset as renamePresetApi` to avoid shadowing the hook's own names. Add both to the returned object.

### 3. Surface rename/delete in `frontend/components/patient-profile/PresetPicker.tsx`

Add to `PresetPickerProps`:

```ts
/** cpfc-03: when true, "My presets" rows show rename + delete affordances. */
customizeMode?: boolean;
onDeletePreset?: (id: string) => void | Promise<void>;
onRenamePreset?: (id: string, name: string) => void | Promise<void>;
```

In the `customPresets.map(...)` row, **when `customizeMode` is on**, render a pencil (rename → inline `<Input>`) and a trash (delete → two-click confirm) next to the existing `RotateCcw` reset button. Reuse the existing per-row button pattern (`e.preventDefault(); e.stopPropagation();` so selecting doesn't close the menu / apply the preset):

```tsx
{customizeMode && (
  <>
    {/* Rename: toggles an inline input for this row id */}
    <button
      type="button"
      className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRenamingId(preset.id); setRenameValue(preset.name); }}
      aria-label={`Rename ${preset.name}`}
    >
      <Pencil className="h-3 w-3" aria-hidden />
    </button>
    {/* Delete: first click arms, second click within the row confirms */}
    <button
      type="button"
      className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
      onClick={(e) => {
        e.preventDefault(); e.stopPropagation();
        if (confirmingDeleteId === preset.id) { void onDeletePreset?.(preset.id); setConfirmingDeleteId(null); }
        else setConfirmingDeleteId(preset.id);
      }}
      aria-label={confirmingDeleteId === preset.id ? `Confirm delete ${preset.name}` : `Delete ${preset.name}`}
    >
      {confirmingDeleteId === preset.id ? <Check className="h-3 w-3 text-destructive" aria-hidden /> : <Trash2 className="h-3 w-3" aria-hidden />}
    </button>
  </>
)}
```

When `renamingId === preset.id`, replace the row's `<span>{preset.name}</span>` with an `<Input>` bound to `renameValue` that commits on Enter (`void onRenamePreset?.(preset.id, renameValue); setRenamingId(null);`) and cancels on Escape/blur. Add `Pencil`, `Trash2` to the `lucide-react` import (`Check` is already imported); add `renamingId` / `renameValue` / `confirmingDeleteId` `useState`s.

> At rest (`customizeMode` falsy / undefined), the rows render **exactly as today** — the new buttons + inline edit are entirely behind the `customizeMode` guard. Deleting the **active** preset must not crash: `isCustomActive` already tolerates a row vanishing from `customPresets`, and delete does NOT change the on-screen layout (it only removes the saved snapshot).

### 4. Page handlers + `layoutTreeUx` extension in `PatientProfilePage.tsx`

```tsx
const handleDeleteLayoutTreePreset = useCallback(
  async (id: string) => {
    await layoutTreePresets.deletePreset(id);
    trackCockpitPaneFreedomPresetCrud({ op: "delete", presetCount: layoutTreePresets.presets.length - 1 });
  },
  [layoutTreePresets],
);

const handleRenameLayoutTreePreset = useCallback(
  async (id: string, name: string) => {
    await layoutTreePresets.renamePreset(id, name);
    trackCockpitPaneFreedomPresetCrud({ op: "rename", presetCount: layoutTreePresets.presets.length });
  },
  [layoutTreePresets],
);
```

Extend the `layoutTreeUx` memo (and its deps) with:

```tsx
customizeMode,
onDeletePreset: handleDeleteLayoutTreePreset,
onRenamePreset: handleRenameLayoutTreePreset,
```

### 5. Telemetry in `frontend/lib/patient-profile/telemetry.ts`

```tsx
export function trackCockpitPaneFreedomPresetCrud(payload: {
  op: "rename" | "delete";
  presetCount: number;
}): void {
  track("cockpit_pane_freedom.preset_crud", payload);
}
```

### 6. Verify

```powershell
cd frontend
npx tsc --noEmit
npm test lib/api/__tests__/cockpit-layout-presets-tree.test.ts hooks/__tests__/useLayoutTreePresets.test.ts
npm run lint
```

Test rows: `renamePreset` changes only `name` + preserves `layout_tree`/`sourceTemplateId`; rejects empty name; 404 on missing id. Hook `deletePreset`/`renamePreset` call the client + `refresh`.

---

## Acceptance gate

- [x] `renamePreset(token, id, name)` in the API client — read-modify-write via the existing full-array `PUT` (P3-DL-4); trims + 60-char caps; preserves all non-name fields; rejects empty; 404 on missing id.
- [x] `useLayoutTreePresets` exposes `deletePreset(id)` + `renamePreset(id, name)`, each calling `refresh()` after.
- [x] `<PresetPicker>` "My presets" rows show rename (inline input) + delete (two-click confirm) **only when `customizeMode` is on**; at rest the rows are byte-identical to today.
- [x] Rename enforces the same name constraints as save (non-empty, ≤60).
- [x] Deleting the active preset doesn't crash the picker; delete does not change the on-screen layout.
- [x] `layoutTreeUx` carries `customizeMode` + `onDeletePreset` + `onRenamePreset`.
- [x] `cockpit_pane_freedom.preset_crud` `{ op, presetCount }` fires on rename + delete.
- [x] `cd frontend; npx tsc --noEmit` + new client/hook test rows clean.

---

## Anti-goals

- ❌ Don't add a PATCH endpoint or migration — rename is read-modify-write through the existing PUT (P3-DL-4).
- ❌ Don't change `MAX_PRESETS` (5) or the server-side validation.
- ❌ Don't show rename/delete at rest — strictly behind `customizeMode`.
- ❌ Don't change the on-screen layout when deleting a preset — it only removes the saved snapshot.
- ❌ Don't let a rename drop `layout_tree` / `sourceTemplateId` / `created_at` — only `name` changes.
- ❌ Don't pull in a heavyweight confirm dialog — the two-click inline confirm is sufficient and keeps the dropdown open.

---

## Risks (executor-facing)

- **Read-modify-write clobber.** Two tabs editing presets concurrently could clobber. Single-doctor surface → low risk. Optionally call `layoutTreePresets.refresh()` immediately before a rename to narrow the window. Don't build optimistic-locking — out of scope.
- **Field preservation.** The single biggest bug surface: a rename that resets `layout_tree` to undefined silently destroys the preset's layout. The `{ ...r, name }` spread preserves it — verify with the test row that asserts `layout_tree` is unchanged after rename.
- **Menu interaction.** Rename/delete buttons live inside `DropdownMenuItem`s; without `e.preventDefault()` + `e.stopPropagation()`, a click would select the item (apply the preset) and/or close the menu. Mirror the existing `RotateCcw` reset button's handlers exactly.
- **Active-preset deletion.** After deleting the active preset, `isCustomActive` must not throw on the now-missing row (it iterates `customPresets`, which refreshes to exclude it — fine). Smoke this explicitly.
