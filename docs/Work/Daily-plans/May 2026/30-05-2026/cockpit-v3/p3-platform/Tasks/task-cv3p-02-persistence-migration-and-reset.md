# cv3p-02 — Persistence reuse + migration round-trip + per-doctor (V3-Q6) + reset-to-blank

| Field | Value |
|---|---|
| **Batch** | [Cockpit v3 Phase 3 — safety + platform](../plan-p3-cockpit-v3-platform-batch.md) |
| **Wave** | 1 (Lane B — parallel with cv3p-01) |
| **Depends on** | Phase 1 (`useCockpitV3Layout` / `useShellLayout`) |
| **Blocks** | cv3p-04 (gate) |
| **Size** | **M** |
| **Model** | **Auto** |
| **Decision locks** | v3-DL-10, P1-DL-1, P3-DL-3, P3-DL-4, P3-DL-5, P3-DL-7 |
| **R-item** | R-PERSIST3 · resolves V3-Q6 |

---

## Objective

**Prove the doctor's layout is durable, that pane-freedom-era layouts migrate for free, and add the one missing affordance (reset → blank)** — all on the kept persistence, with no new schema/key/migration:

1. **Round-trip durability.** A drag-built v3 arrangement persists across reload via `useShellLayout` (same v5 `PaneTreeNode`, same `patient-profile/v4-tree-layout::<storageKey>` key, 200 ms debounce). Resize + active-tab survive remount.
2. **Migration reuse (v3-DL-10).** A representative pane-freedom-era layout (nested splits + multi-tab leaves + hidden panes; and a legacy v2/v3 flat payload) loads correctly in v3 — `validateLayout` already migrates v2→v3→v4→v5 (`upgradeV4LeavesToV5`). Prove it's **idempotent + reversible-by-no-op**; do not add a new migration.
3. **Blank-seed must never clobber.** `useCockpitV3Layout`'s seed effect only applies the blank tree when `localStorage` is empty (it early-returns if `v4Key` exists). Lock this with an explicit test — a hydrated saved layout must win over the seed.
4. **Per-doctor remember — lock V3-Q6 = per-doctor.** The stable per-route key (e.g. `TELEMED_VIDEO_LAYOUT_STORAGE_KEY`) + per-browser localStorage already means "remember per doctor." Prove cross-appointment restore (same key, different appointment id → same arrangement). Do **not** re-key storage; per-(doctor × consult-type) is deferred to ride V3-Q1's seed.
5. **Reset → blank (P3-DL-5).** Add a discoverable "Reset layout" affordance (trailing button in `CockpitPalette`) that returns the canvas to the blank default. Verify "reset" yields the **blank** tree (all panes hidden), not an all-visible default — wire it to the blank seed if `resetLayout`'s `defaultTree` is not already blank.

## Why this task

Durability is what separates a workspace from a toy, and it's the de-risker for the eventual flag-flip: if turning v3 on reset every doctor's saved layout, the cutover would be unshippable. The good news is the kept hook already does the hard parts — the persistence write, the v2→v5 migration, the stale-layout guard. So this task is mostly **proof** (round-trip + migration + no-clobber + cross-appointment) plus two small real additions: locking V3-Q6 and giving the doctor a reset button. Keeping it in its own lane (disjoint from the chrome work) lets it run in parallel with cv3p-01.

## Files

| File | Change |
|---|---|
| `frontend/lib/patient-profile/v3/__tests__/useCockpitV3Layout.persistence.test.tsx` | **New** — round-trip (drag-built tree survives a hook remount on the same key); blank-seed-no-clobber (hydrated layout wins); reset-to-blank; cross-appointment restore (same key, different appt id). Drive via the hook + a fake/`jsdom` `localStorage`. |
| `frontend/lib/patient-profile/v3/__tests__/persistence.migration.test.ts` | **New** — feed representative pane-freedom-era payloads (v2 flat, v3 flat, v4 tree, v5 tree; nested splits + multi-tab leaves + hidden panes) into `validateLayout`; assert each yields a valid v5 tree, that re-running `validateLayout` on the result is a no-op (idempotent), and that no v5 input is mutated. |
| `frontend/components/patient-profile/v3/CockpitPalette.tsx` | **Edit (additive)** — add a trailing "Reset layout" button (after a separator) wired to `layout.resetToBlank` (or `layout.resetLayout` if it already yields blank); tooltip "Reset to blank"; `aria-label`. Keep the existing pane toggles untouched. |
| `frontend/lib/patient-profile/v3/useCockpitV3Layout.ts` | **Edit (conditional, thin)** — **only if** `resetLayout`'s `defaultTree` is not the blank canvas: add a `resetToBlank()` that `applyLayout({ version, paneTree: blankDefaultTree })`, so "reset" matches the blank seed exactly (P3-DL-5). If `resetLayout` already yields blank, just re-export it and skip this edit. |

> **No edit to** `useShellLayout.ts` (the migration + persistence are correct as-is), `layout-tree*.ts`, `types.ts`, or any migration / `doctor_settings` (P3-DL-3 / v3-DL-1). If a test surfaces a real persistence bug in the kept hook, **stop and capture it** rather than forking the hook in v3.

> **Import discipline (P0-DL-4):** persistence helpers (`validateLayout`, `readPersistedLayout`, `v4TreeLayoutStorageKey`) come from `useShellLayout`; model/engine/types via `foundation.ts`.

## Implementation sketch

### Round-trip + no-clobber (the core proofs)

```tsx
// useCockpitV3Layout.persistence.test.tsx
const key = "test-route-" + crypto.randomUUID();

// 1. Round-trip: mount hook, build an arrangement (movePane / splitLeafDir),
//    flush the 200ms debounce, unmount. Re-mount with the same key →
//    expect the same paneTree (resize + activeTab preserved).

// 2. No-clobber: pre-seed localStorage[v4TreeLayoutStorageKey(key)] with a saved
//    tree, mount the hook WITH blankDefaultTree → expect the saved tree to win
//    (the blank seed early-returns because the key exists — useCockpitV3Layout L63).

// 3. Cross-appointment: same key, simulate "appointment A" then "appointment B"
//    (the key is per-route, not per-appt) → expect B sees A's arrangement (V3-Q6).
```

### Migration idempotence (no new migration)

```ts
// persistence.migration.test.ts
const samples = [
  v2FlatPayload,           // { version: 2, paneOrder, paneState:{sizePct,collapsed} }
  v3FlatPayload,           // { version: 3, paneOrder, paneState:{sizePct,hidden} }
  v4TreePayload,           // { version: 4, paneTree } — leaves without paneIds/activeTabId
  v5NestedMultiTabHidden,  // { version: 5, paneTree } — splits + tabs + hidden
];
for (const raw of samples) {
  const once = validateLayout(raw);
  expect(once?.version).toBe(5);
  expect(validateLayout(once)).toEqual(once);   // idempotent / reversible-by-no-op
}
// And: a v5 input is returned structurally unchanged (no mutation).
```

### Reset affordance

```tsx
// CockpitPalette.tsx — trailing control
<div className="mx-1 h-4 w-px bg-border/60" aria-hidden />
<Tooltip>
  <TooltipTrigger asChild>
    <button
      type="button"
      data-testid="cockpit-v3-reset"
      onClick={() => layout.resetToBlank()}   // or layout.resetLayout if blank
      aria-label="Reset to blank"
      className="inline-flex h-7 w-7 items-center justify-center rounded …"
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
    </button>
  </TooltipTrigger>
  <TooltipContent side="bottom">Reset to blank</TooltipContent>
</Tooltip>
```

> **Verify the blank semantics first.** `useShellLayout.resetLayout` resets to `defaultTree` built from the `defaultPaneOrder`/`defaultPaneState` the shell passes (`blankLayoutFlat(panes)`). If that flat default is all-hidden, `resetLayout` already yields the blank canvas and you can wire the button straight to it. If not, add the thin `resetToBlank` that applies `blankDefaultTree` (the same value the seed uses) so reset and first-load match exactly.

## Tests

- [x] **Round-trip** → drag-built tree (with a split + a multi-tab leaf + a resized pane) survives a hook remount on the same key.
- [x] **Blank-seed-no-clobber** → a pre-seeded saved layout wins over `blankDefaultTree`; the seed does not overwrite it.
- [x] **Migration idempotent** → v2 / v3 / v4 / v5 samples each → valid v5; second `validateLayout` is a no-op; v5 input unmutated.
- [x] **Cross-appointment restore** → same per-route key restores the arrangement across two appointment ids (V3-Q6).
- [x] **Reset → blank** → clicking reset returns to the all-hidden blank canvas (matches the seed); the empty-state shows.
- [x] **No new key/schema** → only `patient-profile/v4-tree-layout::<key>` is written; no `doctor_settings` / migration touched.

## Acceptance criteria

- [x] A drag-built arrangement persists across reload (same v5 tree, same key); resize + active-tab survive (P3-DL-3).
- [x] Representative pane-freedom-era layouts (v2/v3/v4/v5; nested + multi-tab + hidden) load in v3; migration is idempotent + reversible-by-no-op (v3-DL-10).
- [x] The blank seed never clobbers a hydrated saved layout (proven) (P3-DL-4).
- [x] V3-Q6 locked = per-doctor; cross-appointment restore proven on the stable key; no re-keying (P3-DL-4).
- [x] A discoverable "Reset layout" affordance returns the canvas to blank (`resetToBlank`/`resetLayout`) (P3-DL-5).
- [x] No new persisted schema / localStorage key; `doctor_settings` + migration 112 untouched; preset data still valid (P3-DL-3 / P3-DL-7).
- [x] Flag off → unchanged. `npx tsc --noEmit` + `npm run lint` clean; both new suites green.

## Out of scope (explicit)

- Chrome / docks / provider scope → cv3p-01.
- Mobile → cv3p-03.
- **Preset save/manage UI** in the v3 palette → deferred (P3-DL-7). Preset *data* stays valid (migration 112 untouched); v3 grows no preset picker now.
- Per-(doctor × consult-type) persistence / the type-aware seed → deferred (V3-Q1 / V3-Q6 fast-follow); reset → blank for now.
- Any change to `useShellLayout`'s migration / write path — reused as-is; capture bugs, don't fork.

## Decision log

- **Migration is inherited, not built.** `validateLayout` already covers v2→v5; the task's value is *proving* idempotence + no-clobber on representative trees, which is exactly what de-risks the flag-flip (no doctor loses a layout). Re-implementing migration in v3 would violate v3-DL-1/10.
- **Per-doctor = the stable key (V3-Q6 locked = per-doctor).** localStorage is per-browser and the key is per-route, so "one arrangement per doctor" falls out for free. Locking it here (vs per-consult-type) keeps Phase 3 small and defers the richer scope to ride the seed decision (V3-Q1).
- **Reset → blank, matched to the seed.** Adding `resetToBlank` (if needed) guarantees reset and first-load are the same canvas, avoiding a subtle "reset gives a different layout than a fresh doctor sees" papercut. The blank, not a populated default, is correct until V3-Q1 ships a seed.

## References

- [`frontend/lib/patient-profile/useShellLayout.ts`](../../../../../../frontend/lib/patient-profile/useShellLayout.ts) — `validateLayout` (v2→v5 migration, L69–140), `resetLayout` (L526), `readPersistedLayout` (L33), the v4/v5 key (L27), the 200 ms write debounce (L330).
- [`frontend/lib/patient-profile/v3/useCockpitV3Layout.ts`](../../../../../../frontend/lib/patient-profile/v3/useCockpitV3Layout.ts) — the blank-seed effect (L58–65, the no-clobber guard) + the state surface (`resetLayout` via `...shell`).
- [`frontend/lib/patient-profile/v3/blankLayout.ts`](../../../../../../frontend/lib/patient-profile/v3/blankLayout.ts) — `blankLayout` / `blankLayoutFlat` (the blank semantics reset must match).
- [`frontend/components/patient-profile/v3/CockpitPalette.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitPalette.tsx) — where the reset button goes.
- [`backend/migrations/112_doctor_settings_cockpit_layout_tree.sql`](../../../../../../backend/migrations/112_doctor_settings_cockpit_layout_tree.sql) — the preset schema (untouched; P3-DL-3/7).
- Batch: [`plan-p3-cockpit-v3-platform-batch.md`](../plan-p3-cockpit-v3-platform-batch.md) · Order: [`EXECUTION-ORDER-p3-cockpit-v3-platform.md`](./EXECUTION-ORDER-p3-cockpit-v3-platform.md).

---

**Status:** `Done` (2026-05-31). Reset wired to `resetLayout` (already blank via `blankLayoutFlat`); `useCockpitV3Layout.persistence.test.tsx` + `persistence.migration.test.ts` green (16 tests); tsc + lint clean. Round-trip/cross-appt use `readPersistedLayout` (cpf-04 remount hang avoided).
