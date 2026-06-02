# Task ppr-15a: Schema migration — `collapsed` → `hidden`

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 4.5, Lane α step 0 — **S, ~30min**

---

## Task overview

The first cut of the **toggle-bar redesign** (mid-batch amendment to DL-6 — see [plan-patient-profile-shell-rebuild-batch.md § Mid-batch amendment](../plan-patient-profile-shell-rebuild-batch.md#mid-batch-amendment-toggle-bar-redesign-ppr-15)).

We are replacing the in-flow "collapse-to-40px-strip" model with a **toggle bar** that hides/shows panes entirely. This task lands the schema change — pure type renames + storage migration — with NO visual changes. After ppr-15a:

- `PaneRuntimeState.collapsed: boolean` becomes `PaneRuntimeState.hidden: boolean`.
- `PaneDefinition` gains an `icon?: LucideIcon` field (used by ppr-15b's toggle bar).
- `validateLayout` learns to read both v2 (with `collapsed`) and v3 (with `hidden`) localStorage payloads, auto-migrating v2 → v3 on read.
- Schema version bumps `2 → 3`.
- All hook callsites (`setPaneCollapsed → setPaneHidden`) are renamed.

The shell still **renders the old strip+chevron behaviour** at the end of ppr-15a — the visual change lands in ppr-15c. ppr-15a is intentionally a no-op for the doctor.

**Estimated time:** ~30min.

**Status:** Pending.

**Hard deps:** ppr-10 (Wave 3 complete), ppr-11 cells 1-3 (F1+F2 fixes already merged).

**Source:** Mid-batch amendment captured in [plan-patient-profile-shell-rebuild-batch.md § Mid-batch amendment](../plan-patient-profile-shell-rebuild-batch.md#mid-batch-amendment-toggle-bar-redesign-ppr-15).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- [`frontend/lib/patient-profile/types.ts`](../../../../../../frontend/lib/patient-profile/types.ts) (the rename target).
- [`frontend/lib/patient-profile/useShellLayout.ts`](../../../../../../frontend/lib/patient-profile/useShellLayout.ts) (`validateLayout` + `setPaneCollapsed` rename target).
- [`frontend/lib/patient-profile/__tests__/useShellLayout.test.ts`](../../../../../../frontend/lib/patient-profile/__tests__/useShellLayout.test.ts) (tests to update + add v2→v3 migration cases).
- [`frontend/lib/patient-profile/preset-translation.ts`](../../../../../../frontend/lib/patient-profile/preset-translation.ts) (preset shape uses the same field).

**Estimated turns:** 2-3 turns. Pure renames + one new branch in `validateLayout`.

---

## Acceptance criteria

### Type changes

- [ ] In [`frontend/lib/patient-profile/types.ts`](../../../../../../frontend/lib/patient-profile/types.ts):
  - Rename `PaneRuntimeState.collapsed: boolean` → `PaneRuntimeState.hidden: boolean`. Update the JSDoc to say "Excluded from the visible layout (toggled off via the toggle bar)".
  - Bump `PatientProfileLayout.version: 2` → `version: 3`. Update the JSDoc to mention the v2 → v3 migration.
  - Add `icon?: LucideIcon` to `PaneDefinition`. Import `type { LucideIcon } from "lucide-react"` at the top of the file.
  - Add a JSDoc note on `PaneDefinition.icon`: "Rendered by `<PaneToggleBar>` (ppr-15b). Required in practice; typed optional only so existing test fixtures don't break compilation. Pages that mount the toggle bar must supply an icon for every pane."

### Hook API changes

- [ ] In [`frontend/lib/patient-profile/useShellLayout.ts`](../../../../../../frontend/lib/patient-profile/useShellLayout.ts):
  - Rename `setPaneCollapsed` → `setPaneHidden` everywhere in this file (signature, implementation, returned object, exports).
  - Update `UseShellLayoutResult` interface accordingly.
  - `defaultLayout()` now writes `hidden: false` (not `collapsed: false`) and `version: 3`.

### `validateLayout` v2 → v3 auto-migration

- [ ] `validateLayout` accepts EITHER `version: 2` (legacy, with `collapsed` field) OR `version: 3` (new, with `hidden` field). Reject any other version.

- [ ] On v2 input, translate before returning: rename every `paneState[id].collapsed` → `paneState[id].hidden`, set `version: 3`. Return the v3-shape object.

- [ ] On v3 input, validate as today (just a field-name check) and return as-is.

- [ ] Add a `console.info("[useShellLayout] migrated v2 layout payload to v3")` after a successful v2 translation, so the rollout is observable in the field.

### Preset translation

- [ ] In [`frontend/lib/patient-profile/preset-translation.ts`](../../../../../../frontend/lib/patient-profile/preset-translation.ts):
  - The translator emits `version: 3` payloads with `hidden` (not `version: 2` with `collapsed`).
  - The `translateLegacyPreset` function still accepts the v1 cockpit-layout shape on input — but its OUTPUT switches from v2 to v3.
  - Built-in preset definitions in [`frontend/lib/patient-profile/built-in-presets.ts`](../../../../../../frontend/lib/patient-profile/built-in-presets.ts): rename every `collapsed: ...` field to `hidden: ...`. Bump `version: 2` → `version: 3` on each preset object.

### Hook callsite renames

- [ ] In [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx):
  - `setPaneCollapsed` → `setPaneHidden` everywhere (function declaration, callbacks, the `PatientProfileShellHandle` interface field, `useImperativeHandle` body, and the `onLayoutChange` payload's field name in `paneState[id].collapsed` → `paneState[id].hidden`).
  - The shell still uses `paneState[id].hidden` to decide between expanded/strip rendering — the visual model change lands in ppr-15c. **For ppr-15a, "hidden" reads as "collapsed" semantically.** This is fine because this task ships no visual change.

- [ ] In [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx):
  - `handleSetPaneCollapsed` → `handleSetPaneHidden`. Update the `useShellHotkeys` call site (`setPaneCollapsed: handleSetPaneCollapsed` → `setPaneHidden: handleSetPaneHidden`).
  - Update the destructuring on `shellRef.current?.setPaneCollapsed` → `shellRef.current?.setPaneHidden`.

- [ ] In [`frontend/hooks/useShellHotkeys.ts`](../../../../../../frontend/hooks/useShellHotkeys.ts):
  - Rename the prop name `setPaneCollapsed` → `setPaneHidden` in the options interface, in the destructure, and in every call site within the hook body.
  - The `[`/`]` hotkey behaviour stays semantically the same (still "collapses leftmost / rightmost"). It just calls a renamed function. Reinterpretation as "hide" lands in ppr-15d.

### Tests

- [ ] In [`frontend/lib/patient-profile/__tests__/useShellLayout.test.ts`](../../../../../../frontend/lib/patient-profile/__tests__/useShellLayout.test.ts):
  - Rename every `collapsed: ...` in test fixtures to `hidden: ...`.
  - Bump `version: 2` → `version: 3` in test fixtures.
  - Add 2 new tests:
    1. **`validateLayout` migrates v2 payload to v3** — feed a v2-shape object with `collapsed: true`, assert the result has `version: 3` and `hidden: true`.
    2. **`validateLayout` rejects v1 payload** — feed an object with `version: 1` (no `version` field too), assert `null`.

- [ ] In [`frontend/lib/patient-profile/__tests__/preset-translation.test.ts`](../../../../../../frontend/lib/patient-profile/__tests__/preset-translation.test.ts):
  - Update assertions: translator output now has `version: 3` + `hidden`. Existing v1 cockpit-layout fixtures unchanged.

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend vitest run lib/patient-profile/` — all green.

### Manual smoke

- [ ] Start `npm run dev`. Open `/dashboard/appointments/[id]/v2` on any appointment.
- [ ] Confirm the page renders identically to before (collapse + chevrons still work in their broken-but-functional state — this task ships no visual change).
- [ ] Open DevTools → Application → Local Storage. Find the `patient-profile:v1:layout` key. Manually edit a saved payload to use the OLD `version: 2` + `collapsed` shape. Reload the page.
- [ ] Confirm: page does not crash, layout still renders, the storage key is now `version: 3` + `hidden` (the migration ran on load and rewrote the payload after the next debounced save).

---

## Out of scope

- **Any visual change.** The toggle bar lands in ppr-15b (component) + ppr-15c (mount). The shell slimming lands in ppr-15c.
- **Hotkey reinterpretation.** `[`/`]` semantics stay "collapse leftmost/rightmost" until ppr-15d.
- **Live-consult guard.** That lands in ppr-15e.
- **Deleting the trailing spacer panel** or other shell internals. Pure rename here.
- **`PaneDefinition.icon` actually being USED.** ppr-15b will mount a toggle bar that consumes it; ppr-15a only adds the field to the type so ppr-15b's PR is small.

---

## Files expected to touch

**Modified:**
- `frontend/lib/patient-profile/types.ts` (~+10 LOC)
- `frontend/lib/patient-profile/useShellLayout.ts` (~+15 LOC for migration branch, rename one function)
- `frontend/lib/patient-profile/preset-translation.ts` (~5 line edits)
- `frontend/lib/patient-profile/built-in-presets.ts` (field renames + version bump)
- `frontend/components/patient-profile/Shell.tsx` (~10 line edits — mostly identifier renames)
- `frontend/components/patient-profile/PatientProfilePage.tsx` (~5 line edits)
- `frontend/hooks/useShellHotkeys.ts` (~5 line edits)
- `frontend/lib/patient-profile/__tests__/useShellLayout.test.ts` (rename + 2 new tests)
- `frontend/lib/patient-profile/__tests__/preset-translation.test.ts` (assertion updates)

**New:** none.

**Tests:** 2 new cases, ~30 LOC.

---

## Notes / open decisions

1. **Why bump `version` instead of accepting the rename in-place?** Future readers of the storage payload need to know "is `collapsed` an old field that means `hidden`, or is it a separately-meaningful new field?" Bumping the version makes the migration auditable and lets us delete the v2 branch cleanly once browsers have all rolled over (we can do that in a follow-up `ppr-16` after ~6 months).
2. **Why `hidden` and not `visible`?** Both work; `hidden` matches the existing `aria-hidden` and `hidden` HTML attribute conventions. The DEFAULT for a new pane is `hidden: false` (visible), which reads naturally.
3. **Why keep the v2 → v3 migration in `validateLayout` rather than a one-shot read?** Doctors might have multiple browsers (laptop + tablet). Each browser's localStorage migrates lazily on first read after the deploy. No coordinated migration needed.
4. **Should existing tests be split** into v2-fixture and v3-fixture variants? No — the tests are about the hook's behaviour, not the storage shape. Use v3 fixtures everywhere; the migration branch is covered by 1 new test.
5. **What about the existing `setPaneCollapsed` exported public API?** It's used only by `<PatientProfilePage>` and `useShellHotkeys` (the shell's own internal). Both are owned by this batch. Safe to rename.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** Mid-batch amendment in [plan-patient-profile-shell-rebuild-batch.md § Mid-batch amendment](../plan-patient-profile-shell-rebuild-batch.md#mid-batch-amendment-toggle-bar-redesign-ppr-15).
- **Original DL-6** (now amended): [Product plans/plan-patient-profile-shell-rebuild.md § DL-6](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).
- **Next task:** [`task-ppr-15b-pane-toggle-bar.md`](./task-ppr-15b-pane-toggle-bar.md) — fresh chat after ppr-15a is green.

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Pending
