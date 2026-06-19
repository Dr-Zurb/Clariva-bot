# Task subj-34: "Manage sections" menu + wire visibility into SubjectiveSection

> **Filename:** `task-subj-34-section-manager-menu.md` in `subjective-tab/p10-section-visibility/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

The menu + join slice. Build a **"Manage sections" popover** anchored top-right of the Subjective section (next
to CarryForward / Preset) that lists the currently-mountable top-level sections with **hide/unhide** toggles, an
**add custom section** action, and **reorder** controls — then wire `SubjectiveSection` to filter its render plan
through the subj-33 resolver, **one-shot hydrate** the hidden set from the stored per-doctor array (subj-32), and
**debounce-autosave** the hidden delta — cloning the Phase-9 collapse autosave (incl. the `hasHydratedRef` guard
that fixed the stale-echo clobber). The existing in-page drag grips + add-custom footer stay; both they and the
menu write the same `subjective_section_order`.

**Program / Phase:** subjective-tab · Phase 10 (section visibility)  
**Batch:** [`plan-p10-subjective-section-visibility-batch.md`](../plan-p10-subjective-section-visibility-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p10-subjective-section-visibility.md`](./EXECUTION-ORDER-p10-subjective-section-visibility.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **DONE** — Completed: 2026-06-18

**Change Type:**
- [x] **New feature** — net-new UI surface (popover) + cloned autosave/hydration + render-plan filter. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** subj-33 resolver/serialiser/save helper; `SubjectiveSection` owns the render plan (`renderItems` over `sectionOrder`), a debounced **layout autosave** (`sectionOrder`) and **collapse autosave** with **one-shot hydration** (`hasHydratedCollapseRef`), and a header row with CarryForward/Preset/save-status; in-page reorder via [`SortableSectionShell`](../../../../../../../../frontend/components/cockpit/rx/subjective/section-reorder-context.tsx) + move-up/down; add-custom via [`CustomSubsectionsChrome`](../../../../../../../../frontend/components/cockpit/rx/subjective/CustomSubsectionsField.tsx) (`ADD_CUSTOM_SUBSECTION` dispatch); [`useRxFormProviderSetup.ts`](../../../../../../../../frontend/components/cockpit/rx/useRxFormProviderSetup.ts) surfaces `subjectiveSectionOrder` + `subjectiveSectionCollapsed`; a popover/menu primitive in `components/ui`.
- ❌ **What's missing:** the hidden set lifted into `SubjectiveSection`, the render-plan filter, the hydration + autosave, and the menu UI.

**Scope Guard:**
- Expected files touched: ≤ 5 (new `SectionManagerMenu` component; `SubjectiveSection.tsx`; `useRxFormProviderSetup.ts` to surface the stored set; possibly the shell/context that carries the other two settings; a small helper).
- **No** changes to nested cluster collapsibles (P10-D3), **no** settings/API change (subj-32), **no** resolver logic change (subj-33), **no** `cc`/`hopi`/PDF change.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Surface the stored set at the mount
- [x] ✅ 1.1 `useRxFormProviderSetup.ts` surfaces `subjectiveSectionHidden` from settings (null until first fetch). - **Completed: 2026-06-18**
- [x] ✅ 1.2 Threaded via `PrescriptionFormShellContext` / shell prop to `SubjectiveSection` (same pattern as order/collapse). - **Completed: 2026-06-18**

### 2. Lift hidden state + filter the render plan
- [x] ✅ 2.1 `hiddenIds` lifted state + `mountableIds` from `resolveAvailableSectionIds`. - **Completed: 2026-06-18**
- [x] ✅ 2.2 One-shot hydrate via `hasHydratedHiddenRef` (clone of collapse guard). - **Completed: 2026-06-18**
- [x] ✅ 2.3 Render plan filtered through `resolveVisibleSections` before `renderItems`. - **Completed: 2026-06-18**

### 3. The "Manage sections" menu
- [x] ✅ 3.1 `SectionManagerMenu` popover in header; trigger always rendered with hidden-count affordance. - **Completed: 2026-06-18**
- [x] ✅ 3.2 Menu lists mountable sections with hide/unhide toggle + "Has data" hint. - **Completed: 2026-06-18**
- [x] ✅ 3.3 Menu reorder calls same `sectionOrder` / `moveSectionInOrder` handlers. - **Completed: 2026-06-18**
- [x] ✅ 3.4 "+ Add custom section" dispatches `ADD_CUSTOM_SUBSECTION`. - **Completed: 2026-06-18**
- [ ] 3.5 "Reset to default layout" — deferred (optional per task).
- [x] ✅ 3.6 All-hidden empty-state row with link to open menu. - **Completed: 2026-06-18**
- [x] ✅ 3.7 In-page drag grips + add-custom footer unchanged. - **Completed: 2026-06-18**

### 4. Debounced autosave (clone the collapse autosave)
- [x] ✅ 4.1 Debounced PATCH via `hiddenOverridesToPersist` + `saveSubjectiveSectionHidden` + `serializeHiddenIds` guard. - **Completed: 2026-06-18**
- [x] ✅ 4.2 Skips PATCH while `disabled` or before stored set resolves. - **Completed: 2026-06-18**
- [x] ✅ 4.3 Updates shell state + `lastPersistedHiddenRef` on success; one-shot guard prevents stale-echo clobber. - **Completed: 2026-06-18**

### 5. Verification & Testing
- [x] ✅ 5.1 Manual scenarios documented in acceptance (automated integration in subj-35). - **Completed: 2026-06-18**
- [x] ✅ 5.2 All-hidden empty-state + menu reachable when all static sections hidden. - **Completed: 2026-06-18**
- [x] ✅ 5.3 Existing `SubjectiveSection.*` suites green (32/32); lint clean on touched files. - **Completed: 2026-06-18**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/subjective/SectionManagerMenu.tsx (the popover: hide/unhide + add + reorder)
UPDATE: frontend/components/cockpit/rx/sections/SubjectiveSection.tsx (lift hiddenIds + filter render plan + hydrate + autosave + header trigger + empty-state)
UPDATE: frontend/components/cockpit/rx/useRxFormProviderSetup.ts (surface subjectiveSectionHidden)
UPDATE: (if needed) the shell/context that already carries subjectiveSectionOrder/Collapsed — add the hidden set alongside
CREATE/UPDATE: frontend/lib/cockpit/subjective-section-visibility.ts (only if a debounce-compare helper is needed)
DO NOT TOUCH: nested cluster collapsibles; doctor_settings api (subj-32); resolver logic (subj-33); PDF/cc/hopi; the existing reorder/add-custom internals (reuse, don't fork)
```

**When updating existing code:**
- [ ] Reuse the collapse autosave + one-shot hydration machinery verbatim in shape — do not invent a third debounce/hydration pattern. Order/collapse/visibility autosaves should look like siblings.
- [ ] Reuse the existing reorder handlers + `ADD_CUSTOM_SUBSECTION` dispatch — the menu is a new *surface* over existing *actions*, not a reimplementation.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **No locks; menu always reachable (P10-D7).** Any section (incl. `chief_complaints`) is hideable; the trigger renders even when all sections are hidden and in `disabled`/preview (read-only there).
- **One-shot hydration (Phase-9 bugfix).** Hydrate `hiddenIds` once; ignore later stored-set changes for hydration to avoid the stale-echo clobber.
- **Single order source.** Menu reorder and in-page grips share `subjective_section_order` — never two competing order states.
- **Static ids persisted; custom blocks by deletion (P10-D4).** The menu never writes `custom_block:*` to the hidden set.
- **View-only (P10-D6).** Hidden state never enters `buildRxPayload`; the PDF/SMS path is untouched — a hidden section with data still prints.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — writes `doctor_settings.subjective_section_hidden` (doctor-scoped config, not PHI) via subj-32's PATCH.
  - [ ] **RLS verified?** existing `doctor_settings` RLS covers it.
- [ ] **Any PHI in logs?** **No** — the "has data" hint is a boolean/count, never content.
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No new patient surface.**

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ Hiding/unhiding filters/restores sections in render plan; persists via debounced PATCH (subj-35 proves remount survival).
- [x] ✅ Menu lists mountable sections with toggles + add-custom + reorder; trigger always reachable; hidden-count shown; all-hidden empty-state renders.
- [x] ✅ Debounced PATCH with pre-hydration/disabled guards; one-shot hydrate prevents stale-echo clobber.
- [x] ✅ Existing grips/footer share same order state; SubjectiveSection.* suites green (32/32).

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

This is the largest slice (net-new popover) but composed from shipped parts: the render plan + autosave +
one-shot hydration already exist for order/collapse, and reorder/add-custom already have handlers. The riskiest
lines are (1) hydration timing — clone the `hasHydratedRef` guard exactly, or the stale-echo bug returns on a new
field — and (2) the all-hidden / hide-chief-complaints edge cases that the "no locks" decision creates: the menu
trigger must never become unreachable.

---

## 🔗 Related Tasks

- [`task-subj-33-visibility-resolver-and-autosave.md`](./task-subj-33-visibility-resolver-and-autosave.md) — supplies the resolver + serialiser + save helper.
- [`task-subj-35-integration-and-verification.md`](./task-subj-35-integration-and-verification.md) — proves remount-survival + a11y + output parity.
- Sibling precedent: [`../../p9-collapse-persistence/Tasks/task-subj-30-wire-controlled-collapse.md`](../../p9-collapse-persistence/Tasks/task-subj-30-wire-controlled-collapse.md).

---

**Last Updated:** 2026-06-18  
**Pattern:** new popover surface over existing actions → render-plan filter → one-shot hydrate → debounced delta autosave (clone of Phase-9 collapse wiring).  
**Reference:** `process/CODE_CHANGE_RULES.md`
