# Task obj-02: Exam-system schema registry (`exam-schema.ts`)

> **Filename:** `task-obj-02-exam-system-registry.md` in `objective-tab/p1-structured-exam/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Create the frontend exam-system registry that obj-03's cards read: for each of the **5 core
systems** (`general`, `cvs`, `resp`, `abd`, `cns`) a label, a "within normal limits" one-liner,
and an abnormal chip palette — plus an OLDCARTS-style default for unknown systemIds (so a
future custom/specialty system still renders). This is a **pure data registry + resolver** —
no UI, no state, no network. It is the Objective analog of subjective `complaint-schema.ts`
(ST-D4). The systemId order defined here is the **canonical derivation order** obj-01 uses.

**Program / Phase:** objective-tab · Phase 1 (structured exam)  
**Batch:** [`plan-p1-objective-tab-structured-exam-batch.md`](../plan-p1-objective-tab-structured-exam-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-objective-tab-structured-exam.md`](./EXECUTION-ORDER-p1-objective-tab-structured-exam.md)  
**Estimated Time:** ~1.5–2 hours  
**Status:** ✅ **COMPLETE** — 2026-06-19

**Change Type:**
- [x] **New feature** — add code only (a new lib file + tests).

**Current State:**
- ✅ **What exists:** `frontend/lib/cockpit/complaint-schema.ts` (the registry + type-aware resolver precedent); the chip vocabulary patterns in `DdxChipList`; the normal/abnormal one-liners drafted in [`exam-catalog.md`](../../../../../../capture/features/objective-tab/exam-catalog.md) §A1.
- ❌ **What's missing:** any exam-system registry.

**Scope Guard:**
- Expected files touched: ≤ 2 (`exam-schema.ts` + its test).
- **No** state, **no** UI, **no** import into `ObjectiveSection` (that's obj-03), **no** backend.

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [RECIPES.md](../../../../../../../Reference/engineering/development/RECIPES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Registry
- [x] ✅ 1.1 `frontend/lib/cockpit/exam-schema.ts`: ordered registry of 5 core systems (`general`, `cvs`, `resp`, `abd`, `cns`); each entry has `systemId`, `label`, `normalLine`, `abnormalChips`. - **Completed: 2026-06-19**
  - [x] ✅ 1.1.1 Seeded from [`exam-catalog.md`](../../../../../../capture/features/objective-tab/exam-catalog.md) §A1. - **Completed: 2026-06-19**
  - [x] ✅ 1.1.2 Exported `EXAM_CORE_SYSTEM_ORDER` (derived from `EXAM_CORE_SYSTEMS` array order). - **Completed: 2026-06-19**
- [x] ✅ 1.2 Default/fallback via `resolveExamSystem` — generic WNL line + abnormal chip palette for unknown ids. - **Completed: 2026-06-19**

### 2. Resolver
- [x] ✅ 2.1 `resolveExamSystem(systemId)` → core entry or fallback; `listExamSystems()` → ordered core list. Pure, never throws. - **Completed: 2026-06-19**

### 3. Verification & Testing
- [x] ✅ 3.1 Test: 5 core systems present, ordered, each with non-empty `normalLine` + ≥1 abnormal chip. - **Completed: 2026-06-19**
- [x] ✅ 3.2 Test: resolver returns fallback for unknown systemId (never throws). - **Completed: 2026-06-19**
- [x] ✅ 3.3 Vitest (5 passed) + eslint clean on new files. (Repo-wide `tsc` debt pre-existing; untouched.) - **Completed: 2026-06-19**

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/exam-schema.ts
CREATE: frontend/__tests__/.../exam-schema.test.ts (match repo test layout)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Pure module — no React, no network, no side effects (mirrors `complaint-schema.ts`).
- The chip vocabulary is **UI guidance only** — obj-01's Zod does not enforce it (a doctor may type a free-text finding not in the palette).
- Canonical order is a contract shared with obj-01 (derivation) — keep it single-sourced here.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **N** (static registry, no PHI).
- [x] **Any PHI in logs?** **No**.
- [x] **External API or AI call?** **N**.
- [x] **Retention / deletion impact?** **N**.

---

## ✅ Acceptance & Verification Criteria

- [x] 5 core systems present + ordered; resolver fallback safe for unknown ids.
- [x] Tests added; eslint + vitest clean on new files.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🔗 Related Tasks

- [`task-obj-01-…`](./task-obj-01-data-model-and-derived-contract.md) — consumes the canonical systemId order for derivation.
- [`task-obj-03-…`](./task-obj-03-exam-card-and-host.md) — renders cards from this registry.

---

**Last Updated:** 2026-06-18  
**Pattern:** Subjective `complaint-schema.ts` (type-aware registry) ported to exam systems.
