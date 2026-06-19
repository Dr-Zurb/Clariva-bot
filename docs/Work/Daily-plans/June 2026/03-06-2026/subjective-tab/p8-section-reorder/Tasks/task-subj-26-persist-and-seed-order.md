# Task subj-26: Persist + seed section order (load default → merge → save-as-default)

> **Filename:** `task-subj-26-persist-and-seed-order.md` in `subjective-tab/p8-section-reorder/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Wire persistence to the reorder UI. On mount, load the doctor's `subjective_section_order` default
(subj-24), reconcile it with the live registry via `normalizeSectionOrder` (subj-23), and apply it as
the initial order for the reorder state (subj-25). Add a **"Save current section order as my default"**
action that PATCHes the current order. This is the join slice that turns reorder into a persistent
per-doctor preference.

**Program / Phase:** subjective-tab · Phase 8 (section reorder)  
**Batch:** [`plan-p8-subjective-section-reorder-batch.md`](../plan-p8-subjective-section-reorder-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p8-subjective-section-reorder.md`](./EXECUTION-ORDER-p8-subjective-section-reorder.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ⏳ **PENDING**

**Change Type:**
- [ ] **New feature** — wires subj-24 api + subj-25 state via subj-23 merge. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** subj-24 settings api (`subjectiveSectionOrder` get/set); subj-25 local reorder state + grips; subj-23 `normalizeSectionOrder`; the cockpit form mount (`useRxFormProviderSetup.ts` or the settings hydration point).
- ❌ **What's missing:** the load→merge→apply wiring and the "save as default" action.

**Scope Guard:**
- Expected files touched: ≤ 4 (mount/hydration wiring; `SubjectiveSection.tsx` init from default + save action; small helper/test).
- **No** schema/api change (subj-24), **no** new DnD (subj-25), **no** output change.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Load + merge on mount
- [ ] 1.1 Read the doctor's `subjectiveSectionOrder` from settings (already in the settings payload from subj-24).
- [ ] 1.2 `normalizeSectionOrder(stored, availableIds)` → initial order (drop unknown, append newly-available at canonical slot, filter to mountable). Empty/absent stored order falls back to `DEFAULT_SECTION_ORDER`.
- [ ] 1.3 Apply the merged order as subj-25's initial reorder state (per-mount; conditional sections resolved for the current linked/fallback mode).

### 2. Save-as-default
- [ ] 2.1 "Save current section order as my default" action (in the Subjective tab toolbar or a small overflow control); PATCH the current order via subj-24's api; toast/confirm on success.
- [ ] 2.2 Saving the order is config-only — it never touches any prescription row.

### 3. Verification & Testing
- [ ] 3.1 Test: a stored order re-applies on next mount; an empty default → canonical layout.
- [ ] 3.2 Test: merge handles a stored order missing a now-available section (appended) and containing a removed id (dropped); conditional sections filtered correctly per mode.
- [ ] 3.3 Test: "save as default" round-trips and issues exactly one PATCH; no prescription mutation.
- [ ] 3.4 `cd frontend && npx tsc --noEmit && npm run lint` clean; suites green.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/useRxFormProviderSetup.ts (or settings hydration point) — surface order to the tab
UPDATE: frontend/components/cockpit/rx/sections/SubjectiveSection.tsx (init order from default + save action)
CREATE/UPDATE: frontend/lib/cockpit/subjective-section-order.ts (merge already there; add save helper if needed)
CREATE: frontend/components/cockpit/rx/sections/__tests__/SubjectiveSection.order-persist.test.tsx
DO NOT TOUCH: doctor_settings schema/api (subj-24); DnD primitives (subj-25); PDF/output; cc/hopi
```

**When updating existing code:**
- [ ] Reconcile against the live registry on **every** load (not just first run) so a future section is never hidden by a stale stored order (P8-D5).
- [ ] Saving the default is a settings PATCH only — assert it never writes to a prescription.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Per-doctor default only (P8-D2).** Order applies to every visit; no per-prescription order.
- **Graceful merge, never hide (P8-D5).** `normalizeSectionOrder` on each load; unknown dropped, new appended, conditional filtered.
- **Config-only save.** "Save as default" touches `doctor_settings` only.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — writes `doctor_settings.subjective_section_order` (doctor-scoped config, not PHI).
  - [ ] **RLS verified?** existing `doctor_settings` RLS covers it.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No new patient surface.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Stored order re-applies across visits; empty → canonical default.
- [ ] Merge drops unknown / appends newly-available / filters conditional sections — no section hidden.
- [ ] "Save as default" round-trips; never mutates a prescription.
- [ ] `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The correctness keystone is "reconcile on every load". A doctor who saved an order before a new section shipped must still see (and be able to place) that new section — never silently hidden.

---

## 🔗 Related Tasks

- [`task-subj-24-doctor-settings-section-order.md`](./task-subj-24-doctor-settings-section-order.md) — the api this loads/saves through.
- [`task-subj-25-drag-and-drop-reorder-chrome.md`](./task-subj-25-drag-and-drop-reorder-chrome.md) — the reorder state this initialises.
- [`task-subj-27-output-parity-and-close-gate.md`](./task-subj-27-output-parity-and-close-gate.md) — final gate.

---

**Last Updated:** 2026-06-17  
**Pattern:** load per-doctor default → `normalizeSectionOrder` merge → apply; config-only "save as default" PATCH.  
**Reference:** `process/CODE_CHANGE_RULES.md`
