# Task rpt-01: Merge to one "Reports" section (retire POC section, fold media, merge chips)

> **Filename:** `task-rpt-01-merge-reports-section.md` in `objective-reports-section/Tasks/`.
> **Links:** batch plan [`../plan-objective-reports-batch.md`](../plan-objective-reports-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-objective-reports.md`](./EXECUTION-ORDER-objective-reports.md). Code paths **repo-relative**.

---

## 📋 Task Overview

The Objective tab currently renders three investigation sections — `test_results` ("Patient-brought reports"), `point_of_care` ("Point-of-care (in-clinic)"), and `media` ("Media & scans"). The first two already share **one** data array (`test_results_json`, discriminated by `source`), and the split adds no clinical value. This task collapses them into a **single "Reports" section** and simplifies the modality layout accordingly — with **no migration and no data change**.

1. **Retire `point_of_care` as a section** (keep the `source` field on the row — RPT-D2). Its quick-add chips move into the merged Reports chip list.
2. **Relabel `test_results` → "Reports"** and make its body render **all** structured rows regardless of `source`.
3. **Fold the media strip into Reports** (rendered below the rows), so uploaded scans/photos live in the same section.
4. **Simplify the modality default layout** — remove the POC-specific hide logic in `objective-default-layout.ts` (video/async no longer need to hide a POC section that no longer exists).
5. **Decide the fate of existing `point_of_care`-scoped saved templates** (remap to the merged scope on read, or leave orphaned) and document the choice.

No migration; no change to `test_results_json` shape; `test_results` TEXT derivation stays byte-identical (OBJ-D8/OBJ-D2).

**Program / Batch:** objective-reports-section · Wave 1
**Plan:** [`../plan-objective-reports-batch.md`](../plan-objective-reports-batch.md)
**Estimated Time:** ~3–4 hours
**Status:** ✅ Done. **Model: Sonnet** — section-registry + layout + chip edits across single-layer files; parity suites contain the blast radius. (Touches ~5 files but no migration/PHI/RLS → no escalation.)

**Change Type:**
- [x] ✅ **Update existing** — merge/retire sections; no new columns. Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **Exists:** section ids/labels/order in `frontend/lib/cockpit/objective-section-order.ts`; `sectionBody` registry + collapse defaults in `ObjectiveSection.tsx` (`test_results`/`point_of_care`/`media` around L106–108, L572–582); modality hide sets in `objective-default-layout.ts` (video/async hide `point_of_care`); `TestResultsList` filters rows by `source`; two chip catalogs in `test-result-catalog.ts` (`PATIENT_REPORT_TEST_CHIPS`, `POC_TEST_CHIPS`).
- ⚠️ **Watch:** `resolveInitialSectionOrder` already drops unknown stored section ids, so a stored layout containing `point_of_care` degrades gracefully — verify this. Saved **templates** scoped `point_of_care` (migration 155) are a separate concern → decide remap vs orphan.

**Scope Guard:**
- Expected files touched: `objective-section-order.ts`, `ObjectiveSection.tsx`, `objective-default-layout.ts`, `test-result-catalog.ts`, `TestResultsList.tsx`, and the two objective parity test files.
- **DO NOT** add a migration or change `test_results_json` / `TestResultRow` shape (that is rpt-02). **DO NOT** remove the `source` field. **DO NOT** touch the attachment/storage service.

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Section registry
- [x] ✅ 1.1 Remove `point_of_care` from the core section ids/labels/order; relabel `test_results` → "Reports" (`objective-section-order.ts`). - **Completed: 2026-07-08**
- [x] ✅ 1.2 Decide whether `media` remains a distinct id folded into Reports UI, or is removed as a section id (prefer: keep the attachment strip, render it inside the Reports body). Record the choice. - **Completed: 2026-07-08**
  - **Choice:** remove `media` as a section id; keep `ObjectiveMediaStrip` and render it inside the Reports (`test_results`) body below the row list.
- [x] ✅ 1.3 Update collapse defaults + `sectionBody` in `ObjectiveSection.tsx` so Reports renders all rows + the media strip. - **Completed: 2026-07-08**

### 2. Row list + chips
- [x] ✅ 2.1 Make the Reports body render **all** structured rows (not filtered to one `source`); keep the legacy free-text textarea escape hatch. - **Completed: 2026-07-08**
- [x] ✅ 2.2 Merge `PATIENT_REPORT_TEST_CHIPS` + `POC_TEST_CHIPS` into one suggestion list (dedupe); keep POC entries (glucometer/dipstick/SpO₂) available. - **Completed: 2026-07-08**

### 3. Modality layout
- [x] ✅ 3.1 Remove POC-specific hide logic in `objective-default-layout.ts`; simplify video/async hidden sets so they reference only surviving section ids. - **Completed: 2026-07-08**
- [x] ✅ 3.2 Confirm no seed references a removed id. - **Completed: 2026-07-08**

### 4. Saved-template scope
- [x] ✅ 4.1 Inspect `point_of_care`-scoped templates (migration 155). Decide remap-on-read vs orphan; document. If remap, do it read-side only (no data migration). - **Completed: 2026-07-08**
  - **Choice: remap-on-read.** Reports picker (`scope=test_results`) also fetches `point_of_care` templates and lists them; apply uses the legacy source-scoped merge so POC presets do not wipe patient-report rows. No DB rewrite. New saves use the merged `test_results` scope (all rows).

### 5. Verification gate
- [x] ✅ 5.1 `cd frontend && npx tsc --noEmit` — no new errors in touched files. - **Completed: 2026-07-08**
- [x] ✅ 5.2 `cd frontend && npm run lint` clean on touched files. - **Completed: 2026-07-08**
- [x] ✅ 5.3 `cd frontend && npm test` green for the objective slice; **`test_results` derivation parity byte-identical** (objectiveResultsParity / objectiveTemplateParity). - **Completed: 2026-07-08**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/objective-section-order.ts        (ids/labels/order: drop point_of_care, relabel test_results→Reports)
UPDATE: frontend/components/cockpit/rx/sections/ObjectiveSection.tsx (sectionBody, collapse defaults, fold media)
UPDATE: frontend/lib/cockpit/objective-default-layout.ts       (simplify modality hide sets)
UPDATE: frontend/lib/cockpit/test-result-catalog.ts            (merge chip catalogs)
UPDATE: frontend/components/cockpit/rx/objective/TestResultsList.tsx (render all sources in one list)
UPDATE: frontend/components/cockpit/rx/sections/__tests__/objectiveResultsParity.test.tsx (section-shape assertions)
UPDATE: frontend/components/cockpit/rx/sections/__tests__/objectiveTemplateParity.test.tsx (scope assertions if templates remapped)
DO NOT TOUCH: test_results_json / TestResultRow shape; migrations; prescription-attachment-service.ts
```

**When updating existing code:** (MANDATORY)
- [x] `test_results` TEXT derivation output must be identical for the same row content (OBJ-D2).
- [x] A stored doctor layout containing `point_of_care` must not throw — it should drop gracefully.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **One section, no data change.** UI/registry only; the row array and its Zod are untouched here.
- **Keep `source`.** Retire the *section*, not the field (RPT-D2).
- **Derivation parity holds** (RPT-D8 / OBJ-D2).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] ✅ **Data touched?** **N** — presentational/registry only; no schema, no row-shape change.
- [x] ✅ **Any PHI in logs?** **No.**
- [x] ✅ **External API or AI call?** **No.**
- [x] ✅ **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] Objective tab shows a single "Reports" section; `point_of_care` is gone as a section; media renders inside Reports.
- [x] Merged chip list offers both patient-brought and POC quick-adds.
- [x] Stored layouts / templates referencing `point_of_care` don't break (documented remap-or-orphan).
- [x] `tsc` + lint + objective-slice tests green; derivation byte-identical.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Enables [`task-rpt-02-lab-report-model-and-fields.md`](./task-rpt-02-lab-report-model-and-fields.md) (needs the merged section as the home for grouped reports).

---

**Last Updated:** 2026-07-08
**Pattern:** merge the shipped POC/patient-brought/media sections into one "Reports" surface without touching the row schema.
**Completed:** 2026-07-08
