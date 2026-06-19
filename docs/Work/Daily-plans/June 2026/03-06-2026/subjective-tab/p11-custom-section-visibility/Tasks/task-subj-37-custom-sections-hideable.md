# Task subj-37: Custom sections hideable/reorderable (drop the special-casing)

> **Filename:** `task-subj-37-custom-sections-hideable.md` in `subjective-tab/p11-custom-section-visibility/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

With the custom-section id now stable (subj-36), remove every `custom_block:*` **special-case** from the Phase-10
visibility machinery so a custom block hides, unhides, and reorders exactly like a static section. Three layers:
**(1) the FE resolver/serialiser** ([`subjective-section-visibility.ts`](../../../../../../../../frontend/lib/cockpit/subjective-section-visibility.ts)) stops passing custom blocks through and starts persisting their ids;
**(2) the "Manage sections" menu** ([`SectionManagerMenu.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/SectionManagerMenu.tsx)) shows the eye toggle on custom rows; and
**(3) the backend hidden-set sanitiser** ([`subjective-section-order.ts`](../../../../../../../../backend/src/types/subjective-section-order.ts) + [`validation.ts`](../../../../../../../../backend/src/utils/validation.ts)) accepts `custom_block:*` ids via `isSubjectiveSectionId` instead of the static-only registry. No new column; `subjective_section_hidden` is already a generic `string[]`.

**Program / Phase:** subjective-tab · Phase 11 (custom-section visibility)
**Batch:** [`plan-p11-custom-section-visibility-batch.md`](../plan-p11-custom-section-visibility-batch.md)
**Execution order:** [`EXECUTION-ORDER-p11-custom-section-visibility.md`](./EXECUTION-ORDER-p11-custom-section-visibility.md)
**Estimated Time:** ~2–3 hours
**Status:** ✅ **DONE** — 2026-06-18

**Change Type:**
- [ ] **Behaviour change (FE + BE)** — removes the P10-D4 exclusion. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists (Phase 10):** `resolveVisibleSections` returns custom blocks untouched (`if (isCustomBlockSectionId(id)) return true`); `isSectionHidden` returns `false` for custom blocks; `hiddenOverridesToPersist` strips custom blocks (static-registry only). The menu computes `canHide = isStaticSubjectiveSectionId(sectionId)` and renders an empty span for custom rows. Backend `sanitizeSubjectiveSectionHidden` keeps only ids in `SUBJECTIVE_SECTION_ID_SET` (static), and `subjectiveSectionHiddenSchema` transforms via it.
- ❌ **What's missing:** custom blocks participating in hide/persist; the menu hide toggle on custom rows; backend acceptance of `custom_block:*` in the hidden set.

**Scope Guard:**
- Expected files touched: ≤ 5 (FE resolver + its test stays for subj-38; menu; backend type + validation; mirror frontend type comment if needed).
- **Do not** change the persistence mechanism, debounce, hydration, or migration. **Do not** touch `buildRxPayload`/PDF/SMS (view-only — subj-38 asserts it). Order already supports custom blocks (`sanitizeSubjectiveSectionOrder` uses `isSubjectiveSectionId`) — leave it; subj-36 makes it actually persist.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [`00-agent-contract`](../../../../../../../../.cursor/rules/00-agent-contract.mdc) (Zod validation, tolerant reconciliation).

---

## ✅ Task Breakdown (Hierarchical)

### 1. FE resolver/serialiser — treat custom blocks like static
- [x] ✅ 1.1 `resolveVisibleSections`: removed the `isCustomBlockSectionId ⇒ return true` bypass; custom blocks now filter out when hidden AND mountable. - **Completed: 2026-06-18**
- [x] ✅ 1.2 `isSectionHidden`: removed the `isCustomBlockSectionId ⇒ false` bypass; returns hidden-state for custom blocks gated on mountable. - **Completed: 2026-06-18**
- [x] ✅ 1.3 `hiddenOverridesToPersist`: keeps `custom_block:*` via `isKnownSubjectiveSectionId`; `SubjectiveSectionHiddenSet` widened to `SubjectiveSectionId[]`. - **Completed: 2026-06-18**

### 2. Menu — eye toggle on custom rows
- [x] ✅ 2.1 `SectionManagerMenu`: `canHide` for every mountable row (incl. custom blocks); `hiddenMountableCount` counts custom blocks too; `onToggleHidden` accepts `SubjectiveSectionId`. - **Completed: 2026-06-18**
- [x] ✅ 2.2 `SubjectiveSection.tsx`: `handleToggleSectionHidden` param widened to `SubjectiveSectionId`. - **Completed: 2026-06-18**

### 3. Backend — accept custom-block ids in the hidden set
- [x] ✅ 3.1 `sanitizeSubjectiveSectionHidden`: membership check switched to `isSubjectiveSectionId`; return type `SubjectiveSectionId[]`; comment updated. - **Completed: 2026-06-18**
- [x] ✅ 3.2 `subjectiveSectionHiddenSchema` comment updated; shape unchanged — inherits looser sanitiser. - **Completed: 2026-06-18**
- [x] ✅ 3.3 `frontend/types/doctor-settings.ts`: `subjective_section_hidden` widened to `SubjectiveSectionId[]` in both places. - **Completed: 2026-06-18**

### 4. Verification
- [x] ✅ 4.1 Lint clean on all touched files. Smoke: 16/17 FE visibility unit tests pass; 6/7 BE hidden-set tests pass. The 2 failing tests are the Phase-10 "drops custom_block" contracts — deferred to subj-38 as planned. `SubjectiveSection.visibility-persist.test.tsx` (7/7) still green. - **Completed: 2026-06-18**

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/subjective-section-visibility.ts (resolver/isSectionHidden/hiddenOverridesToPersist — drop custom_block special-casing)
UPDATE: frontend/components/cockpit/rx/subjective/SectionManagerMenu.tsx (canHide for custom rows)
UPDATE: frontend/components/cockpit/rx/sections/SubjectiveSection.tsx (widen handleToggleSectionHidden param)
UPDATE: frontend/types/doctor-settings.ts (subjective_section_hidden type → SubjectiveSectionId[])
UPDATE: backend/src/types/subjective-section-order.ts (sanitizeSubjectiveSectionHidden → isSubjectiveSectionId)
DO NOT TOUCH: persistence/debounce/hydration; migration; buildRxPayload/PDF/SMS; subjective_section_order sanitiser (already custom-aware)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **First-class id (P11-D2).** `custom_block:<stableId>` flows through hide + order with **no** special-casing. The only gate is `isSubjectiveSectionId` (FE + BE share this notion).
- **Tolerant reconciliation (P11-D5).** Unknown / stale custom ids in a stored array are dropped-on-read; a stale id never bricks a save. Dedupe + cap unchanged.
- **View-only (P11-D4).** This task does not touch any output path; subj-38 asserts parity.
- **Mountable-aware.** A hidden id only filters when it is actually in the current render plan (so a hidden-but-absent custom block doesn't wrongly suppress anything).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No** new storage; `subjective_section_hidden` already exists (doctor-scoped config, not PHI). Validation stays Zod-tolerant.
- [ ] **Any PHI in logs?** **No** — section-id strings only.
- [ ] **External API or AI call?** **No.**
- [ ] **Controllers/services contract.** Backend change is sanitiser-only; PATCH validation already routes through the schema. No raw `Error`, no `process.env`, validation in the schema layer.

---

## ✅ Acceptance & Verification Criteria

- [ ] Resolver filters a hidden, mountable custom block out of the render plan; an unknown/non-mountable custom id passes through.
- [ ] `hiddenOverridesToPersist` keeps `custom_block:<stableId>`; serialiser is stable for the debounce compare.
- [ ] Menu shows a working hide/unhide toggle on custom rows with correct `aria-pressed`.
- [ ] Backend Zod accepts a custom-block id in `subjective_section_hidden`, dedupes, caps, never rejects on unknown.
- [ ] `tsc`/lint clean both apps.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

This is mostly *deletion* — the Phase-10 code already does the right thing for static ids; we're removing the
guards that made custom blocks the exception. The backend flip is a one-line predicate swap
(`SUBJECTIVE_SECTION_ID_SET.has` → `isSubjectiveSectionId`) plus a comment. Existing Phase-10 tests that assert
"drops custom_block" will go red — **do not** edit them here; subj-38 owns inverting those contracts so the
behaviour change is reviewed in one place.

---

## 🔗 Related Tasks

- [`task-subj-36-stable-custom-section-identity.md`](./task-subj-36-stable-custom-section-identity.md) — provides the stable id this task relies on.
- [`task-subj-38-integration-and-verification.md`](./task-subj-38-integration-and-verification.md) — inverts the Phase-10 contracts + proves survival/parity.

---

**Last Updated:** 2026-06-18
**Pattern:** remove special-casing — gate hide/order on `isSubjectiveSectionId` (FE + BE).
**Reference:** `process/CODE_CHANGE_RULES.md`
