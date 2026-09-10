# Task rfec-01: Command bar shell + `/` trigger + jump

> **Filename:** `task-rfec-01-command-bar-shell.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Mount an in-cockpit **command bar** inside the Rx form provider. `/` opens it when focus is not in an editable field. The first capability is **jump** — reuse Phase 1's field index and the `rxFocus` consumer (same visit, no `router.push` required). Unhide and set-value are the next two tasks.

**Program / Phase:** rx-fast-entry · Phase 2 (command-bar)
**Batch:** [`plan-p2-rx-fast-entry-command-bar-batch.md`](../plan-p2-rx-fast-entry-command-bar-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-rx-fast-entry-command-bar.md`](./EXECUTION-ORDER-p2-rx-fast-entry-command-bar.md)
**Estimated Time:** ~2–3 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-08-30

**Change Type:**
- [x] **New feature** — Add code only (no change to existing behavior)
- [ ] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** `RxFormProvider` wraps the SOAP workspace. Phase 1 (once shipped) owns a static field index and an `rxFocus` consumer. Global Cmd-K listener lives in `DashboardShell` and is not scoped to the cockpit. `CockpitPalette` is the v3 add-pane control — unrelated.
- ❌ **What's missing:** No in-form command bar. No `/` listener inside the Rx tree.
- ⚠️ **Notes:** Name lock — command bar, not palette (RFE2-D1). If Phase 1 is not merged, **STOP** — do not copy label maps into this task.

**Scope Guard:**
- Expected files touched: ≤ 5
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md)
- [`plan-rx-fast-entry.md`](../../../../../../Product%20plans/plan-rx-fast-entry.md) — RFE-DL-3, RFE-Q3, RFE2-D1, D2, D6

---

## ✅ Task Breakdown (Hierarchical)

### 1. Mount
- [x] ✅ 1.1 Add the command bar component and mount it once, inside `RxFormProvider` (audit the existing provider setup; do not add a second form tree). - **Completed: 2026-08-30**
- [x] ✅ 1.2 Closed by default. Opened by `/` when the active element is not editable. Closed by Escape or selecting a result. - **Completed: 2026-08-30**
- [x] ✅ 1.3 Cmd-K is not captured. The `DashboardShell` listener must still open the global palette from inside a visit. - **Completed: 2026-08-30**

### 2. Jump results
- [x] ✅ 2.1 Query the Phase 1 field index. Render jump hits. - **Completed: 2026-08-30**
- [x] ✅ 2.2 Selecting a jump hit applies the Phase 1 consumer in-place (same appointment). Do not bounce through `router.push` unless the consumer only exists as a URL reader — if so, set `rxFocus` on the current URL without leaving the visit. - **Completed: 2026-08-30**

### 3. Verification & Testing
- [x] ✅ 3.1 `/` in a text input does not open the bar. - **Completed: 2026-08-30**
- [x] ✅ 3.2 `/` on the page chrome (non-editable) opens it. - **Completed: 2026-08-30**
- [x] ✅ 3.3 Jump to a known visible field calls the Phase 1 consumer (mock/spy). - **Completed: 2026-08-30**
- [x] ✅ 3.4 `npx tsc --noEmit` + lint on touched files. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/command-bar/…   ← shell only
CREATE: tests next to it
UPDATE: the single Rx workspace mount that already sits inside RxFormProvider
        (audit useRxFormProviderSetup / the pane that wraps SOAP — touch one)
```

**Existing Code Status:**
- ✅ `RxFormProvider` — EXISTS; the bar must be a descendant.
- ✅ Phase 1 field index — EXISTS after rfeq-01; import, do not fork.
- ❌ Command bar — MISSING.
- ⚠️ `CockpitPalette` — EXISTS; do not touch.

**When creating:**
- [x] ✅ Keep the shell presentation small. No unhide / set-value UI in this task (placeholders in the empty state are fine). - **Completed: 2026-08-30**

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Name lock: command bar (RFE2-D1).
- `/` only; never steal Cmd-K (RFE2-D2, RFE-Q3).
- Reuse the Phase 1 index (RFE2-D6).
- No doctor-settings writes in this task.
- No PHI in logs. Do not log the query.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No.**
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] `/` opens the bar outside inputs and is ignored inside them.
- [x] Cmd-K still opens the global palette from a visit. (bar does not listen for Cmd-K; DashboardShell listener unchanged)
- [x] A jump hit focuses via the Phase 1 path.
- [x] Type-check + lint + new shell tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** Phase 1 consumer (`useRxFocusDeepLink`) is URL-only and lives on the cockpit shell, not in the Rx form tree.
**Solution:** Jump `router.replace`s the current appointment with `rxFocus` (keeps sibling params). No second focus implementation.

---

## 📝 Notes

- If the Phase 1 consumer is URL-only, setting `rxFocus` on the current appointment is acceptable. Do not add a second focus implementation.
- Name: `RxCommandBar` — distinct from the existing rxs-03 `CommandBar` (Cmd-K command registry).

---

## 🔗 Related Tasks

- [`task-rfec-02-unhide-section.md`](./task-rfec-02-unhide-section.md)
- [Phase 1](../../p1-field-search/) — index + consumer this reuses

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** In-form command surface, navigation-equivalent first
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
