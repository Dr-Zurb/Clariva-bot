# Task subj-33: Visibility resolver + debounced autosave (frontend lib)

> **Filename:** `task-subj-33-visibility-resolver-and-autosave.md` in `subjective-tab/p10-section-visibility/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

The **correctness keystone** of Phase 10: a pure frontend lib that (a) resolves the **visible** render plan by
filtering the doctor's hidden set out of the current section order — but only for sections that are actually
**mountable** in the current chart mode — and (b) computes the minimal set to persist: **only** static, mountable
ids the doctor has hidden, excluding per-visit `custom_block:*` ids. No React, no UI, no DOM — just functions +
unit tests. It mirrors the shape of [`subjective-section-collapse.ts`](../../../../../../../../frontend/lib/cockpit/subjective-section-collapse.ts) (resolver + delta serialiser + save helper).

**Program / Phase:** subjective-tab · Phase 10 (section visibility)  
**Batch:** [`plan-p10-subjective-section-visibility-batch.md`](../plan-p10-subjective-section-visibility-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p10-subjective-section-visibility.md`](./EXECUTION-ORDER-p10-subjective-section-visibility.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **DONE** — Completed: 2026-06-18

**Change Type:**
- [x] **New feature** — new pure lib + tests. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** subj-32 transport (`subjectiveSectionHidden` get/set); the `SubjectiveSectionId` union + `isCustomBlockSectionId` / `isStaticSubjectiveSectionId` + the mountable-id resolvers `resolveStaticSectionIds` / `resolveAvailableSectionIds` in [`subjective-section-order.ts`](../../../../../../../../frontend/lib/cockpit/subjective-section-order.ts); the Phase-9 delta serialiser + thin save helper shape in [`subjective-section-collapse.ts`](../../../../../../../../frontend/lib/cockpit/subjective-section-collapse.ts).
- ❌ **What's missing:** any filter of hidden ids out of the render plan, and the "persist only mountable static hidden ids" serialiser.

**Scope Guard:**
- Expected files touched: ≤ 2 (new lib + its unit test).
- **No** changes to `SubjectiveSection` / no menu (subj-34), **no** settings/API change (subj-32).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Resolver
- [x] ✅ 1.1 `resolveVisibleSections(order, hiddenIds, mountableIds)` → filters mountable hidden ids from order; preserves order; never drops `custom_block:*`; non-mountable hidden ids pass through untouched. - **Completed: 2026-06-18**
- [x] ✅ 1.2 `isSectionHidden(id, hiddenIds, mountableIds)` for menu per-row toggle state (false for non-mountable + custom blocks). - **Completed: 2026-06-18**

### 2. Persist serialiser
- [x] ✅ 2.1 `hiddenOverridesToPersist(hiddenIds, mountableIds)` → static registry ids only; drops `custom_block:*`; dedupes. - **Completed: 2026-06-18**
  - [x] ✅ 2.1.1 **Cross-mode retention:** retains static hidden ids even when not currently mountable; only drops unknown registry ids + custom blocks. Documented in lib header; pinned in unit test. - **Completed: 2026-06-18**
- [x] ✅ 2.2 `serializeHiddenIds(ids)` → stable sorted JSON key for debounce guard. - **Completed: 2026-06-18**
- [x] ✅ 2.3 `saveSubjectiveSectionHidden(token, ids)` + `fetchSubjectiveSectionHidden` → PATCH/GET via subj-32 client (mirrors collapse save/fetch shape). - **Completed: 2026-06-18**

### 3. Verification & Testing
- [x] ✅ 3.1 Test: resolver removes mountable hidden; keeps non-mountable hidden in order; never removes custom_block; preserves order. - **Completed: 2026-06-18**
- [x] ✅ 3.2 Test: serialiser keeps static hidden ids, drops custom_block, dedupes, cross-mode retention. - **Completed: 2026-06-18**
- [x] ✅ 3.3 Test: round-trip visibility stable across resolve → persist → re-resolve (+ cross-mode switch). - **Completed: 2026-06-18**
- [x] ✅ 3.4 `tsc`/lint/tests green on new files (17/17 vitest; no repo-wide tsc baseline change). - **Completed: 2026-06-18**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/subjective-section-visibility.ts (resolver + serialiser + save helper)
CREATE: frontend/lib/cockpit/__tests__/subjective-section-visibility.test.ts
DO NOT TOUCH: SubjectiveSection.tsx / the menu (subj-34); doctor_settings api (subj-32); render-order logic in subjective-section-order.ts
```

**When updating existing code:**
- [ ] Reuse `SubjectiveSectionId` / `isCustomBlockSectionId` / `isStaticSubjectiveSectionId` / the mountable-id resolvers from `subjective-section-order.ts`; do not duplicate the id scheme or re-derive mountability.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Delta set, not a snapshot (P10-D2).** Persist only hidden ids; absent ⇒ visible. The merge against the render plan is this lib's job; the column just stores the array.
- **Mode-aware filtering (P10-D7).** Only filter ids that are mountable in the current mode — hiding `allergies` (linked mode) must not affect the fallback mode where it isn't mountable.
- **Static ids only (P10-D4).** Never hide/persist `custom_block:*` — custom blocks are removed by deletion, not hidden.
- **View-only (P10-D6).** The hidden set never enters `buildRxPayload`; this lib produces a render plan + a config payload only.
- **Pure + deterministic.** No React/DOM/time; debounce + state + one-shot hydration live in subj-34. This lib is fully unit-testable.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No** new storage here — produces the payload subj-32 persists (doctor-scoped config, not PHI).
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No** (the save helper calls the existing doctor-settings PATCH only).
- [ ] **Retention / deletion impact?** **No new patient surface.**

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ Resolver: mountable hidden id removed from render plan; non-mountable hidden id passes through; custom blocks never removed via hidden set; order preserved.
- [x] ✅ Serialiser: keeps static hidden ids; drops `custom_block:*`; dedupes; cross-mode retention behaves as documented.
- [x] ✅ Round-trip visibility stable; `tsc`/lint/tests green on new files.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The subtlety that makes this its own slice: **mode-aware delta.** A naive "filter order by hidden" would either
leak hides across chart modes or write ids the doctor can't currently see. Resolving against the live mountable
set (and persisting only static, mountable hides) keeps the set honest and lets the menu reflect exactly what's
toggleable right now. The cross-mode retention decision (2.1.1) is the one genuine judgement call — pin it in a test.

---

## 🔗 Related Tasks

- [`task-subj-32-doctor-settings-hidden-set.md`](./task-subj-32-doctor-settings-hidden-set.md) — the transport this saves through.
- [`task-subj-34-section-manager-menu.md`](./task-subj-34-section-manager-menu.md) — supplies `mountableIds` and owns debounce/state/hydration.
- Sibling precedent: [`../../p9-collapse-persistence/Tasks/task-subj-29-collapse-resolver-and-autosave.md`](../../p9-collapse-persistence/Tasks/task-subj-29-collapse-resolver-and-autosave.md).

---

**Last Updated:** 2026-06-18  
**Pattern:** pure resolver + delta serialiser + thin save helper (clone of `subjective-section-collapse.ts`).  
**Reference:** `process/CODE_CHANGE_RULES.md`
