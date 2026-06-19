# Task subj-23: Subjective section registry + ordered renderer (parity-preserving refactor)

> **Filename:** `task-subj-23-section-registry-and-ordered-renderer.md` in `subjective-tab/p8-section-reorder/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7). Same depth as the Phase-7 `Tasks/` folder.

---

## 📋 Task Overview

Turn the **hardcoded** Subjective-tab layout into a **registry-driven, ordered render**. Define a
canonical set of section ids + a `DEFAULT_SECTION_ORDER`, build an id→node registry inside
`SubjectiveSection`, and render the sections by iterating a resolved order list. Decompose
`HistoryFields` so each history card (family, social, and each generic history row) is an
**individual** registry entry — doctors will reorder them individually in subj-25. **No DnD and no
persistence yet** — this is a pure refactor that must reproduce today's layout **byte-for-byte** when
no doctor override exists.

**Program / Phase:** subjective-tab · Phase 8 (section reorder)  
**Batch:** [`plan-p8-subjective-section-reorder-batch.md`](../plan-p8-subjective-section-reorder-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p8-subjective-section-reorder.md`](./EXECUTION-ORDER-p8-subjective-section-reorder.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ⏳ **PENDING**

**Change Type:**
- [ ] **Refactor (behaviour-preserving)** — same rendered output, new internal structure. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** `SubjectiveSection.tsx` renders a fixed sequence — `ComplaintList` → (`PatientBackgroundZone` + `PatientAllergiesZone` when `patientId && token`, else `PastSurgicalHistoryField`) → `HistoryFields` → free-text notes `CollapsibleContainer` → `CustomSubsectionsField`. `HistoryFields.tsx` itself maps `HISTORY_FIELD_DEFS` into per-card `CollapsibleContainer`s (family/social special-cased, rest generic). `CollapsibleContainer` already has a `leadingActions` slot (Phase 7).
- ❌ **What's missing:** any notion of a section **id**, an ordered list, or a registry — order is positional JSX.

**Scope Guard:**
- Expected files touched: ≤ 5 (`SubjectiveSection.tsx`; `HistoryFields.tsx` refactor or split; new `subjective-section-order.ts`; one test; possibly a small types file).
- **No** drag UI (subj-25), **no** `doctor_settings` / persistence (subj-24/26), **no** output change.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Section-order module
- [ ] 1.1 Create `frontend/lib/cockpit/subjective-section-order.ts`: a `SubjectiveSectionId` string-literal union (e.g. `chief_complaints`, `patient_background`, `allergies`, `past_surgical`, `family_history`, `social_history`, the generic history-field ids, `free_text_notes`, `custom_subsections`), a `DEFAULT_SECTION_ORDER: SubjectiveSectionId[]` matching today's exact layout, and a `normalizeSectionOrder(stored, available)` helper (drop unknown ids, append available-but-missing at their `DEFAULT_SECTION_ORDER` slot, keep only mountable/available ids).
  - [ ] 1.1.1 History ids derive from `HISTORY_FIELD_DEFS` so adding a history field later auto-extends the registry.

### 2. Registry + ordered render
- [ ] 2.1 In `SubjectiveSection.tsx`, build a `Partial<Record<SubjectiveSectionId, ReactNode>>` registry mapping each id to its existing node, gated by the same conditions (linked PMH/allergies vs `past_surgical` fallback).
- [ ] 2.2 Render by iterating `normalizeSectionOrder(DEFAULT_SECTION_ORDER, availableIds)` and emitting `registry[id]`. The toolbar (carry-forward / preset buttons) and `<section aria-label>` wrapper stay fixed (not reorderable).
- [ ] 2.3 Decompose `HistoryFields` so family/social/each generic row are **individual** registry entries (lift them into `SubjectiveSection`'s registry, or have `HistoryFields` expose a node-per-id map). Drop the inner `<section aria-label="Visit histories">` wrapper only if it does not change the visual output; otherwise keep grouping but make each card independently orderable.

### 3. Verification & Testing
- [ ] 3.1 **Parity test:** with `DEFAULT_SECTION_ORDER` (no override), the rendered section order + DOM is identical to pre-refactor (snapshot or ordered `aria-label`/`id` assertion) in both linked (`patientId && token`) and fallback modes.
- [ ] 3.2 Test: `normalizeSectionOrder` drops unknown ids, appends a newly-available id at its canonical slot, and filters out unmountable ids.
- [ ] 3.3 `cd frontend && npx tsc --noEmit && npm run lint` clean; affected suites green.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/subjective-section-order.ts (ids + DEFAULT_SECTION_ORDER + normalize)
UPDATE: frontend/components/cockpit/rx/sections/SubjectiveSection.tsx (registry + ordered render)
UPDATE: frontend/components/cockpit/rx/subjective/HistoryFields.tsx (decompose into per-id entries)
CREATE: frontend/lib/cockpit/__tests__/subjective-section-order.test.ts
CREATE/UPDATE: SubjectiveSection render-parity test
DO NOT TOUCH: drag UI (subj-25); doctor_settings (subj-24); output/PDF; cc/hopi derivation
```

**When updating existing code:**
- [ ] Preserve the conditional mount logic exactly (linked sections vs past-surgical fallback) — the registry only contains ids that are mountable for the current props.
- [ ] Keep the fixed toolbar + heading outside the orderable list.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Registry-driven render order (P8-D1).** Default order reproduces today's layout byte-for-byte.
- **Graceful merge, never hide (P8-D5).** `normalizeSectionOrder` is the single source of merge truth; conditional sections filtered to what's mountable.
- **Pure refactor.** No DnD, no persistence, no output change this slice.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No** — frontend render refactor only.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Default-order render is byte-identical to today's layout in linked + fallback modes.
- [ ] Registry + `normalizeSectionOrder` exist and are unit-tested (drop/append/filter).
- [ ] `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The whole phase rests on this refactor being a no-op visually. Land the parity test first, then refactor under it.

---

## 🔗 Related Tasks

- [`task-subj-24-doctor-settings-section-order.md`](./task-subj-24-doctor-settings-section-order.md) — persists the order this registry consumes.
- [`task-subj-25-drag-and-drop-reorder-chrome.md`](./task-subj-25-drag-and-drop-reorder-chrome.md) — first consumer (reorders the id list).

---

**Last Updated:** 2026-06-17  
**Pattern:** id→node registry + ordered list render replacing positional JSX; `normalizeSectionOrder` merge.  
**Reference:** `process/CODE_CHANGE_RULES.md`
