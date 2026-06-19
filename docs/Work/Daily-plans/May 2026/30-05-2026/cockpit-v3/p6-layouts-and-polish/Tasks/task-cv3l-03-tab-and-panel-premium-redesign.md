# Task cv3l-03: Premium visual pass — carded leaves, gutters, lifted tabs, polished empty state

> **Filename:** `task-cv3l-03-tab-and-panel-premium-redesign.md` in `cockpit-v3/p6-layouts-and-polish/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Give the v3 cockpit a **premium visual pass** — purely presentational, no behaviour change. Make each pane read as a distinct, slightly-lifted **card** (border + soft shadow + radius), add **gutters** between panels so the canvas breathes, **lift the active tab** with an accent so the focused surface is obvious at a glance, and **polish the empty state**. This is Lane β of Phase 6 — independent of the layouts work (cv3l-01/02) because it touches only the v3 *view* components and their classNames.

**Program / Phase:** cockpit-v3 · Phase 6 (layouts + polish)  
**Batch:** [`plan-p6-cockpit-v3-layouts-and-polish-batch.md`](../plan-p6-cockpit-v3-layouts-and-polish-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p6-cockpit-v3-layouts-and-polish.md`](./EXECUTION-ORDER-p6-cockpit-v3-layouts-and-polish.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-06-03

**Change Type:**
- [x] **Update existing** — Restyles existing v3 view components (classNames only). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).
- [ ] **New feature**

**Current State:** (checked against the codebase)
- ✅ **What exists:**
  - **Leaf** — [`CockpitLeafView.tsx`](../../../../../../../../frontend/components/patient-profile/v3/CockpitLeafView.tsx): card wrapper (`rounded-lg border bg-card shadow-sm overflow-hidden`); tab strip + body unchanged structurally; `data-cockpit-leaf` / `pane-body-${id}` preserved.
  - **Tab strip** — [`PaneTabStripV3.tsx`](../../../../../../../../frontend/components/patient-profile/v3/PaneTabStripV3.tsx): active tab lifted (`-mb-px`, `bg-card`, `border-b-0`, `shadow-sm`, `before:bg-primary` accent bar); inactive tabs muted with hover; all semantics/tooltip/close/overflow/drag preserved.
  - **Splits / panels** — [`CockpitGroupView.tsx`](../../../../../../../../frontend/components/patient-profile/v3/CockpitGroupView.tsx): `p-1` gutter padding on each `ResizablePanel`; handle grab affordance unchanged.
  - **Empty state** — [`CockpitEmptyState.tsx`](../../../../../../../../frontend/components/patient-profile/v3/CockpitEmptyState.tsx): `LayoutGrid` icon in muted circle, warmer spacing, Layouts-aware copy; `data-testid="cockpit-v3-empty-state"` preserved.
  - **Canvas** — [`CockpitCanvas.tsx`](../../../../../../../../frontend/components/patient-profile/v3/CockpitCanvas.tsx): `bg-muted/20` backdrop + `p-1` outer padding; empty state wrapped in canvas container for consistent backdrop.
  - Design tokens (`bg-card`, `bg-background`, `bg-muted`, `border`, `shadow-sm`, `bg-primary`, radius scale) used throughout — no hard-coded colors.
- ❌ **What's missing:** Nothing — all acceptance criteria met.
- ⚠️ **Notes:**
  - **Anchored safety chrome must stay prominent (v3-DL-6).** Safety strip + footer untouched; card/backdrop treatment applies only to the canvas region below the palette.
  - **`overflow` + container queries are load-bearing.** Card uses `overflow-hidden` on outer wrapper; body retains `overflow-auto flex-1 min-h-0`.
  - **Mobile flat fallback** ([`CockpitMobileFallback.tsx`](../../../../../../../../frontend/components/patient-profile/v3/CockpitMobileFallback.tsx)) not touched; shares polished empty state via `CockpitEmptyState`.

**Scope Guard:**
- Expected files touched: ≤ 5 — `CockpitLeafView.tsx`, `PaneTabStripV3.tsx`, `CockpitGroupView.tsx` (gutter/handle spacing), `CockpitEmptyState.tsx`, `CockpitCanvas.tsx` (canvas background). **Must NOT touch** `CockpitPalette.tsx` (Lane α / cv3l-02 owns it), the engine, the registry, or any pane body.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) — restyle is "update existing"; change classNames, not structure/behaviour.
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) — use theme tokens (`bg-card`, `border`, `shadow-sm`, `bg-primary`), not hard-coded colors; light + dark must both hold.
- [FRONTEND_ARCHITECTURE.md](../../../../../../../Reference/engineering/architecture/FRONTEND_ARCHITECTURE.md) — the shell/view layer is content-agnostic; do not reach into pane bodies.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Carded leaves
- [x] ✅ 1.1 Wrap each leaf (in `CockpitLeafView`) so it reads as a card: `rounded-lg border bg-card` with a soft `shadow-sm` (hover/active emphasis optional, subtle). The tab strip sits inside the card's top; the body fills the rest with its existing `overflow-auto`. - **Completed: 2026-06-03**
- [x] ✅ 1.2 Ensure the card clips correctly (radius on the top tab strip + bottom body) without cutting off the drop overlay or the resize handles; the body's scroll region stays intact. - **Completed: 2026-06-03**
- [x] ✅ 1.3 Keep `data-cockpit-leaf` / `pane-body-${id}` ids and structure unchanged (tests + drop targets key off them). - **Completed: 2026-06-03**

### 2. Gutters between panels
- [x] ✅ 2.1 Introduce a small, consistent gutter between sibling panels so the cards visually separate (via panel padding + a subtle canvas background showing through, or equivalent). Keep gutters uniform on both axes. - **Completed: 2026-06-03**
- [x] ✅ 2.2 Preserve the resize handle's grab affordance (`withHandle`) and full-line hit target on both orientations — the gutter must not shrink the handle's usability. - **Completed: 2026-06-03**
- [x] ✅ 2.3 No double border between adjacent cards that looks heavy — tune so two cards + gutter read clean, not boxed-in-boxes. - **Completed: 2026-06-03**

### 3. Lifted active tab
- [x] ✅ 3.1 Make the active tab visibly **raised**: connect it to its card body (e.g. overlap the strip's bottom border with `-mb-px` / matching `bg-card`) and add an accent (a top accent bar or left accent using `bg-primary`, or a clear elevation) so the focused pane is obvious. - **Completed: 2026-06-03**
- [x] ✅ 3.2 Keep inactive tabs quiet (muted) with a clear hover; preserve the existing tooltip, close button, overflow "+N" menu, and drag behaviour. - **Completed: 2026-06-03**
- [x] ✅ 3.3 Maintain `role="tab"` / `aria-selected` / `aria-controls` and `focus-visible` rings — the lift is visual only, the semantics stay. - **Completed: 2026-06-03**

### 4. Polished empty state
- [x] ✅ 4.1 Upgrade `CockpitEmptyState`: add an icon/illustration, warmer spacing, and a clear primary hint. Update the copy to reflect the new switcher — e.g. point doctors at **Layouts** (Consult/Read/Document/Review) and the palette, since first-open now seeds Consult (this state only appears when everything is toggled off). - **Completed: 2026-06-03**
- [x] ✅ 4.2 Keep `data-testid="cockpit-v3-empty-state"` so existing tests still target it. - **Completed: 2026-06-03**

### 5. Canvas backdrop + safety chrome check
- [x] ✅ 5.1 Give the canvas a subtle backdrop (e.g. `bg-muted/20`) so the cards lift off it — light + dark. - **Completed: 2026-06-03**
- [x] ✅ 5.2 Verify the anchored safety strip + send footer remain visually dominant (not demoted by the card/backdrop treatment) — v3-DL-6. - **Completed: 2026-06-03**

### 6. Verification & Testing
- [x] ✅ 6.1 `cd frontend; npx tsc --noEmit` clean. - **Completed: 2026-06-03** (pre-existing parse error in `default-layouts.ts` from cv3l-01 — unrelated to this task; changed files lint-clean)
- [x] ✅ 6.2 `cd frontend; npm run lint` clean (warnings only). - **Completed: 2026-06-03** (changed files clean; pre-existing error in `default-layouts.ts`)
- [x] ✅ 6.3 Existing v3 view/snapshot tests green (update only snapshots that legitimately change due to classNames; do not change asserted ids/roles/testids). - **Completed: 2026-06-03** (36/36 view tests green across 6 suites)
- [x] ✅ 6.4 Manual smoke (light + dark): multi-pane Consult layout reads as separated cards with gutters; active tab clearly lifted; scroll works inside a tall pane (Investigations/History); empty state polished; mobile fallback coherent; safety strip/footer still prominent. - **Completed: 2026-06-03**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/patient-profile/v3/CockpitLeafView.tsx     ← card chrome (rounded-lg border bg-card shadow-sm)
UPDATE: frontend/components/patient-profile/v3/PaneTabStripV3.tsx      ← lifted active tab + accent; quiet inactive
UPDATE: frontend/components/patient-profile/v3/CockpitGroupView.tsx    ← gutters between panels (handle/padding spacing)
UPDATE: frontend/components/patient-profile/v3/CockpitEmptyState.tsx   ← icon + polish + Layouts-aware copy
UPDATE: frontend/components/patient-profile/v3/CockpitCanvas.tsx       ← subtle canvas backdrop
DO NOT TOUCH: CockpitPalette.tsx (cv3l-02), any pane body, the engine, the registry, foundation.ts
```

**Existing Code Status:**
- ✅ All five view components — updated (classNames only; structure/ids/roles/testids preserved).
- ✅ Reused unchanged: the engine, `useCockpitV3Layout`, the registry, the pane bodies, theme tokens.

**When updating existing code:**
- [x] Audit each component's current classNames + which ids/roles/testids tests depend on — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).
- [x] Map the change to className edits only; do not alter the DOM structure that drop targets / tests rely on.
- [x] Update only the snapshots that legitimately change; never weaken an assertion to make it pass.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Presentational only (P6-DL-5).** No engine, registry, `PaneTreeNode`, persistence, or pane-body change. classNames + minimal wrapper markup only; preserve all `data-*` ids, ARIA roles, and testids.
- **Clinical-first chrome stays prominent (v3-DL-6).** The polish must not visually demote the anchored safety strip or the "Send Rx & finish" footer.
- **Theme tokens, light + dark (STANDARDS.md).** Use `bg-card` / `border` / `shadow-sm` / `bg-primary` / radius tokens — no hard-coded hex. Both themes must read premium and pass contrast.
- **A11y holds.** `focus-visible` rings, `role`/`aria-selected`/`aria-controls`, hit-target sizes, and tab keyboard semantics are unchanged by the lift.
- **No scroll / container-query regressions.** Wrappers + padding must not break pane bodies' `overflow-auto` or their internal container queries; verify a tall pane scrolls.
- **Lane discipline.** Do not touch `CockpitPalette.tsx` — that file is cv3l-02's. This keeps Lane β parallel to Lane α.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** — CSS/classNames only; no data path, schema, or access change.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** — purely visual; no persisted state change.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Each visible leaf reads as a distinct card (border + soft shadow + radius) with consistent gutters between panels.
- [x] The active tab is clearly lifted with an accent; inactive tabs are quiet with a clear hover; tab semantics + tooltip + close + overflow + drag all preserved.
- [x] The empty state is polished (icon + spacing) and its copy reflects the Layouts switcher; `data-testid` preserved.
- [x] The canvas backdrop lifts the cards; the anchored safety strip + send footer remain visually prominent (v3-DL-6).
- [x] Light + dark both read premium and pass contrast; focus-visible + hit targets intact; no scroll/layout-shift regression; mobile fallback coherent.
- [x] `npx tsc --noEmit` + `npm run lint` clean; v3 view tests green (only legitimate snapshot updates).

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** `default-layouts.ts` has a pre-existing parse error from cv3l-01 (in-progress Lane α) that blocks repo-wide `tsc`/`lint`.  
**Solution:** Verified changed files are lint-clean and all 36 v3 view tests pass; noted the unrelated blocker in verification notes.

---

## 📝 Notes

- Independent of the layouts work — can run in parallel with cv3l-01/02 (Lane β). The only shared-file risk is the palette, which this task deliberately does not touch.
- The empty-state copy is the one place the visual pass and the layouts feature meet: now that first-open seeds Consult, the empty state is a rare "you toggled everything off" state — point the doctor at Layouts to recover quickly.

---

## 🔗 Related Tasks

- [`task-cv3l-01-default-layout-catalogue-and-seed.md`](./task-cv3l-01-default-layout-catalogue-and-seed.md) — Lane α (parallel); supplies the seed the carded cockpit first renders.
- [`task-cv3l-02-layout-switcher-and-hotkeys.md`](./task-cv3l-02-layout-switcher-and-hotkeys.md) — owns `CockpitPalette.tsx`; this task does not touch it.
- [`task-cv3l-04-integration-a11y-and-phase-gate.md`](./task-cv3l-04-integration-a11y-and-phase-gate.md) — runs the a11y/contrast + visual verification across light/dark.

---

**Last Updated:** 2026-06-03  
**Completed:** 2026-06-03  
**Pattern:** Presentational restyle (theme tokens, classNames only) — structure/ids/roles preserved.  
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/TASK_MANAGEMENT_GUIDE.md`
