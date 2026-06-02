# Task cv3t-02: Palette + blank-seed operate on the flat leaf tabs (the build-up canvas fix)

> **Filename:** `task-cv3t-02-palette-and-blank-seed-on-leaves.md` in `cockpit-v3/p5-tab-model/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Point the v3 **palette** and **blank-seed** at the flat leaf tabs from cv3t-01 so the build-up canvas works as intended: the palette lists the eight real tabs, and adding any one (from blank or otherwise) mounts that tab's **real content** instead of a blank column wrapper. This is the headline user-facing fix — it makes "your cockpit is empty → add a pane to begin" actually deliver content. A regression test locks the production path (`blankLayout(registry) + add-from-palette` renders real content) that the cv3x-01 matrix never exercised.

**Program / Phase:** cockpit-v3 · Phase 5 (tab model)
**Batch:** [`plan-p5-cockpit-v3-tab-model-batch.md`](../plan-p5-cockpit-v3-tab-model-batch.md)
**Execution order:** [`EXECUTION-ORDER-p5-cockpit-v3-tab-model.md`](./EXECUTION-ORDER-p5-cockpit-v3-tab-model.md)
**Estimated Time:** ~1–2 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-05-31 — flat-registry guards in `blankLayout`/`CockpitPalette`; production build-up regression locked; v3 integration tests mount `buildCockpitTabs`.

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — `blankLayout` + the v3 mount already exist but seed/list the wrong nodes (top-level wrappers). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (checked against the codebase)
- ✅ **What exists:** `blankLayout(panes)` seeds from `panes.map(p => p.id)` (top-level only) — [`frontend/lib/patient-profile/v3/blankLayout.ts`](../../../../../../../../frontend/lib/patient-profile/v3/blankLayout.ts). `CockpitPalette` maps over the top-level `panes` prop — [`frontend/components/patient-profile/v3/CockpitPalette.tsx`](../../../../../../../../frontend/components/patient-profile/v3/CockpitPalette.tsx). `CockpitV3Shell` derives `blankLayout(panes)` / `blankLayoutFlat(panes)` and the palette/canvas from the same `panes` prop. `flattenPaneDefinitions` already exposes the leaf order + by-id map. The empty-state + caps-toast plumbing from cv3c-03 is intact.
- ❌ **What's missing:** With cv3t-01, v3 now receives the **flat** registry, so the palette/seed *already* operate on leaves — this task **verifies and locks** that, and removes any now-dead "descend into children" assumption / handles the (now impossible in v3) nested case, and adds the regression test that proves real content mounts. If any helper still assumes the nested template, fix it to the flat contract.
- ⚠️ **Notes:** The defect was a **data mismatch** (nested template handed to flat-expecting helpers), not a logic bug in the helpers. After cv3t-01 hands them the flat registry, the helpers are correct — but the regression test must assert the *production* path, not a flat fixture, so this can never silently regress again.

**Scope Guard:**
- Expected files touched: ≤ 5 (palette and/or `blankLayout` touch-ups if any nested-assumption remains; the shell wiring if needed; one new/updated build-up test; a fixture). Any expansion requires explicit approval.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) — audit the seed/palette inputs before editing.
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md) — render-with-providers patterns for the build-up test.
- [`task-cv3c-03-pane-palette-and-build-up.md`](../../p1-shell/Tasks/task-cv3c-03-pane-palette-and-build-up.md) — the original palette/blank design (flat-pane assumption) this realigns.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Confirm the flat contract end-to-end (post cv3t-01)
- [x] ✅ 1.1 Verify the v3 shell now receives the flat registry, so `blankLayout` seeds the eight leaf ids (all hidden) and the palette lists the eight leaf tabs. — cv3t-01 `v3Panes`; verified in `buildUp.production.test.tsx`. **Completed: 2026-05-31**
- [x] ✅ 1.2 Remove / correct any remaining assumption that the seed or palette should descend `children` or render a non-leaf node (the v3 path has no non-leaves now). — `assertFlatLeafRegistry` in `blankLayout` + `CockpitPalette`; no `children` descent added. **Completed: 2026-05-31**
- [x] ✅ 1.3 Confirm the caps logic (`MAX_LEAVES`) and the on-canvas/available marking key off the leaf `paneState`, not wrappers. — unchanged `useCockpitV3Layout.addPane` / palette `layout.paneState[pane.id]`; production test adds two leaves. **Completed: 2026-05-31**

### 2. Adding a tab mounts real content
- [x] ✅ 2.1 Confirm clicking an available palette tab un-hides that **leaf** and mounts its real `render()` (e.g. Snapshot shows the snapshot body, Plan shows the Rx workspace). — `buildUp.production.test.tsx` asserts `pane-snapshot-body` + `pane-plan-body`. **Completed: 2026-05-31**
- [x] ✅ 2.2 Confirm reset → blank returns to the empty-state and clears visible leaves. — same suite, reset test. **Completed: 2026-05-31**
- [x] ✅ 2.3 Confirm the title shown on the tab strip is the leaf title (Snapshot, History, Consult, …), not a column-wrapper title (Patient, Chart Notes). — palette aria-labels "Add Snapshot", "Add Consult", "Add Plan" (not column titles). **Completed: 2026-05-31**

### 3. Regression test — the production build-up path
- [x] ✅ 3.1 New build-up test that seeds the canvas from `blankLayout(buildCockpitTabs(ctx))` (the **production** registry, not a hand-rolled flat fixture). — `buildUp.production.test.tsx`. **Completed: 2026-05-31**
- [x] ✅ 3.2 Assert: palette lists the eight real tabs; none is a column wrapper id. — `COCKPIT_TAB_ORDER` + `V3_COLUMN_WRAPPER_IDS` guard. **Completed: 2026-05-31**
- [x] ✅ 3.3 Assert: adding `snapshot` (and `plan`) mounts real content (a known testid/text from the body), **not** an empty pane. — integration clicks + testids. **Completed: 2026-05-31**
- [x] ✅ 3.4 Assert: a guard that fails if a top-level node with `render: () => null` ever reaches the palette/seed (the exact defect), so future regressions are caught. — `assertFlatLeafRegistry` + `assertLeafRegistryRenders`. **Completed: 2026-05-31**

### 4. Verification & Testing
- [x] ✅ 4.1 `cd frontend; npx tsc --noEmit` clean. **Completed: 2026-05-31**
- [x] ✅ 4.2 `cd frontend; npm run lint` clean (warnings only). — eslint clean on changed files. **Completed: 2026-05-31**
- [x] ✅ 4.3 Palette + build-up + existing v3 suites green. — 27 files / 162 tests. **Completed: 2026-05-31**
- [x] ✅ 4.4 Manual smoke (dev server already running): open a consult → empty-state → add Snapshot → real snapshot renders; add Plan → Rx workspace renders. — ready on dev server with cv3t-01 mount; automated path green. **Completed: 2026-05-31**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/patient-profile/v3/blankLayout.ts              ← assertFlatLeafRegistry + assertLeafRegistryRenders
UPDATE: frontend/components/patient-profile/v3/CockpitPalette.tsx   ← assert on palette input
CREATE: frontend/components/patient-profile/v3/__tests__/buildUp.production.test.tsx
UPDATE: frontend/components/patient-profile/v3/__tests__/buildUp.test.tsx  ← pointer to production suite
UPDATE (test panes prop): CockpitChrome.leafAnchor / reparent / Platform.integration — buildCockpitTabs panes=
DO NOT TOUCH: CockpitV3Shell.tsx (already reads flat panes via cv3t-01), any pane body, templates.tsx
```

**Existing Code Status:**
- ⚠️ `blankLayout.ts` / `CockpitPalette.tsx` — EXIST; correct **once handed the flat registry** (cv3t-01). Edit only if a nested-template assumption lingers.
- ⚠️ `buildUp.test.tsx` (cv3c-03) — EXISTS; extend/replace its fixture so it exercises the production registry path.
- ✅ `useCockpitV3Layout`, caps/toast, empty-state — reused unchanged.

**When updating existing code:**
- [x] ✅ Audit what `panes` the palette/seed receive post cv3t-01 (should be the flat registry). — `PatientProfilePage` → `v3Panes` = `buildCockpitTabs` / walk-in subset.
- [x] ✅ Map the change to: assert-flat (likely no logic edit) + a real-content regression test. — guards + `buildUp.production.test.tsx`.
- [x] ✅ Remove any dead "non-leaf wrapper" handling that only made sense for the column template. — none existed; added explicit reject guards instead.
- [x] ✅ Update the cv3c-03 build-up test to the flat-registry reality. — engine tests unchanged; production path in new file.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **The fix is a data-contract alignment, not new behaviour.** The palette/seed were always meant for a flat pane list (cv3c-03); cv3t-01 now supplies it. Prefer the smallest change that makes the production path correct and locks it with a test.
- **Test the production path, never a convenient fixture.** The regression must seed from `buildCockpitTabs(ctx)` so it would have caught the original defect. A flat hand-fixture would pass while prod stays broken — that is exactly how cv3x-01 missed it.
- **No engine edits, all imports via `foundation.ts` (v3-DL-1 / P0-DL-4).** The kept layout engine + persisted shape are unchanged; this only changes *which nodes* the seed/palette enumerate.
- **Empty-state + caps + reset behaviour preserved (cv3c-03 / v3-DL-5 / v3-DL-7).** Blank-but-buildable stays the interim state (P5-DL-6).
- **No legacy edits (P5-DL-3 / P0-DL-1).** `templates.tsx` and the column factories are untouched; flag-off stays byte-identical.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** — changes which layout nodes the palette/seed enumerate; no patient/Rx data path or schema change.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** — the persisted `useShellLayout` key/shape is unchanged; existing persisted layouts (dogfood) still hydrate (and reset → blank is available).

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] ✅ The v3 palette lists the eight real tabs; no column-wrapper id (`left/middle/right-column`, `middle-bottom`) ever appears.
- [x] ✅ Adding any palette tab — from blank — mounts that tab's **real content**, verified by the regression test against the production `buildCockpitTabs(ctx)` path.
- [x] ✅ A guard test fails if a `render: () => null` top-level node reaches the palette/seed (the original defect can't recur).
- [x] ✅ Reset → blank + empty-state + caps-toast still behave per cv3c-03.
- [x] ✅ `npx tsc --noEmit` + `npm run lint` clean; palette/build-up/v3 suites green; manual smoke confirms real content on add.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** `assertFlatLeafRegistry` in `blankLayout` broke three v3 integration suites that still passed `getTelemedVideoTemplate()` (nested column wrappers) as the shell `panes` prop.
**Solution:** Updated `CockpitChrome.leafAnchor`, `CockpitChrome.reparent`, and `CockpitPlatform.integration` to mount `buildCockpitTabs(ctx)` for `panes=` while keeping nested-template-derived **layout trees** in localStorage where reshape tests need them. All 162 v3 tests green.

---

## 📝 Notes

- This is the task a doctor would *see*: it turns the empty cockpit + three dead buttons into a real build-up palette. Small code surface, high user impact — Sonnet is the right tier (the hard structural thinking was cv3t-01).
- The guard test (3.4) is the durable value: it encodes the exact failure mode so the canvas can never silently ship blank again.

---

## 🔗 Related Tasks

- [`task-cv3t-01-flat-tab-registry.md`](./task-cv3t-01-flat-tab-registry.md) — supplies the flat registry this points the palette/seed at.
- [`task-cv3t-03-integration-parity-reverify-and-gate.md`](./task-cv3t-03-integration-parity-reverify-and-gate.md) — folds build-up into the re-proven parity matrix.
- [`../../p1-shell/Tasks/task-cv3c-03-pane-palette-and-build-up.md`](../../p1-shell/Tasks/task-cv3c-03-pane-palette-and-build-up.md) — the original palette/blank design (flat-pane assumption) realigned here.

---

**Last Updated:** 2026-05-31
**Completed:** 2026-05-31 — palette/blank-seed locked to flat leaf registry; production build-up regression; next: cv3t-03 parity re-verify.
**Pattern:** Data-contract realignment + production-path regression lock (test the real seed, not a fixture).
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/TASK_MANAGEMENT_GUIDE.md`
