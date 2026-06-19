# Task subj-12: Nested associated complaint cards (one level)

> **Filename:** `task-subj-12-nested-associated-complaints.md` in `subjective-tab/p4-rapid-capture/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).
> **Sequenced after subj-11** — reuses the rapid-capture bar one level down.

---

## 📋 Task Overview

Let a chief complaint own **associated complaints** that are themselves full mini-cards with
their own OLDCARTS/SOCRATES (e.g. *chest pain* → associated *breathlessness* with its own
onset/timing/severity). This is distinct from the existing lightweight `associated: string[]`
symptom chips — **keep both**, and add a **"promote chip → card"** path for when a tagged
symptom turns out to need detail. **One level of nesting only** (associated complaints can't
nest further). **No migration** — `complaints` is already JSONB; nesting is an additive shape
validated app-side.

**Program / Phase:** subjective-tab · Phase 4 (rapid-capture)
**Batch:** [`plan-p4-subjective-tab-rapid-capture-batch.md`](../plan-p4-subjective-tab-rapid-capture-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-subjective-tab-rapid-capture.md`](./EXECUTION-ORDER-p4-subjective-tab-rapid-capture.md)
**Estimated Time:** ~1–1.5 days
**Status:** ⬜ TODO

**Change Type:**
- [ ] **Update existing** — `Complaint` type, reducer actions (target a child via `parentId`), `cc`/`hopi` derivation + serialize/hydrate, `ComplaintCard`/`ComplaintList`. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).
- [ ] **Backend** — permit `associatedComplaints[]` in prescription validation/types.

**Current State:**
- ✅ **What exists:** flat `complaints: Complaint[]` + reducer in [`RxFormContext.tsx`](../../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx); `associated: string[]` chips on `Complaint` ([`types/prescription.ts`](../../../../../../../../frontend/types/prescription.ts)); `deriveCcFromComplaints` / `deriveHopiFromComplaints` / `formatComplaintHopiLine` (flat); `buildRxPayload` + `complaintsFromPrescription` round-trip; the subj-11 capture bar.
- ❌ **What's missing:** recursive `associatedComplaints?: Complaint[]`; child-targeted reducer ops; nested rendering + nested capture bar; nested derivation; chip→card promotion.
- ⚠️ **Notes:** subj-10 locked `cc`/`hopi` byte-parity — nested HOPI is a **deliberate** format change (indented sub-lines under the parent); update the gate fixtures with it. `cc` stays top-level-only (associated complaints are not chief complaints).

**Scope Guard:**
- One level deep. Sibling-only reorder (promote/demote via explicit button, NOT cross-level drag). Expected files: `types/prescription.ts`, `RxFormContext.tsx`, `ComplaintCard.tsx`, `ComplaintList.tsx`, backend `types/prescription.ts` + `utils/validation.ts`, tests + gate fixtures. **DO NOT add a migration.**

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [FRONTEND_ARCHITECTURE.md](../../../../../../../Reference/engineering/architecture/FRONTEND_ARCHITECTURE.md) · [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md) · [RECIPES.md](../../../../../../../Reference/engineering/development/RECIPES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Data model + state
- [ ] 1.1 Add `associatedComplaints?: Complaint[]` to `Complaint` (frontend + backend types).
- [ ] 1.2 Reducer: extend `ADD/UPDATE/REMOVE/REORDER_COMPLAINT` with optional `parentId` targeting one nesting level; reject deeper nesting.
- [ ] 1.3 `complaintsFromPrescription` hydrates children; `buildRxPayload` recurses, trimming empty children (same name-required rule as top level).

### 2. Derivation (cc / hopi)
- [ ] 2.1 `cc`: unchanged — top-level names only.
- [ ] 2.2 `hopi`: `formatComplaintHopiLine` / `deriveHopiFromComplaints` render each associated complaint as an **indented sub-line** under its parent; deterministic ordering.
- [ ] 2.3 Update the subj-10 gate fixtures to the new HOPI format; assert determinism (PDF/SMS/snapshot reproducible).

### 3. UI
- [ ] 3.1 In an expanded parent card, render associated complaint cards indented (subtle left-border inset, narrow-rail safe) with a nested capture bar (reuse subj-11).
- [ ] 3.2 Collapsed parent summary shows a count, e.g. `Chest pain · +2 associated`.
- [ ] 3.3 "Promote chip → card": an action on an `associated` chip moves it into `associatedComplaints` (removing the chip).
- [ ] 3.4 Sibling-only drag reorder within each level; explicit button for promote/demote (no cross-level drag).

### 4. Verification & Testing
- [ ] 4.1 Add parent → add 2 associated → fill child attributes → round-trips through autosave + reload.
- [ ] 4.2 HOPI derivation snapshot: parent with nested children renders indented sub-lines; `cc` unchanged.
- [ ] 4.3 Promote a chip → becomes a child card; removing a parent cascades its children.
- [ ] 4.4 a11y: nested cards labelled with parent context; 44px targets; keyboard add/promote; `tsc`/lint/tests + updated gate green.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/types/prescription.ts (associatedComplaints?: Complaint[])
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (reducer parentId, derive, serialize/hydrate)
UPDATE: frontend/components/cockpit/rx/subjective/ComplaintCard.tsx (nested render + promote)
UPDATE: frontend/components/cockpit/rx/subjective/ComplaintList.tsx (nested capture bar, sibling reorder)
UPDATE: backend/src/types/prescription.ts + backend/src/utils/validation.ts (permit nested array)
UPDATE: subj-10 gate fixtures + ComplaintList/derivation tests
DO NOT: add a DB migration (complaints is JSONB)
```

**When updating existing code:**
- [ ] Audit every reader of `Complaint` / `complaints` (PDF mapper, notification/SMS, snapshot, public-prescription read) before changing the shape — [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).
- [ ] Keep `associated` (chips) working unchanged; nesting is additive beside it.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **One level only** — guard against deeper nesting in the reducer.
- **Two distinct tools** — chips = quick tags; nested cards = detailed; promote bridges them.
- **`cc` is top-level-only** — associated complaints never enter the chief-complaint line.
- **Deterministic HOPI** — stable ordering so PDF/SMS/snapshot stay reproducible.
- **Narrow-rail nesting** — subtle inset, not deep margins; collapsed-first.
- **No direct field mutation** — all writes via reducer; autosave wired off it.

**DO NOT include** code or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Shape-only** (JSONB; no migration; no schema/column change).
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] A chief complaint can hold associated complaint cards (one level), each with its own attributes, round-tripping through autosave/reload.
- [ ] Chips and nested cards coexist; chip→card promotion works; removing a parent cascades its children.
- [ ] HOPI renders associated complaints as indented sub-lines (gate fixtures updated); `cc` unchanged.
- [ ] Narrow-rail friendly; a11y + `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Clinically, some complaints travel together (chest pain + breathlessness + sweating) and the
associated symptom sometimes needs its own OLDCARTS, not just a tag. The recursive shape is
free in storage (`complaints` is already JSONB), so the real work is the **derivation** (one
level of indented HOPI sub-lines) and the **round-trip/serializer** recursion — both in
`RxFormContext.tsx`. Cap at one level to avoid recursive DnD/derivation complexity for no
clinical payoff.

---

## 🔗 Related Tasks

- [`task-subj-11-rapid-complaint-capture.md`](./task-subj-11-rapid-complaint-capture.md) — the capture bar reused for the nested add-bar.
- subj-02 — `ComplaintCard` / `ComplaintList` being extended.
- subj-01 — the `complaints` state + derivation this recurses.

---

**Last Updated:** 2026-06-04
**Pattern:** one-level recursive complaint tree; chips + promote.
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/CODE_CHANGE_RULES.md`
