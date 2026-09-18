# Task ctf-07: Phase 2 close gate

> **Filename:** `task-ctf-07-primary-close-gate.md`  
> **Links:** batch [`../plan-p2-cockpit-tab-primary-batch.md`](../plan-p2-cockpit-tab-primary-batch.md) · program [`../../README.md`](../../README.md) · exec [`./EXECUTION-ORDER-p2-cockpit-tab-primary.md`](./EXECUTION-ORDER-p2-cockpit-tab-primary.md)  
> **Depends on:** `ctf-05`…`ctf-06`

---

## 📋 Task Overview

Prove the p2 acceptance gate; run verification; update program README; capture whether p3 Peek is wanted.

**Estimated Time:** ~1–2 hours  
**Model:** Sonnet / Composer  
**Status:** ✅ Complete (2026-07-17).  
**Change Type:** ✅ Verify + docs/status only.

---

## ✅ Task Breakdown

### 1. Smoke (desktop, light + dark)

Automated / code-path proof (2026-07-17). Live browser dogfood residual captured in inbox.

- [x] ✅ 1.1 Primary on Plan → Assessment visible ~⅓; other leaves hidden. - **Completed: 2026-07-17** (`primaryLeafInTree` + pair neighbour tests; `PRIMARY_FOCUS_PCT` / `PRIMARY_NEIGHBOUR_PCT`)
- [x] ✅ 1.2 Menu: Focus / Primary idle; Restore when active. - **Completed: 2026-07-17** (`PaneFocusButton` RTL; no Peek item)
- [x] ✅ 1.3 Switch Primary → Focus from same session → recomputes from original prior. - **Completed: 2026-07-17** (`usePaneFocusSession` CTF-D10 cases)
- [x] ✅ 1.4 Esc / drag-exit / preset-exit still correct. - **Completed: 2026-07-17** (Esc + dialog overlay; `discardFocusSession`; switcher discard before preset)
- [x] ✅ 1.5 Sole-pane edge (if reproducible) does not crash. - **Completed: 2026-07-17** (sole-leaf Primary → Focus fallback unit test)
- [x] ✅ 1.6 Ribbon sheet Esc still wins over Restore when dialog open. - **Completed: 2026-07-17** (`hasBlockingOverlay` skips Focus Esc when `[role="dialog"]`)

### 2. Commands

- [x] ✅ 2.1 Focus-slice `tsc` clean (no new errors). - **Completed: 2026-07-17** (no errors in Focus/Primary files; pre-existing unrelated repo noise remains)
- [x] ✅ 2.2 Lint clean on touched files. - **Completed: 2026-07-17** (0 errors; pre-existing `useShellLayout` exhaustive-deps warning only)
- [x] ✅ 2.3 Unit tests: focus-leaf primary + session + chrome green. - **Completed: 2026-07-17** (59 tests across 8 files in Focus+layout slice)

### 3. Close-out

- [x] ✅ 3.1 Tick batch acceptance gate. - **Completed: 2026-07-17**
- [x] ✅ 3.2 Program README: p2 complete. - **Completed: 2026-07-17**
- [x] ✅ 3.3 Capture go/no-go for [`../../p3-peek/`](../../p3-peek/) in inbox / cockpit.md — do not start p3 unasked. - **Completed: 2026-07-17**
- [x] ✅ 3.4 No fraction picker landed. - **Completed: 2026-07-17** (menu = Focus · Primary · Restore only)

---

## ✅ Acceptance Criteria

- [x] Gate green or phase explicitly cancelled.
- [x] p3 remains gated.

---

**Created:** 2026-07-17. **Closed:** 2026-07-17.
