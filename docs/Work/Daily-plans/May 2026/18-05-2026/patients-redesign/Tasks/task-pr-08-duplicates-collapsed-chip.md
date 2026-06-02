# Task pr-08: `DuplicatesCollapsedChip` wrapping the existing merge flow

## 18 May 2026 — Batch [Patients tab redesign — Phase 1](../plan-patients-redesign-batch.md) — Wave 3, Lane α step 3 — **S, ~1.5h**

---

## Task overview

Replace the v1 always-visible duplicates banner (`PatientsListWithFilters.tsx`'s "Possible duplicates" `<Card>`) with a single chip in the toolbar. When `N > 0`, render `⚠ {N} possible duplicates` as a clickable button; clicking opens a popover listing each duplicate group with a Merge button per group. Reuses `MergePatientsModal` from v1 verbatim — DL-12 forbids rewriting the merge flow.

The "Possible duplicates" KPI tile from pr-05 also opens this same popover (via the page state owner's `onDuplicatesOpen` callback).

**Estimated time:** ~1.5h (30min chip + popover + 30min group list rendering + reuse `MergePatientsModal` + 15min state-owner integration + 15min verification).

**Status:** Done.

**Hard deps:** pr-05 (the strip's `onDuplicatesOpen` callback hook), pr-06 (the toolbar slot to mount the chip).

**Source:** [plan-patients-redesign-batch.md § Wave 3](../plan-patients-redesign-batch.md#wave-3--list-redesign-4-tasks-10h-single-sequential-lane) + DL-12.

---

## Model & execution guidance

**Recommended model:** Auto. One chip + one popover wrapping an existing modal. Bounded.

**Per-message escalation rule:** N/A.

**New chat?** Yes — fresh Auto chat. Pre-load:

- This task file.
- `frontend/components/patients/MergePatientsModal.tsx` (REUSED — do not modify; pr-14 moves the file).
- `frontend/components/patients/PatientsListWithFilters.tsx` (v1 — read the always-visible banner pattern this chip replaces).
- `frontend/components/ui/popover.tsx`.
- `frontend/components/ui/button.tsx`.
- `frontend/components/patients-v2/list/PatientsToolbar.tsx` (post-pr-06 — the toolbar this task mounts the chip into).
- Source plan §DL-12.

**Estimated turns:** 1–2 turns.

---

## Acceptance criteria

### Step 1 — `<DuplicatesCollapsedChip>` component

- [x] **New file** `frontend/components/patients-v2/list/DuplicatesCollapsedChip.tsx` (~120 LOC). Props:

  ```ts
  interface DuplicatesCollapsedChipProps {
    duplicateGroups: DuplicateGroupPatient[][];     // existing v1 type
    onMerged: () => void;                           // called after a successful merge so the parent re-fetches
  }
  ```

  - When `duplicateGroups.length === 0` → return `null` (chip hidden).
  - When > 0 → render a `<Popover>` with:
    - Trigger: `<Button variant="outline" size="sm" className="text-amber-700 border-amber-200"><AlertTriangle /> {N} possible duplicates</Button>`.
    - Content: `<DuplicatesPopoverContent groups={…} onMerged={…} />`.
  - Telemetry: emit `patients_v2.duplicates_popover_opened` once per browser session on first open (track via a module-level boolean).

- [x] **`<DuplicatesPopoverContent>`** (inline sub-component, ~70 LOC). For each group:
  ```tsx
  <div className="border-b pb-2 last:border-0">
    <p className="text-sm font-medium">{group.map(g => g.name).join(' • ')}</p>
    <p className="text-xs text-muted-foreground">{group.length} entries — matched on phone</p>
    <Button size="sm" variant="link" onClick={() => openMergeModal(group)}>Merge</Button>
  </div>
  ```
  - Group label = comma-separated patient names; sub-label = how the match was identified (the v1 banner already exposes this; reuse the same matchTypeLabel helper if present).
  - Clicking Merge sets the locally-mounted `<MergePatientsModal>`'s `selectedGroup` state to this group.

- [x] **`<MergePatientsModal>`** mounted at the chip's root so it shares the same render tree. After successful merge, call `onMerged()` so the page state owner re-fetches the duplicates list (the chip's N decrements, the popover closes when N reaches 0).

### Step 2 — Page-state-owner integration

- [x] **In `PatientsV2Page.tsx`**, fetch `getPossibleDuplicates(token)` alongside `getPatientsKpis` (same `useEffect`). Store in `useState<DuplicateGroupPatient[][]>([])`.
- [x] **Pass to**:
  - `<PatientsKpiStrip>` — the KPI tile derives `count` from this array's length.
  - `<PatientsToolbar>` — into the new prop slot.
  - `<DuplicatesCollapsedChip>` — directly.
- [x] **`onMerged` callback** triggers a re-fetch of both `getPossibleDuplicates` AND `getPatientsList(filters)` (the table needs to refresh because one of the two merged rows is now gone).
- [x] **`onDuplicatesOpen` callback** (from pr-05's KPI strip) → set a `forceOpenDuplicates` state that the chip respects via a controlled-popover prop (Radix supports `open` + `onOpenChange`).

### Step 3 — Toolbar mounting

- [x] **In `PatientsToolbar`** (modifying pr-06's output), add a new prop `duplicatesSlot?: React.ReactNode` and render it in the toolbar's right area between the saved-view dropdown and the density toggle.
- [x] **`PatientsV2Page`** passes `<DuplicatesCollapsedChip {...} />` as `duplicatesSlot`.

### Step 4 — Verification

- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean.
- [x] On `/dashboard/patients-v2` with seed data containing ≥ 1 duplicate group, the chip renders in the toolbar; clicking it opens the popover; clicking Merge opens the `MergePatientsModal` unchanged.
- [x] After a successful merge, the chip's count decrements; if it hits 0, the chip disappears.
- [x] Clicking the "Possible duplicates" KPI tile from pr-05 opens the same popover.
- [x] Telemetry `patients_v2.duplicates_popover_opened` fires once per session (verify in network/console).
- [x] When no duplicate groups exist, the chip is absent and the KPI tile renders `0` but doesn't open the popover on click (or opens it to a "No duplicates" empty state — task picks; the empty-state route is friendlier).

---

## Out of scope

- **Modifying `MergePatientsModal`.** DL-12 forbids.
- **Snoozing / dismissing duplicate suggestions.** Phase 2 may add ("not a duplicate" button per group).
- **A duplicates management page.** The popover is enough for Phase 1 (typical clinic has < 10 duplicate groups).
- **Heuristic-tuning** (changing how the backend decides what's a duplicate). Out of scope; the existing logic stays.

---

## Files expected to touch

**New:**

- `frontend/components/patients-v2/list/DuplicatesCollapsedChip.tsx` (~120 LOC).

**Modified:**

- `frontend/components/patients-v2/list/PatientsToolbar.tsx` (~10 LOC delta — add `duplicatesSlot?` prop + render it).
- `frontend/components/patients-v2/PatientsV2Page.tsx` (~40 LOC delta — fetch duplicates, wire chip, wire `onDuplicatesOpen` from the KPI strip, wire `onMerged` re-fetch).

**Read but do not modify in this task:**

- `frontend/components/patients/MergePatientsModal.tsx` (REUSED verbatim; pr-14 moves the file).

---

## Notes / open decisions

1. **Why a chip in the toolbar instead of a discrete button?** The chip's variant + amber color signals "deserves attention but isn't a primary action." A regular button would compete with the toolbar's saved-view dropdown for the doctor's eye.

2. **Why the controlled `open` state from the KPI strip?** The strip's "Possible duplicates" tile is a CTA. Wiring it through state means the popover opens from a click anywhere on the tile, not just the chip.

3. **Why mount `MergePatientsModal` inside the chip?** Keeps the dialog state-co-located with the trigger. The alternative (lift to the page state owner) requires another callback layer for nothing.

4. **What if `getPossibleDuplicates` returns an empty array AND the KPI strip's `possible_duplicates.count` is positive?** They should match (both come from the same backend logic). If they drift, the chip is the source of truth — the strip's count is informational. Task doesn't reconcile; pr-03 ensures they match.

5. **Why the ESLint zone allows `@/components/patients/MergePatientsModal`?** DL-12. pr-14 moves the file to `frontend/components/patients-v2/MergePatientsModal.tsx`; the import in this file updates to the new path at that point.

---

## References

- **Affected files:** see "Files expected to touch".
- **Source decisions:** [§DL-12 (duplicates collapsed chip)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-patients-redesign.md` § Wave 3 gate](./EXECUTION-ORDER-patients-redesign.md#wave-3-gate-after-pr-05--pr-06--pr-07--pr-08).
- **Next task:** [`task-pr-09-patient-v2-shell.md`](./task-pr-09-patient-v2-shell.md) — Wave 4, Lane α step 0 (fresh chat; switches surfaces to the detail page).

---

**Owner:** TBD
**Created:** 2026-05-18
**Status:** Pending
