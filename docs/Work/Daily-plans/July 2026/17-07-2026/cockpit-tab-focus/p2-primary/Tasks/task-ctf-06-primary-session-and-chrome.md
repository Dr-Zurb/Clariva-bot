# Task ctf-06: Primary session mode + menu chrome

> **Filename:** `task-ctf-06-primary-session-and-chrome.md`  
> **Links:** batch [`../plan-p2-cockpit-tab-primary-batch.md`](../plan-p2-cockpit-tab-primary-batch.md) · program [`../../README.md`](../../README.md) · exec [`./EXECUTION-ORDER-p2-cockpit-tab-primary.md`](./EXECUTION-ORDER-p2-cockpit-tab-primary.md)  
> **Depends on:** `ctf-05` · product go-ahead

---

## 📋 Task Overview

Wire Primary into the p1 session + chrome:

1. Extend session state with `mode: 'focus' | 'primary'` (and keep `prior` / `focusedLeafId`).
2. `enterPrimary(leafId)` / switch Focus↔Primary from **original prior** (CTF-D10).
3. Upgrade `PaneFocusButton` to a small menu: idle → **Focus** · **Primary**; active → **Restore** (+ optional switch intent).
4. Wire through `useCockpitV3Layout` + `CockpitLeafView`.

**Estimated Time:** ~2–4 hours  
**Status:** ✅ Done (2026-07-17). **Model: Sonnet**  
**Change Type:** ✅ Extend session + chrome.

**Scope Guard:**
- Prefer DropdownMenu pattern already used in `PaneTabStripV3` / palette.
- **DO NOT** add Peek menu item (p3).
- Keep Esc / drag-discard / preset-discard behaviour from p1.
- Blast radius: ideally ≤4 files beyond tests.

---

## ✅ Task Breakdown

### 1. Session API
- [x] 1.1 Add `mode` to `PaneFocusSessionState`.
- [x] 1.2 `enterPrimary(leafId): boolean` — snapshot prior on first enter; apply `primaryLeafInTree`.
- [x] 1.3 `enterFocus` while already in Primary (same or other leaf) recomputes from prior.
- [x] 1.4 `enterPrimary` while already in Focus recomputes from prior.
- [x] 1.5 Expose `mode` / `enterPrimary` on `useCockpitV3Layout` return.

### 2. Chrome
- [x] 2.1 `PaneFocusButton` (or rename to `PaneFocusMenu`) — idle menu Focus/Primary; pressed shows Restore.
- [x] 2.2 `aria-haspopup="menu"`, keyboardable items, `aria-pressed` when session active on this leaf.
- [x] 2.3 Tooltip / labels: "Focus {title}", "Primary {title}", "Restore {title}".
- [x] 2.4 `CockpitLeafView` uses new API (no duplicate controls).

### 3. Regression
- [x] 3.1 Esc Restore still works; dialog overlay still blocks Esc.
- [x] 3.2 Drag / preset still `discardFocusSession`.

### 4. Tests
- [x] 4.1 Session: enterPrimary → exit restores prior serialisation.
- [x] 4.2 Session: Focus → Primary from same prior (not from focused tree).
- [x] 4.3 RTL: menu items call enterFocus / enterPrimary / exitFocus.

### 5. Verification
- [x] 5.1 `tsc` + targeted tests green.

---

## 📁 Files

```
UPDATE: frontend/lib/patient-profile/v3/usePaneFocusSession.ts
UPDATE: frontend/lib/patient-profile/v3/useCockpitV3Layout.ts
UPDATE: frontend/components/patient-profile/v3/PaneFocusButton.tsx
UPDATE: frontend/components/patient-profile/v3/CockpitLeafView.tsx
UPDATE: tests (session + button)
READ:     ctf-05 primaryLeafInTree
DO NOT TOUCH: peek sizes; backend; ribbon
```

---

## ✅ Acceptance Criteria

- [x] Primary reachable from chrome menu; Restore exact.
- [x] Mode switches use original prior.
- [x] No Peek / fraction items.
- [x] p1 behaviours intact.

---

**Created:** 2026-07-17.
