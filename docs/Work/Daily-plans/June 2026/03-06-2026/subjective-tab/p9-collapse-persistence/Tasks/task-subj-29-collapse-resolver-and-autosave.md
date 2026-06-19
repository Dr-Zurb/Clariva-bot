# Task subj-29: Collapse-state resolver + debounced autosave (frontend lib)

> **Filename:** `task-subj-29-collapse-resolver-and-autosave.md` in `subjective-tab/p9-collapse-persistence/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

The **correctness keystone** of Phase 9: a pure frontend lib that (a) resolves the effective open/closed
state of each top-level Subjective section by layering the stored per-doctor map over the section's current
default, and (b) computes the minimal map to persist — **only** the sections the doctor explicitly toggled
away from their default, excluding per-visit `custom_block:*` ids. No React, no UI, no DOM — just functions
+ unit tests. It mirrors the shape of [`subjective-section-order.ts`](../../../../../../../../frontend/lib/cockpit/subjective-section-order.ts) (resolver + save helper).

**Program / Phase:** subjective-tab · Phase 9 (collapse persistence)  
**Batch:** [`plan-p9-subjective-collapse-persistence-batch.md`](../plan-p9-subjective-collapse-persistence-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p9-subjective-collapse-persistence.md`](./EXECUTION-ORDER-p9-subjective-collapse-persistence.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **DONE** — Completed: 2026-06-18

**Change Type:**
- [ ] **New feature** — new pure lib + tests. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** subj-28 transport (`subjectiveSectionCollapsed` get/set); the `SubjectiveSectionId` union + `isCustomBlockSectionId`/`isStaticSubjectiveSectionId` helpers + the `saveSubjectiveSectionOrder` autosave shape in [`subjective-section-order.ts`](../../../../../../../../frontend/lib/cockpit/subjective-section-order.ts); the per-section `defaultOpen` values + content-aware predicates (`hasFamilyHistoryStructuredContent`, `hasPastSurgicalHistoryStructuredContent`, etc.) used today in [`SubjectiveSection.tsx`](../../../../../../../../frontend/components/cockpit/rx/sections/SubjectiveSection.tsx) and the field components.
- ❌ **What's missing:** any merge of stored collapse over defaults, and the "persist only overrides" serialiser.

**Scope Guard:**
- Expected files touched: ≤ 2 (new lib + its unit test).
- **No** changes to `SubjectiveSection` (subj-30), **no** settings/API change (subj-28), **no** default-value changes.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Resolver
- [ ] 1.1 `resolveSectionOpenState(stored, defaultsById)` → `Record<SubjectiveSectionId, boolean>`: for each section id present in `defaultsById`, use the **stored value if the key exists**, else the default. An explicit stored value always wins (P9-D2). Keys absent from `defaultsById` (not mountable in the current mode) are omitted.
- [ ] 1.2 `defaultsById` is supplied by the caller (subj-30) and already folds in content-aware defaults for the current visit — this lib does not re-derive content predicates, it only layers stored over given defaults.

### 2. Persist serialiser
- [ ] 2.1 `collapseOverridesToPersist(currentOpenById, defaultsById)` → map containing **only** entries where `current !== default` (omit keys equal to default), and **excluding** any `custom_block:*` id (P9-D4). This keeps the stored map minimal and lets default heuristics evolve later without stale rows.
- [ ] 2.2 `saveSubjectiveSectionCollapsed(token, overrides)` → PATCH via the subj-28 client; return the persisted map. Mirror `saveSubjectiveSectionOrder`'s structure (dynamic import of the api client, return the echoed value).
- [ ] 2.3 (Optional, if subj-30 needs it) a stable-key helper to compare current vs last-persisted overrides for the debounce guard (mirror the `JSON.stringify(sectionOrder)` ref pattern).

### 3. Verification & Testing
- [ ] 3.1 Test: resolver returns default when key absent; returns stored value when key present (both true→false and false→true); omits ids not in `defaultsById`.
- [ ] 3.2 Test: serialiser omits default-equal keys, keeps genuine overrides, and drops `custom_block:*` ids even if toggled.
- [ ] 3.3 Test: round-trip — `resolveSectionOpenState(collapseOverridesToPersist(x, d), d)` reproduces `x` for mountable ids.
- [ ] 3.4 `cd frontend && npx tsc --noEmit && npm run lint` clean; new unit test green.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/subjective-section-collapse.ts (resolver + serialiser + save helper)
CREATE: frontend/lib/cockpit/__tests__/subjective-section-collapse.test.ts
DO NOT TOUCH: SubjectiveSection.tsx (subj-30); doctor_settings api (subj-28); any defaultOpen heuristic
```

**When updating existing code:**
- [ ] Reuse `SubjectiveSectionId` / `isCustomBlockSectionId` from `subjective-section-order.ts`; do not duplicate the id scheme.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Map of overrides, not a snapshot (P9-D2).** Persist only sections toggled away from their default; absent key ⇒ default.
- **Explicit value wins (P9-D2).** Once a doctor toggles a section, the stored boolean overrides the (possibly content-aware) default on every visit until they toggle it back to the default.
- **Static ids only (P9-D4).** Never persist `custom_block:*` — their ids re-mint per visit, so a stored value would be dead weight (and could pollute the map).
- **Pure + deterministic.** No React/DOM/time; debounce + state live in subj-30. This lib is fully unit-testable.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No** new storage here — produces the payload subj-28 persists (doctor-scoped config, not PHI).
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No** (the save helper calls the existing doctor-settings PATCH only).
- [ ] **Retention / deletion impact?** **No new patient surface.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Resolver: absent key ⇒ default; present key ⇒ stored; non-mountable ids omitted.
- [ ] Serialiser: omits default-equal keys; drops `custom_block:*`; keeps real overrides.
- [ ] Round-trip identity holds for mountable ids; `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The subtlety that makes this its own slice: **persist only deltas from the default.** A full snapshot would
freeze today's content-aware defaults into storage and make every future default change invisible to existing
doctors. Storing only explicit overrides keeps the smart defaults live for untouched sections.

---

## 🔗 Related Tasks

- [`task-subj-28-doctor-settings-collapse-map.md`](./task-subj-28-doctor-settings-collapse-map.md) — the transport this saves through.
- [`task-subj-30-wire-controlled-collapse.md`](./task-subj-30-wire-controlled-collapse.md) — supplies `defaultsById` (incl. content-aware) and owns debounce/state.

---

**Last Updated:** 2026-06-18  
**Pattern:** pure resolver + delta serialiser + thin save helper (clone of `subjective-section-order.ts`).  
**Reference:** `process/CODE_CHANGE_RULES.md`
