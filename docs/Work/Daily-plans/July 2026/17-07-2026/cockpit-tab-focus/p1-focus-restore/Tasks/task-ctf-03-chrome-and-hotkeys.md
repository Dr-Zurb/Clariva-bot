# Task ctf-03: Focus chrome + keyboard affordance

> **Filename:** `task-ctf-03-chrome-and-hotkeys.md`  
> **Links:** batch [`../plan-p1-cockpit-tab-focus-batch.md`](../plan-p1-cockpit-tab-focus-batch.md) · program [`../../README.md`](../../README.md) · exec [`./EXECUTION-ORDER-p1-cockpit-tab-focus.md`](./EXECUTION-ORDER-p1-cockpit-tab-focus.md)  
> **Depends on:** `ctf-02`

---

## 📋 Task Overview

Expose Focus on leaf chrome (CTF-D4):

- One icon button (Maximize2 / Minimize2 or existing lucide pattern in repo).
- Idle → `aria-label="Focus <Pane>"`, `aria-pressed={false}`.
- Focused → label becomes Restore / Exit focus, `aria-pressed={true}`.
- Place in `PaneHeader` `actions` for single-pane leaves; for tabbed leaves, put the control on the **leaf chrome** that stays visible (tab strip trailing actions or header) — not duplicated per tab chip.
- Optional hotkey (e.g. `F` when leaf focused / hovered) only if it doesn't collide with existing cockpit shortcuts — **nice-to-have; Esc Restore is required**.

**Program / Batch:** cockpit-tab-focus · p1-focus-restore · Wave 3  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ Complete (2026-07-17). **Model: Sonnet / Auto**  
**Change Type:** ✅ Wire UI to session hook.

**Scope Guard:**
- Keep blast radius small (ideally ≤4 files). Prefer a tiny `PaneFocusButton` used from one mount point.
- **DO NOT** add a dropdown with Primary / fractions (p2).
- **DO NOT** restyle the whole header system.

---

## ✅ Task Breakdown

### 1. Control component
- [x] ✅ 1.1 Add `PaneFocusButton` (or inline) calling `toggleFocus(leafId)`. - **Completed: 2026-07-17**
- [x] ✅ 1.2 Visual: quiet icon button matching existing cockpit header action density (see collapse chevrons / palette icon buttons). - **Completed: 2026-07-17**
- [x] ✅ 1.3 Disabled / hidden when leaf already alone at full size? Optional — can still no-op via mutation. - **Completed: 2026-07-17** (always shown; mutation no-ops safely)

### 2. Mount points
- [x] ✅ 2.1 Single-pane leaves: `PaneHeader` `actions`. - **Completed: 2026-07-17** (mounted on leaf tab-strip trailingActions — covers all leaves including hideHeader panes)
- [x] ✅ 2.2 Tabbed leaves: one control for the host leaf (strip or header) — verify Subjective/Objective stacked or tabbed layouts both get a control. - **Completed: 2026-07-17**
- [x] ✅ 2.3 Body / Assessment / Plan covered in Consult default layout. - **Completed: 2026-07-17** (every CockpitLeafView)

### 3. A11y
- [x] ✅ 3.1 Keyboard activatable; focus ring visible light + dark. - **Completed: 2026-07-17**
- [x] ✅ 3.2 `aria-pressed` reflects session state. - **Completed: 2026-07-17**
- [x] ✅ 3.3 Esc still works from ctf-02 when focus is inside the pane body. - **Completed: 2026-07-17** (unchanged)

### 4. Tests
- [x] ✅ 4.1 RTL: click Focus → `enterFocus` called / pressed state; click again → Restore. - **Completed: 2026-07-17**
- [x] ✅ 4.2 Smoke: control present on representative leaves. - **Completed: 2026-07-17** (trailingActions strip test)

### 5. Verification
- [x] ✅ 5.1 `tsc` / lint / targeted tests green. - **Completed: 2026-07-17**

---

## 📁 Files to Create/Update

```
CREATE?: frontend/components/patient-profile/v3/PaneFocusButton.tsx
UPDATE:  mount site(s) — PaneHeader consumer(s) and/or PaneTabStripV3 / CockpitLeafView
UPDATE?: tests colocated
READ:   usePaneFocusSession (ctf-02)
DO NOT TOUCH: focus-leaf math (ctf-01); p2 menu; ribbon; backend
```

---

## ✅ Acceptance Criteria

- [x] Focus control visible on canvas leaves in Consult layout.
- [x] Toggle enters/exits Focus; labels/ARIA correct.
- [x] No fraction / Primary menu.
- [x] Light + dark: control readable, not competing with allergies/ribbon safety cues.

---

**Created:** 2026-07-17.
