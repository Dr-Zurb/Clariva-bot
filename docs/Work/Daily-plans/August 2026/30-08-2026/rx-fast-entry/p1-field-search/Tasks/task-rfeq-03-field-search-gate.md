# Task rfeq-03: Field-search gate + tests

> **Filename:** `task-rfeq-03-field-search-gate.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Close Phase 1. Prove the batch-plan gate: Cmd-K field jump works on an open visit, is silent elsewhere, does not snap-rail, does not unhide sections, does not leak query content into telemetry, and does not regress patient search.

**Program / Phase:** rx-fast-entry · Phase 1 (field-search)
**Batch:** [`plan-p1-rx-fast-entry-field-search-batch.md`](../plan-p1-rx-fast-entry-field-search-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-rx-fast-entry-field-search.md`](./EXECUTION-ORDER-p1-rx-fast-entry-field-search.md)
**Estimated Time:** ~1–2 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-08-30

**Change Type:**
- [x] **New feature** — Add code only (no change to existing behavior)
- [ ] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** rfeq-01/02 will have landed the source + consumer. Palette telemetry is counts-only (`cmdkOpened` / `cmdkSearched(queryLen)` / `cmdkSelected(source)`). Patient source + recents path already have tests around the palette shell.
- ❌ **What's missing:** An integration-style test that the `fields` source is silent off-appointment and that `cmdkSelected("fields")` is the only new event. Phase 1 gate checkboxes in the batch plan are unchecked.
- ⚠️ **Notes:** This task is verify-and-lock, not a second design pass. If rfeq-02 deferred per-input focus, document that in the batch Notes and still close the pane-level gate.

**Scope Guard:**
- Expected files touched: ≤ 5 (tests + leftover telemetry/placeholder polish only)
- Any expansion requires explicit approval

**Reference Documentation:**
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md)
- [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)
- [`plan-rx-fast-entry.md`](../../../../../../Product%20plans/plan-rx-fast-entry.md) — RFE-DL-4

---

## ✅ Task Breakdown (Hierarchical)

### 1. Tests
- [x] ✅ 1.1 Palette: appointment path → Fields group; other path → no Fields group. Patients source still returns hits either way. - **Completed: 2026-08-30**
- [x] ✅ 1.2 Selecting a field item calls `cmdkSelected` with `"fields"` and does not pass the query string to any telemetry helper. - **Completed: 2026-08-30**
- [x] ✅ 1.3 Deep-link: restore-without-snap-rail + param strip still green (extend rfeq-02 tests if a hole remains). - **Completed: 2026-08-30**
- [x] ✅ 1.4 Label-registry lock: the SpO₂ hit's display label equals the vitals-schema label (catches a hardcoded copy). - **Completed: 2026-08-30**

### 2. Gate
- [x] ✅ 2.1 Tick every checkbox in the Phase 1 batch acceptance gate, or leave a one-line gap with a follow-up (not a silent skip). - **Completed: 2026-08-30**
- [ ] 2.2 Manual smoke on the running dev server — **residual:** no authenticated browser in this session. Written in the batch Notes. Palette + deep-link Vitest cover the same paths.
- [x] ✅ 2.3 Grep the new/changed files for `console.log` / `console.debug` of the query or `rxFocus`. - **Completed: 2026-08-30**

### 3. Verification & Testing
- [x] ✅ 3.1 `cd frontend && npx tsc --noEmit` clean on touched production files (repo-wide tsc still has pre-existing errors outside this program). - **Completed: 2026-08-30**
- [x] ✅ 3.2 Lint clean on touched files. - **Completed: 2026-08-30**
- [x] ✅ 3.3 Targeted vitest for the new search + deep-link suites + existing palette tests. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE/UPDATE: frontend tests next to the rfeq-01/02 modules
UPDATE (if needed): frontend/lib/telemetry/cmdk.ts comments listing the new source
UPDATE: this phase batch plan gate checkboxes (when green)
```

**Existing Code Status:**
- ✅ Palette + cmdk telemetry — EXIST (ui-B4). Do not change the searched-event signature.
- ⚠️ New tests — add; do not weaken patient-search coverage.

**When updating existing code:**
- [x] ✅ Audit telemetry signatures. Adding a parameter that can carry query text is a **STOP**. - **Completed: 2026-08-30**

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Telemetry stays length-only (RFE-DL-4).
- No new behaviour beyond closing gaps rfeq-01/02 left (placeholder copy, a missed test).
- Do not start Phase 2 unhide in this task.

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
- [x] The Phase 1 batch acceptance gate is fully green (or an explicit residual is written in the batch Notes).
- [x] Patient search off-visit is unchanged.
- [x] Type-check + lint + targeted tests green.
- [x] Manual smoke recorded in Notes (dev server) — residual written; not silently skipped.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** No authenticated browser tool in this session; Next is running but API proxy to `:3001` was refusing connections at smoke time.
**Solution:** Wrote an explicit live-smoke residual in the batch Notes. Did not invent a pass.

---

## 📝 Notes

- After this ships, Phase 2 may reuse the field index module. Do not relocate it in this task "for cleanliness."
- Grep: `rx-fields.ts`, `rx-focus.ts`, `GlobalCommandPalette.tsx` have no `console.log`/`debug` of the query or `rxFocus`. `cmdk.ts` `console.debug` payload is `{ queryLen }` / `{ source }` only.

---

## 🔗 Related Tasks

- [`task-rfeq-01-field-index-and-cmdk-source.md`](./task-rfeq-01-field-index-and-cmdk-source.md)
- [`task-rfeq-02-rx-focus-deep-link.md`](./task-rfeq-02-rx-focus-deep-link.md)
- [Phase 2](../../p2-command-bar/) — next

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** Phase close-gate, no new design
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
