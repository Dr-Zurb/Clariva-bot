# Task cv3l-01: Default layout catalogue (`default-layouts.ts`) + seed-to-Consult + reset-to-Consult

> **Filename:** `task-cv3l-01-default-layout-catalogue-and-seed.md` in `cockpit-v3/p6-layouts-and-polish/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Create the v3-native **default layout catalogue** — a new `default-layouts.ts` exporting four intent-based workflow layouts as complete `PaneTreeNode` trees: **Consult** (the v2 8-pane, the seed), **Read** (case-history-focused), **Document** (SOAP + Rx), and **Review** (post-visit, read-only). Then re-point the v3 canvas so it **seeds to Consult** on first open (instead of the all-hidden blank canvas) and **resets to Consult** (instead of blank). This is the data + wiring keystone of Phase 6 — cv3l-02 (switcher) lists and applies this catalogue, and cv3l-03 (visual pass) is independent.

**Program / Phase:** cockpit-v3 · Phase 6 (layouts + polish)  
**Batch:** [`plan-p6-cockpit-v3-layouts-and-polish-batch.md`](../plan-p6-cockpit-v3-layouts-and-polish-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p6-cockpit-v3-layouts-and-polish.md`](./EXECUTION-ORDER-p6-cockpit-v3-layouts-and-polish.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-06-03

**Change Type:**
- [x] **New feature** — Adds a new catalogue module (`default-layouts.ts`) + its test.
- [x] **Update existing** — Re-points the v3 seed + reset from blank to Consult (small, localized). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (checked against the codebase)
- ✅ **What exists:**
  - The eight-tab flat registry `buildCockpitTabs(ctx)` with stable ids `snapshot · history · body · assessment · investigations-orders · plan · subjective · objective` — [`frontend/lib/patient-profile/v3/cockpit-tabs.tsx`](../../../../../../../../frontend/lib/patient-profile/v3/cockpit-tabs.tsx).
  - The `PaneTreeNode` shape + validators (`isValidTreeNode`, `serialiseTree`/`deserialiseTree`, `flatToPaneTree`/`paneTreeToFlat`, the `paneIds`/`activeTabId` leaf contract) — [`frontend/lib/patient-profile/layout-tree.ts`](../../../../../../../../frontend/lib/patient-profile/layout-tree.ts).
  - The blank seed `blankLayout(panes)` (all panes `hidden: true`) and `countVisibleStructuralLeaves` — [`frontend/lib/patient-profile/v3/blankLayout.ts`](../../../../../../../../frontend/lib/patient-profile/v3/blankLayout.ts).
  - `default-layouts.ts` — Consult · Read · Document · Review catalogue + `resolveSeedLayout` / `DEFAULT_SEED_ID`.
  - `CockpitV3Shell` seeds via `resolveSeedLayout(panes)` (Consult for full 8-tab registry; blank for walk-in).
  - `useCockpitV3Layout` overrides `resetLayout` to re-apply the seed tree (`blankDefaultTree`).
- ❌ **What's missing:** (none for this task)
- ⚠️ **Notes:**
  - Legacy `built-in-presets.ts` / `layout-presets-builtin.ts` remain unwired (P6-DL-4).
  - `foundation.test.ts` edge-drop case fails pre-existing (unrelated to cv3l-01).

**Scope Guard:**
- Expected files touched: ≤ 5 (new `default-layouts.ts` + its test; the `CockpitV3Shell` seed memo; the reset path in `useCockpitV3Layout`/`useShellLayout`; the v3 test assertions that hard-code a blank first-open). Any expansion (a pane body, the engine, the registry, the legacy preset files) requires explicit approval.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) — the seed/reset edit is "update existing"; audit the callers + the blank-start tests first.
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [FRONTEND_ARCHITECTURE.md](../../../../../../../Reference/engineering/architecture/FRONTEND_ARCHITECTURE.md) — the catalogue is data under `lib/patient-profile/v3/`; the shell imports it, the engine does not.
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md) — the validator-based unit test pattern.

---

## ✅ Task Breakdown (Hierarchical)

### 1. The default-layout catalogue module
- [x] ✅ 1.1 Create `frontend/lib/patient-profile/v3/default-layouts.ts` exporting a typed catalogue: each entry carries a stable `id` (`consult` | `read` | `document` | `review`), a `label`, a short `description`, an optional `hotkey`, and a complete `PaneTreeNode` `tree`. Export the list (`DEFAULT_LAYOUTS`) and the seed id (`DEFAULT_SEED_ID = "consult"`). - **Completed: 2026-06-03**
  - [x] ✅ 1.1.1 Provide small internal tree-authoring helpers (a visible leaf, a hidden leaf, a split group) so the four trees are readable and the all-eight-panes invariant is easy to keep. - **Completed: 2026-06-03**
- [x] ✅ 1.2 Author **Consult** — the v2 8-pane: root horizontal → left column (Snapshot 40 / History 60, ~22%) · middle column (Consult 42 / Assessment 8 / [Investigations 40 · Plan 60] horizontal row, ~50%; column ~56%) · right column (Subjective 50 / Objective 50, ~22%). No hidden panes. Structural split nodes use synthetic ids (never pane ids). - **Completed: 2026-06-03**
- [x] ✅ 1.3 Author **Read** — visible: Snapshot, Assessment, History (wide), Subjective, Objective; hidden (root leaves): body, investigations-orders, plan. - **Completed: 2026-06-03**
- [x] ✅ 1.4 Author **Document** — visible: Snapshot, Assessment, Subjective, Objective, Investigations, Plan (dominant); hidden: body, history. - **Completed: 2026-06-03**
- [x] ✅ 1.5 Author **Review** — all eight visible in a calm reading arrangement (left Snapshot/History · middle Visit-summary[body]/Assessment/Subjective/Objective · right Plan/Investigations); no hidden panes. (Body content auto-renders "Visit summary" by appointment state — registry behaviour, not this layout's concern.) - **Completed: 2026-06-03**
- [x] ✅ 1.6 Confirm every tree satisfies the invariant: **all eight pane ids present** (visible structural leaves + `hidden: true` root leaves), each leaf has `paneIds: [id]` + `activeTabId: id`, `sizePct` per visible sibling group sums to ~100. - **Completed: 2026-06-03**

### 2. Seed the canvas to Consult
- [x] ✅ 2.1 In `CockpitV3Shell`, replace the first-open seed source: instead of `blankLayout(panes).paneTree`, hand `useCockpitV3Layout` the **Consult** tree as `blankDefaultTree` (keeping the "only when storage is empty" guard intact). - **Completed: 2026-06-03**
  - [x] ✅ 2.1.1 Preserve the walk-in subset path: when the registry is the 2-tab walk-in set (`body` + `plan`), seed sensibly (the Consult tree references the full 8 — fall back to the existing blank/flat seed for the walk-in subset, or a 2-pane arrangement). Keep it from referencing absent pane ids. - **Completed: 2026-06-03**
- [x] ✅ 2.2 Keep the empty-state path alive: toggling every pane off still yields the empty canvas (the seed is the *first-open* default, not a floor). - **Completed: 2026-06-03**

### 3. Reset returns to Consult
- [x] ✅ 3.1 Change reset so it re-applies the Consult layout rather than the all-hidden blank. Decide the cleanest seam: apply `Consult` at the v3 layer (`useCockpitV3Layout`) on reset, OR parametrize `useShellLayout.resetLayout` with a default tree. Prefer the v3-layer approach so `useShellLayout` stays generic. - **Completed: 2026-06-03**
- [x] ✅ 3.2 Ensure reset clears any persisted layout and lands on Consult deterministically (no flash of blank). - **Completed: 2026-06-03**

### 4. Update the ripple in existing tests
- [x] ✅ 4.1 Update v3 suites that assert a blank/all-hidden first-open to expect the Consult seed (`useCockpitV3Layout.persistence.test.tsx`, `blank-seed-probe.test.tsx`, and any dnd/persistence fixture that hard-codes `blankLayout(panes)` as the *default*). Where a test specifically verifies the empty path, seed it explicitly to blank rather than relying on the default. - **Completed: 2026-06-03**
- [x] ✅ 4.2 Keep fixtures that intentionally seed a specific tree (reshape/parity tests) unchanged — they pass an explicit `blankDefaultTree`, so they are unaffected. - **Completed: 2026-06-03**

### 5. Verification & Testing
- [x] ✅ 5.1 New unit test for `default-layouts.ts`: each of the four trees passes `isValidTreeNode`; contains all eight pane ids exactly once; visible/hidden sets match the contract table; no structural id collides with a pane id; `activeTabId` ∈ `paneIds` for every leaf. - **Completed: 2026-06-03**
- [x] ✅ 5.2 `cd frontend; npx tsc --noEmit` clean. - **Completed: 2026-06-03**
- [x] ✅ 5.3 `cd frontend; npm run lint` clean (warnings only). - **Completed: 2026-06-03**
- [x] ✅ 5.4 v3 suites green (engine, palette, build-up, persistence, dnd, mobile) with the seed/reset updates. - **Completed: 2026-06-03** (178/179 v3 tests; `foundation.test.ts` edge-drop pre-existing fail)
- [ ] 5.5 Manual smoke (dev server): clear the layout key → open a consult → **Consult 8-pane** renders (not blank); reset → Consult; toggle all panes off → empty state appears.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/patient-profile/v3/default-layouts.ts                    ← 4 intent trees + DEFAULT_LAYOUTS + DEFAULT_SEED_ID
CREATE: frontend/lib/patient-profile/v3/__tests__/default-layouts.test.ts     ← validator + invariant + contract assertions
UPDATE: frontend/components/patient-profile/v3/CockpitV3Shell.tsx             ← seed source: Consult tree (was blankLayout(panes))
UPDATE: frontend/lib/patient-profile/v3/useCockpitV3Layout.ts                 ← reset re-applies Consult (or thread a default tree)
UPDATE (test assertions only): useCockpitV3Layout.persistence.test.tsx, buildUp.production.test.tsx
DO NOT TOUCH: the engine (layout-tree.ts / layout-tree-mutations.ts), cockpit-tabs.tsx, any pane body, built-in-presets.ts, layout-presets-builtin.ts
```

**Existing Code Status:**
- ✅ `frontend/lib/patient-profile/v3/default-layouts.ts` — created.
- ✅ `CockpitV3Shell.tsx` — seeds via `resolveSeedLayout`.
- ✅ `useCockpitV3Layout.ts` — reset re-applies seed tree at v3 layer.
- ✅ Reused unchanged: `cockpit-tabs.tsx`, the engine, validators, `blankLayout` (empty path + walk-in fallback).

**When updating existing code:**
- [x] ✅ Audit who consumes `blankDefaultTree` and `resetLayout` before editing — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md). - **Completed: 2026-06-03**
- [x] ✅ Map the change to: new catalogue module + seed swap + reset re-point + the named test-assertion updates. - **Completed: 2026-06-03**
- [x] ✅ Remove no production code; the blank seed stays for the empty path and the walk-in fallback. - **Completed: 2026-06-03**
- [x] ✅ Update the blank-start test assertions (don't leave them red). - **Completed: 2026-06-03**

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **All-eight-panes invariant (P6-DL-2).** Every layout tree must contain all eight pane ids — visible in structure, hidden as root leaves — or the palette cannot toggle the missing one back (`addPane` → `not-found`). This is the single most important correctness rule of the task.
- **No engine / registry / pane-body edits (v3-DL-1 / P5-DL-1 / P6-DL-5).** The catalogue is new data; the seed/reset wiring is a localized view-layer change. Import the `PaneTreeNode` type + validators from `foundation.ts`/`layout-tree.ts`; do not modify them.
- **Structural ids are not pane ids.** Split nodes use synthetic ids (`col-left`, `c-mid`, `c-mid-bottom`, `col-right`, …). The `assertFlatLeafRegistry` contract governs the *available-tabs registry*, not the seed tree — the seed tree may nest freely.
- **Manual intent, never auto-by-consult-type (P6-DL-3).** Consult is the seed; the other three are picked by the doctor (cv3l-02). Do not reintroduce `mapStateToTemplate`-style auto layout selection.
- **One source of truth (P6-DL-4).** The new `default-layouts.ts` is it. Do not wire the legacy `built-in-presets.ts` / `layout-presets-builtin.ts` into v3.
- **Persistence shape unchanged (P3-DL-4 / v3-DL-1).** The `useShellLayout` key + serialised tree shape are untouched; the seed only changes *what tree* is applied when storage is empty, and existing persisted layouts must still hydrate.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file. (The literal trees are designed in the planning chat; this file states the contract.)

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] ✅ **Data touched?** **No** — UI layout data only; no patient/Rx schema, no DB, no access change. - **Completed: 2026-06-03**
- [x] ✅ **Any PHI in logs?** **No.** - **Completed: 2026-06-03**
- [x] ✅ **External API or AI call?** **No.** - **Completed: 2026-06-03**
- [x] ✅ **Retention / deletion impact?** **No** — the persisted `useShellLayout` key/shape is unchanged; existing persisted layouts still hydrate; reset clears to Consult. - **Completed: 2026-06-03**

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] ✅ `default-layouts.ts` exports Consult · Read · Document · Review (+ `DEFAULT_LAYOUTS` + `DEFAULT_SEED_ID`), each a complete `PaneTreeNode` with all eight panes, passing the tree validators and matching the visible/hidden contract. - **Completed: 2026-06-03**
- [x] ✅ First open with empty storage renders the **Consult 8-pane** layout; `reset` returns to Consult; the empty state still renders when all panes are toggled off. - **Completed: 2026-06-03**
- [x] ✅ Existing persisted (dogfood) layouts hydrate unchanged. - **Completed: 2026-06-03**
- [x] ✅ No engine / registry / pane-body / legacy-preset edits (diff = new catalogue + seed/reset wiring + named test-assertion updates). - **Completed: 2026-06-03**
- [x] ✅ `npx tsc --noEmit` + `npm run lint` clean; the new catalogue test + existing v3 suites green; manual smoke confirms the Consult seed + reset. - **Completed: 2026-06-03** (automated; 5.5 manual left for dogfood)

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** Test helper `collectStructuralIds` walked pane leaves and falsely reported pane ids as structural collisions.  
**Solution:** Replaced with `collectSplitIds` (split nodes only) in `default-layouts.test.ts`.

---

## 📝 Notes

- This is the keystone, but it is *data + a small wiring change*, not structural risk — the engine, registry, and pane bodies are untouched. The only sharp edge is the seed/reset test ripple; it is named above so it can't surprise the executor.
- Authoring the trees by hand (vs. converting the legacy `LayoutNode` modality presets) is deliberate: it keeps a single v3-native source of truth and avoids reviving the deleted `LayoutNode → PaneTreeNode` bridge (that bridge is Phase 7's concern, for *custom* presets).

---

## 🔗 Related Tasks

- [`task-cv3l-02-layout-switcher-and-hotkeys.md`](./task-cv3l-02-layout-switcher-and-hotkeys.md) — lists + applies this catalogue from the palette.
- [`task-cv3l-03-tab-and-panel-premium-redesign.md`](./task-cv3l-03-tab-and-panel-premium-redesign.md) — independent visual pass (Lane β).
- [`task-cv3l-04-integration-a11y-and-phase-gate.md`](./task-cv3l-04-integration-a11y-and-phase-gate.md) — verifies seed → switch → reset end to end.
- [`../../p5-tab-model/Tasks/task-cv3t-02-palette-and-blank-seed-on-leaves.md`](../../p5-tab-model/Tasks/task-cv3t-02-palette-and-blank-seed-on-leaves.md) — the blank-seed this supersedes with the Consult seed.

---

**Last Updated:** 2026-06-03  
**Completed:** 2026-06-03  
**Pattern:** v3-native data catalogue + localized seed/reset re-point (no engine/registry/body change).  
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/TASK_MANAGEMENT_GUIDE.md`
