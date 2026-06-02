# rxf-06 · Wire chip-strip into PlanSection + apply handler

> **Wave 3** of [rx-polish-favorites](../plan-rx-polish-favorites-batch.md). Production wire-up.

| Property | Value |
|---|---|
| **Size** | S | **Model** | Auto | **Wave** | 3 | **Depends on** | rxf-04 (components exist) + rxd-03 (active-row tracking) | **Blocks** | rxf-07 |

---

## Goal

Mount `<FavoritesChipStrip>` above the medicine list. Tap-chip → append pre-filled row + make it active. `[+ Save current row]` → POST to favorites endpoint. `[Manage]` → open `<FavoritesSideSheet>`.

---

## What to do

### 1. Modify `frontend/components/cockpit/rx/sections/PlanSection.tsx`

Add favorites data hook:

```ts
const { data: favorites = [], refetch: refetchFavorites } = useFavorites(token);
const sideSheet = useSideSheet();
```

Render the chip strip per DL-9 — above the medicine list, below safety/narrow-merge:

```tsx
<FavoritesChipStrip
  favorites={favorites}
  canSaveCurrent={
    activeRowIndex !== null &&
    isMedicineRowComplete(medicines[activeRowIndex])
  }
  onApply={handleApplyFavorite}
  onSaveCurrentRow={handleSaveCurrentRowAsFavorite}
  onManage={() => sideSheet.open("rx-favorites")}
/>
```

### 2. Implement `handleApplyFavorite`

```ts
function handleApplyFavorite(fav: DoctorDrugFavorite) {
  const nextIndex = medicines.length;
  appendMedicine({ ...emptyMedicineRowValue(), ...fav.template });
  setActiveRowIndex(nextIndex);
  trackCockpitV2RRxPolishFavoriteApplied({
    favoriteId: fav.id,
    fromCount: medicines.length,
  });
}
```

The new row inherits the favorite's full template (drug + dosage + route + frequency + duration + instructions + drug_master_id). Active-row tracking from rxd-03 makes it the editor.

### 3. Implement `handleSaveCurrentRowAsFavorite`

Inline-prompt for a name (uses an inline input rendered by `<FavoritesChipStrip>` when `[+ Save current row]` is clicked, OR a small `prompt()`-style helper). On submit:

```ts
async function handleSaveCurrentRowAsFavorite(name: string) {
  if (activeRowIndex === null) return;
  const value = medicines[activeRowIndex];
  if (!isMedicineRowComplete(value)) return;
  await createFavorite(token, { name, template: value });
  await refetchFavorites();
}
```

### 4. Tests `frontend/components/cockpit/rx/sections/__tests__/PlanSection.test.tsx` (extend)

- `<FavoritesChipStrip>` mounts above the medicine list.
- Tapping a favorite chip appends a row pre-filled from the template.
- The new row becomes active editor.
- `[+ Save current row]` writes a favorite + refreshes the chip strip.
- `[Manage]` opens the side-sheet.
- Cold-start (zero favorites) shows hint per DL-5.

### 5. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test
```

---

## Acceptance gate

- [x] Chip strip renders at correct position per DL-9.
- [x] Apply flow works end-to-end.
- [x] Save flow works end-to-end.
- [x] Manage opens side-sheet.
- [x] Tests pass.

---

## Anti-goals

- ❌ Don't show the chip strip if there's no active draft yet (rxd-03's `medicines.length === 0` is fine; chip strip still renders so doctors can start a draft from a favorite tap).
- ❌ Don't add a "delete row, restore favorite" undo — out of scope.
- ❌ Don't auto-save on edit of an applied favorite back to the favorite — applied → independent draft row.
