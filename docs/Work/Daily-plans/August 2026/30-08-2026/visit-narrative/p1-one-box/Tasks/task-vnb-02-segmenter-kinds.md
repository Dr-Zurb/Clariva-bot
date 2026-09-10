# Task vnb-02: Segmenter kinds — vital / diagnosis / investigation / prose

> **Filename:** `task-vnb-02-segmenter-kinds.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Widen the pure segmenter so a whole-visit paragraph yields slices for **every** Phase-1 target. Today it knows `complaint | medicine | ignored | leftover` and throws exam/impression content away as `ignored`. After this task, "Impression: dengue" is a `diagnosis` slice, "order cbc" an `investigation` slice, "spo2 98" a `vital` slice, and "advice rest" a routed-prose slice.

**Program / Phase:** visit-narrative · Phase 1 (one box)
**Batch:** [`plan-p1-visit-narrative-one-box-batch.md`](../plan-p1-visit-narrative-one-box-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-visit-narrative-one-box.md`](./EXECUTION-ORDER-p1-visit-narrative-one-box.md)
**Estimated Time:** ~2.5 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-08-30

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — widens `visit-segmenter.ts`; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** `visit-segmenter.ts` with `VISIT_SEGMENT_CUES` (single table, rfed-01), kinds `complaint | medicine | ignored | leftover`; exam/impression cues recognised but mapped to `ignored`.
- ❌ **What's missing:** `vital`, `diagnosis`, `investigation`, and routed-prose kinds (with a target-section tag for prose: exam / advice / note).
- ⚠️ **Notes:** rfed-01's task notes anticipated exactly this: *"Exam + impression slices are recognised and dropped … so a future program can pick them up."* This is that program. Keep one cue table; the router (vnb-03) imports it, never copies it.

**Scope Guard:**
- Expected files touched: ≤ 4 (module + tests; orchestrator compile-fix only if the kind union is imported there)
- Any expansion requires explicit approval.

**Reference Documentation:**
- [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) — VN-DL-3, VN-DL-4, VN-Q4
- Batch locks VNB-D2 (ladder consumes these kinds), VNB-D5 (prose targets)
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Kinds + cues
- [x] ✅ 1.1 New kinds: `vital`, `diagnosis`, `investigation`, and routed prose carrying its target section (exam / advice / note). `ignored` remains only for content Phase 1 genuinely cannot place. - **Completed: 2026-08-30**
- [x] ✅ 1.2 Remap existing exam/impression cues: impression/dx → `diagnosis`; exam/on-examination → prose(exam). Add cues for orders (order / send for / test) → `investigation`, advice → prose(advice), and vital-shaped starts → `vital`. - **Completed: 2026-08-30**
- [x] ✅ 1.3 Cue table stays a single exported constant; case-insensitive; clinical shorthand tolerated (same folding rules as today). - **Completed: 2026-08-30**
- [x] ✅ 1.4 No-cue behavior unchanged: one `leftover` slice. - **Completed: 2026-08-30**

### 2. Verification & Testing
- [x] ✅ 2.1 Table-driven tests: each new kind alone; a whole-visit paragraph hitting all six kinds in order; precedence when cues collide. - **Completed: 2026-08-30**
- [x] ✅ 2.2 Regression: every rfed-01 case still passes (complaint/medicine/leftover behavior identical). - **Completed: 2026-08-30**
- [x] ✅ 2.3 `npx tsc --noEmit` + lint on the new files. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/visit-segmenter.ts
UPDATE: frontend/lib/cockpit/__tests__/visit-segmenter.test.ts
```

**Existing Code Status:**
- ✅ Segmenter + cue table — EXIST; widen in place.
- ❌ New kinds — MISSING.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Model-free, deterministic, no network imports, no logging of input text (unchanged from rfed-01).
- The segmenter labels; it does not validate values ("spo2 985" is still a `vital` slice — the grammar in vnb-03 rejects it).
- Hindi/Marathi cue expansion stays out (VN-DL-12) — leftover + parsers handle vernacular for now.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** No.
- [x] **Any PHI in logs?** No.
- [x] **External API or AI call?** No.
- [x] **Retention / deletion impact?** No.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] All six kinds emitted from one table; whole-visit paragraph test locked.
- [x] rfed-01 regression cases green unchanged.
- [x] Module still has no network imports.
- [x] Type-check + lint + tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:**
**Solution:**

---

## 📝 Notes

- Allergy / history / follow-up / referral cues: route to prose(note) for now — VN-DL-3 defers their structured parsers. Do not add speculative kinds for them.

---

## 🔗 Related Tasks

- [`task-vnb-01-single-mount.md`](./task-vnb-01-single-mount.md) (parallel, Lane α)
- [`task-vnb-03-deterministic-first-router.md`](./task-vnb-03-deterministic-first-router.md) (consumes the kinds)

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** Pure segmenter widening, table-tested
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
