# Task subj-30: Wire top-level sections to controlled collapse + persistence

> **Filename:** `task-subj-30-wire-controlled-collapse.md` in `subjective-tab/p9-collapse-persistence/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

The join slice. Lift each top-level Subjective section's open/closed state into `SubjectiveSection` as a
`Record<SubjectiveSectionId, boolean>`, drive every top-level [`CollapsibleContainer`](../../../../../../../../frontend/components/ui/CollapsibleContainer.tsx) via **controlled** `open`/`onOpenChange`,
hydrate the initial state from the stored per-doctor map (subj-28) merged over the live defaults via the
resolver (subj-29), and **debounce-autosave** the doctor's explicit overrides — cloning the Phase-8 layout
autosave effect already in this file. Result: collapse choices survive a tab toggle and a patient reopen.

**Program / Phase:** subjective-tab · Phase 9 (collapse persistence)  
**Batch:** [`plan-p9-subjective-collapse-persistence-batch.md`](../plan-p9-subjective-collapse-persistence-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p9-subjective-collapse-persistence.md`](./EXECUTION-ORDER-p9-subjective-collapse-persistence.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **DONE** — Completed: 2026-06-18

**Change Type:**
- [ ] **New feature** — controlled-mode wiring + a cloned autosave effect. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** subj-29 resolver/serialiser/save helper; `CollapsibleContainer` already supports controlled `open` + `onOpenChange` (today most top-level sections are **uncontrolled** with a hardcoded `defaultOpen`, some content-aware); `SubjectiveSection` already owns a debounced **layout autosave** for `sectionOrder` (`lastPersistedSectionOrderRef` + `setTimeout` + `saveSubjectiveSectionOrder`) and a `storedSectionOrder` hydration effect; [`useRxFormProviderSetup.ts`](../../../../../../../../frontend/components/cockpit/rx/useRxFormProviderSetup.ts) already surfaces `subjectiveSectionOrder` from settings.
- ❌ **What's missing:** per-section open state lifted into `SubjectiveSection`, controlled wiring, hydration from the stored collapse map, and the collapse autosave.

**Scope Guard:**
- Expected files touched: ≤ 4 (`SubjectiveSection.tsx`; `useRxFormProviderSetup.ts` to surface the stored map; possibly the shell/context that carries `subjectiveSectionOrder`; a small helper).
- **No** changes to nested cluster collapsibles (P9-D3), **no** `defaultOpen` heuristic changes, **no** settings/API change (subj-28), **no** resolver logic change (subj-29).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Surface the stored map at the mount
- [ ] 1.1 In `useRxFormProviderSetup.ts` (the same place `subjectiveSectionOrder` is loaded), also surface `subjectiveSectionCollapsed` from the settings payload (null until first fetch resolves), mirroring the existing field.
- [ ] 1.2 Thread it to `SubjectiveSection` the same way `subjectiveSectionOrder` is threaded (shell/context prop or fetch fallback).

### 2. Lift + control open state
- [ ] 2.1 In `SubjectiveSection`, build `defaultsById: Record<SubjectiveSectionId, boolean>` for the **currently mountable** sections — reproduce today's `defaultOpen` values exactly, including the content-aware ones (`hasFamilyHistoryStructuredContent(value)`, etc.). This is the single source of "what open means by default" for this visit.
- [ ] 2.2 Initialise open state via `resolveSectionOpenState(stored, defaultsById)` (subj-29). Re-resolve when the stored map arrives or mountable ids change (clone the `storedSectionOrder` hydration effect).
- [ ] 2.3 Pass controlled `open={openById[id]}` + `onOpenChange` into each **top-level** container (Chief complaints, Patient background, Allergies, Family history, Social history, Past-surgical fallback, Free-text notes). Custom blocks keep their current default-open behaviour (P9-D4) — do **not** control them via the persisted map.
- [ ] 2.4 Leave nested cluster collapsibles untouched (P9-D3).

### 3. Debounced autosave (clone the layout autosave)
- [ ] 3.1 On open-state change, compute overrides via `collapseOverridesToPersist(openById, defaultsById)` and debounce-PATCH via `saveSubjectiveSectionCollapsed` — mirror the existing `sectionOrder` autosave (same `DOCTOR_LAYOUT_AUTOSAVE_MS`, `lastPersisted…Ref` guard, `saving/saved/error` status reuse or a sibling status).
- [ ] 3.2 Skip the PATCH while `disabled` (preview/patient mode) and before the stored map has resolved (avoid clobbering with a pre-hydration empty map).
- [ ] 3.3 Update the stored-map ref + shell state on success so a re-hydration doesn't bounce the UI (same pattern as `setSubjectiveSectionOrder`).

### 4. Verification & Testing
- [ ] 4.1 Manual: collapse several sections → toggle the Subjective tab off/on → state restored; close/reopen patient → state restored.
- [ ] 4.2 `cd frontend && npx tsc --noEmit && npm run lint` clean; existing `SubjectiveSection.*` suites green (integration test lands in subj-31).

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/useRxFormProviderSetup.ts (surface subjectiveSectionCollapsed)
UPDATE: frontend/components/cockpit/rx/sections/SubjectiveSection.tsx (defaultsById + controlled open + hydrate + autosave)
UPDATE: (if needed) the shell/context that already carries subjectiveSectionOrder — add the collapse map alongside
CREATE/UPDATE: frontend/lib/cockpit/subjective-section-collapse.ts (only if a debounce-compare helper is needed)
DO NOT TOUCH: nested cluster collapsibles; defaultOpen heuristics; doctor_settings api (subj-28); resolver logic (subj-29); PDF/cc/hopi
```

**When updating existing code:**
- [ ] Reuse the existing layout-autosave machinery verbatim in shape — do not invent a second debounce pattern. Collapse autosave and order autosave should look like siblings.
- [ ] Compute `defaultsById` from the **same** predicates the sections use today so an untouched section's resolved state is byte-identical to current behaviour.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Controlled top-level only (P9-D3).** Only the top-level section containers become controlled; nested clusters stay as-is.
- **Static ids persisted; custom blocks default (P9-D4).** Custom blocks render open by default and are never written to the map.
- **UI-only (P9-D6).** Open state never enters `buildRxPayload`; the PDF/SMS path is untouched.
- **No default drift.** An untouched section must resolve to exactly its current `defaultOpen` — verify content-aware defaults still apply when no stored key exists.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — writes `doctor_settings.subjective_section_collapsed` (doctor-scoped config, not PHI) via subj-28's PATCH.
  - [ ] **RLS verified?** existing `doctor_settings` RLS covers it.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No new patient surface.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Collapsing/expanding a top-level section persists and re-applies after a tab toggle and a patient reopen.
- [ ] Untouched sections still follow their current (incl. content-aware) defaults.
- [ ] Exactly one debounced PATCH per settle; none while `disabled` or pre-hydration; custom blocks never written.
- [ ] `tsc`/lint clean; existing suites green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

This is deliberately a clone of the Phase-8 layout autosave with a map instead of an array. The riskiest line is
hydration timing: don't autosave an empty map before the stored map has loaded, or you'll wipe the doctor's saved
layout on first mount (same guard the `sectionOrder` autosave already uses).

---

## 🔗 Related Tasks

- [`task-subj-29-collapse-resolver-and-autosave.md`](./task-subj-29-collapse-resolver-and-autosave.md) — supplies the resolver + serialiser + save helper.
- [`task-subj-31-integration-and-verification.md`](./task-subj-31-integration-and-verification.md) — proves remount-survival + a11y.
- Sibling precedent: [`../../p8-section-reorder/Tasks/task-subj-26-persist-and-seed-order.md`](../../p8-section-reorder/Tasks/task-subj-26-persist-and-seed-order.md).

---

**Last Updated:** 2026-06-18  
**Pattern:** lift state → controlled `CollapsibleContainer` → resolver-hydrate → debounced delta autosave (clone of Phase-8 layout autosave).  
**Reference:** `process/CODE_CHANGE_RULES.md`
