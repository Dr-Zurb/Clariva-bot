# Task subj-03: Complaint-type attribute schema registry (OLDCARTS / SOCRATES / per-type)

> **Filename:** `task-subj-03-complaint-type-attribute-schema.md` in `subjective-tab/p1-complaint-cards/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Make each complaint card show the **attribute set relevant to that complaint** (ST-D4): a
frontend schema registry mapping a complaint *category* → its attribute rows + chip
vocabularies — **pain** → SOCRATES, **fever** → pattern / max-temp / chills / duration,
**cough** → dry-or-productive / sputum / duration, and a **default** OLDCARTS fallback. The
card (subj-02) renders whatever the registry returns.

**Program / Phase:** subjective-tab · Phase 1 (complaint-cards)  
**Batch:** [`plan-p1-subjective-tab-complaint-cards-batch.md`](../plan-p1-subjective-tab-complaint-cards-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-subjective-tab-complaint-cards.md`](./EXECUTION-ORDER-p1-subjective-tab-complaint-cards.md)  
**Estimated Time:** ~1.5 hours  
**Status:** ✅ **DONE** — 2026-06-03

**Change Type:**
- [x] **New feature** — a new data/registry module + a resolver; subj-02 consumes it.

**Current State:**
- ✅ **What exists:** the `Complaint` shape (subj-01); the card host (subj-02); the chip-input pattern [`DdxChipList.tsx`](../../../../../../../../frontend/components/cockpit/rx/inputs/DdxChipList.tsx); the parse/serialize precedent [`lib/cockpit/exam-findings`](../../../../../../../../frontend/lib/cockpit/exam-findings.ts).
- ❌ **What's missing:** the `complaint-schema.ts` registry + the keyword/category → attribute-set resolver.
- ⚠️ **Notes:** in Phase 1 the category is inferred from the typed complaint name (a keyword map); Phase 2 (`subj-06`) feeds `complaint_master.category` directly. Build the resolver so the Phase-2 source slots in without rework.

**Scope Guard:**
- Expected files touched: ≤ 3 (registry module, its test, the small wiring in `ComplaintCard`). No backend, no schema.

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md) · [RECIPES.md](../../../../../../../Reference/engineering/development/RECIPES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. The schema registry
- [x] ✅ 1.1 Create `frontend/lib/cockpit/complaint-schema.ts` defining attribute-set descriptors per category (pain/fever/cough/default), each describing which `Complaint` fields show + each field's input kind (chip palette vs short text vs segmented severity) + chip vocab. - **Completed: 2026-06-03**
- [x] ✅ 1.2 Add a resolver: `(complaintName | category) → AttributeFieldDef[]`, defaulting to OLDCARTS for unknown categories. - **Completed: 2026-06-03**
  - [x] ✅ 1.2.1 Keyword→category matcher for v1 (name-based); leave a clean seam for a passed-in `category` (Phase 2). - **Completed: 2026-06-03**

### 2. Wire into the card
- [x] ✅ 2.1 `ComplaintCard` (subj-02) renders the resolved field set; switching the complaint name re-resolves without losing already-entered *shared* fields (e.g. severity, duration). - **Completed: 2026-06-03**

### 3. Verification & Testing
- [x] ✅ 3.1 Unit test: pain → SOCRATES set; fever → fever set; unknown → OLDCARTS; re-resolve preserves shared fields. - **Completed: 2026-06-03**
- [x] ✅ 3.2 `tsc`/lint clean. - **Completed: 2026-06-03**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/complaint-schema.ts
CREATE: frontend/lib/cockpit/__tests__/complaint-schema.test.ts
UPDATE: frontend/components/cockpit/rx/subjective/ComplaintCard.tsx (consume the registry)
DO NOT TOUCH: backend, RxFormContext schema, complaint_master (Phase 2)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Default never blocks (ST-D4).** An unknown complaint resolves to OLDCARTS — a missing category never breaks the card.
- **Forward-compatible category source.** v1 infers from the name; the resolver must accept an explicit `category` so Phase 2's `complaint_master` slots in.
- **No data loss on re-resolve.** Changing the complaint keeps shared attribute values.
- Pure frontend data + a resolver; no PHI handling beyond rendering existing state.

**DO NOT include** code or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** (frontend registry only).
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] Card shows complaint-type-relevant attributes; default = OLDCARTS; re-resolve preserves shared fields; resolver accepts an explicit category; tests + `tsc`/lint green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Small, bounded data module — the part that makes the cards feel clinical rather than generic.

---

## 🔗 Related Tasks

- [`task-subj-02-complaint-card-and-list-ui.md`](./task-subj-02-complaint-card-and-list-ui.md) — the host that renders this.
- [`task-subj-06-complaint-master-and-favorites.md`](../../p2-fast-entry/Tasks/task-subj-06-complaint-master-and-favorites.md) — feeds `category` from the master (Phase 2).

---

**Last Updated:** 2026-06-03  
**Pattern:** category → attribute-set registry + resolver (OLDCARTS default).  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
