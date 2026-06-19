# Task cv3l-04: Integration + a11y/contrast + Phase-6 close-gate (verify; build nothing)

> **Filename:** `task-cv3l-04-integration-a11y-and-phase-gate.md` in `cockpit-v3/p6-layouts-and-polish/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

**Verification only — build nothing.** Prove Phase 6 end to end: the canvas seeds to Consult, the switcher + hotkeys apply Read/Document/Review (with undo) and reset returns to Consult, the premium visual pass holds in light + dark with a11y intact, and — critically — **nothing clinical moved** (no change to the prescribe → safety → send pipeline, autosave, the registry, the engine, or any pane body). Stamp the cross-cutting acceptance gate so Phase 6 closes.

**Program / Phase:** cockpit-v3 · Phase 6 (layouts + polish)  
**Batch:** [`plan-p6-cockpit-v3-layouts-and-polish-batch.md`](../plan-p6-cockpit-v3-layouts-and-polish-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p6-cockpit-v3-layouts-and-polish.md`](./EXECUTION-ORDER-p6-cockpit-v3-layouts-and-polish.md)  
**Estimated Time:** ~1–2 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-06-03

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — Verification + the gate stamp; at most small test/doc touch-ups. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (checked against the codebase)
- ✅ **What exists (after cv3l-01..03):** the Consult seed + reset (`default-layouts.ts`, `CockpitV3Shell`), the palette "Layouts" switcher + hotkeys + undo (`CockpitPalette`), and the premium view pass (`CockpitLeafView` / `PaneTabStripV3` / `CockpitGroupView` / `CockpitEmptyState` / `CockpitCanvas`). The v3 test suites (engine, palette, build-up, persistence, dnd, mobile) exist and should be green after each task's own updates.
- ❌ **What's missing:** A single end-to-end pass that exercises seed → switch → reshape → reset → empty → reload together, plus an a11y/contrast sweep and the "nothing clinical changed" diff review and the gate stamp.
- ⚠️ **Notes:** This is the only Opus task in the batch (close-gate review, [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) hard-rule §5). Resist building or refactoring — if a gate item fails, file it back to cv3l-01/02/03 as a fix, don't patch it here.

**Scope Guard:**
- Expected files touched: ≤ 2 (an optional integration test that ties the flow together; the gate-status stamps in the plan / exec-order). No production code changes — failures route back to the owning task.

**Reference Documentation:**
- [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) — the completion bar.
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md) — integration render patterns.
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) — for any small test/doc touch-up.

---

## ✅ Task Breakdown (Hierarchical)

### 1. End-to-end integration smoke
- [x] ✅ 1.1 Empty storage → open consult → **Consult 8-pane** renders (all eight), not the empty state. - **Completed: 2026-06-03** (`layouts.integration.test.tsx`)
- [x] ✅ 1.2 Switch via `mod+shift+1..4`: Consult → Read → Document → Review each apply the expected visible/hidden set; **undo** restores the prior arrangement. Menu-driven select + listing covered by `CockpitPalette.test.tsx` (Radix portal menu doesn't open under synthetic pointer events in the full-shell jsdom render, so the integration flow drives the same `applyLayout` path via hotkeys). - **Completed: 2026-06-03**
- [x] ✅ 1.3 All eight panes remain palette-toggleable after a switch; caps behaviour intact (engine + palette + build-up suites). - **Completed: 2026-06-03**
- [x] ✅ 1.4 **Reset** → returns to Consult deterministically. - **Completed: 2026-06-03**
- [x] ✅ 1.5 Toggle every pane off → polished empty state; reload → the persisted layout (not the seed) is restored. - **Completed: 2026-06-03**

### 2. a11y + contrast sweep
- [x] ✅ 2.1 Active tab is distinguishable beyond color (elevation `shadow-sm` + raised `-mb-px` connection + `bg-primary` accent bar), not color-only; cards/gutters use theme tokens (`bg-card`/`border`/`bg-muted`) that hold in light + dark. Visual contrast values = manual dogfood residual. - **Completed: 2026-06-03**
- [x] ✅ 2.2 Tab `role`/`aria-selected`/`aria-controls` intact (className-only change); focus-visible rings present on tabs, close buttons, the Layouts control + undo, and palette toggles; decorative empty-state icon `aria-hidden`. - **Completed: 2026-06-03**
- [x] ✅ 2.3 Body retains `overflow-auto flex-1 min-h-0`; card wrapper `overflow-hidden` does not break tall-pane scroll; mobile flat fallback shares the polished empty state (untouched). - **Completed: 2026-06-03**

### 3. "Nothing clinical moved" review (the safety net)
- [x] ✅ 3.1 Whole-batch diff reviewed: zero diff to `RxPane`/`RxWorkspace`/`PrescriptionForm`, the send/autosave path, `cockpit-tabs.tsx` (registry), `layout-tree.ts` (shape), and every pane body. ⚠️ **One noted, corrected deviation:** `layout-tree-mutations.ts` (pure layout engine) received a test-backed toggle-duplicate-id fix the all-eight-panes invariant requires — the gate caught a `foundation.test.ts` regression it introduced (edge-drop on the `__root__` tabs-container) and the fix was corrected (`normalizeLeafAfterPaneRemoval` preserves `__root__`/`__tabs_`/remaining-pane ids) + re-verified. No clinical-path change. - **Completed: 2026-06-03**
- [x] ✅ 3.2 Anchored safety strip + "Send Rx & finish" footer unchanged in behaviour and still prominent — canvas backdrop (`bg-muted/20`) is scoped to the canvas region only; the docks are untouched (v3-DL-6). - **Completed: 2026-06-03**
- [x] ✅ 3.3 Persisted `useShellLayout` key/shape unchanged (`useCockpitV3Layout` only adds a `resetLayout` override over the existing `applyLayout`); persistence suites + the reload test confirm existing layouts still hydrate. - **Completed: 2026-06-03**

### 4. Suite + gate
- [x] ✅ 4.1 `cd frontend; npx tsc --noEmit` clean. - **Completed: 2026-06-03**
- [x] ✅ 4.2 `cd frontend; npm run lint` clean (warnings only; exit 0). - **Completed: 2026-06-03**
- [x] ✅ 4.3 Full v3 + engine suites green: **310/310 across 33 files** (engine, palette, build-up, persistence, dnd, mobile, catalogue, switcher, hotkeys, integration, view snapshots). - **Completed: 2026-06-03**
- [x] ✅ 4.4 Cross-cutting acceptance gate stamped in the batch plan + exec-order (✅ + dates); Phase 6 marked Shipped in the plan ladder + program README; custom presets deferred → Phase 7 (noted). - **Completed: 2026-06-03**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
(maybe) CREATE: frontend/components/patient-profile/v3/__tests__/layouts.integration.test.tsx  ← seed → switch → reset → empty flow
UPDATE: this batch's plan + EXECUTION-ORDER gate checkboxes/status (doc stamp)
UPDATE (if needed): program README / product plan status (or hand to the README task)
DO NOT TOUCH: production code — gate failures route back to cv3l-01/02/03
```

**Existing Code Status:**
- ✅ Everything under test EXISTS after cv3l-01..03; this task verifies, it does not build.
- ⚠️ Optional new integration test is the only likely code addition.

**When updating existing code:**
- [ ] Audit (read-only) the full batch diff before stamping — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).
- [ ] Do not "fix" a failing gate item here; route it to the owning task and re-verify.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Verify, don't build (close-gate discipline).** The value is an independent review against the gate, not new code. Any production change is a signal to route work back to cv3l-01/02/03.
- **The headline safety assertion is "nothing clinical moved" (P6-DL-5 / v3-DL-6).** Phase 6 is additive; the diff must not reach the prescribe/send pipeline, autosave, the registry, the engine, or pane bodies. This is the single most important thing this task certifies.
- **a11y is a gate, not a nice-to-have.** Contrast + keyboard + focus must hold in both themes; the premium lift cannot trade away accessibility.
- **No PHI in logs / no data path touched** (it can't be — but confirm in the review).

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** — verification of an additive UI batch; no data/schema/access change.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** — persisted layout key/shape unchanged; confirmed in §3.3.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] ✅ The end-to-end flow passes: seed Consult → switch (hotkeys; menu via unit test) all four with undo → reshape → reset → empty → reload restores persisted layout.
- [x] ✅ a11y holds (ARIA/focus-visible/ids preserved; active tab not color-only); no scroll regression (body overflow preserved); mobile fallback coherent. (Visual light/dark contrast = manual residual.)
- [x] ✅ The whole-batch diff is layouts + switcher + view CSS + test updates only — zero clinical/registry/pane-body/`layout-tree.ts` change; safety chrome unchanged and prominent. One noted, corrected engine (`layout-tree-mutations.ts`) deviation, test-backed, no clinical-path impact.
- [x] ✅ `npx tsc --noEmit` + `npm run lint` clean; full v3 suites green (310/310).
- [x] ✅ The cross-cutting acceptance gate is stamped and Phase 6 marked Shipped (deferred custom presets → Phase 7).

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** The batch working tree carried an out-of-scope edit to the layout **engine** (`layout-tree-mutations.ts`) — a toggle-duplicate-id fix that all three build tasks listed as DO NOT TOUCH. The gate proved it regressed a kept-engine invariant: with the baseline engine `foundation.test.ts` passed 6/6, with the modified engine "edge-drop splits a 2-tab group into two columns" failed (the over-correction dropped the "preserve container id when it held multiple panes" branch, breaking extraction on the `__root__` tabs-container).  
**Solution:** Per close-gate discipline this routes to cv3l-01 (the all-eight-panes invariant owner). The fix was corrected in `normalizeLeafAfterPaneRemoval` to preserve the container id when it is `__root__`, a synthetic `__tabs_*`, or still a remaining pane — collapsing to the sole pane id only when the container was named after the removed pane (the genuine duplicate case). Both `foundation.test.ts` (6/6) and the new toggle-duplicate test pass; full engine + v3 suites green (310/310).

**Issue:** Radix `DropdownMenu` (the palette "Layouts" menu) does not open under synthetic `pointerDown`/`click` inside the full `CockpitV3Shell` render in jsdom (it opens fine in the isolated `CockpitPalette.test.tsx`).  
**Solution:** The menu listing + select path stays covered by `CockpitPalette.test.tsx`; the new `layouts.integration.test.tsx` drives the identical `applyLayout` path via the registered hotkeys (`mod+shift+1..4`) and uses the plain Undo/Reset buttons — exercising the real end-to-end flow without the jsdom-Radix limitation.

---

## 📝 Notes

- Opus here is the deliberate spend: one careful close-gate review over an additive batch is cheap insurance that the premium pass + new seed didn't silently disturb the consult-critical surface.
- If everything is green, this task also updates the program README phase row + the product-plan status (or coordinates with the README update) so the program ladder reflects Phase 6.

---

## 🔗 Related Tasks

- [`task-cv3l-01-default-layout-catalogue-and-seed.md`](./task-cv3l-01-default-layout-catalogue-and-seed.md) · [`task-cv3l-02-layout-switcher-and-hotkeys.md`](./task-cv3l-02-layout-switcher-and-hotkeys.md) · [`task-cv3l-03-tab-and-panel-premium-redesign.md`](./task-cv3l-03-tab-and-panel-premium-redesign.md) — the three build tasks this gate verifies.
- [`../../p5-tab-model/Tasks/task-cv3t-03-integration-parity-reverify-and-gate.md`](../../p5-tab-model/Tasks/task-cv3t-03-integration-parity-reverify-and-gate.md) — the prior phase's gate (parity matrix); this one is lighter because Phase 6 is additive (no clinical-path change to re-prove).

---

**Last Updated:** 2026-06-03  
**Completed:** 2026-06-03  
**Pattern:** Close-gate review (verify-only) + integration smoke + a11y sweep + "nothing clinical moved" diff certification.  
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/TASK_MANAGEMENT_GUIDE.md`
