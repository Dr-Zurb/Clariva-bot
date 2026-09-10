# Task rfed-01: Deterministic cue-phrase segmenter

> **Filename:** `task-rfed-01-cue-segmenter.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Ship a **pure**, model-free segmenter that splits a visit paragraph into labelled slices (complaint vs medicine / plan, plus leftover). No React, no fetch. This is the primitive rfed-02 fans out from.

**Program / Phase:** rx-fast-entry · Phase 3 (describe-visit)
**Batch:** [`plan-p3-rx-fast-entry-describe-visit-batch.md`](../plan-p3-rx-fast-entry-describe-visit-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-fast-entry-describe-visit.md`](./EXECUTION-ORDER-p3-rx-fast-entry-describe-visit.md)
**Estimated Time:** ~2 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-08-30

**Change Type:**
- [x] **New feature** — Add code only (no change to existing behavior)
- [ ] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** Per-line deterministic parsers inside complaint / medicine capture (one line → one entity). No paragraph-level SOAP cue splitter.
- ❌ **What's missing:** A reusable segmenter module.
- ⚠️ **Notes:** Cue list is product-locked (RFE3-D2): complaint / exam / impression / plan / review / start-on / medicine-ish starts. Exam + impression slices are **recognised and dropped** in this program (Subjective + Plan only) — do not send them to a parser. Document the drop in tests so Phase 4-of-a-future-program can pick them up.

**Scope Guard:**
- Expected files touched: ≤ 5 (module + tests only)
- Any expansion requires explicit approval

**Reference Documentation:**
- [`plan-rx-fast-entry.md`](../../../../../../Product%20plans/plan-rx-fast-entry.md) — RFE-DL-7, RFE3-D2
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Segmenter
- [x] ✅ 1.1 Input: one string. Output: ordered slices, each with a kind (`complaint` / `medicine` / `ignored` / `leftover`) and the text span. - **Completed: 2026-08-30**
- [x] ✅ 1.2 Cue phrases are case-insensitive and tolerate common clinical shorthand. Keep the table in one place so rfed-02 does not grow a second list. - **Completed: 2026-08-30**
- [x] ✅ 1.3 No cue at all → a single `leftover` slice containing the original text (rfed-02 will send that to both parsers). - **Completed: 2026-08-30**
- [x] ✅ 1.4 Exam / impression / other non-S+P cues → `ignored` (not leftover). They must not be double-sent. - **Completed: 2026-08-30**

### 2. Verification & Testing
- [x] ✅ 2.1 Table-driven tests: mixed paragraph, medicine-only, complaint-only, no cues, exam-only (ignored). - **Completed: 2026-08-30**
- [x] ✅ 2.2 Empty / whitespace → no slices (or one empty leftover — pick one and lock it in the test name). - **Completed: 2026-08-30**
- [x] ✅ 2.3 `npx tsc --noEmit` + lint on the new files. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/visit-segmenter.ts
CREATE: frontend/lib/cockpit/__tests__/visit-segmenter.test.ts
```

**Existing Code Status:**
- ❌ Segmenter — MISSING.
- ✅ Capture-bar line parsers — EXIST; do not call them from this module.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Model-free (RFE3-D2). Importing an API client here is a **STOP**.
- No PHI logging — the module should not log input text.
- Deterministic: same string → same slices.

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
- [x] Mixed and no-cue cases are locked by tests.
- [x] Exam/impression slices are `ignored`, not leftover.
- [x] The module has no network imports.
- [x] Type-check + lint + tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:**
**Solution:**

---

## 📝 Notes

- Empty / whitespace → **no slices** (locked in `empty and whitespace yield no slices`).
- Cue table: `VISIT_SEGMENT_CUES` in `frontend/lib/cockpit/visit-segmenter.ts`. rfed-02 must import it, not copy it.
- Do not "helpfully" add Hindi/Marathi cues unless they are already obvious cognates — leftover handles those via the parsers. Expanding the cue table is a follow-up.

---

## 🔗 Related Tasks

- [`task-rfed-02-fanout-orchestrator.md`](./task-rfed-02-fanout-orchestrator.md)

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** Pure segmenter, table-tested
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
