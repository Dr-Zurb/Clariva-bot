# rxf-04 · Favorites service + side-sheet

> **Wave 2** of [rx-polish-favorites](../plan-rx-polish-favorites-batch.md). Full-stack: CRUD endpoints + side-sheet UI + chip-strip component.

| Property | Value |
|---|---|
| **Size** | M | **Model** | Auto | **Wave** | 2 | **Depends on** | rxf-02 (table) | **Blocks** | rxf-06 (wire chip-strip into PlanSection) |

---

## Goal

End-to-end favorites surface: backend CRUD + frontend API client + side-sheet management UI + horizontal chip-strip component (placeholder rendering — wire-up lives in rxf-06).

---

## What to do

### 1. Backend service `backend/src/services/doctor-drug-favorites-service.ts`

CRUD pattern, returns `Result<...>`. Operations:

- `listFavorites(doctorId): Favorite[]` — `SELECT * ORDER BY created_at DESC` (RLS filters automatically).
- `createFavorite(doctorId, { name, template }): Favorite` — guards 30-max via `SELECT COUNT(*)` first; rejects with 400 if at cap. Validates `template` shape via Zod (matches `MedicineRowValue`).
- `updateFavorite(doctorId, id, { name?, template? }): Favorite` — Zod-validates patch.
- `deleteFavorite(doctorId, id): void` — RLS naturally guards cross-doctor delete.

### 2. Backend routes `backend/src/api/routes/doctor-drug-favorites.ts`

```ts
GET    /api/v1/doctors/me/drug-favorites
POST   /api/v1/doctors/me/drug-favorites
PATCH  /api/v1/doctors/me/drug-favorites/:id
DELETE /api/v1/doctors/me/drug-favorites/:id
```

Each route resolves `doctorId` from session, delegates to service, returns JSON.

Tests in `backend/tests/unit/services/doctor-drug-favorites-service.test.ts`:
- create / read / update / delete happy paths.
- 30-max guard rejects 31st.
- RLS: doctor B cannot read / mutate doctor A's favorites.
- Zod validation rejects malformed `template`.

### 3. Frontend API client `frontend/lib/api/doctor-drug-favorites.ts`

```ts
export interface DoctorDrugFavorite {
  id: string;
  name: string;
  template: MedicineRowValue;
  createdAt: string;
  updatedAt: string;
}

export async function listFavorites(token: string): Promise<DoctorDrugFavorite[]>;
export async function createFavorite(token: string, payload: { name: string; template: MedicineRowValue }): Promise<DoctorDrugFavorite>;
export async function updateFavorite(token: string, id: string, patch: Partial<{ name: string; template: MedicineRowValue }>): Promise<DoctorDrugFavorite>;
export async function deleteFavorite(token: string, id: string): Promise<void>;
```

### 4. `<FavoritesSideSheet>` component `frontend/components/cockpit/rx/favorites/FavoritesSideSheet.tsx`

Uses cv2-09's `SideSheetAnchor` contract. Renders:
- List of favorites with name + tiny preview (`PCM 500mg · TID · 5d`).
- Per-row `[Edit name]` (inline) + `[Delete]` (with confirm).
- Header CTA: closes the sheet.
- Empty state: "No favorites yet. Save one from any complete medicine row."

Anchor registered at app shell mount (similar to cce-01's side-sheet registration). `useSideSheet().open('rx-favorites')` opens it.

### 5. `<FavoritesChipStrip>` component `frontend/components/cockpit/rx/favorites/FavoritesChipStrip.tsx`

Props: `{ favorites: DoctorDrugFavorite[]; onApply: (fav: DoctorDrugFavorite) => void; onSaveCurrentRow: () => void; onManage: () => void; }`.

Render:

```
⭐ [PCM fever] [Pantop GERD] [Azithro] [+ Save current row]  [Manage]
```

- Horizontal scroll if many favorites.
- `[+ Save current row]` only shown when `<PlanSection>` has an active editor row that is complete (gated by parent — pass a `canSaveCurrent: boolean` prop).
- `[Manage]` opens the side-sheet.
- Cold-start (zero favorites): show DL-5 hint text inline.

### 6. Tests

- Backend: service-level tests above.
- Frontend: `FavoritesChipStrip.test.tsx` — chip-tap fires `onApply`; save-button fires `onSaveCurrentRow`; cold-start hint visible.
- Frontend: `FavoritesSideSheet.test.tsx` — renders list; delete-with-confirm; edit-name inline.

### 7. Verify

```powershell
pnpm --filter backend test
pnpm --filter frontend test
pnpm --filter backend lint && pnpm --filter frontend lint
```

---

## Acceptance gate

- [x] Backend CRUD endpoints work.
- [x] 30-max guard.
- [x] RLS isolation.
- [x] `<FavoritesSideSheet>` lists + edits + deletes.
- [x] `<FavoritesChipStrip>` renders chips + Save / Manage CTAs.
- [x] Cold-start hint per DL-5.

---

## Anti-goals

- ❌ Don't wire the chip-strip into `<PlanSection>` here — rxf-06 owns that. This task just builds the components in isolation.
- ❌ Don't add drag-to-reorder favorites in v1 — capture-inbox if needed.
- ❌ Don't add cross-doctor / clinic-wide sharing — out of scope.
- ❌ Don't merge `[+ Save current row]` and `[Manage]` into one menu — keep them visually distinct.

---

## Notes

- **Side-sheet anchor id:** use a stable string like `"rx-favorites"`. The host (`<SideSheetHost>` from cce-01) renders one sheet at a time; opening rx-favorites closes any other open sheet (e.g. previous-Rx from rx-polish-side-sheet).
- **`<FavoritesChipStrip>` is a presentational component** — no API calls inside. Parent (`<PlanSection>` in rxf-06) wires data + handlers.
- **Save flow inline:** when the doctor clicks `[+ Save current row]`, prompt inline (small text input + `[Save]` / `[Cancel]`) for the favorite's name. Auto-suggest the drug name as default.
