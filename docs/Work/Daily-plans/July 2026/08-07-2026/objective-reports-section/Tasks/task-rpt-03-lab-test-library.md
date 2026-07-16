# Task rpt-03: Researched lab-test library (analytes / panels / units / ranges / aliases)

> **Filename:** `task-rpt-03-lab-test-library.md` in `objective-reports-section/Tasks/`.
> **Links:** batch plan [`../plan-objective-reports-batch.md`](../plan-objective-reports-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-objective-reports.md`](./EXECUTION-ORDER-objective-reports.md). Code paths **repo-relative**.

---

## 📋 Task Overview

Give the Reports section clinical intelligence: a **static, versioned lab-test library** (like `exam-schema.ts`) so picking a test/panel prefills the analyte name, canonical unit, and a default reference range — and so extraction (rpt-05) can match an OCR'd name to a known analyte via aliases.

1. **Analyte catalog** — id, display name, **aliases** (for extraction matching: "Hb"/"Haemoglobin"/"HGB"), specimen, canonical unit + accepted alternates, default adult reference range (sex-split where it matters: Hb, creatinine, ferritin, uric acid…).
2. **Panels** — CBC, LFT, KFT/RFT, lipid profile, thyroid profile, HbA1c, urine routine, electrolytes, iron studies, vit D/B12, CRP/ESR. Selecting a panel **scaffolds all its analyte rows** at once (grouped under one report header from rpt-02).
3. **Custom test** — free-text analyte row (v1); persisting to the doctor's own library is rpt-06.
4. **Auto-flag (suggestion)** — when value + range are both numeric, derive `interpretation` high/low/normal; **always doctor-overridable**, and **the printed range wins** when present (RPT-D5).

**Program / Batch:** objective-reports-section · Wave 3
**Plan:** [`../plan-objective-reports-batch.md`](../plan-objective-reports-batch.md)
**Estimated Time:** ~4–6 hours agent-time **+ a clinical content-review pass**
**Status:** ✅ **Done — 2026-07-08** (static library + panel scaffolding + auto-flag suggestion). **Clinical content-review pass (4.3) still open** — all ranges ship `reviewed: false` / provisional. Minimal FE `labReports` form state wired for scaffolding; **BE persist of `lab_reports_json` still deferred** (rpt-02 carve-out).

**Change Type:**
- [x] ✅ **New** (library module + panel scaffolding) **+ Update** (row card reads unit/range defaults). Follow `docs/Work/process/CODE_CHANGE_RULES.md`. **— Completed: 2026-07-08**

**Current State:** (check existing code first!)
- ✅ **Exists:** the chip-catalog discipline in `frontend/lib/cockpit/test-result-catalog.ts`; `exam-schema.ts` as the static-clinical-data reference; row + range fields from rpt-02.
- ⚠️ **Content risk:** reference ranges are lab/method-dependent. The library value is a **convenience default only** (RPT-D5). Do not present it as authoritative; microcopy must say ranges vary by lab.

**Scope Guard:**
- Expected files touched: a new library module beside `test-result-catalog.ts`, the row card (unit/range prefill + auto-flag suggestion), the "add panel / add test" affordance in the Reports body.
- **DO NOT** add a DB table for the catalog (v1 is static TS — RPT-D4). **DO NOT** hard-flag values (suggestion + override only). **DO NOT** invent ranges without the review pass — mark unreviewed entries.

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Analyte catalog (content + shape)
- [x] ✅ 1.1 Defined analyte entry shape in `frontend/lib/cockpit/lab-test-library.ts` (id, name, aliases[], specimen, unit + alt units, default range(s) incl. sex split, category). — **Completed: 2026-07-08**
- [x] ✅ 1.2 Populated ~44 common analytes. **Every range ships `reviewed: false`** (provisional) until the clinical pass signs off. — **Completed: 2026-07-08**

### 2. Panels
- [x] ✅ 2.1 Defined 11 panels as ordered analyte-id lists (CBC, LFT, KFT/RFT, lipid, thyroid, HbA1c, urine routine, electrolytes, iron studies, vit D/B12, CRP/ESR). — **Completed: 2026-07-08**
- [x] ✅ 2.2 "Add panel" scaffolds all rows under one `LabReport` header via `scaffoldLabPanel` + reducer `ADD_LAB_PANEL`; unit + default range prefilled. — **Completed: 2026-07-08**

### 3. Custom + auto-flag
- [x] ✅ 3.1 "Add custom test" creates a free-text analyte row (`createCustomTestResultRow`); name/unit/range editable on the card. — **Completed: 2026-07-08**
- [x] ✅ 3.2 Auto-derive `interpretation` via `suggestInterpretationFromRange` as a suggestion (soft-apply when unset; chip override always wins); printed `refText` skips numeric auto-flag (printed range wins). — **Completed: 2026-07-08**

### 4. Verification gate
- [x] ✅ 4.1 Touched-file `eslint` clean; `tsc` errors from this task resolved (`Array.from` for Map iteration). Remaining FE `tsc` noise is pre-existing WIP. — **Completed: 2026-07-08**
- [x] ✅ 4.2 Unit tests green: alias lookup, panel scaffold, auto-flag truth table, unreviewed provisional flag; list + reducer coverage. — **Completed: 2026-07-08**
- [ ] 4.3 **Clinical review pass** on units/ranges/aliases — **still open**. All ranges remain `reviewed: false` / provisional microcopy until signed off (RPT-D5).

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/lab-test-library.ts
CREATE: frontend/lib/cockpit/__tests__/lab-test-library.test.ts
UPDATE: frontend/lib/cockpit/test-results.ts          (preserve reportId/ref*; normalizeLabReports)
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (labReports + ADD_LAB_PANEL)
UPDATE: frontend/components/cockpit/rx/objective/TestResultRow.tsx
UPDATE: frontend/components/cockpit/rx/objective/TestResultsList.tsx
DO NOT TOUCH: DB (no catalog table in v1); do not hard-flag values
```

**When updating existing code:** (MANDATORY)
- [x] Free-text fallback stays available on every field (chip/library guidance is not a constraint).
- [x] Ranges render as provisional defaults with "varies by lab" microcopy; printed range wins.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Static TS, versioned** (RPT-D4) — no DB table v1.
- **Ranges are defaults; printed range wins; flag is a suggestion** (RPT-D5).
- **Aliases are load-bearing for rpt-05** — design them for extraction matching.
- **Content is reviewed data, not agent guesswork** — mark unreviewed entries.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] ✅ **Data touched?** **N** — static catalog + UI; no schema.
- [x] ✅ **Any PHI in logs?** **No.**
- [x] ✅ **External API or AI call?** **No** (extraction is rpt-05).
- [x] ✅ **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] Analyte catalog with aliases + units + default ranges exists; unreviewed ranges flagged provisional.
- [x] Panels scaffold grouped rows with prefilled unit + default range; custom test can be added.
- [x] Auto-flag is a suggestion, overridable; printed range wins.
- [x] Library unit tests green; **clinical review still open** (4.3) before defaults are trusted.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Requires [`task-rpt-02-lab-report-model-and-fields.md`](./task-rpt-02-lab-report-model-and-fields.md). Feeds alias matching in [`task-rpt-05-extraction-and-verify-dialog.md`](./task-rpt-05-extraction-and-verify-dialog.md); persistence in [`task-rpt-06-custom-test-library.md`](./task-rpt-06-custom-test-library.md).

---

**Last Updated:** 2026-07-08
**Pattern:** static clinical catalog (à la `exam-schema.ts`) — analytes/panels/units/ranges/aliases — powering prefill, panel scaffolding, and extraction alias-matching.
