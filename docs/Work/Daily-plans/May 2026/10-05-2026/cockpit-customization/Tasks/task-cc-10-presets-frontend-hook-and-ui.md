# Task cc-10: Presets frontend — `usePresets()` hook + UI

## 10 May 2026 — Batch [Cockpit customization](../plan-cockpit-customization-batch.md) — Phase D, Lane β step 0 — **M, ~3h**

---

## Task overview

cc-09 ships the API. cc-10 wires it into the cockpit:

1. **`usePresets()` hook** — fetch on mount, cache, refetch after mutations.
2. **Custom-presets section** in the cc-06 dropdown menu — replaces the placeholder cc-06 stub with the real list.
3. **"Save current layout..." dialog** — name input, soft-cap eviction confirm, calls PUT.
4. **"Manage presets" modal** — rename / delete each saved preset.
5. **Preset apply** — clicking a custom preset in the menu calls `handleApplyPreset(preset.layout)` (same path as cc-06's built-ins).

The 5-cap soft-evict UX (CC-D6): when the doctor tries to save a 6th preset, we show a confirm "You already have 5 presets. Saving will evict the oldest ('My triage view'). Continue?" with an explicit oldest-preset name. Confirm → PUT with the new array (oldest dropped, new appended).

**Estimated time:** ~3h.

**Status:** Pending.

**Hard deps:** cc-04 (need `cockpit-layout` shape), cc-06 (the dropdown menu shell to inject custom presets into), cc-09 (the API to call).

**Source:** [plan-cockpit-customization-batch.md § CC-D5, § CC-D6](../plan-cockpit-customization-batch.md#decision-lock-locked-2026-05-10-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (the cc-06 dropdown — extension point).
- `frontend/lib/consultation/cockpit-layout.ts` (the cc-04 types).
- `frontend/lib/api.ts` and `frontend/lib/api-base.ts` (request helpers — confirm the auth-header attach pattern; use the same for the new endpoints).
- `frontend/components/ui/dialog.tsx` (shadcn dialog primitives) — for the "Save layout" and "Manage presets" modals.
- The cc-09 spec for the API contract.

**Estimated turns:** 3–4 turns.

---

## Acceptance criteria

### `usePresets()` hook

- [ ] Create `frontend/hooks/useCockpitPresets.ts`:

  ```ts
  import { useCallback, useEffect, useState } from 'react';
  import { apiGet, apiPut, apiDelete } from '@/lib/api';
  import type { CockpitLayout } from '@/lib/consultation/cockpit-layout';

  export interface CockpitLayoutPreset {
    id: string;
    name: string;
    created_at: string;
    layout: CockpitLayout;
  }

  type PresetsState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; presets: CockpitLayoutPreset[] }
    | { status: 'error'; error: string };

  export interface UseCockpitPresetsResult {
    state: PresetsState;
    /** Save a new preset. If the array is full (5 presets), evicts the oldest first. */
    save: (name: string, layout: CockpitLayout) => Promise<CockpitLayoutPreset>;
    /** Rename an existing preset. */
    rename: (id: string, newName: string) => Promise<void>;
    /** Delete a preset by id. */
    remove: (id: string) => Promise<void>;
    /** Manual refetch. */
    refresh: () => Promise<void>;
    /**
     * Returns the preset that would be evicted if a 6th save happened now.
     * Used by the save-dialog to show the eviction confirm. Null when below cap.
     */
    nextEvictionTarget: () => CockpitLayoutPreset | null;
  }

  const MAX_PRESETS = 5;

  export function useCockpitPresets(): UseCockpitPresetsResult {
    const [state, setState] = useState<PresetsState>({ status: 'idle' });

    const refresh = useCallback(async () => {
      setState({ status: 'loading' });
      try {
        const res = await apiGet<{ presets: CockpitLayoutPreset[] }>('/v1/settings/doctor/cockpit-presets');
        setState({ status: 'ready', presets: res.presets });
      } catch (err) {
        setState({ status: 'error', error: (err as Error).message });
      }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const save = useCallback(
      async (name: string, layout: CockpitLayout) => {
        const current = state.status === 'ready' ? state.presets : [];
        let nextArray = current;
        if (current.length >= MAX_PRESETS) {
          // Evict oldest (lowest created_at).
          const oldest = [...current].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
          nextArray = current.filter((p) => p.id !== oldest.id);
        }
        const newPreset: CockpitLayoutPreset = {
          id: crypto.randomUUID(),
          name: name.trim(),
          created_at: new Date().toISOString(),
          layout,
        };
        const presets = [...nextArray, newPreset];
        const res = await apiPut<{ presets: CockpitLayoutPreset[] }>(
          '/v1/settings/doctor/cockpit-presets',
          { presets },
        );
        setState({ status: 'ready', presets: res.presets });
        return newPreset;
      },
      [state],
    );

    const rename = useCallback(
      async (id: string, newName: string) => {
        if (state.status !== 'ready') return;
        const presets = state.presets.map((p) =>
          p.id === id ? { ...p, name: newName.trim() } : p,
        );
        const res = await apiPut<{ presets: CockpitLayoutPreset[] }>(
          '/v1/settings/doctor/cockpit-presets',
          { presets },
        );
        setState({ status: 'ready', presets: res.presets });
      },
      [state],
    );

    const remove = useCallback(
      async (id: string) => {
        const res = await apiDelete<{ presets: CockpitLayoutPreset[] }>(
          `/v1/settings/doctor/cockpit-presets/${encodeURIComponent(id)}`,
        );
        setState({ status: 'ready', presets: res.presets });
      },
      [],
    );

    const nextEvictionTarget = useCallback((): CockpitLayoutPreset | null => {
      if (state.status !== 'ready') return null;
      if (state.presets.length < MAX_PRESETS) return null;
      return [...state.presets].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    }, [state]);

    return { state, save, rename, remove, refresh, nextEvictionTarget };
  }
  ```

  - **Why optimistic vs trust-the-server?** This hook trusts the server (sets state to whatever PUT returned). PUT is fast (single Supabase upsert), and the server's response is the canonical truth.
  - **Why eviction logic in the hook, not the dialog?** Keeps the dialog dumb. The dialog calls `save(name, layout)` and the hook decides what to evict. The dialog only needs `nextEvictionTarget()` to show the confirm copy.

### Custom-presets section in the cc-06 dropdown

- [ ] In `<CockpitHeader>`, replace the cc-06 placeholder block:

  ```tsx
  // BEFORE (cc-06 stub):
  <DropdownMenuLabel>Custom presets</DropdownMenuLabel>
  <DropdownMenuItem disabled className="text-xs text-muted-foreground">
    No custom presets yet
  </DropdownMenuItem>
  <DropdownMenuItem onSelect={() => onOpenSavePresetDialog()}>
    <Save className="mr-2 h-3 w-3" />
    Save current layout…
  </DropdownMenuItem>

  // AFTER (cc-10):
  <DropdownMenuLabel>Custom presets</DropdownMenuLabel>
  {presetsState.status === 'loading' && (
    <DropdownMenuItem disabled>Loading presets…</DropdownMenuItem>
  )}
  {presetsState.status === 'error' && (
    <DropdownMenuItem disabled className="text-destructive">
      Could not load presets
    </DropdownMenuItem>
  )}
  {presetsState.status === 'ready' && presetsState.presets.length === 0 && (
    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
      No custom presets yet
    </DropdownMenuItem>
  )}
  {presetsState.status === 'ready' && presetsState.presets.map((p) => (
    <DropdownMenuItem
      key={p.id}
      onSelect={() => onApplyPreset(p.layout)}
    >
      {layoutsEqual(currentLayout, p.layout) && <Check className="mr-2 h-3 w-3" />}
      <span className="flex-1 truncate">{p.name}</span>
    </DropdownMenuItem>
  ))}
  <DropdownMenuSeparator />
  <DropdownMenuItem onSelect={() => setSaveDialogOpen(true)}>
    <Save className="mr-2 h-3 w-3" />
    Save current layout…
  </DropdownMenuItem>
  {presetsState.status === 'ready' && presetsState.presets.length > 0 && (
    <DropdownMenuItem onSelect={() => setManageDialogOpen(true)}>
      <Settings className="mr-2 h-3 w-3" />
      Manage presets…
    </DropdownMenuItem>
  )}
  ```

- [ ] Read `presetsState` from a `usePresets()` invocation in `<ConsultationCockpit>` and pass it down to `<CockpitHeader>` as a prop. (The hook can't be called inside `<CockpitHeader>` because the apply-preset path needs the full `setLayout` context that lives in `<ConsultationCockpit>`; centralizing the hook call in the parent keeps the data flow legible.)

### "Save current layout..." dialog

- [ ] Create `frontend/components/consultation/cockpit/SavePresetDialog.tsx`:

  ```tsx
  export interface SavePresetDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentLayout: CockpitLayout;
    onSave: (name: string, layout: CockpitLayout) => Promise<void>;
    nextEvictionTarget: CockpitLayoutPreset | null;
  }

  export default function SavePresetDialog({ open, onOpenChange, currentLayout, onSave, nextEvictionTarget }: SavePresetDialogProps) {
    const [name, setName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      setError(null);
      try {
        await onSave(name, currentLayout);
        onOpenChange(false);
        setName('');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save layout preset</DialogTitle>
            <DialogDescription>
              Save the current cockpit layout so you can recall it later.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="preset-name">Preset name</Label>
              <Input
                id="preset-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Morning OPD"
                maxLength={60}
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground">{name.length}/60</p>
            </div>
            {nextEvictionTarget && (
              <div className="rounded border border-warning/30 bg-warning/10 p-3 text-sm">
                You already have 5 saved presets. Saving will <strong>evict the oldest</strong>:
                <span className="ml-1 font-medium">"{nextEvictionTarget.name}"</span>.
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} type="button">Cancel</Button>
              <Button type="submit" disabled={submitting || !name.trim()}>
                {submitting ? 'Saving…' : nextEvictionTarget ? 'Evict & save' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }
  ```

  - The button label changes from "Save" → "Evict & save" when the eviction confirm is shown — makes the consequence explicit.

### "Manage presets" modal

- [ ] Create `frontend/components/consultation/cockpit/ManagePresetsDialog.tsx`:

  - Lists all custom presets with: name, created-at relative ("3 days ago"), `[Rename]` and `[Delete]` buttons per row.
  - `[Rename]` opens an inline input replacing the name. Enter → calls `rename(id, newName)`. Escape → cancel.
  - `[Delete]` shows a confirm ("Delete preset '<name>'?") then calls `remove(id)`.
  - Below the list: a button "Close" (no save needed — actions are immediate).

### Wire into `<ConsultationCockpit>`

- [ ] In `<ConsultationCockpit>`:

  ```tsx
  const presetsHook = useCockpitPresets();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);

  // ... pass presetsHook.state, setSaveDialogOpen, setManageDialogOpen to <CockpitHeader> ...

  return (
    <>
      <CockpitHeader
        … existing props …
        presetsState={presetsHook.state}
        currentLayout={layout}
        onApplyPreset={handleApplyPreset}
        onApplyColumnOrder={handleApplyColumnOrder}
        onOpenSavePresetDialog={() => setSaveDialogOpen(true)}
        onOpenManagePresetsDialog={() => setManageDialogOpen(true)}
      />
      … existing JSX …
      <SavePresetDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        currentLayout={layout}
        onSave={(name, l) => presetsHook.save(name, l).then(() => undefined)}
        nextEvictionTarget={presetsHook.nextEvictionTarget()}
      />
      <ManagePresetsDialog
        open={manageDialogOpen}
        onOpenChange={setManageDialogOpen}
        presets={presetsHook.state.status === 'ready' ? presetsHook.state.presets : []}
        onRename={presetsHook.rename}
        onDelete={presetsHook.remove}
      />
    </>
  );
  ```

### Tests

- [ ] `frontend/hooks/__tests__/useCockpitPresets.test.ts`:
  - Mocks `apiGet` / `apiPut` / `apiDelete`.
  - `save` with 4 existing presets → calls PUT with 5 presets.
  - `save` with 5 existing presets → calls PUT with 5 presets where the oldest is evicted.
  - `rename` updates the named preset and calls PUT.
  - `remove` calls DELETE and updates state.
  - `nextEvictionTarget` returns null when below cap; returns oldest when at cap.

- [ ] `frontend/components/consultation/cockpit/__tests__/SavePresetDialog.test.tsx`:
  - Submit disabled when name is empty.
  - Char counter updates.
  - Eviction warning only renders when `nextEvictionTarget` is non-null.
  - Submit calls `onSave(name, layout)` and closes the dialog on success.

- [ ] `frontend/components/consultation/cockpit/__tests__/ManagePresetsDialog.test.tsx`:
  - Rename inline → calls onRename.
  - Delete → confirms → calls onDelete.

- [ ] `pnpm --filter frontend tsc --noEmit` clean. Lint clean. All tests pass.

### Manual verification

- [ ] Sign in as a doctor with 0 presets. Open cockpit. Layout dropdown → "Custom presets" section says "No custom presets yet" + "Save current layout..."
- [ ] Click "Save current layout...". Dialog opens. Type "Morning OPD". Save. Dialog closes. Reopen the dropdown — "Morning OPD" appears in custom presets, with a check (since the current layout still matches what was saved).
- [ ] Apply a built-in (Triage). Now "Morning OPD" loses its check. Click "Morning OPD" → cockpit snaps back to the saved layout.
- [ ] Save 4 more presets. Now there are 5 total. Try to save a 6th — confirm shows "Saving will evict the oldest ('Morning OPD')". Cancel → no save. Confirm → "Morning OPD" disappears from the list, the new preset appears.
- [ ] Open "Manage presets...". Rename one. Delete one. Confirm changes round-trip across browser refresh.

---

## Out of scope

- **Built-in preset hotkeys (Cmd/Ctrl+Shift+1/2/3)** — that's cc-11.
- **Custom preset hotkeys** — explicitly NOT shipping per CC-D5 ("hotkeys for the 3 built-ins only").
- **Per-doctor preset import / export / sharing** — out of scope.
- **Optimistic UI updates** — `usePresets` trusts the server response. If perceived latency is poor, optimistic updates can land in a polish task.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (~50 LOC delta — replace cc-06 stub block, add new props).
- `frontend/components/consultation/ConsultationCockpit.tsx` (~30 LOC delta — host the hook + dialogs).

**New:**
- `frontend/hooks/useCockpitPresets.ts` (~150 LOC).
- `frontend/components/consultation/cockpit/SavePresetDialog.tsx` (~120 LOC).
- `frontend/components/consultation/cockpit/ManagePresetsDialog.tsx` (~150 LOC).
- `frontend/hooks/__tests__/useCockpitPresets.test.ts` (~150 LOC).
- `frontend/components/consultation/cockpit/__tests__/SavePresetDialog.test.tsx` (~80 LOC).
- `frontend/components/consultation/cockpit/__tests__/ManagePresetsDialog.test.tsx` (~80 LOC).

---

## Notes / open decisions

1. **Where does the hook live?** Top-level `<ConsultationCockpit>` calls `useCockpitPresets`. `<CockpitHeader>` receives the state as a prop. This avoids two component trees both fetching presets. The cost is one extra prop; the benefit is single source of truth.
2. **Why no debounce on save?** Save is a deliberate action (dialog submit). No spam path to debounce. Rename / delete also originate from a deliberate user action.
3. **Stale-while-revalidate?** Not needed — the dataset is tiny and the read is fast. We don't need to show stale data while a refetch is in flight.
4. **What if the doctor's session JWT expires while saving?** The shared API helpers in `frontend/lib/api.ts` already handle 401 → re-login flow. The hook doesn't need special handling.
5. **Should the eviction be configurable (oldest vs least-used)?** Oldest-by-`created_at` for now. "Least used" requires tracking apply count, which means another column. YAGNI — revisit if doctors complain.

---

## References

- **Affected files:**
  - `frontend/components/consultation/cockpit/CockpitHeader.tsx`
  - `frontend/components/consultation/ConsultationCockpit.tsx`
  - new `frontend/hooks/useCockpitPresets.ts`
  - new `frontend/components/consultation/cockpit/SavePresetDialog.tsx`
  - new `frontend/components/consultation/cockpit/ManagePresetsDialog.tsx`
- **API contract:** [`task-cc-09-presets-backend-service-endpoints.md`](./task-cc-09-presets-backend-service-endpoints.md).
- **Predecessor:** [`task-cc-06-layout-dropdown-menu.md`](./task-cc-06-layout-dropdown-menu.md) (the dropdown shell).
- **Successor:** [`task-cc-11-presets-built-in-hotkeys.md`](./task-cc-11-presets-built-in-hotkeys.md).

---

**Owner:** TBD
**Created:** 2026-05-10
**Status:** Pending
