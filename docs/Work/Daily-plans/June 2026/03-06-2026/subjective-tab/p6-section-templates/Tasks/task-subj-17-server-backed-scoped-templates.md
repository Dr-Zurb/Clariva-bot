# Task subj-17: Server-backed scoped templates (PMH + allergies — create-on-apply with dedup)

> **Filename:** `task-subj-17-server-backed-scoped-templates.md` in `subjective-tab/p6-section-templates/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

The two subsections that are **server-backed chart data** — **Past medical history** (patient
conditions + meds) and **Allergies** (patient allergy rows) — get scoped Templates buttons.
Unlike the form-state scopes (subj-16), these can't be a reducer dispatch: **save** snapshots the
patient's current chart rows into the template JSON, and **apply creates chart rows on the patient
(name-deduped against what's already there)**. This is the high-blast-radius slice: multi-row
creates, dedup, optimistic UI, and **partial-failure** recovery.

**Program / Phase:** subjective-tab · Phase 6 (section templates)  
**Batch:** [`plan-p6-subjective-section-templates-batch.md`](../plan-p6-subjective-section-templates-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p6-subjective-section-templates.md`](./EXECUTION-ORDER-p6-subjective-section-templates.md)  
**Estimated Time:** ~4–6 hours  
**Status:** ✅ **DONE** — 2026-06-17. Built on **subj-15**; parallel lane to subj-16.

**Change Type:**
- [x] **Update existing** + **new columns + apply hooks**. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** patient chart write paths — [`createPatientCondition`/`createPatientMedication`/`createPatientAllergy`](../../../../../../../../frontend/lib/api.ts); [`patient-chart-service.ts`](../../../../../../../../backend/src/services/patient-chart-service.ts) + controller; the PMH UI ([`ProblemOrientedMedicalSection.tsx`](../../../../../../../../frontend/components/ehr/sections/ProblemOrientedMedicalSection.tsx)) + [`AllergiesSection.tsx`](../../../../../../../../frontend/components/ehr/sections/AllergiesSection.tsx) with their optimistic patterns ([`use-stable-med-key.ts`](../../../../../../../../frontend/lib/chart/use-stable-med-key.ts)); subj-15's `scope`.
- ❌ **What's missing:** `pmh_json` + `allergies_json` template columns; save snapshots from chart state; apply hooks that **create** rows with name dedup + partial-failure handling; the two scoped buttons.

**Scope Guard:**
- Expected files touched: ≤ 10 (2 migrations; BE types/validation/service; FE types/api; 2 apply hooks; 2 section wirings; tests). Does **not** touch the form-state apply path (subj-16).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migrations
- [x] ✅ 1.1 `142_doctor_rx_templates_pmh_json.sql` — `pmh_json JSONB NOT NULL DEFAULT '{}'` (`{ conditions[], medications[] }`); object CHECK; header + rollback. - **Completed: 2026-06-17**
- [x] ✅ 1.2 `143_doctor_rx_templates_allergies_json.sql` — `allergies_json JSONB NOT NULL DEFAULT '{}'` (`{ allergies[] }`); object CHECK; header + rollback. - **Completed: 2026-06-17**

### 2. Backend types + validation + service
- [x] ✅ 2.1 Added `pmh_json` / `allergies_json` to the row + `pmh` / `allergies` to the payload types; Zod shape validation (recreate-able chart-row subset) on create + update. - **Completed: 2026-06-17**
- [x] ✅ 2.2 `rx-template-service.ts` normalizes + persists both on create + update. - **Completed: 2026-06-17**

### 3. Frontend types + API
- [x] ✅ 3.1 Mirrored `pmh_json` / `allergies_json` types; `createRxTemplate` payload carries `pmh` / `allergies` generically. - **Completed: 2026-06-17**

### 4. Save (snapshot from chart)
- [x] ✅ 4.1 `past_medical` save snapshots current conditions + flattened/deduped meds (name + recreate-able attrs) into `pmh_json` (`snapshotPmh`). - **Completed: 2026-06-17**
- [x] ✅ 4.2 `allergies` save snapshots current allergy rows (allergen + severity + reaction) into `allergies_json` (`snapshotAllergies`). - **Completed: 2026-06-17**

### 5. Apply (create-on-chart with dedup) — **the core**
- [x] ✅ 5.1 `usePmhTemplateApply` — plans against existing rows (case-insensitive trim dedup + intra-template dedup), then drives the section's optimistic single-row creators; per-row failures are kept-and-counted, resync-from-server only on partial failure. - **Completed: 2026-06-17**
- [x] ✅ 5.2 `useAllergyTemplateApply` — same pattern over allergy rows (dedup by allergen). - **Completed: 2026-06-17**
- [x] ✅ 5.3 Reuses the section's existing optimistic + stable-key machinery (`commitCondition`/`commitMedication`/`commitAllergen` → `use-stable-med-key`); applied rows render like manually-added ones. Bulk-apply suppresses the capture-bar refocus + duplicate toast (silent mode). - **Completed: 2026-06-17**

### 6. Wire the two buttons
- [x] ✅ 6.1 PMH section → `SubjectiveSectionTemplateButton scope="past_medical"` (apply via `usePmhTemplateApply`, save via snapshot); gated behind `enableTemplates` so the section stays template-free in the patient-profile panes. - **Completed: 2026-06-17**
- [x] ✅ 6.2 Allergies section → `scope="allergies"` (apply via `useAllergyTemplateApply`), same gating. - **Completed: 2026-06-17**

> The shared `SubjectiveSectionTemplateButton` (subj-16) needs an **apply override** seam for server-backed scopes (form-state scopes dispatch; server scopes call a hook). Add that seam here without breaking subj-16's reducer path.

✅ Seam added: `applyOverride` + `buildSaveOverride` + `defaultSaveName` props. When present they take over apply/save; absent (subj-16 callers) the reducer path is unchanged. Scope type widened to `SectionTemplateScope`.

### 7. Verification & Testing
- [x] ✅ 7.1 `template-apply.test.ts` (vitest): snapshot of chart rows; plan dedup (existing + intra-template, case-insensitive trim); hook orchestration creates missing rows, keeps successes on partial failure, resyncs once, reports counts-only summary. Backend `rx-template-service.test.ts` + `rx-template-scope-validation.test.ts` cover normalize/persist + shape validation. RLS: template read stays doctor-scoped (service ownership check); chart writes go through existing patient-scoped endpoints — no new cross-patient path. - **Completed: 2026-06-17**
- [x] ✅ 7.2 Scoped backend suites green (49 passing across service + validation); frontend vitest green (25 passing across new + subj-16 + zone); eslint clean on touched files; `tsc` introduces no new errors (remaining errors are pre-existing: `@react-pdf/renderer` ESM, `MapIterator` downlevel-iteration, `notes`-null debt). - **Completed: 2026-06-17**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/142_doctor_rx_templates_pmh_json.sql
CREATE: backend/migrations/143_doctor_rx_templates_allergies_json.sql
UPDATE: backend/src/types/rx-template.ts (+ pmh_json / allergies_json)
UPDATE: backend/src/utils/validation.ts (shape validation)
UPDATE: backend/src/services/rx-template-service.ts (persist both)
UPDATE: frontend/types/rx-template.ts (mirror)
UPDATE: frontend/lib/api.ts (payload carries pmh_json/allergies_json if not already generic)
CREATE: frontend/lib/chart/use-pmh-template-apply.ts
CREATE: frontend/lib/chart/use-allergy-template-apply.ts
UPDATE: frontend/components/ehr/sections/ProblemOrientedMedicalSection.tsx (button + apply)
UPDATE: frontend/components/ehr/sections/AllergiesSection.tsx (button + apply)
UPDATE: frontend/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton.tsx (apply-override seam)
CREATE/UPDATE: tests for snapshot + create-with-dedup + partial failure
DO NOT TOUCH: the form-state reducer apply (subj-16); never delete/replace existing chart rows
```

**When updating existing code:**
- [x] ✅ Audited `AllergiesSection`/`ProblemOrientedMedicalSection` optimistic flows — apply reuses their `commit*` creators (stable-key + reload-on-error) rather than reinventing.
- [x] ✅ Apply is **additive only** (P6-D3): creates missing rows, skips duplicates, never deletes/overwrites existing chart data.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Create-with-dedup (P6-D3).** Name-based, case-insensitive, trimmed dedup against existing chart rows; duplicates are skipped, not errored.
- **Partial failure is non-fatal.** If 3 of 5 rows create and 2 fail, keep the 3, surface a clear count, and resync from server — never roll the whole apply back or lose the successes.
- **Optimistic, no flicker.** Reuse the section's stable-key machinery so applied rows render like manually-added ones.
- **Patient-scoped writes.** Chart creates go through the existing patient-scoped endpoints; the template read stays doctor-scoped.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — `doctor_rx_templates` (new JSON columns, per-doctor) **and** patient chart rows (conditions/meds/allergies — **PHI**) created on apply.
  - [x] **RLS verified?** **Yes** — template read doctor-scoped (service ownership check + owner-only RLS); chart writes patient-scoped via existing `createPatient*` endpoints. The template JSON is just a name list — apply re-creates rows under the active patient context, so no cross-patient write is possible.
- [x] **Any PHI in logs?** **No** — summary surfaces counts only (`Added N · M already present · K failed`), no allergen/condition text logged.
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **Considered** — applied chart rows are normal patient data under existing retention; templates cascade on doctor deletion. No new retention surface.

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ PMH + allergy Templates buttons save the current chart slice and apply by **creating** missing rows (name-deduped), optimistically, with partial-failure recovery; existing chart rows never deleted/overwritten; RLS holds both sides; scoped tests + lint green; no new `tsc` errors. - **2026-06-17**

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

This is the Opus-grade task: the create-on-apply + dedup + partial-failure logic is the only genuinely novel, high-risk code in the phase. Treat the chart-write path as PHI and verify RLS explicitly.

---

## 🔗 Related Tasks

- [`task-subj-15-template-scope-foundation.md`](./task-subj-15-template-scope-foundation.md) — provides `scope`.
- [`task-subj-16-form-state-scoped-templates.md`](./task-subj-16-form-state-scoped-templates.md) — the form-state counterpart + the shared button this extends.
- [`task-subj-18-whole-subjective-template-upgrade.md`](./task-subj-18-whole-subjective-template-upgrade.md) — reuses `usePmhTemplateApply` for the full bundle.

---

**Last Updated:** 2026-06-17  
**Pattern:** template snapshot + create-on-apply with name dedup, cloning the sections' existing optimistic chart flows.  
**Reference:** `process/CODE_CHANGE_RULES.md`
