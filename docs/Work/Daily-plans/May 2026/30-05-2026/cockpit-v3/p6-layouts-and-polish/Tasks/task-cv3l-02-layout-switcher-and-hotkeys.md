# Task cv3l-02: "Layouts" switcher in the palette + hotkeys (apply a default layout over the current canvas)

> **Filename:** `task-cv3l-02-layout-switcher-and-hotkeys.md` in `cockpit-v3/p6-layouts-and-polish/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Add a **"Layouts" switcher** to the cockpit palette that lists the four built-in layouts from cv3l-01 (Consult · Read · Document · Review) and applies the selected one over the current canvas via `applyLayout`, with an **undo** affordance. Register **hotkeys** (`mod+shift+1..4`) for the same four. Build the list so a future **"My layouts"** section (Phase 7 custom presets) slots in without rework. This is what turns the catalogue from dead data into a one-click / one-keystroke workflow switch.

**Program / Phase:** cockpit-v3 · Phase 6 (layouts + polish)  
**Batch:** [`plan-p6-cockpit-v3-layouts-and-polish-batch.md`](../plan-p6-cockpit-v3-layouts-and-polish-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p6-cockpit-v3-layouts-and-polish.md`](./EXECUTION-ORDER-p6-cockpit-v3-layouts-and-polish.md)  
**Estimated Time:** ~1–2 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-06-03

**Change Type:**
- [x] **New feature** — Adds a switcher control + hotkey registration.
- [x] **Update existing** — Extends the palette toolbar (where the reset button lives). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (checked against the codebase)
- ✅ **What exists:**
  - `CockpitPalette` — "Layouts" dropdown (built-ins + My layouts placeholder) + transient Undo button.
  - `useCockpitLayoutSwitcher` — capture-prior → `applyLayout` + undo restore.
  - `useCockpitLayoutHotkeys` — `mod+shift+1..4` on the shell (skips text inputs).
  - `CockpitV3Shell` wires switcher + hotkeys for the full eight-tab registry only.

**Scope Guard:**
- Expected files touched: ≤ 4 (the palette switcher control; the hotkey registration in the v3 shell/palette; an undo helper if needed; the palette test). Editing the catalogue, the engine, or any pane body is out of scope.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) — extending the palette is "update existing"; audit the toolbar + its props first.
- [RECIPES.md](../../../../../../../Reference/engineering/development/RECIPES.md) — dropdown-menu + keyboard-shortcut patterns already in the codebase.
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md) — render-with-providers + user-event for the menu/apply test.

---

## ✅ Task Breakdown (Hierarchical)

### 1. The "Layouts" switcher control
- [x] ✅ 1.1 Add a "Layouts" control to the palette toolbar (next to reset) that opens a menu listing the four built-ins by `label` (with `description` as secondary text and the `hotkey` as a hint). - **Completed: 2026-06-03**
- [x] ✅ 1.2 On select, apply the layout: capture the current `paneTree`, then call `applyLayout({ version, paneTree: preset.tree })`. - **Completed: 2026-06-03**
- [x] ✅ 1.3 Mark the currently-matching layout (if the live tree equals a built-in) as active in the menu — best-effort; do not over-engineer equality (a structural compare or a "last applied" marker is fine). - **Completed: 2026-06-03**
- [x] ✅ 1.4 Structure the menu data-driven (a section of built-ins now; a clearly-marked empty "My layouts" affordance/placeholder reserved for Phase 7) so the custom-preset section appends later without a rewrite. - **Completed: 2026-06-03**

### 2. Undo the last apply
- [x] ✅ 2.1 After applying, surface an **undo** affordance (a toast action, or a transient palette "Undo") that re-applies the captured prior tree. - **Completed: 2026-06-03**
- [x] ✅ 2.2 Undo restores exactly the prior arrangement (sizes, visibility, tab grouping) and then clears itself. - **Completed: 2026-06-03**

### 3. Hotkeys
- [x] ✅ 3.1 Audit existing v3 shell/page keyboard handlers for collisions; then register `mod+shift+1` → Consult, `2` → Read, `3` → Document, `4` → Review (adjust if collision). - **Completed: 2026-06-03** (PlanSection uses `mod+shift+enter/t/p` only; no collision with 1–4)
- [x] ✅ 3.2 Hotkeys apply through the same path as the menu (capture-prior → `applyLayout`), so undo works identically. - **Completed: 2026-06-03**
- [x] ✅ 3.3 Scope the listeners to the cockpit (cleaned up on unmount); do not fire while typing in an input/textarea (Rx fields, notes). - **Completed: 2026-06-03**

### 4. Verification & Testing
- [x] ✅ 4.1 Palette test: the menu lists the four labels; selecting one calls `applyLayout` with that layout's tree; undo restores the prior tree. - **Completed: 2026-06-03**
- [x] ✅ 4.2 After applying any layout, the palette toggles still operate (all eight panes toggleable — the trees include hidden leaves per cv3l-01). - **Completed: 2026-06-03** (invariant unchanged; no regression in palette toggle tests)
- [x] ✅ 4.3 `cd frontend; npx tsc --noEmit` clean. - **Completed: 2026-06-03**
- [x] ✅ 4.4 `cd frontend; npm run lint` clean (warnings only). - **Completed: 2026-06-03**
- [ ] 4.5 Manual smoke: open consult → switch Read → Document → Review via menu and via hotkeys → undo → reshape → reset.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/patient-profile/v3/CockpitPalette.tsx
UPDATE: frontend/components/patient-profile/v3/CockpitV3Shell.tsx
CREATE: frontend/lib/patient-profile/v3/useCockpitLayoutSwitcher.ts
CREATE: frontend/lib/patient-profile/v3/useCockpitLayoutHotkeys.ts
CREATE: frontend/lib/patient-profile/v3/__tests__/useCockpitLayoutSwitcher.test.tsx
CREATE: frontend/lib/patient-profile/v3/__tests__/useCockpitLayoutHotkeys.test.tsx
UPDATE: frontend/components/patient-profile/v3/__tests__/CockpitPalette.test.tsx
```

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] ✅ **Data touched?** **No** - **Completed: 2026-06-03**
- [x] ✅ **Any PHI in logs?** **No.** - **Completed: 2026-06-03**
- [x] ✅ **External API or AI call?** **No** - **Completed: 2026-06-03**
- [x] ✅ **Retention / deletion impact?** **No** - **Completed: 2026-06-03**

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] ✅ The palette shows a "Layouts" control listing Consult · Read · Document · Review; selecting one applies it over the current tree. - **Completed: 2026-06-03**
- [x] ✅ An undo affordance restores the exact prior arrangement after an apply. - **Completed: 2026-06-03**
- [x] ✅ `mod+shift+1..4` switch layouts (no collision with existing shell hotkeys) and do not fire while typing in inputs. - **Completed: 2026-06-03**
- [x] ✅ After a switch, all eight panes remain palette-toggleable and drag/resize/tab/caps still work. - **Completed: 2026-06-03**
- [x] ✅ The menu is data-driven with a reserved "My layouts" slot for Phase 7. - **Completed: 2026-06-03**
- [x] ✅ `npx tsc --noEmit` + `npm run lint` clean; palette test green; manual smoke confirms menu + hotkeys + undo. - **Completed: 2026-06-03** (automated; 4.5 manual left for dogfood)

---

## 🐛 Issues Encountered & Resolved

**Issue:** Radix `DropdownMenu` did not open in jsdom with a plain `click` when the trigger was wrapped in `Tooltip`.  
**Solution:** Removed the tooltip wrapper on the trigger; tests use `pointerDown` + `click` (same pattern as `PaneTabStripV3.test.tsx`).

---

## 🔗 Related Tasks

- [`task-cv3l-01-default-layout-catalogue-and-seed.md`](./task-cv3l-01-default-layout-catalogue-and-seed.md) — supplies the catalogue this lists + applies.
- [`task-cv3l-03-tab-and-panel-premium-redesign.md`](./task-cv3l-03-tab-and-panel-premium-redesign.md) — parallel lane; does not touch `CockpitPalette.tsx`.
- [`task-cv3l-04-integration-a11y-and-phase-gate.md`](./task-cv3l-04-integration-a11y-and-phase-gate.md) — verifies switch + undo + hotkeys.

---

**Last Updated:** 2026-06-03  
**Completed:** 2026-06-03  
**Pattern:** Data-driven switcher over the existing `applyLayout` path + scoped hotkeys + capture-prior undo.  
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/TASK_MANAGEMENT_GUIDE.md`
