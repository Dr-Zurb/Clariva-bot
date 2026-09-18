# Task ctf-02: Focus session hook + shell wiring

> **Filename:** `task-ctf-02-focus-session-hook.md`  
> **Links:** batch [`../plan-p1-cockpit-tab-focus-batch.md`](../plan-p1-cockpit-tab-focus-batch.md) · program [`../../README.md`](../../README.md) · exec [`./EXECUTION-ORDER-p1-cockpit-tab-focus.md`](./EXECUTION-ORDER-p1-cockpit-tab-focus.md)  
> **Depends on:** `ctf-01`

---

## 📋 Task Overview

Turn the pure mutation into a **session**:

- `enterFocus(leafId)` — snapshot prior `paneTree`, `applyLayout(focusLeafInTree(...))`.
- `exitFocus()` / Restore — `applyLayout(prior)`.
- Track `isFocused` + `focusedLeafId`.
- Esc restores.
- Drag-resize while focused exits Focus and **keeps** the post-drag tree (CTF-D6).
- Preset / `applyDefaultLayout` / `applySavedLayout` while focused: **auto-exit Focus and apply the preset** (recommended lock for open question #2 — document if you deviate).

**Program / Batch:** cockpit-tab-focus · p1-focus-restore · Wave 2  
**Estimated Time:** ~2–4 hours  
**Status:** ✅ Complete (2026-07-17). **Model: Sonnet**  
**Change Type:** ✅ Add hook + wire into cockpit layout controller.

**Scope Guard:**
- Expected: new hook module (e.g. `usePaneFocusSession.ts`) + thin integration in `useCockpitV3Layout` or shell host; tests for session transitions.
- **DO NOT** add chrome buttons (that's `ctf-03`).
- **DO NOT** implement Primary.
- **DO NOT** change durable preset matching to treat Focus trees as "Consult" etc. without clearing focusMeta.

**Persist policy (CTF-D3) — pick and implement one:**

| Option | Behaviour | Recommendation |
|---|---|---|
| A | While focused, skip durable `localStorage` writes; keep prior + focus flag in React (+ optional `sessionStorage`) | **Preferred** |
| B | Write focused tree + `focusMeta: { prior, leafId }` beside layout; hydrate can Restore | Acceptable |

Document the pick in a short comment on the hook.

---

## ✅ Task Breakdown

### 1. Session API
- [x] ✅ 1.1 `usePaneFocusSession({ getTree, applyLayout, … })` (names flexible) exposing `{ isFocused, focusedLeafId, enterFocus, exitFocus, toggleFocus }`. - **Completed: 2026-07-17**
- [x] ✅ 1.2 `enterFocus` no-ops / replaces if already focused on another leaf (snapshot was taken at first enter — decide: re-focus from **original** prior, not from focused tree). - **Completed: 2026-07-17**
- [x] ✅ 1.3 `exitFocus` is idempotent when not focused. - **Completed: 2026-07-17**

### 2. Shell integration
- [x] ✅ 2.1 Wire apply via existing `applyLayout` / `dispatchEngine` patterns. - **Completed: 2026-07-17**
- [x] ✅ 2.2 Esc key listener (desktop) calls `exitFocus` when focused; don't steal Esc from open dialogs/sheets — respect existing side-sheet / dialog stack if present. - **Completed: 2026-07-17**
- [x] ✅ 2.3 On layout resize commit from the shell: if focused → clear session, keep current tree (CTF-D6). - **Completed: 2026-07-17**
- [x] ✅ 2.4 On preset apply: clear session then apply preset. - **Completed: 2026-07-17**

### 3. Form remount safety
- [x] ✅ 3.1 Confirm Focus only changes sizes/hidden bits — leaf `id`s stay mounted so Rx form state survives (spot-check Subjective draft). - **Completed: 2026-07-17** (transform preserves leaf ids; manual smoke in ctf-04)

### 4. Tests
- [x] ✅ 4.1 Unit/integration: enter → tree focused; exit → serialisation equals prior. - **Completed: 2026-07-17**
- [x] ✅ 4.2 Re-focus different leaf restores from **original** prior then focuses the new leaf (or document alternate). - **Completed: 2026-07-17**
- [x] ✅ 4.3 Preset-while-focused clears session. - **Completed: 2026-07-17**

### 5. Verification
- [x] ✅ 5.1 `tsc` + targeted tests green. - **Completed: 2026-07-17**

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/patient-profile/v3/usePaneFocusSession.ts  (or under hooks/)
CREATE: frontend/lib/patient-profile/v3/__tests__/usePaneFocusSession.test.ts
UPDATE: frontend/lib/patient-profile/v3/useCockpitV3Layout.ts   (expose enter/exit OR compose at shell)
UPDATE?: resize commit site in CockpitGroupView / shell (drag exit)
READ:   ctf-01 focus-leaf helpers
DO NOT TOUCH: PaneHeader chrome (ctf-03); p2 Primary; ribbon; backend
```

---

## ✅ Acceptance Criteria

- [x] Focus / Restore round-trip restores exact prior tree.
- [x] Esc restores when no higher-priority overlay owns Esc.
- [x] Drag-while-focused and preset-while-focused match CTF-D6 + documented preset pick.
- [x] Persist policy implemented and noted. (**Option A** — `setPersistSuspended` in `useShellLayout`)
- [x] No Focus button UI yet (hook can be called from a temporary test harness if needed).

---

**Created:** 2026-07-17.
