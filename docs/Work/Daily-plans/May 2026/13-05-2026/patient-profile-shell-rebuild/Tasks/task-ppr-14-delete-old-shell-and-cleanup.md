# Task ppr-14: Delete old shell + cleanup

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 5 step 2 — **S, ~2.5h**

---

## Task overview

The final cleanup. After the release window expires (≥1 week of `/v2` as default, ≤1% `?v1=1` traffic), remove the old shell and everything that only existed for v1.

The originally-planned scope was a clean delete-the-v1-files sweep. A 14 May 2026 audit (see [History / divergence](#history--divergence)) revealed that **two of the supposed "v1-only" modules — `cockpit-layout.ts` and `useCockpitPresets.ts` — are not actually v1-only**: the surviving green-grade preset dialogs (`SavePresetDialog`, `ManagePresetsDialog`) and the v2 `PatientProfilePage` import shared **types** from them today. Deleting blind would break v2.

ppr-14 therefore now includes a small types-lift step **before** the deletion sweep, so the deletion is genuinely transitive and v2 keeps compiling.

Workflow:

1. **Pre-delete checks** — `?v1=1` traffic ≤1% for 7 days; TS clean (i.e. ppr-13 finished).
2. **Lift shared types** out of `cockpit-layout.ts` and `useCockpitPresets.ts` into a neutral module so the dialogs and v2 keep their contract.
3. **Delete `ConsultationCockpit.tsx`** (~2,548 LOC).
4. **Delete `cockpit-layout.ts`** (constants, helpers, validators — types are gone after step 2).
5. **Delete the obsoleted helpers** (drag handle, drop zone). `RxRailToggle.tsx` and `WalkInQuickModal.tsx` are already deleted in the working tree; ppr-14 just confirms.
6. **Delete the `useCockpitHotkeys` + `useCockpitPresets` v1-only hooks** (types are gone after step 2; runtime is v1-only).
7. **Remove the `?v1=1` branch** from `[id]/page.tsx` (one if-branch).
8. **Remove `?cockpitDbg=1` debug instrumentation** (inbox.md L280; lives entirely inside `ConsultationCockpit.tsx`).
9. **Tick off** inbox items L278 (cascading drag-to-collapse — obsoleted) and L280 (debug instrumentation).
10. **Optional cleanup pass:** remove the v1-only legacy props (`onCollapse`, `isCollapsible`, `slotIndex`, `dragHandle`, `headerLeadingExtra`, `headerTrailingExtra`) from `<ConsultationBodyPane>` and `<RxPane>`.

Net diff target: ≥ **−2,800 LOC** (revised down slightly from the original −3,000 because the types-lift adds back ~50 LOC in `preset-types.ts`).

**DO NOT START THIS TASK** until ppr-12 has been live ≥1 week and `?v1=1` traffic is observed to be near zero, **and** ppr-13 is complete (working tree TS-clean).

**Estimated time:** ~2.5h.

**Status:** Pending. Gated on the release window AND on ppr-13 completing its mid-flight import-path follow-through.

**Hard deps:** ppr-13 (must be TS-clean first — see [task-ppr-13](./task-ppr-13-rename-green-grade-files.md) which is currently in-progress mid-rename).

**Source:** R5.3 + R5.5 + R5.6 + R5.7 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).

---

## History / divergence

> **Read this before starting work.** The plan as originally drafted treated `cockpit-layout.ts` and `useCockpitPresets.ts` as deletable v1-only modules. Audited 14 May 2026 against the working tree, that's not quite right.

**The v1↔v2 type bridge that ppr-14 must dismantle**

These imports cross from v2 into "v1-only" files today and would break on a blind delete:

| v2 / shared file | v1-only file imported | Symbols used |
|---|---|---|
| `frontend/components/patient-profile/PatientProfilePage.tsx` | `@/lib/consultation/cockpit-layout` | `CockpitLayout` (type), `ColumnSlots` (type) |
| `frontend/components/patient-profile/PatientProfilePage.tsx` | `@/hooks/useCockpitPresets` | `PresetsState` (type), `CockpitLayoutPreset` (type) |
| `frontend/components/patient-profile/PatientProfileHeader.tsx` (moved by ppr-13) | `@/lib/consultation/cockpit-layout` | `ColumnSlots` (type) + many runtime helpers (`COLUMN_ORDER_PERMUTATIONS` etc.) |
| `frontend/components/consultation/cockpit/SavePresetDialog.tsx` (kept by ppr-13) | `@/lib/consultation/cockpit-layout` | `CockpitLayout` (type) |
| `frontend/components/consultation/cockpit/SavePresetDialog.tsx` | `@/hooks/useCockpitPresets` | `CockpitLayoutPreset` (type) |
| `frontend/components/consultation/cockpit/ManagePresetsDialog.tsx` (kept by ppr-13) | `@/lib/consultation/cockpit-layout` | `CockpitLayout` (type) |
| `frontend/components/consultation/cockpit/ManagePresetsDialog.tsx` | `@/hooks/useCockpitPresets` | `CockpitLayoutPreset` (type) |
| `frontend/components/consultation/cockpit/__tests__/SavePresetDialog.test.tsx` | both | both |
| `frontend/components/consultation/cockpit/__tests__/ManagePresetsDialog.test.tsx` | both | both |

Note that `PatientProfilePage.tsx` carries the explicit comment "CockpitHeader expects PresetsState / CockpitLayoutPreset from useCockpitPresets. We adapt by casting…" with `as unknown as CockpitLayout` casts at four call sites. The bridge is intentional, not accidental.

**Working-tree state already consistent with ppr-14's plan**

- `frontend/components/consultation/cockpit/RxRailToggle.tsx` — already deleted (`D` in `git status`).
- `frontend/components/dashboard/WalkInQuickModal.tsx` — already deleted (not on disk).
- The two `git rm` lines for these in the original task are no-ops.

**Inbox.md references no longer accurate**

- The original task says "Resolve git-status leftovers ([inbox.md L268..L275]) — `WalkInQuickModal.tsx` and `RxRailToggle.tsx`". Audited: `rg "WalkInQuickModal|RxRailToggle|git[- ]status leftovers"` against `inbox.md` returns **zero hits**, and L268..L275 today point at unrelated EHR/PF entries. That whole sub-bullet is dead.
- L278 (cascading drag-to-collapse) and L280 (`?cockpitDbg=1` instrumentation) **are still at those exact line numbers** as of audit. Those tick-offs are still valid.

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file (especially the divergence section above).
- `frontend/components/consultation/ConsultationCockpit.tsx` (about to be deleted).
- `frontend/lib/consultation/cockpit-layout.ts` (about to be deleted).
- `frontend/hooks/useCockpitPresets.ts` (about to be deleted).
- `frontend/components/consultation/cockpit/SavePresetDialog.tsx` + `ManagePresetsDialog.tsx` (kept; their import paths change in step 3).
- `frontend/components/patient-profile/PatientProfilePage.tsx` (kept; its import paths change in step 3).
- `frontend/app/dashboard/appointments/[id]/page.tsx` (the `?v1=1` branch).
- `docs/Work/capture/inbox.md` (the deferred items to tick off).

**Estimated turns:** 5–7 turns (lift types → tsc → delete sweep → tsc-loop until clean → inbox tick-offs).

---

## Acceptance criteria

### Step 1: Pre-delete checks

- [ ] Confirm `?v1=1` traffic in production has been ≤1% of cockpit loads for at least 7 consecutive days. (Use whatever observability surface exists — Datadog RUM, Sentry breadcrumb counts, server-log `searchParams.v1` filter.) If traffic > 1%, **HOLD** — investigate the parity gap that's keeping doctors on v1, fix it, then restart the window.
- [ ] Confirm `npx tsc --noEmit` (run from `frontend/`) is clean BEFORE any deletes. **If it's not clean, ppr-13 is still in flight — finish that first.**

### Step 2: Delete the v1 route branch

- [ ] Edit `frontend/app/dashboard/appointments/[id]/page.tsx`:
  - Remove the `if (searchParams?.v1 === "1") { … }` block (lines ~94–101 as of audit).
  - Remove the `import ConsultationCockpit from "@/components/consultation/ConsultationCockpit";` line (line ~6).
  - Remove the now-unused `searchParams?: { v1?: string };` field from `PageProps`.
  - The page now unconditionally renders `<PatientProfilePage>`.

### Step 3: Lift the shared types out of v1-only files

> **Why this step exists:** see [History / divergence](#history--divergence). The dialogs and v2 page consume types from `cockpit-layout.ts` and `useCockpitPresets.ts`. Lifting them first is what makes Step 4's deletes actually transitive.

- [ ] Create `frontend/components/consultation/cockpit/preset-types.ts` with **type-only exports** for the symbols still needed by the surviving dialogs and v2 page. Minimum required set (verify against the audit table; widen if `tsc` still complains after the lift):

  ```ts
  // From cockpit-layout.ts
  export type ColumnType = "chart" | "body" | "rx";
  export type ColumnSlots = readonly [ColumnType, ColumnType, ColumnType];
  export type ColumnWidths = readonly [number, number, number];
  export type MiddleCollapseSide = "left" | "right" | null;
  export interface CollapsedFlags { … }
  export interface CockpitLayout { … }

  // From useCockpitPresets.ts
  export interface CockpitLayoutPreset { … }
  export interface PresetsState { … }
  ```

  Move (don't copy) the canonical definitions from their current homes. The originals re-import from `preset-types` if they're still alive at the moment of move — but since `cockpit-layout.ts` and `useCockpitPresets.ts` are about to be deleted in Step 4, this is purely transitional.

- [ ] Update **all** importers of those types to point at `@/components/consultation/cockpit/preset-types`. Use `rg`:
  - `rg "from \"@/lib/consultation/cockpit-layout\"" frontend/` → expect only **runtime** symbols (constants like `DEFAULT_COCKPIT_LAYOUT`, `BUILT_IN_PRESETS`, helpers like `validateLayout`, `swapSlots`, `layoutsEqual`) to remain. Those are all v1-only and die with `cockpit-layout.ts` in Step 4. Type-only imports should be moved to `preset-types`.
  - `rg "from \"@/hooks/useCockpitPresets\"" frontend/` → expect only the v1 hook itself (in `ConsultationCockpit.tsx`) to remain after the lift.

- [ ] `npx tsc --noEmit` clean after the lift, before any deletions. This is the safety checkpoint: if TS goes red here, you've missed an importer or pulled the wrong slice of types.

- [ ] Decision (record in PR): the new home is `frontend/components/consultation/cockpit/preset-types.ts` rather than `frontend/lib/patient-profile/preset-types.ts` because:
  - The dialogs are the contract owner — the type names describe their public prop shape.
  - ppr-13 already decided medical surfaces stay under `consultation/cockpit/` (DL-2: shell stays content-agnostic). The dialog-types live with the dialogs.
  - `PatientProfilePage.tsx` is the adapter, not the contract owner.

### Step 4: Delete files

- [ ] `git rm`:
  - `frontend/components/consultation/ConsultationCockpit.tsx`
  - `frontend/lib/consultation/cockpit-layout.ts` (constants, helpers, validators — types lifted in Step 3)
  - `frontend/components/consultation/cockpit/CockpitColumnDragHandle.tsx`
  - `frontend/components/consultation/cockpit/CockpitColumnDropZone.tsx`
  - `frontend/hooks/useCockpitHotkeys.ts`
  - `frontend/hooks/useCockpitPresets.ts` (runtime — types lifted in Step 3)
  - Unit/integration tests that exclusively cover the deleted files:
    - `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx`
    - `frontend/components/consultation/__tests__/ConsultationCockpit.resize.test.tsx`
    - `frontend/hooks/__tests__/useCockpitHotkeys.test.ts`
    - `frontend/hooks/__tests__/useCockpitPresets.test.ts` (if exclusively v1; check for type-shape coverage that may still be useful and either drop or rewrite to import from `preset-types`)

- [ ] **Already-deleted (no-op, just confirm):**
  - `frontend/components/consultation/cockpit/RxRailToggle.tsx` — `git status` shows `D`.
  - `frontend/components/dashboard/WalkInQuickModal.tsx` — not on disk.

- [ ] Run `npx tsc --noEmit`. Fix the cascade of import errors by:
  - Updating every importer of a deleted file to import the v2 equivalent instead.
  - Where the importer's needs are met by something already in the codebase, swap accordingly.
  - Where the importer was v1-only and exists nowhere else, delete the importer too.

### Step 5: Remove `?cockpitDbg=1` instrumentation

- [ ] After deleting `ConsultationCockpit.tsx`, `rg "COCKPIT_DBG" frontend/` and `rg "cockpitDbg" frontend/` should return **zero results**. The instrumentation lived entirely inside `ConsultationCockpit.tsx` (audit-confirmed); if anything appears elsewhere, delete it too.

### Step 6: Tick off inbox items

- [ ] **inbox.md L278** (cascading drag-to-collapse — deferred): mark resolved:

  ```
  - [x] Cascading drag-to-collapse — obsoleted by ppr-14. The new shell's
    adjacent-absorber rule (DL-6) handles the "collapse the next pane when
    the dragging pane runs out of room" UX automatically, so the originally
    requested cascading-three-column behaviour is naturally achieved without
    additional code.
  ```

- [ ] **inbox.md L280** (`?cockpitDbg=1` instrumentation):

  ```
  - [x] Resolved by ppr-14 — `ConsultationCockpit.tsx` deleted, instrumentation gone with it.
  ```

- [ ] **(Original task's L268..L275 git-status-leftovers tick-off):** ~~drop this step.~~ The audit confirmed inbox.md has no entry for `WalkInQuickModal.tsx` / `RxRailToggle.tsx` leftovers; those line numbers point at unrelated items. There's nothing to tick off.

### Step 7: Optional legacy-prop cleanup

- [ ] Edit `frontend/components/patient-profile/panes/ConsultationBodyPane.tsx`:
  - Remove `onCollapse`, `isCollapsible`, `slotIndex`, `dragHandle`, `headerLeadingExtra`, `headerTrailingExtra` props from the interface.
  - Remove the render branches that used those props.
  - Keep `hideHeader` (the shell still uses it for `hideHeader={true}`).
- [ ] Same cleanup in `RxPane.tsx`.
- [ ] **`<PaneHeader>` (renamed by ppr-13 from `CockpitColumnHeader`):** if the legacy `dragHandle` + `actions` props are no longer used by anyone after the v1 shell deletion, simplify to `{ title, titleId, className }`.

### Step 8: Test sweep

- [ ] `npx tsc --noEmit -p tsconfig.json` (from `frontend/`) — clean.
- [ ] `npm run lint` (frontend) — clean.
- [ ] `npm test` (frontend) — all green. Remove any tests that exclusively exercise deleted code.
- [ ] `rg "ConsultationCockpit" frontend/` → zero results.
- [ ] `rg "cockpit-layout" frontend/` → zero results (the constants file is gone; types are in `preset-types`).
- [ ] `rg "useCockpitHotkeys" frontend/` → zero results.
- [ ] `rg "from \"@/hooks/useCockpitPresets\"" frontend/` → zero results (the hook is gone; the lifted types live in `preset-types`).
- [ ] `rg "CockpitColumnDrag" frontend/` → zero results.
- [ ] `rg "COCKPIT_DBG" frontend/` and `rg "cockpitDbg" frontend/` → zero results.

### Step 9: Net diff verification

- [ ] `git diff --stat main...HEAD` for the entire batch should show **at least −2,800 LOC net** (was −3,000 before the types-lift; the new `preset-types.ts` adds back ~50 LOC).
- [ ] Optional: regenerate any LOC dashboards / docs that referenced the old shell's size.

### Manual smoke (final)

- [ ] Open `/dashboard/appointments/[id]` — v2 shell renders.
- [ ] Open `/dashboard/appointments/[id]?v1=1` — same v2 shell (the `?v1=1` branch is gone; the query param is ignored).
- [ ] Save a layout preset, then re-open and `Apply` it. Verifies the lifted-types path end-to-end (the dialogs are the type's main consumer).
- [ ] All previously verified parity matrix cells (from ppr-11) still pass — quick walk through a representative 5–10 cells.

---

## Out of scope

- **Renaming `consultation/cockpit/` folder.** Optional follow-up; the surviving green-grade components in that folder don't block on a folder rename. The new `preset-types.ts` lives there too — fine.
- **Rewriting `<SavePresetDialog>` / `<ManagePresetsDialog>` to be layout-shape-agnostic.** A bigger refactor that would let `PatientProfilePage.tsx` drop its `as unknown as CockpitLayout` casts. Worth doing, but as a separate task — ppr-14 only lifts the types so the dialogs keep working.
- **Removing `WrapUpDialog.tsx` / other shared dialogs.** They're used by v2.
- **Refactoring any of the surviving green-grade components.** Out of scope; the rebuild was a SHELL replacement.

---

## Files expected to touch

**Created:** 1 file (`frontend/components/consultation/cockpit/preset-types.ts`).

**Deleted:** ~6–8 files:
- `ConsultationCockpit.tsx`
- `cockpit-layout.ts`
- `CockpitColumnDragHandle.tsx`
- `CockpitColumnDropZone.tsx`
- `useCockpitHotkeys.ts`
- `useCockpitPresets.ts`
- 2–4 v1-only test files.

**Modified:**
- `frontend/app/dashboard/appointments/[id]/page.tsx` (~−15 LOC — remove `?v1=1` branch).
- `frontend/components/consultation/cockpit/SavePresetDialog.tsx` (import paths only — types now from `./preset-types`).
- `frontend/components/consultation/cockpit/ManagePresetsDialog.tsx` (import paths only).
- `frontend/components/consultation/cockpit/__tests__/SavePresetDialog.test.tsx` (import paths only).
- `frontend/components/consultation/cockpit/__tests__/ManagePresetsDialog.test.tsx` (import paths only).
- `frontend/components/patient-profile/PatientProfilePage.tsx` (import paths only — `CockpitLayout`/`ColumnSlots`/`PresetsState`/`CockpitLayoutPreset` from `preset-types`).
- `frontend/components/patient-profile/PatientProfileHeader.tsx` (import paths only — `ColumnSlots` from `preset-types`; `COLUMN_ORDER_PERMUTATIONS` etc. were already v1-runtime — if used, swap to whatever v2 equivalent or inline).
- `frontend/components/patient-profile/__tests__/PatientProfileHeader.test.tsx` (likely import paths).
- `frontend/components/patient-profile/panes/ConsultationBodyPane.tsx` (~−40 LOC — legacy props removed).
- `frontend/components/patient-profile/panes/RxPane.tsx` (~−40 LOC — same).
- `docs/Work/capture/inbox.md` (~2 line edits — L278 + L280 tick-offs).

**Tests:** deletions of v1-only tests + identifier renames + import-path updates.

---

## Notes / open decisions

1. **Why the release window between ppr-12 and ppr-14?** ppr-11's parity QA is best-effort. A 1-week prod window with the `?v1=1` escape hatch is the real safety net — if a doctor hits a parity bug we missed, they have a one-key fallback (`?v1=1`) while we investigate. ppr-14 deletes the fallback; better to delete after observing zero usage.
2. **Why delete `useCockpitHotkeys` instead of renaming to `useShellHotkeys`?** ppr-10 created `useShellHotkeys` from scratch. The original `useCockpitHotkeys` is a v1-only artefact. Renaming would imply a deeper compatibility relationship that doesn't exist. **Confirmed against audit:** `useCockpitHotkeys` is only imported by `ConsultationCockpit.tsx` and its tests; nothing v2 touches it.
3. **Why is `useCockpitPresets` *not* the same story?** Despite the name, the hook's *types* (`PresetsState`, `CockpitLayoutPreset`) are part of the surviving dialog contract. Step 3 lifts those types out before deleting the hook itself. The v2 hook (`usePatientProfilePresets`) does the runtime fetching/saving for v2 and was always going to coexist.
4. **Why `frontend/components/consultation/cockpit/preset-types.ts` rather than `frontend/lib/patient-profile/preset-types.ts`?** The dialogs that own this contract live under `consultation/cockpit/` (per ppr-13's DL-2 decision: medical surfaces stay there, shell stays under `patient-profile/`). The type names describe the dialogs' prop shape; co-locating with the dialogs is the natural home. v2's `PatientProfilePage.tsx` is the adapter side of the bridge, not the contract owner.
5. **What if `?cockpitDbg=1` leaves a trace outside `ConsultationCockpit.tsx`?** Audited 14 May 2026 — `rg COCKPIT_DBG` and `rg cockpitDbg` against `frontend/` returned only `ConsultationCockpit.tsx`. Step 5 is a verification, not a search-and-purge. If a future commit reintroduces it elsewhere, that's a regression — handle outside ppr-14.
6. **What if a parity bug surfaces AFTER ppr-14 (when `?v1=1` is gone)?** The bug is real, but the v1 shell is gone. Fix the v2 shell in a new task. Adding the `?v1=1` branch back would require restoring `ConsultationCockpit.tsx` + ~2,500 LOC — not feasible.
7. **What about the long-term goal of removing the `CockpitLayout`-shaped contract entirely?** That's a follow-up: refactor the dialogs to take `PatientProfileLayout` directly, which lets `preset-types.ts` shrink to nothing and lets `PatientProfilePage.tsx` drop its `as unknown as CockpitLayout` casts. Worth doing, but it's a real refactor with its own risk surface. Out of scope here.

---

## References

- **Source decisions:** R5.3 + R5.5 + R5.6 + R5.7 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).
- **Inbox debt:** [docs/Work/capture/inbox.md L278 + L280](../../../../capture/inbox.md). (L268..L275 reference from the original task is no longer accurate — see [History / divergence](#history--divergence).)
- **Previous task:** [`task-ppr-13-rename-green-grade-files.md`](./task-ppr-13-rename-green-grade-files.md). Note ppr-13 is mid-flight; finish it before starting ppr-14.

---

**Owner:** TBD
**Created:** 2026-05-13
**Updated:** 2026-05-14 (rewritten to add the types-lift pre-step after the audit found a v1↔v2 type bridge in `cockpit-layout.ts` + `useCockpitPresets.ts`)
**Status:** Pending — gated on (a) ppr-13 completing + TS clean, (b) ≤1% `?v1=1` traffic for 7 days
