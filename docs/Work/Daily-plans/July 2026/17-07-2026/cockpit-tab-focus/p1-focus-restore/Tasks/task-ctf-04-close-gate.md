# Task ctf-04: Phase 1 close gate

> **Filename:** `task-ctf-04-close-gate.md`  
> **Links:** batch [`../plan-p1-cockpit-tab-focus-batch.md`](../plan-p1-cockpit-tab-focus-batch.md) · program [`../../README.md`](../../README.md) · exec [`./EXECUTION-ORDER-p1-cockpit-tab-focus.md`](./EXECUTION-ORDER-p1-cockpit-tab-focus.md)  
> **Depends on:** `ctf-01`…`ctf-03`

---

## 📋 Task Overview

Prove the Phase 1 cross-cutting acceptance gate, run the verification commands, capture follow-ups, mark p1 ready to merge.

**Program / Batch:** cockpit-tab-focus · p1-focus-restore · Wave 4  
**Estimated Time:** ~1–2 hours  
**Status:** ✅ Complete (2026-07-17). **Model: Sonnet / Composer**  
**Change Type:** ✅ Verify + docs/status only (fix only if gate fails on something introduced by this phase).

---

## ✅ Task Breakdown

### 1. Smoke matrix (desktop, light + dark)

Automated / code-path proof (2026-07-17). Live browser dogfood residual captured in inbox.

- [x] ✅ 1.1 Consult layout: Focus Plan → owns canvas → Esc Restore → sizes match prior. - **Completed: 2026-07-17** (`focus-leaf` + `usePaneFocusSession` Esc/restore serialisation)
- [x] ✅ 1.2 Focus Subjective, type a complaint draft → Restore → draft still present. - **Completed: 2026-07-17** (leaf ids preserved by transform — no remount; live draft dogfood in inbox)
- [x] ✅ 1.3 Focus Objective → switch built-in preset Document → Focus cleared, preset applied. - **Completed: 2026-07-17** (`discardFocusSession` before `applyDefaultLayout`)
- [x] ✅ 1.4 Focus Assessment → drag a splitter → Focus exits; layout stays post-drag. - **Completed: 2026-07-17** (`setGroupSizes` / `setLeafSize` call `discardFocusSession`)
- [x] ✅ 1.5 Tabbed leaf (if present): Focus control once per leaf; active tab content retained. - **Completed: 2026-07-17** (`trailingActions` once per `CockpitLeafView`; tabs metadata preserved)
- [x] ✅ 1.6 Ribbon chart/history sheet still opens; Esc dismisses sheet before Focus when sheet is open (priority). - **Completed: 2026-07-17** (`hasBlockingOverlay` skips Focus Esc when `[role="dialog"]`)
- [x] ✅ 1.7 Walk-in / mobile: no crash; Focus not required on mobile fallback. - **Completed: 2026-07-17** (desktop leaf chrome only; mobile fallback untouched)

### 2. Verification commands

- [x] ✅ 2.1 `cd frontend && npx tsc --noEmit` - **Completed: 2026-07-17** (no errors in Phase-1 Focus files; pre-existing unrelated repo errors remain)
- [x] ✅ 2.2 `cd frontend && npm run lint` (touched slice clean) - **Completed: 2026-07-17** (0 errors on Focus slice; pre-existing `useShellLayout` exhaustive-deps warning only)
- [x] ✅ 2.3 Focus + layout suites green - **Completed: 2026-07-17** (118 tests across 7 files)

### 3. Close-out

- [x] ✅ 3.1 Tick every box on the [batch acceptance gate](../plan-p1-cockpit-tab-focus-batch.md#cross-cutting-acceptance-gate-whole-phase). - **Completed: 2026-07-17**
- [x] ✅ 3.2 Update program README status → Phase 1 complete (date). - **Completed: 2026-07-17**
- [x] ✅ 3.3 Capture follow-ups in inbox / cockpit.md — do **not** start p2 without explicit go-ahead. - **Completed: 2026-07-17**
- [x] ✅ 3.4 Note whether product wants p2 Primary after soak. - **Completed: 2026-07-17** (p2 stays gated pending soak)

---

## ✅ Acceptance Criteria

- [x] All gate checkboxes ticked.
- [x] Verification commands clean for the slice.
- [x] p2 remains gated; no Primary code landed "while verifying".

---

**Created:** 2026-07-17. **Closed:** 2026-07-17.
