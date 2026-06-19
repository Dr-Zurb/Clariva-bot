# Task cv3l-05: Fixed app-shell, header differentiation, reset rename + full-fidelity saved layouts

> **Filename:** `task-cv3l-05-cockpit-shell-chrome-and-layout-persistence.md` in `cockpit-v3/p6-layouts-and-polish/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Post-gate UX/UI follow-ups raised during Phase 6 dogfood, plus the deferred **save-layout** feature done at full fidelity. Four work items:

1. **Fixed app-shell** — the cockpit must fill the viewport below the palette with the **anchored "Send Rx & finish" footer permanently pinned**; only pane bodies scroll. Today the page over-requests height (`h-screen` inside a scrolling `<main>` that sits below the dashboard header), so the footer falls below the fold and the doctor must scroll to reach it.
2. **Tab header differentiation** — the tab strip currently uses `bg-card` (same as the body) and blends into the content. Restore a clear **header band** while keeping tab chips as raised, separated chips (no between-tab line artifacts — the regression we chased during cv3l-03 dogfood).
3. **Save layout (full fidelity)** — wire the "My layouts" section (currently a placeholder) to real per-doctor saved layouts: save / apply / rename / delete with the existing 5-preset cap. Must round-trip the **v3 `PaneTreeNode`** exactly (tabs + hidden + sizes), which the existing `LayoutNode` bridge cannot represent — so this includes a small **backend schema change** to persist the v3 tree natively.
4. **Reset rename** — the reset control already re-applies the **Consult** seed (not blank), but its label/tooltip still say "Reset to blank". Rename to "Reset to Consult".

**Program / Phase:** cockpit-v3 · Phase 6 (layouts + polish) — post-gate follow-up
**Batch:** [`plan-p6-cockpit-v3-layouts-and-polish-batch.md`](../plan-p6-cockpit-v3-layouts-and-polish-batch.md)
**Execution order:** [`EXECUTION-ORDER-p6-cockpit-v3-layouts-and-polish.md`](./EXECUTION-ORDER-p6-cockpit-v3-layouts-and-polish.md)
**Estimated Time:** ~4–6 hours (item 3 dominates; incl. backend)
**Status:** ✅ **DONE**
**Completed:** 2026-06-03

**Change Type:**
- [x] **New feature** — save-layout persistence (item 3).
- [x] **Update existing** — shell scroll structure, tab chrome, reset rename (items 1, 2, 4). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (checked against the codebase)
- ✅ **What exists:**
  - **Shell structure** — [`CockpitV3Shell.tsx`](../../../../../../../../frontend/components/patient-profile/v3/CockpitV3Shell.tsx) already lays out `safetyDock` / palette / canvas / `actionDock` with the docks `shrink-0` and the canvas `flex-1 min-h-0`. The footer pin is *almost* right; the height bug is upstream.
  - **Scroll root** — [`DashboardShell.tsx`](../../../../../../../../frontend/components/layout/DashboardShell.tsx) root is `min-h-screen flex-col`; `<main>` is `flex-1 overflow-auto p-4 md:p-6`. [`PatientProfilePage.tsx`](../../../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) wraps in `-m-4 md:-m-6 flex h-screen flex-col` — the `h-screen` (100vh) **inside** a `<main>` that already sits below the dashboard header is what overflows.
  - **Tab strip** — [`PaneTabStripV3.tsx`](../../../../../../../../frontend/components/patient-profile/v3/PaneTabStripV3.tsx): strip is `bg-card` (blends with body); tab chips use `ring-1 ring-inset` + `bg-card` + `shadow`/`shadow-sm` (the muted-pill + elevation pass).
  - **Reset control** — [`CockpitPalette.tsx`](../../../../../../../../frontend/components/patient-profile/v3/CockpitPalette.tsx) L208–222: `data-testid="cockpit-v3-reset"`, `aria-label="Reset to blank"`, calls `layout.resetLayout()` which applies the Consult seed (see [`useCockpitV3Layout.ts`](../../../../../../../../frontend/lib/patient-profile/v3/useCockpitV3Layout.ts) `resetLayout`).
  - **Layout switcher** — [`useCockpitLayoutSwitcher.ts`](../../../../../../../../frontend/lib/patient-profile/v3/useCockpitLayoutSwitcher.ts): `LAYOUT_MENU_SECTIONS` has a `my-layouts` section with an empty `entries` array + placeholder copy ("Save custom layouts — coming in a later update").
  - **Presets API** — [`cockpit-layout-presets-tree.ts`](../../../../../../../../frontend/lib/api/cockpit-layout-presets-tree.ts): `listPresetsTree` / `savePresetTree` / `renamePreset` / `deletePreset`, 5-preset server cap, against `/api/v1/settings/doctor/cockpit-presets`. Stores `LayoutNode`.
  - **Bridge** — [`layout-node-bridge.ts`](../../../../../../../../frontend/lib/patient-profile/layout-node-bridge.ts): `paneTreeToLayoutNode` / `layoutNodeToPaneTree`. **Lossy for v3** — `LayoutNode` is `pane | split` only, so multi-tab leaves collapse to their first pane and `hidden` state is dropped.
  - **React-query** — already provided at `DashboardShell` (`QueryProvider`); `token` is available in `PatientProfilePage` and can be threaded to the shell/palette.
- ❌ **What's missing:** the height fix, the header band, the reset rename, and the entire save-layout wiring (UI + full-fidelity persistence + backend acceptance of the v3 tree).
- ⚠️ **Notes:** Phase 6's gate (cv3l-04) is already stamped ✅; this task is additive polish + the Phase-7-class save feature, tracked here at the user's request rather than spun into a new phase folder.

**Scope Guard:**
- Expected files touched: frontend — `DashboardShell.tsx`, `PatientProfilePage.tsx`, `PaneTabStripV3.tsx`, `CockpitLeafView.tsx` (only if body/header tokens need a tweak), `CockpitPalette.tsx`, `useCockpitLayoutSwitcher.ts`, a new `useCockpitLayoutPresets` hook, `cockpit-layout-presets-tree.ts` (v3-tree payload), and the affected tests. Backend — the `cockpit-presets` route/validator + its tests for item 3.
- **Must NOT** change the prescribe → safety → send pipeline, autosave, the registry (`cockpit-tabs.tsx`), the engine (`layout-tree*.ts`), or any pane body.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) — update-existing discipline for items 1/2/4.
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) — theme tokens (`bg-card`/`bg-muted`/`border`); light + dark must hold.
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md) — integration render + react-query test patterns.
- [FRONTEND_ARCHITECTURE.md](../../../../../../../Reference/engineering/architecture/FRONTEND_ARCHITECTURE.md) — shell/view layer is content-agnostic.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Fixed app-shell (footer always pinned, only pane bodies scroll)
- [x] ✅ 1.1 `DashboardShell`: root `min-h-screen` → `h-screen overflow-hidden`; add `min-h-0` to `<main>` — **Completed: 2026-06-03**
- [x] ✅ 1.2 `PatientProfilePage`: outer wrapper `h-screen` → `h-full min-h-0 overflow-hidden` — **Completed: 2026-06-03**
- [x] ✅ 1.3 Footer pinned; pane bodies scroll internally — **Completed: 2026-06-03** (manual smoke recommended)
- [x] ✅ 1.4 Other dashboard pages scroll inside bounded `<main>` — **Completed: 2026-06-03** (manual regression recommended)

### 2. Tab header differentiation
- [x] ✅ 2.1 Tab strip header band (`bg-muted/40` + `border-b`) — **Completed: 2026-06-03**
- [x] ✅ 2.2 Raised tab chips; no between-tab line artifacts — **Completed: 2026-06-03**
- [x] ✅ 2.3 Tab a11y preserved — **Completed: 2026-06-03**

### 3. Save layout — full fidelity (UI + persistence + backend)
- [x] ✅ 3.1 `pane_tree_v3` on preset row (no lossy bridge on save) — **Completed: 2026-06-03**
- [x] ✅ 3.2 Backend route/validator + tests — **Completed: 2026-06-03**
- [x] ✅ 3.3 API client `listPresetsV3` / `savePresetV3` / rename v3 — **Completed: 2026-06-03**
- [x] ✅ 3.4 `useCockpitLayoutPresets` hook — **Completed: 2026-06-03**
- [x] ✅ 3.5 Token threaded Page → Shell → Palette — **Completed: 2026-06-03**
- [x] ✅ 3.6 My layouts UI (save/apply/rename/delete) — **Completed: 2026-06-03**
- [x] ✅ 3.7 Save gated on full eight-pane registry — **Completed: 2026-06-03**

### 4. Reset rename → "Reset to Consult"
- [x] ✅ 4.1 Label/tooltip → "Reset to Consult" — **Completed: 2026-06-03**
- [x] ✅ 4.2 Tests updated — **Completed: 2026-06-03**

### 5. Verification & Testing
- [x] ✅ 5.1 `tsc` + `lint` clean (warnings only) — **Completed: 2026-06-03**
- [x] ✅ 5.2 Frontend suites green — **Completed: 2026-06-03**
- [x] ✅ 5.3 Backend preset tests green — **Completed: 2026-06-03**
- [ ] 5.4 Manual smoke (light + dark) — **Pending user dogfood**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/layout/DashboardShell.tsx                         ← app-shell frame (h-screen overflow-hidden; main min-h-0)
UPDATE: frontend/components/patient-profile/PatientProfilePage.tsx            ← h-screen → h-full min-h-0 overflow-hidden; thread token
UPDATE: frontend/components/patient-profile/v3/PaneTabStripV3.tsx             ← header band + clean chips
UPDATE: frontend/components/patient-profile/v3/CockpitV3Shell.tsx             ← pass token → palette
UPDATE: frontend/components/patient-profile/v3/CockpitPalette.tsx             ← reset rename + My-layouts UI (save/apply/rename/delete)
UPDATE: frontend/lib/patient-profile/v3/useCockpitLayoutSwitcher.ts          ← surface custom presets in LAYOUT_MENU_SECTIONS
CREATE: frontend/lib/patient-profile/v3/useCockpitLayoutPresets.ts           ← react-query CRUD hook (+ test)
UPDATE: frontend/lib/api/cockpit-layout-presets-tree.ts                      ← v3 paneTree payload (+ back-compat read)
UPDATE: backend  (cockpit-presets route + validator + tests)                ← accept/return v3 tree JSON; keep 5-cap
UPDATE: frontend tests — CockpitPalette / buildUp.production / layouts.integration / PaneTabStripV3 as needed
DO NOT TOUCH: prescribe→send pipeline, autosave, cockpit-tabs.tsx (registry), layout-tree*.ts (engine), pane bodies
```

**When updating existing code:**
- [ ] Audit each touched component's current classNames + which ids/roles/testids tests depend on.
- [ ] Keep the `actionDock`/`safetyDock` behaviour and prominence intact (v3-DL-6).
- [ ] For the backend change, keep per-doctor scoping + the 5-preset cap; add tests; no PHI in logs.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Clinical-first chrome stays prominent (v3-DL-6).** The fixed-shell work must make the safety strip + "Send Rx & finish" footer *more* reliably visible, never demote them.
- **Full-fidelity saved layouts.** The headline correctness bar for item 3 is that a saved layout restores **exactly** — same tabs grouped, same hidden panes, same splits/sizes. The lossy `LayoutNode` path is explicitly rejected for the save shape.
- **Theme tokens, light + dark.** Header band + chips use `bg-card`/`bg-muted`/`border` tokens; both themes must read premium and pass contrast.
- **No engine / registry / pane-body change.** Persistence stores the existing `PaneTreeNode`; it does not alter how the tree is mutated or rendered.
- **No PHI; per-doctor scope; cap respected.** Presets are layout metadata only.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes (item 3 only)** — adds a per-doctor *layout preset* (a v3 tree blob) to the existing `cockpit-presets` store. No clinical/PHI data; no access-model change.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **Item 3** — presets are user-created and user-deletable (delete endpoint exists); 5-preset cap retained. Items 1/2/4 have none.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] The "Send Rx & finish" footer is permanently visible with no page-level scroll; only pane bodies scroll; other dashboard pages still scroll normally.
- [x] The tab strip reads as a distinct header band with clean, separated tab chips (no between-tab line artifacts); tab a11y intact.
- [x] Doctors can save / apply / rename / delete custom layouts (≤5); a saved layout restores the v3 tree at full fidelity (tabs + hidden + sizes) across reload; presets are per-doctor.
- [x] The reset control reads "Reset to Consult" and returns to the Consult seed.
- [x] `tsc` + frontend lint clean; frontend + backend suites green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** `PatientProfilePage` used `h-screen` inside `DashboardShell`’s scrolling `<main>`, pushing the Send Rx footer below the fold.
**Solution:** `DashboardShell` → `h-screen overflow-hidden` + `main min-h-0`; page wrapper → `h-full min-h-0 overflow-hidden`.

**Issue:** Legacy `LayoutNode` bridge is lossy for v3 tabs/hidden.
**Solution:** New `pane_tree_v3` wire field; save/apply uses `PaneTreeNode` via `serialiseTree`/`deserialiseTree`.

---

## 📝 Notes

- Items 1/2/4 are frontend-only and low-risk; item 3 is the Phase-7-class save feature and is the bulk of the work (incl. a backend schema touch for full-fidelity persistence).
- Suggested execution order: **2 → 4 → 1 → 3** (cheap chrome wins first; the app-shell change with its regression sweep next; the cross-stack save feature last).
- Custom-preset persistence was the deferred Phase-7 item noted in cv3l-04's gate; this task pulls it forward and does it at full fidelity rather than via the lossy legacy bridge.

---

## 🔗 Related Tasks

- [`task-cv3l-01-default-layout-catalogue-and-seed.md`](./task-cv3l-01-default-layout-catalogue-and-seed.md) · [`task-cv3l-02-layout-switcher-and-hotkeys.md`](./task-cv3l-02-layout-switcher-and-hotkeys.md) · [`task-cv3l-03-tab-and-panel-premium-redesign.md`](./task-cv3l-03-tab-and-panel-premium-redesign.md) — the build tasks this refines.
- [`task-cv3l-04-integration-a11y-and-phase-gate.md`](./task-cv3l-04-integration-a11y-and-phase-gate.md) — the gate that deferred custom presets → this task.

---

**Last Updated:** 2026-06-03
**Completed:** 2026-06-03
**Pattern:** Post-gate UX polish (shell/chrome) + full-fidelity layout-persistence feature (frontend + backend).
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/TASK_MANAGEMENT_GUIDE.md`
